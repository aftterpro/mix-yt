// Módulo: Configuración y Variables Globales
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let monitorInterval; // Declarar fuera para controlar el intervalo
let playersInitialized = false; // Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let isTransitioning = false; // Flag para estado de transición
let isAudioFading = false; // NUEVO: Flag específico para la duración del fundido de audio
let hasOutroCrossfadeStarted = false; // NUEVO: Flag para indicar si el crossfade fue disparado por un segmento "outro" de SB

let playlistsData = []; // Array principal para almacenar todas las playlists [{id, name, thumbnailUrl, videos:[], isExpanded}, ...]
let currentPlayingInfo = { // Para rastrear qué video/playlist está sonando
    playlistId: null,
    videoId: null,
    flattenedIndex: -1 // Índice en la lista aplanada para reproducción
};
// Variables para Búsqueda y Scroll Infinito
let isLoadingMore = false; // Flag para evitar cargas múltiples simultáneas
let nextPageContext = null; // Para guardar información de la siguiente página (si la API la provee)
let currentSearchQuery = ''; // Guarda la última consulta realizada
const resultsContainer = document.getElementById('resultsContainer'); // Contenedor scrollable
const resultsDiv = document.getElementById('results'); // Contenedor de la grilla

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para almacenar los segmentos por videoId
let lastSeekEndTime = -1; // Último punto de salto para evitar bucles
let lastSeekVideoId = null; // Video ID asociado al último salto

function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'mensaje-flotante';
    const playlistContainer = document.getElementById('playlistContainer'); // Obtener referencia al contenedor
    playlistContainer.insertAdjacentElement('afterend', mensajeDiv); // Insertar después del contenedor

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => {
            mensajeDiv.remove();
        }, 1000);
    7},6000);// 6segundos
}
mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!"); // Comentado para no molestar siempre

// Módulo: Carga del API de YouTube (Optimizado)
function loadYouTubeAPI() {
    if (youtubeAPIReady) return;
    youtubeAPIReady = true;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; // URL oficial
    script.async = true;
    document.head.appendChild(script); // Añadir al head
    // La función onYouTubeIframeAPIReady será llamada automáticamente por la API
}
// Esta función es llamada por la API de YouTube cuando está lista
function onYouTubeIframeAPIReady() {
    initializePlayers();
}

function initializePlayers() {
    if (player1 && player2) return; // Evitar reinicialización

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        playerVars: {
             'playsinline': 1 // Importante para móviles
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    player2 = new YT.Player('player2', {
        height: '100%',
        width: '100%',
         playerVars: {
             'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    // Verificar si AMBOS están listos
    if (player1 && typeof player1.getPlayerState === 'function' &&
        player2 && typeof player2.getPlayerState === 'function') {
        if (!playersInitialized) {
            playersInitialized = true;
            console.log("Ambos reproductores listos.");
            // Habilitar botón Play solo si hay videos cargados
             const flatList = getFlattenedPlaylist();
            document.getElementById('botonPlay').disabled = flatList.length === 0;
        }
    }
    // Iniciar monitor solo UNA VEZ cuando los players estén listos
    if (playersInitialized && !monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 300); // Chequear cada 300ms
        console.log('Monitor iniciado (intervalo: 300ms)');
    }
}

function onPlayerError(event) {
    console.error("Error del reproductor:", event.data, "Player:", event.target === player1 ? '1' : '2');
    let videoTitle = "este video";
    try {
      // Intentar obtener el título del video que falló
      const videoData = event.target.getVideoData();
      if(videoData && videoData.title) {
        videoTitle = `"${videoData.title}"`;
      }
    } catch (e) { /* Ignorar si no se puede obtener */}

    let errorMsg = `Ocurrió un error desconocido (${event.data}) al reproducir ${videoTitle}.`;
    switch (event.data) {
        case 2: errorMsg = `Error: ID de video inválido para ${videoTitle}.`; break;
        case 5: errorMsg = `Error al reproducir ${videoTitle}. (Posible problema de HTML5 o derechos).`; break;
        case 100: errorMsg = `Error: Video ${videoTitle} no encontrado.`; break;
        case 101:
        case 150: errorMsg = `Error: El propietario de ${videoTitle} no permite la reproducción incrustada.`; break;
    }
    mostrarMensajeFlotante(errorMsg);

    // Intentar saltar al siguiente si el error impide la reproducción
    if ([2, 5, 100, 101, 150].includes(event.data)) {
         console.log("Intentando saltar al siguiente video debido a error...");
         // Llamar a playNextVideo SIN argumentos debería funcionar con la lógica adaptada
         setTimeout(playNextVideo, 500); // Pequeño delay antes de saltar
    }
}
function onPlayerStateChange(event) {
    const playerState = event.data;
    const changedPlayerNum = event.target === player1 ? 1 : 2;
    const videoId = event.target.getVideoData()?.video_id;
    const playerInstance = event.target;

     if (playerState === YT.PlayerState.PLAYING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);

         const flatList = getFlattenedPlaylist();
         const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

         if (videoId && playingVideoIndex !== -1) {
              const playingVideoObject = flatList[playingVideoIndex];
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
              currentPlayingInfo.flattenedIndex = playingVideoIndex;
              console.log(`onPlayerStateChange: Información de reproducción actual actualizada vía cambio de estado: ${playingVideoIndex} (Video: ${videoId})`);
              updatePlaylistsUI();

             if (currentPlayer !== changedPlayerNum) {
                  console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum}.`);
                  currentPlayer = changedPlayerNum;
             }

             if (isTransitioning) {
                 console.log(`onPlayerStateChange: Video conocido (${videoId}) comenzó a reproducir. Reseteando flag isTransitioning.`);
                 isTransitioning = false;
             }

              // --- CORRECCIÓN: Resetear hasOutroCrossfadeStarted cuando un NUEVO video comienza a reproducir ---
             console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted.`);
             hasOutroCrossfadeStarted = false; // Resetear el flag

         } else if (videoId && playingVideoIndex === -1) {
             console.warn(`onPlayerStateChange: Video desconocido (${videoId}) comenzó a reproducir en Player ${changedPlayerNum}.`);
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = null;
              currentPlayingInfo.flattenedIndex = -1;
               updatePlaylistsUI();
               if (currentPlayer !== changedPlayerNum) {
                   console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} basándose en video desconocido.`);
                    currentPlayer = changedPlayerNum;
               }
                console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted para video desconocido.`);
                hasOutroCrossfadeStarted = false;

         } else {
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO, pero el videoId aún no está disponible.`);
         }

          // Llamar a checkAndSkipSegment con forceCheck=true al entrar en estado PLAYING
          if (videoId) {
             checkAndSkipSegment(event.target, true);
          }

     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
         if (changedPlayerNum === currentPlayer && reproduccionIniciada) {
             // Handled by button
         }
     } else if (playerState === YT.PlayerState.BUFFERING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);

     } else if (playerState === YT.PlayerState.CUED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);

         const intendedNextPlayerNum = currentPlayer === 1 ? 2 : 1;
         const intendedNextVideoId = currentPlayingInfo.flattenedIndex !== -1 ? getFlattenedPlaylist()[currentPlayingInfo.flattenedIndex]?.videoId : null;

         if (changedPlayerNum === intendedNextPlayerNum && videoId === intendedNextVideoId && isTransitioning) {
             console.warn(`onPlayerStateChange: Reproductor siguiente previsto (${changedPlayerNum}) entró en estado CUED inesperadamente después de la llamada a playVideo() durante la transición. Video: ${videoId}. Intentando playVideo() de nuevo.`);
             setTimeout(() => {
                 try {
                     if (playerInstance && typeof playerInstance.playVideo === 'function' && playerInstance.getPlayerState() === YT.PlayerState.CUED) {
                          console.log(`onPlayerStateChange: Reintentando playVideo() en Player ${changedPlayerNum} desde estado CUED.`);
                         playerInstance.playVideo();
                     } else {
                          console.log(`onPlayerStateChange: No se reintenta playVideo() - Player ${changedPlayerNum} ya no está en estado CUED o es inválido.`);
                     }
                 } catch(e) { console.error("onPlayerStateChange: Error reintentando playVideo desde estado CUED:", e); }
             }, 500);
         } else if (playerState === YT.PlayerState.CUED) {
               console.log(`onPlayerStateChange: Player ${changedPlayerNum} entró en estado CUED normalmente. Video: ${videoId || 'Unknown ID'}.`);
         }

     } else if (playerState === YT.PlayerState.ENDED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
         const endedVideoMatchesCurrent = (videoId && currentPlayingInfo.videoId === videoId);

         if (endedVideoMatchesCurrent && !isTransitioning && !isAudioFading) {
             console.log(`onPlayerStateChange: Video actual (${videoId}) terminó inesperadamente. Intentando playNextVideo.`);
             playNextVideo();
         } else if (changedPlayerNum !== currentPlayer) {
             console.log(`onPlayerStateChange: Otro player ${changedPlayerNum} estado ENDED. Video: ${videoId}. (No es el reproductor activo actual)`);
         }
    }
}
// Módulo: Interacción con API de Búsqueda (Piped)
const performSearch = async (query, nextPage = null) => {
    if (!resultsDiv) return;

    // Limpiar y mostrar estado si es búsqueda NUEVA
    if (!nextPage) {
        console.log(`Iniciando NUEVA búsqueda para: ${query}`);
        currentSearchQuery = query; // Guarda la nueva query
        nextPageContext = null; // Resetea el contexto de paginación
        resultsDiv.innerHTML = '<p>Buscando...</p>'; // Mostrar "Buscando..."
    } else {
        console.log(`Cargando MÁS resultados para: ${currentSearchQuery} (Página: ${nextPage})`);
        showLoadMoreSpinner(); // Mostrar indicador al cargar más
    }

    isLoadingMore = true; // Marcar como cargando

    try {
        // Construir URL: Añadir 'nextpage' si existe
        let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(currentSearchQuery)}`;
        if (nextPage) {
            apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`; // Usar token/página
        }
        const response = await fetch(apiUrl);

        // Mejor manejo de errores HTTP
        if (!response.ok) {
            let errorDetails = `Error: ${response.status} ${response.statusText}`;
            let errorBody = null;
            try {
                errorBody = await response.json(); // Intenta leer cuerpo del error
                errorDetails = errorBody.error || errorDetails; // Usa mensaje del cuerpo si existe
                console.error("Error Body from Netlify Function:", errorBody);
            } catch (e) {
                console.warn("Could not parse error response body as JSON.");
                // Si no es JSON, intentar leer como texto
                try {
                    errorDetails = await response.text();
                } catch (e2) { /* Ignorar si falla */}
            }
            // Asegurarse que sea un objeto Error
            const error = new Error(errorDetails);
            error.status = response.status; // Añadir status al objeto error
            error.body = errorBody; // Añadir cuerpo si se pudo parsear
            throw error;
        }

        const data = await response.json();
        // Llamar a displaySearchResultsPiped, indicando si se deben añadir (append=true)
        displaySearchResultsPiped(data, !!nextPage); // append es true si nextPage tiene valor

    } catch (error) {
        console.error("Error fetching search results (app.js):", error.message, error);
        const displayError = error.message || "Error desconocido al buscar.";
        // Mostrar el mensaje de error que ahora viene más detallado
        if (!nextPage) {
            resultsDiv.innerHTML = `<p>${displayError}</p>`;
        } else {
             mostrarMensajeFlotante(displayError);
             hideLoadMoreSpinner();
        }
        isLoadingMore = false; // Resetea el flag en error
    }
};

// --- Función para mostrar resultados ---
const displaySearchResultsPiped = (results, append = false) => {
    if (!resultsDiv) {
        console.error("Results div not found!");
        return;
    }
    if (!append) {
        resultsDiv.innerHTML = '';
    }
    if (!results || !results.items || !Array.isArray(results.items)) {
        if (!append && (!results || results.items?.length === 0)) { // Mostrar solo si es búsqueda inicial y no hay NADA
            resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
        }
        nextPageContext = results?.nextpage || null; // Guardar contexto incluso si no hay items
        isLoadingMore = false;
        hideLoadMoreSpinner();
        return;
    }

    // Guardar el contexto para la siguiente página
    nextPageContext = results.nextpage || null;
    console.log("Next page context:", nextPageContext);

    results.items.forEach(video => {
        const authorName = video.uploaderName || 'Autor Desconocido';
        const videoId = video.videoId || video.url?.split('v=')[1];

        if (!videoId) {
            console.warn("Resultado omitido, no se pudo obtener videoId:", video);
            return;
        }
        // Evitar duplicados al añadir MÁS resultados
        if (append && resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
            // console.log(`Video duplicado omitido al añadir: ${video.title}`);
            return;
        }

        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail;
        thumbnail.alt = video.title;
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        thumbnailContainer.appendChild(thumbnail);
        if (video.duration && video.duration > 0) {
            const durationSpan = document.createElement('span');
            durationSpan.textContent = formatDuration(video.duration);
            durationSpan.classList.add('duration');
            thumbnailContainer.appendChild(durationSpan);
        }
        videoDiv.appendChild(thumbnailContainer);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('video-details');
        const title = document.createElement('h3');
        title.textContent = video.title;
        title.classList.add('video-title');
        title.title = video.title;
        detailsDiv.appendChild(title);
        const author = document.createElement('p');
        author.textContent = authorName;
        author.classList.add('video-author');
        detailsDiv.appendChild(author);
                // --- Botón Añadir ---
        const addToPlaylistButton = document.createElement('button');
        // Estilos base del botón (pueden estar en CSS)
        addToPlaylistButton.innerHTML = '<i class="fa-solid fa-plus"></i><span class="add-text"> Añadir</span>';
        addToPlaylistButton.classList.add('add-to-playlist', 'search-result-add-button'); // Añadir clase específica
        // Guardar datos del video en el botón
        addToPlaylistButton.dataset.videoId = videoId;
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        const durationSeconds = typeof video.duration === 'number' ? video.duration : parseDuration(video.duration);
        addToPlaylistButton.dataset.videoDuration = durationSeconds;
        
        addToPlaylistButton.addEventListener('click', (event) => {
            // Extraer datos del botón presionado
            const button = event.currentTarget;
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration, 10),
            };
            // Llamar a la nueva función manejadora
            handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addToPlaylistButton);
        videoDiv.appendChild(detailsDiv);
        resultsDiv.appendChild(videoDiv);
    }); // Fin del forEach de resultados

    if (append) {
        hideLoadMoreSpinner();
    }
    isLoadingMore = false;
};
function handleSearchResultAddClick(event, videoData) {
    event.preventDefault(); // Evitar comportamiento por defecto
    event.stopPropagation(); // Detener propagación

    const addButton = event.currentTarget; // El botón que fue clickeado
// Determine if there are any playlists loaded that are not the empty manual playlist
 const userLoadedPlaylists = playlistsData.filter(p => p.id !== 'manual' || p.videos.length > 0);

if (userLoadedPlaylists.length === 0) {
    // Case: No playlists loaded (or only manual is present and empty). Add directly to the manual playlist.
    console.log("No loaded playlists or only empty manual, adding direct to manual playlist.");
    addVideoToManualPlaylist(videoData); // Call the function to add to the manual playlist
} else {
    // Case: There are other playlists available. Show the menu to let the user choose.
    console.log("Showing menu to select destination playlist (Add action).");
    // Call the new generic popup function with the action type 'add'
    // No sourcePlaylistId is needed for 'add' from search results.
    showPlaylistSelectionPopup(addButton, videoData, 'add'); // <-- NEW CALL HERE
  }
}
// --- NUEVA: Función específica para añadir a "Mis Vídeos Añadidos" ---
function addVideoToManualPlaylist(videoData) {
    const manualPlaylistId = 'manual';
    let manualPlaylist = playlistsData.find(p => p.id === manualPlaylistId);

    // Crear playlist manual si no existe
    if (!manualPlaylist) {
        manualPlaylist = {
            id: manualPlaylistId,
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://via.placeholder.com/50?text=+',
            videos: [],
            isExpanded: true
        };
        // Asegurar que la manual siempre quede al principio si se crea ahora
        playlistsData.unshift(manualPlaylist);
        console.log("Playlist 'manual' creada y añadida al inicio.");
    }

    // Verificar duplicados DENTRO de la playlist manual
    const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
        return;
    }

    // Crear el objeto de video
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0, // Ya debería ser número
    };

    // Añadir al final de la playlist manual
    manualPlaylist.videos.push(videoObject);
    mostrarMensajeFlotante(`Video añadido a "${manualPlaylist.name}": ${videoObject.title}`);
    console.log(`Video añadido a playlist '${manualPlaylistId}': ${videoObject.title}`);

    updatePlaylistsUI(); // Actualizar la UI
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}
// --- NUEVA: Función para añadir a una Playlist ESPECÍFICA ---
function addVideoToSpecificPlaylist(videoData, targetPlaylistId) {
    const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
    if (!targetPlaylist) {
        console.error(`Error: Playlist destino ${targetPlaylistId} no encontrada.`);
        mostrarMensajeFlotante("Error: No se encontró la playlist destino.");
        return;
    }

    // Verificar duplicados en la playlist destino
    const isDuplicate = targetPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${targetPlaylist.name}".`);
        return;
    }

    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0,
    };

    // --- Lógica de Inserción: "Debajo del video que se está reproduciendo" ---
    let targetIndex = targetPlaylist.videos.length; // Por defecto, añadir al final

    if (currentPlayingInfo.playlistId === targetPlaylistId && currentPlayingInfo.flattenedIndex >= 0) {
        // Si el video actual está en la playlist destino
        const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentPlayingInfo.videoId);
        if (currentVideoLocalIndex !== -1) {
            targetIndex = currentVideoLocalIndex + 1; // Insertar justo después
            console.log(`Insertando después del video actual (índice local ${currentVideoLocalIndex}) en ${targetPlaylistId}. Nuevo índice: ${targetIndex}`);
        } else {
             console.log(`Video actual (${currentPlayingInfo.videoId}) no encontrado localmente en ${targetPlaylistId}, añadiendo al final.`);
        }
    } else {
        // Si no hay nada sonando, o está en otra playlist, añadir al final
        console.log(`Video actual no está en ${targetPlaylistId} (o nada suena), añadiendo al final.`);
         targetIndex = targetPlaylist.videos.length;
    }

    // Insertar el video en el array
    targetPlaylist.videos.splice(targetIndex, 0, videoObject);
    mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
    console.log(`Video ${videoObject.videoId} añadido a playlist '${targetPlaylistId}' en índice ${targetIndex}.`);

    updatePlaylistsUI(); // Actualizar UI
    updateCurrentPlayingIndex(); // Recalcular índice aplanado
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}
// --- NUEVA: Función auxiliar para habilitar botón Play ---
function checkAndEnablePlayButton() {
     const flatList = getFlattenedPlaylist();
     if (flatList.length > 0 && playersInitialized) {
         botonPlay.disabled = false;
     }
}
// --- Scroll Infinito ---
const handleScroll = () => {
    if (isLoadingMore || !nextPageContext || !currentSearchQuery) {
        return;
    }
    const scrollThreshold = 300; // Píxeles antes del final para empezar a cargar
    const bottomReached = resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - scrollThreshold;
    if (bottomReached) {
        console.log("Scroll cerca del final, intentando cargar más...");
        performSearch(currentSearchQuery, nextPageContext);
    }
};
resultsContainer.addEventListener('scroll', handleScroll);

// --- Funciones Spinner "Cargar Más" ---
function showLoadMoreSpinner() {
    let spinner = document.getElementById('loadMoreSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadMoreSpinner';
        spinner.className = 'loading-spinner-small';
        resultsContainer.appendChild(spinner); // Añadir al contenedor scrollable
    }
    spinner.style.display = 'flex';
}
function hideLoadMoreSpinner() {
    const spinner = document.getElementById('loadMoreSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// Módulo: Manejo de Playlists (Nueva Lógica con Pestañas)

// --- Función para obtener la lista aplanada para reproducción ---
function getFlattenedPlaylist() {
    let flatList = [];
    playlistsData.forEach(playlist => {
        // ¡IMPORTANTE! Aplanar todos los videos, independientemente de si la pestaña está expandida o no,
        // para mantener un orden de reproducción consistente.
        playlist.videos.forEach(video => {
            flatList.push({ ...video, sourcePlaylistId: playlist.id });
        });
    });
    return flatList;
}

// --- Actualizar índice basado en video actual ---
function updateCurrentPlayingIndex() {
    const flatList = getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;

    // Determinar qué player está sonando
     try {
         if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player1.getVideoData()?.video_id;
             activePlayerNum = 1;
         } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player2.getVideoData()?.video_id;
             activePlayerNum = 2;
         }
     } catch (e) {
         console.error("Error getting playing video data:", e);
         // Mantener índice previo si hay error?
     }
    
    if (playingVideoId) {
        // Solo actualizar si el video que suena ha cambiado o el índice es inválido
         if (currentPlayingInfo.videoId !== playingVideoId || currentPlayingInfo.flattenedIndex < 0) {
             const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
             if (newFlatIndex !== -1) {
                  const currentVideoObject = flatList[newFlatIndex];
                  currentPlayingInfo.videoId = playingVideoId;
                  currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                  currentPlayingInfo.flattenedIndex = newFlatIndex;
                  console.log(`Índice aplanado actualizado a: ${newFlatIndex} (Video: ${playingVideoId})`);
                  // Actualizar UI para reflejar el cambio de resaltado
                  updatePlaylistsUI();
             } else {
                 console.warn(`Video ${playingVideoId} sonando, pero no encontrado en la lista aplanada actualizada.`);
                  // Podríamos buscar por playlistId también si el ID no coincide? O resetear?
                   currentPlayingInfo.flattenedIndex = -1; // Marcar como desconocido
             }
         }
          // Asegurarse que currentPlayer esté sincronizado con el player que realmente suena
          if (activePlayerNum && currentPlayer !== activePlayerNum) {
             console.log(`Sincronizando currentPlayer a ${activePlayerNum}`);
             currentPlayer = activePlayerNum;
          }

    } else {
         // Si nada suena, el índice es -1 (o el último conocido si se pausó?)
         // Por simplicidad, si nada suena activamente, consideramos índice -1
         if (currentPlayingInfo.flattenedIndex !== -1) {
            console.log("Reproducción detenida o sin iniciar, reseteando índice aplanado.");
            currentPlayingInfo.videoId = null;
            currentPlayingInfo.playlistId = null;
            currentPlayingInfo.flattenedIndex = -1;
            // Actualizar UI para quitar resaltado
            updatePlaylistsUI();
         }
    }
}

// --- Manejar carga de Playlist desde URL ---
async function handlePlaylistLoaded(playlistInfo) { // Marcar como async si usa await interno
    console.log('Datos de playlist recibidos:', playlistInfo);

    // --- VALIDACIÓN INICIAL ---
    if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
        // Intenta obtener ID incluso si falla para mensaje de error
        const failedPlaylistId = playlistInfo?.id || playlistInfo?.url?.split('list=')[1] || 'desconocida';
        mostrarMensajeFlotante(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`);
        console.error("Respuesta inválida de getPlaylistInfo:", playlistInfo);
        return;
    }

    const playlistId = playlistInfo.id || playlistInfo.url?.split('list=')[1] || `playlist_${Date.now()}`;

    if (playlistsData.some(p => p.id === playlistId)) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`);
        return;
    }

    const loadedVideos = playlistInfo.relatedStreams.map(video => ({
        videoId: video.url?.split('v=')[1],
        title: video.title || "Título Desconocido",
        thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: parseDuration(video.duration) || 0,
    })).filter(v => v.videoId); // Filtrar videos sin ID válido

    if (loadedVideos.length === 0) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`);
        return;
    }

    const newPlaylist = {
        id: playlistId,
        name: playlistInfo.name || "Playlist Sin Nombre",
        thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || 'https://via.placeholder.com/50?text=?',
        videos: loadedVideos,
        isExpanded: true
    };

    // --- LÓGICA DE ORDENAMIENTO (CASO 2) ---
    const manualPlaylistIndex = playlistsData.findIndex(p => p.id === 'manual');
    if (manualPlaylistIndex !== -1) {
        // Si existe la playlist 'manual', insertar la nueva DESPUÉS de ella
        playlistsData.splice(manualPlaylistIndex + 1, 0, newPlaylist);
    } else {
        // Si no existe 'manual', añadir al final (o al principio si se prefiere)
        playlistsData.push(newPlaylist);
        console.log(`Playlist '${newPlaylist.name}' añadida al final.`);
    }
    // --- FIN LÓGICA ORDENAMIENTO ---
    mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`);
    updatePlaylistsUI();
    checkAndEnablePlayButton();
}

// --- Renderizar/Actualizar UI de Playlists con Pestañas ---
function updatePlaylistsUI() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;
    const currentScrollTop = playlistContainer.scrollTop; // Guardar posición scroll
    playlistContainer.innerHTML = ''; // Limpiar contenedor principal

    // Obtener info del video sonando para resaltarlo
     const playingVideoId = currentPlayingInfo.videoId;

    if (playlistsData.length === 0) {
         // Opcional: Mostrar mensaje si no hay playlists
         playlistContainer.innerHTML = '<p style="padding: 10px; color: #888; text-align: center;">Añade playlists o videos.</p>';
         return;
    }

    playlistsData.forEach((playlist) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `playlist-group ${playlist.isExpanded ? 'expanded' : ''}`;
        groupDiv.dataset.playlistId = playlist.id;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'playlist-group-header';
        headerDiv.innerHTML = `
            <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-group-thumb" loading="lazy">
            <span class="playlist-group-name">${playlist.name} (${playlist.videos.length})</span>
            <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} expand-icon"></i>
        `;
        headerDiv.addEventListener('click', () => togglePlaylistExpansion(playlist.id));
        groupDiv.appendChild(headerDiv);

        const videosDiv = document.createElement('div');
        videosDiv.className = 'playlist-group-videos';
        // Aplicar max-height inicial para animación CSS (el CSS debe ocultarlo si no tiene 'expanded')
         if (playlist.isExpanded) {
              // Calcular altura después de añadir items, o poner un valor grande inicial
              // videosDiv.style.maxHeight = '1000px'; // Temporal
         } else {
              videosDiv.style.maxHeight = '0px';
         }
        playlist.videos.forEach((video) => {
            // Usar función helper para crear cada item
            const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
            videosDiv.appendChild(item);
        });

        groupDiv.appendChild(videosDiv);
        playlistContainer.appendChild(groupDiv);
    });

    playlistContainer.scrollTop = currentScrollTop; // Restaurar posición scroll
    addDragAndDropListeners();
}

// --- Función para crear un elemento de video en la playlist ---
function createPlaylistItemElement(video, playlistId, playingVideoId) {
    const videoItem = document.createElement('div');
    videoItem.className = `playlist-item ${video.videoId === playingVideoId ? 'playing' : ''}`;
    videoItem.dataset.videoId = video.videoId;
    videoItem.dataset.playlistId = playlistId; // Añadir el ID de la playlist a cada video item
    videoItem.draggable = true; // Habilitar arrastre
    videoItem.addEventListener('dragstart', handleDragStart);

    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.className = 'thumbnail-container';
    const thumbnail = document.createElement('img');
    thumbnail.src = video.thumbnail;
    thumbnail.alt = video.title;
    thumbnail.classList.add('thumbnail');
    thumbnail.loading = "lazy";
    thumbnailDiv.appendChild(thumbnail);

    if (video.duration) {
        const durationSpan = document.createElement('span');
        durationSpan.textContent = formatDuration(video.duration);
        durationSpan.classList.add('duration');
        thumbnailDiv.appendChild(durationSpan);
    }
    videoItem.appendChild(thumbnailDiv);

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'video-details';

    const title = document.createElement('h3');
    title.className = 'video-title';
    title.textContent = video.title;
    title.title = video.title; // Tooltip completo
    detailsDiv.appendChild(title);

    // Controles de video (Play, Eliminar, Menú contextual)
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'video-controls';

    // Botón Play
    const playButton = document.createElement('button');
    playButton.className = 'play-button';
    playButton.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
    playButton.title = 'Reproducir ahora';
    playButton.addEventListener('click', () => {
        // Encontrar el índice aplanado del video para reproducirlo
        const flatList = getFlattenedPlaylist();
        const flatIndex = flatList.findIndex(v => v.videoId === video.videoId);
        if (flatIndex !== -1) {
            playVideoFromFlattenedIndex(flatIndex);
        } else {
            console.error('Video no encontrado en la lista aplanada para reproducción directa.');
            mostrarMensajeFlotante('Error: No se puede reproducir este video.');
        }
    });
    controlsDiv.appendChild(playButton);

    // Menú contextual (3 puntos)
    const deleteMenuDiv = document.createElement('div');
    deleteMenuDiv.className = 'delete-menu';
    deleteMenuDiv.innerHTML = `
        <button class="delete-menu-button" title="Opciones">
            <i class="fas fa-ellipsis-h"></i>
        </button>
        <div class="delete-menu-content">
            <button class="remove-from-playlist-button" data-video-id="${video.videoId}" data-playlist-id="${playlistId}">Eliminar</button>
            <button class="move-video-button" data-video-id="${video.videoId}" data-video-title="${video.title}" data-playlist-id="${playlistId}">Mover a...</button>
        </div>
    `;
    controlsDiv.appendChild(deleteMenuDiv);
    detailsDiv.appendChild(controlsDiv);
    videoItem.appendChild(detailsDiv);

    return videoItem;
}

// --- Toggle de expansión de Playlist ---
function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist) {
        playlist.isExpanded = !playlist.isExpanded;
        // Re-renderizar solo esta playlist o actualizar la clase
        const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);
        if (groupDiv) {
            groupDiv.classList.toggle('expanded', playlist.isExpanded);
            const expandIcon = groupDiv.querySelector('.expand-icon');
            if (expandIcon) {
                expandIcon.classList.toggle('fa-chevron-up', playlist.isExpanded);
                expandIcon.classList.toggle('fa-chevron-down', !playlist.isExpanded);
            }
             // Ajustar max-height para animación
            const videosDiv = groupDiv.querySelector('.playlist-group-videos');
            if (videosDiv) {
                 if (playlist.isExpanded) {
                     videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
                 } else {
                     videosDiv.style.maxHeight = '0';
                 }
            }
        }
    }
}
// Cerrar todos los menús contextuales de 3 puntos (usado globalmente)
function closeAllContextMenus() {
    document.querySelectorAll('.delete-menu-content').forEach(menu => {
        menu.style.display = 'none';
    });
}
// Delegación de eventos para el botón de 3 puntos y botones internos
document.addEventListener('click', (event) => {
    const targetButton = event.target.closest('.delete-menu-button');
    if (targetButton) {
        const menuContent = targetButton.nextElementSibling;
        if (menuContent && menuContent.classList.contains('delete-menu-content')) {
            // Cerrar otros menús antes de abrir este
            document.querySelectorAll('.delete-menu-content').forEach(menu => {
                if (menu !== menuContent) {
                    menu.style.display = 'none';
                }
            });
            // Alternar visibilidad del menú clickeado
            menuContent.style.display = menuContent.style.display === 'block' ? 'none' : 'block';
            event.stopPropagation(); // Evitar que el click en el documento lo cierre inmediatamente
        }
    } else {
        // Si el click es fuera de cualquier botón de menú, cerrar todos
        closeAllContextMenus();
    }
});
// Delegación para botones de "Eliminar" dentro de los menús contextuales
document.addEventListener('click', (event) => {
    const removeButton = event.target.closest('.remove-from-playlist-button');
    if (removeButton) {
        const videoId = removeButton.dataset.videoId;
        const playlistId = removeButton.dataset.playlistId;
        removeVideoFromPlaylist(playlistId, videoId);
        closeAllContextMenus(); // Cerrar el menú después de la acción
    }
    const moveButton = event.target.closest('.move-video-button');
    if (moveButton) {
        const videoDataToMove = {
            videoId: moveButton.dataset.videoId,
            title: moveButton.dataset.videoTitle,
            // No necesitamos thumbnail ni duration para la acción de mover,
            // ya que el video ya existe en 'playlistsData'.
            // Solo se usarán si el video se copiara a una NUEVA playlist.
        };
        const sourcePlaylistId = moveButton.dataset.playlistId;
        showPlaylistSelectionPopup(moveButton, videoDataToMove, 'move', sourcePlaylistId); // <-- NUEVA LLAMADA
        closeAllContextMenus(); // Cerrar el menú después de la acción
    }
});

// --- Función para eliminar video de playlist ---
function removeVideoFromPlaylist(playlistId, videoId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    const initialLength = playlist.videos.length;
    playlist.videos = playlist.videos.filter(video => video.videoId !== videoId);

    if (playlist.videos.length < initialLength) {
        mostrarMensajeFlotante(`Video eliminado de "${playlist.name}".`);
        console.log(`Video ${videoId} eliminado de playlist ${playlistId}.`);

        // Si la playlist se vacía (y no es la manual), considerarla para eliminación
        if (playlist.videos.length === 0 && playlist.id !== 'manual') {
            playlistsData = playlistsData.filter(p => p.id !== playlistId);
            mostrarMensajeFlotante(`Playlist "${playlist.name}" vaciada y eliminada.`);
            console.log(`Playlist ${playlistId} eliminada por estar vacía.`);
        }
         // Si el video eliminado era el que estaba sonando, pasar al siguiente
        if (currentPlayingInfo.videoId === videoId) {
            console.log(`El video eliminado (${videoId}) era el que estaba sonando. Intentando reproducir el siguiente.`);
            // Intentar reproducir el siguiente, recalcula currentPlayingInfo automáticamente
            playNextVideo();
        } else {
            // Si no era el que sonaba, solo actualizar la UI y el índice aplanado
            updatePlaylistsUI();
            updateCurrentPlayingIndex();
        }
        // Deshabilitar botón de play si no hay videos en general
        const flatList = getFlattenedPlaylist();
        document.getElementById('botonPlay').disabled = flatList.length === 0;

    }
}
// --- NUEVA: Función para mover video entre playlists ---
function moveVideoToSpecificPlaylist(videoData, sourcePlaylistId, targetPlaylistId) {
    if (sourcePlaylistId === targetPlaylistId) {
        mostrarMensajeFlotante("El video ya está en esa playlist.");
        return;
    }
    const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
    const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);

    if (!sourcePlaylist || !targetPlaylist) {
        console.error("Error: Playlist de origen o destino no encontrada para mover.");
        mostrarMensajeFlotante("Error al mover el video: playlists no encontradas.");
        return;
    }

    // Asegurarse de que el video exista en la playlist de origen
    const videoIndexInSource = sourcePlaylist.videos.findIndex(v => v.videoId === videoData.videoId);
    if (videoIndexInSource === -1) {
        console.error(`Error: Video ${videoData.videoId} no encontrado en la playlist de origen ${sourcePlaylistId}.`);
        mostrarMensajeFlotante("Error: El video no está en la playlist original.");
        return;
    }

    // Verificar duplicados en la playlist destino ANTES de mover
    const isDuplicateInTarget = targetPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicateInTarget) {
        mostrarMensajeFlotante(`"${videoData.title}" ya existe en "${targetPlaylist.name}".`);
        return;
    }

    // 1. Eliminar de la playlist de origen
    const [videoToMove] = sourcePlaylist.videos.splice(videoIndexInSource, 1);
    console.log(`Video ${videoToMove.videoId} eliminado de playlist de origen ${sourcePlaylistId}.`);

    // 2. Añadir a la playlist de destino (al final por simplicidad, o podrías usar lógica de inserción inteligente)
    targetPlaylist.videos.push(videoToMove);
    console.log(`Video ${videoToMove.videoId} añadido a playlist de destino ${targetPlaylistId}.`);

    mostrarMensajeFlotante(`Video "${videoToMove.title}" movido a "${targetPlaylist.name}".`);
    
    // Si la playlist de origen se vacía (y no es la manual), eliminarla
    if (sourcePlaylist.videos.length === 0 && sourcePlaylist.id !== 'manual') {
        playlistsData = playlistsData.filter(p => p.id !== sourcePlaylistId);
        mostrarMensajeFlotante(`Playlist "${sourcePlaylist.name}" vaciada y eliminada.`);
        console.log(`Playlist ${sourcePlaylistId} eliminada por estar vacía después de mover.`);
    }

    // Si el video movido era el que estaba sonando, es crucial mantener el currentPlayingInfo
    // Pero si se cambia de playlist, el sourcePlaylistId en currentPlayingInfo deberá actualizarse
    if (currentPlayingInfo.videoId === videoToMove.videoId && currentPlayingInfo.playlistId === sourcePlaylistId) {
        // Actualizar la playlistId del video que se está reproduciendo
        currentPlayingInfo.playlistId = targetPlaylistId;
        console.log(`currentPlayingInfo.playlistId actualizado a ${targetPlaylistId} para el video en reproducción.`);
    }
    
    updatePlaylistsUI(); // Actualizar la UI
    updateCurrentPlayingIndex(); // Recalcular índice aplanado (importante para orden de reproducción)
    checkAndEnablePlayButton(); // Asegurar que el botón de Play esté habilitado si hay videos
}

// --- NUEVA: Pop-up genérico para selección de playlist (Añadir/Mover) ---
function showPlaylistSelectionPopup(triggerElement, videoData, actionType, sourcePlaylistId = null) {
    // actionType: 'add' o 'move'
    // sourcePlaylistId: Solo relevante para 'move'

    closePlaylistSelectionPopups(); // Asegurar que otros popups estén cerrados

    const popupDiv = document.createElement('div');
    popupDiv.className = 'playlist-selection-popup-menu'; // Usar nueva clase para popups de selección
    
    const title = document.createElement('div');
    title.className = 'popup-title';
    title.textContent = actionType === 'add' ? 'Añadir a playlist:' : 'Mover a playlist:';
    popupDiv.appendChild(title);

    // Botón para crear nueva playlist (solo para añadir)
    if (actionType === 'add') {
        const createNewBtn = document.createElement('button');
        createNewBtn.textContent = 'Crear nueva playlist (manual)';
        createNewBtn.className = 'popup-option-button create-new-playlist-button';
        createNewBtn.addEventListener('click', () => {
             addVideoToManualPlaylist(videoData); // Añadir al instante a la manual
             closePlaylistSelectionPopups();
        });
        popupDiv.appendChild(createNewBtn);
    }
    
    // Listar playlists existentes (filtrando la de origen si es "mover")
    const filteredPlaylists = playlistsData.filter(p => actionType !== 'move' || p.id !== sourcePlaylistId);

    if (filteredPlayplaylists.length > 0) {
        filteredPlaylists.forEach(playlist => {
            const optionBtn = document.createElement('button');
            optionBtn.textContent = playlist.name;
            optionBtn.className = 'popup-option-button';
            optionBtn.addEventListener('click', () => {
                if (actionType === 'add') {
                    addVideoToSpecificPlaylist(videoData, playlist.id);
                } else if (actionType === 'move') {
                    moveVideoToSpecificPlaylist(videoData, sourcePlaylistId, playlist.id);
                }
                closePlaylistSelectionPopups();
            });
            popupDiv.appendChild(optionBtn);
        });
    } else if (actionType === 'move') { // Si no hay playlists a las que mover (solo aplica a "mover")
        const noOptionDiv = document.createElement('div');
        noOptionDiv.className = 'popup-no-options';
        noOptionDiv.textContent = 'No hay otras playlists disponibles para mover.';
        popupDiv.appendChild(noOptionDiv);
    }

    // Posicionar el popup
    const rect = triggerElement.getBoundingClientRect();
    popupDiv.style.position = 'absolute';
    popupDiv.style.left = `${rect.left + window.scrollX}px`;
    popupDiv.style.top = `${rect.bottom + window.scrollY + 5}px`; // Un poco debajo del botón
    popupDiv.style.zIndex = '1000'; // Asegurar que esté por encima de otros elementos

    document.body.appendChild(popupDiv);
}
// Función para cerrar todos los popups de selección de playlist
function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(popup => {
        popup.remove();
    });
}
// Event listener global para cerrar popups al hacer clic fuera
// Ya está incluido en el listener principal de document.addEventListener('click', ...)
// Asegurarse de que el listener principal capture clicks en la fase de captura (tercer argumento = true)
// para que pueda cerrar los menús antes de que el evento llegue a elementos dentro de los menús.
document.addEventListener('click', (event) => {
    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
    // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
    // Ensure this new class is used for both Add and Move popups (which it is in the new code)
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        closePlaylistSelectionPopups(); // <-- NEW CALL HERE
    }
}, true); // Keep using the capture phase for better reliability

// === TRANSICIÓN VISUAL CROSSFADE ===
/**function aplicarTransicionVisual(playerEntranteId, playerSalienteId) {
    const playerEntrante = document.getElementById(playerEntranteId);
    const playerSaliente = document.getElementById(playerSalienteId);

    if (!playerEntrante || !playerSaliente) return;

    // Reset clases por si estaban mal
    playerEntrante.classList.remove('fade-out', 'hidden');
    playerSaliente.classList.remove('fade-in');

    // Aplicar clases de transición
    playerEntrante.classList.add('fade-in');
    playerSaliente.classList.add('fade-out');
 
    // Después de la duración del crossfade, ocultar el player saliente
    setTimeout(() => {
        playerSaliente.classList.add('hidden');
        playerSaliente.classList.remove('fade-out');
    }, CROSSFADE_DURATION * 100); // Convertir segundos a milisegundos
}*/
async function aplicarTransicionVisualYAudio(playerEntrante, playerSaliente) {
    console.log("Iniciando transición visual y de audio...");
    isTransitioning = true; // Establecer flag de transición
    isAudioFading = true; // Establecer flag de fundido de audio
    hasOutroCrossfadeStarted = false; // Resetear este flag al iniciar una transición nueva

    const playerEntranteDiv = playerEntrante.getIframe().parentNode;
    const playerSalienteDiv = playerSaliente.getIframe().parentNode;

    // Asegurarse de que ambos estén visibles o al menos no ocultos
    playerEntranteDiv.classList.remove('fade-out', 'hidden');
    playerSalienteDiv.classList.remove('fade-in', 'hidden'); // Asegurarse que el saliente no esté oculto de antes

    // Traer el player entrante al frente
    playerEntranteDiv.style.zIndex = 2;
    playerSalienteDiv.style.zIndex = 1;

    // Aplicar clases de transición visual
    playerEntranteDiv.classList.add('fade-in');
    playerSalienteDiv.classList.add('fade-out');

    // --- Fundido de Audio ---
    const AUDIO_FADE_DURATION = 2000; // 2 segundos para el fundido de audio
    const steps = 20; // 20 pasos de fundido
    const stepTime = AUDIO_FADE_DURATION / steps; // Tiempo entre cada paso

    let currentVolumeSaliente = playerSaliente.getVolume();
    let currentVolumeEntrante = playerEntrante.getVolume();

    // Guardar volumen original para restaurar al entrante
    const originalVolumeEntrante = currentVolumeEntrante;

    // Asegurarse de que el volumen inicial del entrante no sea 0 si ya está sonando
    if (playerEntrante.getVolume() === 0 && originalVolumeEntrante > 0) {
        playerEntrante.setVolume(1); // Pequeño volumen inicial para que no sea mudo
    }
     // Asegurarse de que el volumen inicial del entrante no sea 0 si ya está sonando
    if (playerEntrante.getVolume() === 0) {
        // Establecer un volumen bajo inicial si estaba en 0, para que el fade-in funcione.
        // Después del fade-in, se ajustará al volumen original si es mayor.
        playerEntrante.setVolume(1); 
    }

    // Calcular el decremento/incremento por paso
    const decrementPerStep = currentVolumeSaliente / steps;
    const incrementPerStep = originalVolumeEntrante / steps;

    let fadeInterval = setInterval(() => {
        currentVolumeSaliente -= decrementPerStep;
        currentVolumeEntrante += incrementPerStep;

        // Asegurarse de que los volúmenes no bajen de 0 o suban del original
        currentVolumeSaliente = Math.max(0, currentVolumeSaliente);
        currentVolumeEntrante = Math.min(originalVolumeEntrante, currentVolumeEntrante);

        try {
            playerSaliente.setVolume(currentVolumeSaliente);
            playerEntrante.setVolume(currentVolumeEntrante);
        } catch (e) {
            console.warn("Error setting volume during fade:", e);
            clearInterval(fadeInterval);
            isAudioFading = false;
            return;
        }

        if (currentVolumeSaliente <= 0 && currentVolumeEntrante >= originalVolumeEntrante) {
            clearInterval(fadeInterval);
            console.log("Fundido de audio completado.");
            isAudioFading = false;
            // Asegurarse de que el saliente esté completamente mudo
            try { playerSaliente.setVolume(0); } catch(e) { console.warn("Error final setVolume saliente:", e);}
            // Restaurar volumen original del entrante (si fue modificado)
            try { playerEntrante.setVolume(originalVolumeEntrante); } catch(e) { console.warn("Error final setVolume entrante:", e);}
        }
    }, stepTime);

    // Esperar a que termine la transición visual (CROSSFADE_DURATION es CSS transition)
    // Usamos setTimeout que se sincroniza con el CSS (o un poco después)
    setTimeout(() => {
        // Ocultar el player saliente y resetear sus clases después de la transición visual
        playerSalienteDiv.classList.add('hidden');
        playerSalienteDiv.classList.remove('fade-out');
        playerEntranteDiv.classList.remove('fade-in'); // Limpiar clase del entrante

        // Asegurarse de que el z-index del player saliente baje después de la transición
        playerSalienteDiv.style.zIndex = 0; // O un valor bajo como -1 para ocultarlo completamente

        console.log("Transición visual completada.");
        isTransitioning = false; // Resetear flag de transición global
    }, CROSSFADE_DURATION * 1000); // Convertir segundos a milisegundos

    // Si el fundido de audio termina antes que la transición visual, no hay problema.
    // El flag isAudioFading se encargará de eso.
}

// === Funciones de Reproducción Principal ===
let reproduccionIniciada = false;

document.getElementById('botonPlay').addEventListener('click', () => {
    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        mostrarMensajeFlotante("No hay videos en la playlist.");
        return;
    }
    if (!playersInitialized) {
        mostrarMensajeFlotante("Los reproductores aún no están listos. Intenta de nuevo en unos segundos.");
        loadYouTubeAPI(); // Asegurarse de que la API se cargue si aún no lo ha hecho
        return;
    }

    // Si la reproducción no ha iniciado y hay videos, reproducir desde el principio
    if (!reproduccionIniciada) {
        currentPlayingInfo.flattenedIndex = -1; // Resetear para empezar desde el 0
        playNextVideo();
        reproduccionIniciada = true;
        document.getElementById('botonPlay').innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
        document.getElementById('botonStop').disabled = false;
    } else {
        // Toggle Pausar/Reproducir
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (activePlayer && typeof activePlayer.getPlayerState === 'function') {
            const state = activePlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
                activePlayer.pauseVideo();
                document.getElementById('botonPlay').innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
                console.log("Video pausado.");
            } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED || state === YT.PlayerState.CUED) {
                activePlayer.playVideo();
                document.getElementById('botonPlay').innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
                console.log("Video reanudado.");
            }
        }
    }
});

document.getElementById('botonNext').addEventListener('click', () => {
    console.log("Saltando al siguiente video (botón Next)...");
    playNextVideo();
});

document.getElementById('botonStop').addEventListener('click', () => {
    stopPlayback();
    mostrarMensajeFlotante("Reproducción detenida.");
});

function stopPlayback() {
    try {
        if (player1 && typeof player1.stopVideo === 'function') player1.stopVideo();
        if (player2 && typeof player2.stopVideo === 'function') player2.stopVideo();
    } catch (e) {
        console.warn("Error al intentar detener videos:", e);
    }
    reproduccionIniciada = false;
    document.getElementById('botonPlay').innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
    document.getElementById('botonPlay').disabled = getFlattenedPlaylist().length === 0;
    document.getElementById('botonStop').disabled = true;
    currentPlayingInfo.videoId = null;
    currentPlayingInfo.playlistId = null;
    currentPlayingInfo.flattenedIndex = -1;
    updatePlaylistsUI(); // Quitar resaltado de "playing"
    clearInterval(monitorInterval); // Detener el monitor
    monitorInterval = null; // Resetear la variable
    playersInitialized = false; // Para que onPlayerReady se active de nuevo al reproducir

    // Restablecer estilos visuales de los players
    const player1Div = document.getElementById('player1').parentNode;
    const player2Div = document.getElementById('player2').parentNode;
    player1Div.classList.remove('fade-in', 'fade-out', 'hidden');
    player2Div.classList.remove('fade-in', 'fade-out', 'hidden');
    player1Div.style.zIndex = ''; // Resetear z-index
    player2Div.style.zIndex = '';
}

function playNextVideo() {
    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("No hay videos en la playlist. Deteniendo reproducción.");
        stopPlayback();
        return;
    }

    let nextIndex = currentPlayingInfo.flattenedIndex + 1;
    if (nextIndex >= flatList.length) {
        nextIndex = 0; // Volver al principio si se llegó al final
        console.log("Fin de la playlist, volviendo al inicio.");
    }
    
    const nextVideo = flatList[nextIndex];
    if (!nextVideo) {
        console.error("No se pudo obtener el siguiente video en el índice", nextIndex);
        stopPlayback();
        mostrarMensajeFlotante("Error al cargar el siguiente video.");
        return;
    }

    const activePlayer = (currentPlayer === 1) ? player1 : player2;
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1;

    // Determinar si es necesario cambiar de reproductor o si el video ya está cargado en el inactivo
    const inactivePlayerVideoId = inactivePlayer?.getVideoData()?.video_id;
    const activePlayerVideoId = activePlayer?.getVideoData()?.video_id;

    if (inactivePlayerVideoId === nextVideo.videoId) {
        console.log(`El siguiente video (${nextVideo.videoId}) ya está en el reproductor INACTIVO. Cambiando players.`);
        // El video ya está precargado o fue el que terminó
        // Simplemente realizamos el crossfade
        currentPlayingInfo.flattenedIndex = nextIndex; // Actualizar antes del crossfade
        currentPlayingInfo.videoId = nextVideo.videoId;
        currentPlayingInfo.playlistId = nextVideo.sourcePlaylistId;
        aplicarTransicionVisualYAudio(inactivePlayer, activePlayer);
        // El onStateChange del inactivePlayer (ahora activo) debería establecer currentPlayer
        // Asegurarse de que el nuevo activo empiece a sonar (si no lo está ya)
         try {
             if (inactivePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
                 inactivePlayer.playVideo();
             }
         } catch(e) { console.error("Error al intentar reproducir el player inactivo:", e);}
         updatePlaylistsUI(); // Resaltar nuevo video
        return;

    } else {
        console.log(`Cargando nuevo video (${nextVideo.videoId}) en reproductor INACTIVO.`);
        // Necesitamos cargar el nuevo video en el reproductor inactivo
        inactivePlayer.loadVideoById(nextVideo.videoId, 0); // Cargar y empezar en 0
        currentPlayingInfo.flattenedIndex = nextIndex;
        currentPlayingInfo.videoId = nextVideo.videoId;
        currentPlayingInfo.playlistId = nextVideo.sourcePlaylistId;

        // La transición se hará una vez que el inactivePlayer comience a reproducir (onStateChange)
        // Establecer un flag temporal para saber que estamos esperando la carga
        isTransitioning = true;
        console.log(`playNextVideo: isTransitioning = true, esperando que Player ${currentPlayer === 1 ? 2 : 1} inicie.`);
        
        // En algunos casos (ej. video corto, buffer rápido), el onStateChange podría ser casi inmediato.
        // Si no, el monitorPlayers se encargará de la transición cuando detecte que el inactivo está sonando.
        updatePlaylistsUI(); // Resaltar nuevo video
    }
}


function monitorPlayers() {
    if (!playersInitialized || isTransitioning || isAudioFading) {
        // console.log("Monitor: Saltando, players no inicializados o en transición.");
        return;
    }
     const activePlayer = (currentPlayer === 1) ? player1 : player2;
     const inactivePlayer = (currentPlayer === 1) ? player2 : player1;

     if (!activePlayer || !inactivePlayer || typeof activePlayer.getCurrentTime !== 'function') {
         console.warn("Monitor: Reproductores no disponibles o incompletos.");
         return;
     }

    const currentTime = activePlayer.getCurrentTime();
    const duration = activePlayer.getDuration();
    const playerState = activePlayer.getPlayerState();

    if (playerState === YT.PlayerState.PLAYING && duration > 0) {
        // Actualizar UI del progreso
        updateProgressBar(currentTime, duration);
        // Actualizar tiempo transcurrido / restante
        updateTimeDisplay(currentTime, duration);

        // --- Lógica de SponsorBlock y Crossfade ---
        checkAndSkipSegment(activePlayer); // Chequear y saltar segmentos
        
        // Calcular cuándo empezar el crossfade para el próximo video
        const timeToEnd = duration - currentTime;
        const flatList = getFlattenedPlaylist();
        
        if (timeToEnd <= CROSSFADE_DURATION && currentPlayingInfo.flattenedIndex !== -1 && !hasOutroCrossfadeStarted) {
            console.log(`Monitor: Tiempo para crossfade! ${timeToEnd.toFixed(1)}s restantes. Iniciando pre-carga de siguiente video.`);

            let nextIndex = currentPlayingInfo.flattenedIndex + 1;
            if (nextIndex >= flatList.length) {
                nextIndex = 0; // Volver al principio si se llegó al final
            }
            const nextVideo = flatList[nextIndex];

            if (nextVideo && inactivePlayer && typeof inactivePlayer.loadVideoById === 'function') {
                const inactivePlayerVideoId = inactivePlayer.getVideoData()?.video_id;
                if (inactivePlayerVideoId !== nextVideo.videoId || inactivePlayer.getPlayerState() === YT.PlayerState.ENDED) {
                    // Solo cargar si no es el mismo video O si el precargado ya terminó
                    console.log(`Monitor: Precargando el siguiente video (${nextVideo.videoId}) en el reproductor INACTIVO.`);
                    inactivePlayer.loadVideoById(nextVideo.videoId, 0); // Precargar en el inactivo
                    // No lo reproducimos aún, solo lo cargamos.
                } else {
                    console.log(`Monitor: Siguiente video (${nextVideo.videoId}) ya está precargado en inactivo.`);
                }
            } else if (!nextVideo) {
                console.warn("Monitor: No hay siguiente video para precargar.");
            }
            
            // Si el video actual tiene un segmento 'outro', podemos iniciar la transición aquí
            // Esto es si el final del video actual coincide con el inicio de un 'outro'
            const currentVideoSegments = segmentosCache[activePlayer.getVideoData().video_id] || [];
            const outroSegment = currentVideoSegments.find(s => s.category === 'outro' && currentTime >= s.segment[0] && currentTime < s.segment[1]);

            // Este flag es CRUCIAL para que solo se inicie la transición UNA VEZ por video
            // El `isTransitioning` previene múltiples llamadas de `aplicarTransicionVisualYAudio`
            // El `hasOutroCrossfadeStarted` previene que esta parte del código se ejecute múltiples veces
            // para el mismo 'outro' en el mismo video.
            if (outroSegment && !isTransitioning && !hasOutroCrossfadeStarted) {
                console.log(`Monitor: Iniciando crossfade debido a segmento 'outro'. Video actual: ${activePlayer.getVideoData().video_id}, Seg: ${outroSegment.segment}`);
                hasOutroCrossfadeStarted = true; // Marcar que el crossfade por outro ya inició

                // Asegurarse de que el siguiente video esté listo o al menos cargándose
                if (inactivePlayer.getVideoData()?.video_id === nextVideo.videoId && inactivePlayer.getPlayerState() === YT.PlayerState.CUED) {
                    console.log("Monitor: Siguiente video en CUED, iniciando reproducción y transición.");
                    inactivePlayer.playVideo(); // Iniciar reproducción del siguiente
                    aplicarTransicionVisualYAudio(inactivePlayer, activePlayer);
                } else if (inactivePlayer.getVideoData()?.video_id === nextVideo.videoId && inactivePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                     // Esto puede ocurrir si el nextVideo ya empezó a sonar por alguna razón
                     console.log("Monitor: Siguiente video ya está en PLAYING, iniciando transición.");
                     aplicarTransicionVisualYAudio(inactivePlayer, activePlayer);
                }
                 // Si el inactivePlayer no está listo, la lógica de onPlayerStateChange o playNextVideo lo manejará.
                 // Este `if` es para un inicio proactivo si todo está en el estado correcto.
            }
        }
    }
    // Lógica para detectar si el inactivo ya está sonando y el activo debería transicionar
    // Esto es un fallback o para casos donde playNextVideo precargó pero no activó inmediatamente
    const inactivePlayerState = inactivePlayer.getPlayerState();
    if (inactivePlayerState === YT.PlayerState.PLAYING && !isTransitioning && !isAudioFading && !hasOutroCrossfadeStarted) {
        console.log(`Monitor: Detectado que el player inactivo (${currentPlayer === 1 ? 2 : 1}) está ahora en PLAYING. Iniciando transición.`);
        aplicarTransicionVisualYAudio(inactivePlayer, activePlayer);
        // Importante: No actualizamos `currentPlayer` aquí; `aplicarTransicionVisualYAudio` o `onPlayerStateChange` lo harán.
    }
}
// --- Módulo: SponsorBlock ---
async function fetchSegments(videoId) {
    if (segmentosCache[videoId]) {
        return segmentosCache[videoId];
    }
    try {
        const userId = 'tu-id-de-usuario-unico'; // Considera usar un ID persistente
        const response = await fetch(`/.netlify/functions/sponsorblock/segments/${videoId}`, {
            headers: {
                'X-UserID': userId
            }
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Error HTTP ${response.status}: ${errorBody.error || 'Desconocido'}`);
        }
        const segments = await response.json();
        segmentosCache[videoId] = segments;
        console.log(`Segmentos SB para ${videoId} (cacheada):`, segments.length, 'segmentos.');
        return segments;
    } catch (error) {
        console.error(`Error al obtener segmentos de SponsorBlock para ${videoId}:`, error);
        return [];
    }
}

async function checkAndSkipSegment(player, forceCheck = false) {
    if (isTransitioning || isAudioFading) return; // No saltar durante transiciones

    const videoId = player.getVideoData()?.video_id;
    if (!videoId) return;

    const currentTime = player.getCurrentTime();
    // Previene bucle infinito si el seek no mueve mucho el tiempo
    if (!forceCheck && Math.abs(currentTime - lastSeekEndTime) < 1 && lastSeekVideoId === videoId) {
        return;
    }

    const segments = await fetchSegments(videoId);
    if (segments.length === 0) return;

    for (const segment of segments) {
        const [segmentStart, segmentEnd] = segment.segment;
        const segmentCategory = segment.category;

        // Si el tiempo actual está dentro de un segmento a omitir
        if (currentTime >= segmentStart && currentTime < segmentEnd) {
            if (['sponsor', 'selfpromo', 'interaction', 'poi', 'music_offtopic'].includes(segmentCategory)) {
                const skipTo = segmentEnd + 0.1; // Saltar justo después del segmento
                console.log(`⏩ Saltando segmento de ${segmentCategory} en ${videoId} de ${formatTime(segmentStart)} a ${formatTime(segmentEnd)}. Saltando a ${formatTime(skipTo)}.`);
                try {
                    player.seekTo(skipTo, true);
                    lastSeekEndTime = skipTo;
                    lastSeekVideoId = videoId;
                    mostrarMensajeFlotante(`Saltando ${getCategoryName(segmentCategory)}...`);
                } catch (e) {
                    console.error("Error al hacer seekTo:", e);
                }
                return; // Solo saltar un segmento a la vez
            } else if (segmentCategory === 'intro') {
                // Para intro, si estamos al principio y entramos en el intro, saltar.
                // Esto es más agresivo, se puede refinar.
                if (currentTime < segmentEnd && currentTime < 5) { // Si estamos en los primeros 5 segundos y es intro
                    const skipTo = segmentEnd + 0.1;
                    console.log(`⏩ Saltando INTRO en ${videoId} de ${formatTime(segmentStart)} a ${formatTime(segmentEnd)}. Saltando a ${formatTime(skipTo)}.`);
                    try {
                        player.seekTo(skipTo, true);
                        lastSeekEndTime = skipTo;
                        lastSeekVideoId = videoId;
                        mostrarMensajeFlotante("Saltando introducción...");
                    } catch (e) {
                        console.error("Error al hacer seekTo para intro:", e);
                    }
                    return;
                }
            }
        }
    }
}

function getCategoryName(category) {
    switch (category) {
        case 'sponsor': return 'Patrocinio';
        case 'intro': return 'Introducción';
        case 'outro': return 'Outro';
        case 'selfpromo': return 'Autopromoción';
        case 'interaction': return 'Interacción';
        case 'poi': return 'Punto de interés';
        case 'music_offtopic': return 'Música fuera de tema';
        default: return category;
    }
}

// === Funciones de Utilidad ===

// Formatea la duración de segundos a HH:MM:SS o MM:SS
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00";
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');

    if (h > 0) {
        return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
}

// Parsea duración en formato 'PT#M#S' o similar a segundos
function parseDuration(durationString) {
    if (typeof durationString === 'number') {
        return durationString; // Ya es un número, devolverlo
    }
    if (!durationString || typeof durationString !== 'string') {
        return 0;
    }
    const parts = durationString.match(/(\d+)(H|M|S)/g);
    let totalSeconds = 0;
    if (parts) {
        parts.forEach(part => {
            const value = parseInt(part.slice(0, -1));
            const unit = part.slice(-1);
            if (unit === 'H') totalSeconds += value * 3600;
            else if (unit === 'M') totalSeconds += value * 60;
            else if (unit === 'S') totalSeconds += value;
        });
    }
    return totalSeconds;
}

function formatTime(seconds) {
    return formatDuration(seconds); // Reutilizar la función
}

// Actualiza la barra de progreso
function updateProgressBar(currentTime, duration) {
    const progressBar = document.getElementById('progressBar');
    if (progressBar && duration > 0) {
        const progress = (currentTime / duration) * 100;
        progressBar.style.width = `${progress}%`;
    }
}

// Actualiza la visualización de tiempo transcurrido / restante
function updateTimeDisplay(currentTime, duration) {
    const timeElapsed = document.getElementById('timeElapsed');
    const timeRemaining = document.getElementById('timeRemaining');
    if (timeElapsed) {
        timeElapsed.textContent = formatTime(currentTime);
    }
    if (timeRemaining) {
        timeRemaining.textContent = `-${formatTime(duration - currentTime)}`;
    }
}
// Módulo: Funcionalidad de Arrastrar y Soltar (Drag & Drop)
let draggedItem = null; // El elemento de playlist que está siendo arrastrado

function addDragAndDropListeners() {
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
     // Añadir listeners a los grupos de playlist para manejar arrastre entre grupos vacíos
    document.querySelectorAll('.playlist-group-videos').forEach(group => {
        group.addEventListener('dragover', handleDragOverGroup);
        group.addEventListener('drop', handleDropGroup);
    });
}
function handleDragStart(e) {
    draggedItem = e.target.closest('.playlist-item');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItem.dataset.videoId + '|' + draggedItem.dataset.playlistId); // Guardar videoId y playlistId
    setTimeout(() => {
        draggedItem.classList.add('dragging'); // Añadir clase para ocultar el original
    }, 0);
}

function handleDragOver(e) {
    e.preventDefault(); // Permitir el drop
    const targetItem = e.target.closest('.playlist-item');
    if (targetItem && targetItem !== draggedItem) {
        const boundingBox = targetItem.getBoundingClientRect();
        const offset = e.clientY - boundingBox.top;

        if (offset < boundingBox.height / 2) {
            targetItem.classList.remove('drag-after');
            targetItem.classList.add('drag-before');
        } else {
            targetItem.classList.remove('drag-before');
            targetItem.classList.add('drag-after');
        }
    }
}

function handleDragLeave(e) {
    e.target.classList.remove('drag-before', 'drag-after');
}

function handleDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.playlist-item');
    if (!draggedItem || !targetItem || targetItem === draggedItem) {
        return;
    }

    const fromVideoId = draggedItem.dataset.videoId;
    const fromPlaylistId = draggedItem.dataset.playlistId;
    const toVideoId = targetItem.dataset.videoId;
    const toPlaylistId = targetItem.dataset.playlistId;

    let destinationIndex = -1;
    let targetPlaylist = playlistsData.find(p => p.id === toPlaylistId);

    if (!targetPlaylist) return;

    // Remover el video de su playlist original
    const sourcePlaylist = playlistsData.find(p => p.id === fromPlaylistId);
    if (!sourcePlaylist) return;
    
    // Obtener una copia del video a mover y luego eliminarlo del origen
    const videoToMoveIndex = sourcePlaylist.videos.findIndex(v => v.videoId === fromVideoId);
    if (videoToMoveIndex === -1) return;
    const [videoToMove] = sourcePlaylist.videos.splice(videoToMoveIndex, 1);

    // Calcular la posición de inserción en la playlist de destino
    const boundingBox = targetItem.getBoundingClientRect();
    const offset = e.clientY - boundingBox.top;

    const currentVideosInTarget = targetPlaylist.videos;
    const targetLocalIndex = currentVideosInTarget.findIndex(v => v.videoId === toVideoId);

    if (offset < boundingBox.height / 2) {
        // Insertar antes del targetItem
        destinationIndex = targetLocalIndex;
    } else {
        // Insertar después del targetItem
        destinationIndex = targetLocalIndex + 1;
    }
    
    // Si se movió dentro de la misma playlist, ajustar el índice si es necesario
    if (fromPlaylistId === toPlaylistId && videoToMoveIndex < destinationIndex) {
        destinationIndex--; // Compensar el índice al haber quitado un elemento antes
    }
    
    // Añadir el video a la playlist de destino en la nueva posición
    targetPlaylist.videos.splice(destinationIndex, 0, videoToMove);

    // Si la playlist de origen quedó vacía (y no es la manual), eliminarla
    if (sourcePlaylist.videos.length === 0 && sourcePlaylist.id !== 'manual') {
        playlistsData = playlistsData.filter(p => p.id !== fromPlaylistId);
        mostrarMensajeFlotante(`Playlist "${sourcePlaylist.name}" vaciada y eliminada.`);
        console.log(`Playlist ${fromPlaylistId} eliminada por estar vacía después de D&D.`);
    }

    // Actualizar la UI y el estado de reproducción si el video en reproducción se movió
    if (currentPlayingInfo.videoId === fromVideoId) {
         currentPlayingInfo.playlistId = toPlaylistId;
         // El updateCurrentPlayingIndex recalculará el flattenedIndex
    }

    updatePlaylistsUI(); // Re-renderizar todo el UI de playlists
    updateCurrentPlayingIndex(); // Recalcular índices aplanados
    e.target.classList.remove('drag-before', 'drag-after');
}

function handleDragEnd(e) {
    draggedItem.classList.remove('dragging');
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('drag-before', 'drag-after');
    });
    draggedItem = null;
}

// Manejar arrastre sobre un grupo vacío para permitir soltar en él
function handleDragOverGroup(e) {
    e.preventDefault();
    const targetGroupVideos = e.target.closest('.playlist-group-videos');
    if (targetGroupVideos && targetGroupVideos.children.length === 0) {
        targetGroupVideos.classList.add('drag-over-empty'); // Añadir clase visual
    } else {
        targetGroupVideos?.classList.remove('drag-over-empty');
    }
}
function handleDropGroup(e) {
    e.preventDefault();
    const targetGroupVideos = e.target.closest('.playlist-group-videos');
    if (!draggedItem || !targetGroupVideos) {
        return;
    }

    // Si se suelta en un grupo vacío
    if (targetGroupVideos.children.length === 0) {
        const fromVideoId = draggedItem.dataset.videoId;
        const fromPlaylistId = draggedItem.dataset.playlistId;
        const toPlaylistId = targetGroupVideos.closest('.playlist-group').dataset.playlistId;

        // Remover el video de su playlist original
        const sourcePlaylist = playlistsData.find(p => p.id === fromPlaylistId);
        if (!sourcePlaylist) return;
        
        const videoToMoveIndex = sourcePlaylist.videos.findIndex(v => v.videoId === fromVideoId);
        if (videoToMoveIndex === -1) return;
        const [videoToMove] = sourcePlaylist.videos.splice(videoToMoveIndex, 1);

        // Añadir al final de la playlist de destino vacía
        const targetPlaylist = playlistsData.find(p => p.id === toPlaylistId);
        if (!targetPlaylist) return;
        targetPlaylist.videos.push(videoToMove);

        // Si la playlist de origen quedó vacía (y no es la manual), eliminarla
        if (sourcePlaylist.videos.length === 0 && sourcePlaylist.id !== 'manual') {
            playlistsData = playlistsData.filter(p => p.id !== fromPlaylistId);
            mostrarMensajeFlotante(`Playlist "${sourcePlaylist.name}" vaciada y eliminada.`);
            console.log(`Playlist ${fromPlaylistId} eliminada por estar vacía después de D&D a grupo vacío.`);
        }

        // Actualizar el currentPlayingInfo si el video en reproducción se movió
        if (currentPlayingInfo.videoId === fromVideoId) {
            currentPlayingInfo.playlistId = toPlaylistId;
        }

        updatePlaylistsUI(); // Re-renderizar todo
        updateCurrentPlayingIndex();
    }
    targetGroupVideos.classList.remove('drag-over-empty');
}

// === Inicialización ===
document.addEventListener('DOMContentLoaded', () => {
    loadYouTubeAPI(); // Cargar API de YouTube
    // Otros inicializadores aquí
    document.getElementById('botonPlay').disabled = true; // Deshabilitar inicialmente
    document.getElementById('botonStop').disabled = true;

    // Simular carga de playlist de ejemplo al inicio
    // Esto es solo para demostración, en una app real vendría de una API o localStorage
    const examplePlaylist = {
        id: 'ejemplo1',
        name: 'Música de Ejemplo',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        videos: [
            { videoId: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', duration: 213 },
            { videoId: 'hTWzRzUaBw4', title: 'Another Example Song', thumbnail: 'https://i.ytimg.com/vi/hTWzRzUaBw4/hqdefault.jpg', duration: 180 },
            { videoId: 'kJQP7kiw5Fk', title: 'Bohemian Rhapsody', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', duration: 354 }
        ],
        isExpanded: true
    };
    // Descomenta la siguiente línea para cargar la playlist de ejemplo al inicio
    // playlistsData.push(examplePlaylist);
    // updatePlaylistsUI(); // Renderizar las playlists iniciales
    // checkAndEnablePlayButton(); // Asegurarse de habilitar el botón de Play si hay videos

    // Event listener para el formulario de búsqueda
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const queryInput = document.getElementById('searchQuery');
            const query = queryInput.value.trim();
            if (query) {
                console.log(`Buscando: ${query}`);
                await performSearch(query);
            }
        });
    }

    // Event listener para el formulario de carga de playlist por URL
    const loadPlaylistForm = document.getElementById('loadPlaylistForm');
    if (loadPlaylistForm) {
        loadPlaylistForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const playlistUrlInput = document.getElementById('playlistUrl');
            const playlistUrl = playlistUrlInput.value.trim();
            if (playlistUrl) {
                console.log(`Cargando playlist desde URL: ${playlistUrl}`);
                try {
                    // Aquí deberías llamar a una función backend o proxy para obtener info de playlist
                    // Por simplicidad, un mock o un llamado a tu función de búsqueda con un ID de playlist
                    // Para Piped, el endpoint de playlist es /playlists/{id}
                    const playlistIdMatch = playlistUrl.match(/(?:list=)([^&]+)/);
                    let playlistId = playlistIdMatch ? playlistIdMatch[1] : null;

                    if (!playlistId) {
                         // Intentar extraer de URLs cortas de YouTube o de la URL completa
                         const shortUrlMatch = playlistUrl.match(/(?:youtu\.be\/playlist\?list=|youtube\.com\/playlist\?list=)([^&]+)/);
                         if (shortUrlMatch) playlistId = shortUrlMatch[1];
                    }

                    if (!playlistId) {
                        mostrarMensajeFlotante("URL de playlist inválida.");
                        return;
                    }

                    const instanceUrl = getRandomPipedInstance();
                    const apiUrl = `${instanceUrl}/playlists/${encodeURIComponent(playlistId)}`;
                    
                    showLoadingSpinner(); // Mostrar spinner
                    const response = await fetch(apiUrl);
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Error HTTP ${response.status}: ${errorText}`);
                    }
                    const playlistInfo = await response.json();
                    await handlePlaylistLoaded(playlistInfo); // Usar la nueva función
                    playlistUrlInput.value = ''; // Limpiar input
                } catch (error) {
                    console.error("Error al cargar playlist desde URL:", error);
                    mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
                } finally {
                    hideLoadingSpinner(); // Ocultar spinner
                }
            }
        });
    }
    // Inicializar listeners de drag and drop después de que el DOM esté listo
    // y después de que cualquier UI de playlist inicial haya sido renderizada.
    updatePlaylistsUI(); // Asegurarse de que el DOM de playlists esté listo
    addDragAndDropListeners();

    // Cierre inicial de spinners por si se quedaron pegados de una carga previa
    hideLoadingSpinner();
    hideLoadMoreSpinner();
});
// Función para mostrar el spinner de carga de página completa
function showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
}
// Function to hide the loading spinner
function hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
}

// Event listener for global clicks to close popups - ensure it captures during the capture phase
document.addEventListener('click', (event) => {
    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
    // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        closePlaylistSelectionPopups(); // NEW CALL HERE
    }
}, true); // Keep using the capture phase for better reliability
