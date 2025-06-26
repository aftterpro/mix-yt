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

    // CORRECCIÓN: Cambiar 'playlistContainer' a 'playlists-container' y añadir verificación
    const playlistContainer = document.getElementById('playlists-container'); // Obtener referencia al contenedor
    
    if (playlistContainer) { // Verificar si el elemento existe
        playlistContainer.insertAdjacentElement('afterend', mensajeDiv); // Insertar después del contenedor
    } else {
        console.error("Error: El elemento 'playlists-container' no se encontró en el DOM para insertar el mensaje. Insertando en el body."); // Mensaje de error útil
        document.body.insertAdjacentElement('beforeend', mensajeDiv); // Fallback: Insertar al final del body
    }

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => {
            mensajeDiv.remove();
        }, 1000);
    }, 6000); // 6 segundos
}
// mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!"); // Comentado para no molestar siempre

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
         // if (changedPlayerNum === currentPlayer && reproduccionIniciada) {
         //     // Handled by button
         // }
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
    })).filter(video => video.videoId); // Asegurarse de que tengamos un videoId

    if (loadedVideos.length === 0) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`);
        return;
    }

    const newPlaylist = {
        id: playlistId,
        name: playlistInfo.name || `Playlist ${playlistsData.length + 1}`,
        thumbnailUrl: playlistInfo.thumbnailUrl || 'https://via.placeholder.com/50?text=Playlist',
        videos: loadedVideos,
        isExpanded: false // Por defecto, las nuevas playlists están contraídas
    };

    playlistsData.push(newPlaylist);
    console.log(`Playlist añadida: ${newPlaylist.name} con ${newPlaylist.videos.length} videos.`);
    mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada con éxito.`);
    updatePlaylistsUI(); // Actualizar la UI
    checkAndEnablePlayButton(); // Habilitar botón Play si corresponde
}

// --- Función para renderizar y actualizar la interfaz de playlists ---
function updatePlaylistsUI() {
    const playlistsContainer = document.getElementById('playlists-container');
    if (!playlistsContainer) {
        console.error("El contenedor de playlists no se encontró en el DOM.");
        return;
    }

    playlistsContainer.innerHTML = ''; // Limpiar el contenedor actual

    if (playlistsData.length === 0) {
        playlistsContainer.innerHTML = '<p>No hay playlists cargadas aún. ¡Añade una!</p>';
        document.getElementById('botonPlay').disabled = true; // Deshabilitar si no hay nada
        return;
    }

    playlistsData.forEach(playlist => {
        const playlistDiv = document.createElement('div');
        playlistDiv.classList.add('playlist-item');
        playlistDiv.dataset.playlistId = playlist.id;

        const playlistHeader = document.createElement('div');
        playlistHeader.classList.add('playlist-header');

        const playlistThumbnail = document.createElement('img');
        playlistThumbnail.src = playlist.thumbnailUrl;
        playlistThumbnail.alt = playlist.name;
        playlistThumbnail.classList.add('playlist-thumbnail');
        playlistHeader.appendChild(playlistThumbnail);

        const playlistTitle = document.createElement('h3');
        playlistTitle.textContent = playlist.name;
        playlistTitle.classList.add('playlist-title');
        playlistHeader.appendChild(playlistTitle);

        const toggleButton = document.createElement('button');
        toggleButton.classList.add('playlist-toggle-button');
        toggleButton.innerHTML = playlist.isExpanded ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i>';
        toggleButton.addEventListener('click', () => togglePlaylistExpand(playlist.id));
        playlistHeader.appendChild(toggleButton);

        // --- Menú de Opciones (3 puntos) para cada playlist ---
        const optionsMenuDiv = document.createElement('div');
        optionsMenuDiv.classList.add('delete-menu'); // Reutiliza clases del botón de eliminar de video
        optionsMenuDiv.innerHTML = `
            <button class="delete-menu-button playlist-options-button" aria-label="Opciones de Playlist">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="delete-menu-content playlist-options-content hidden">
                <button class="menu-option move-playlist-up" data-playlist-id="${playlist.id}"><i class="fas fa-arrow-up"></i> Mover Arriba</button>
                <button class="menu-option move-playlist-down" data-playlist-id="${playlist.id}"><i class="fas fa-arrow-down"></i> Mover Abajo</button>
                <button class="menu-option remove-playlist" data-playlist-id="${playlist.id}"><i class="fas fa-times"></i> Eliminar Playlist</button>
            </div>
        `;
        playlistHeader.appendChild(optionsMenuDiv);

        // Event listener para el botón de opciones de playlist
        const playlistOptionsButton = optionsMenuDiv.querySelector('.playlist-options-button');
        playlistOptionsButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Evitar que el clic se propague al documento y cierre el menú inmediatamente
            closeAllContextMenus(); // Cerrar otros menús abiertos
            const menuContent = playlistOptionsButton.nextElementSibling;
            menuContent.classList.toggle('hidden');
        });

        // Event listeners para las opciones del menú de playlist
        optionsMenuDiv.querySelector('.move-playlist-up').addEventListener('click', (event) => {
            event.stopPropagation();
            movePlaylist(playlist.id, -1);
            closeAllContextMenus();
        });
        optionsMenuDiv.querySelector('.move-playlist-down').addEventListener('click', (event) => {
            event.stopPropagation();
            movePlaylist(playlist.id, 1);
            closeAllContextMenus();
        });
        optionsMenuDiv.querySelector('.remove-playlist').addEventListener('click', (event) => {
            event.stopPropagation();
            removePlaylist(playlist.id);
            closeAllContextMenus();
        });


        playlistDiv.appendChild(playlistHeader);

        const videoListDiv = document.createElement('div');
        videoListDiv.classList.add('playlist-video-list');
        if (!playlist.isExpanded) {
            videoListDiv.classList.add('hidden');
        }

        playlist.videos.forEach(video => {
            const videoItemDiv = document.createElement('div');
            videoItemDiv.classList.add('video-item');
            videoItemDiv.dataset.videoId = video.videoId;
            videoItemDiv.dataset.sourcePlaylistId = playlist.id; // Añadir ID de playlist de origen

            // Resaltar si es el video que se está reproduciendo
            if (currentPlayingInfo.videoId === video.videoId && currentPlayingInfo.playlistId === playlist.id) {
                videoItemDiv.classList.add('playing');
                // Asegurarse de que el video actualmente reproduciéndose esté visible
                if (!playlist.isExpanded) {
                    playlist.isExpanded = true;
                    toggleButton.innerHTML = '<i class="fas fa-chevron-up"></i>';
                    videoListDiv.classList.remove('hidden');
                }
            }

            const thumbnailImg = document.createElement('img');
            thumbnailImg.src = video.thumbnail;
            thumbnailImg.alt = video.title;
            thumbnailImg.classList.add('video-item-thumbnail');
            videoItemDiv.appendChild(thumbnailImg);

            const videoInfoDiv = document.createElement('div');
            videoInfoDiv.classList.add('video-item-info');

            const videoTitleP = document.createElement('p');
            videoTitleP.textContent = video.title;
            videoTitleP.classList.add('video-item-title');
            videoTitleP.title = video.title; // Título completo en tooltip
            videoInfoDiv.appendChild(videoTitleP);

            const videoDurationSpan = document.createElement('span');
            videoDurationSpan.textContent = formatDuration(video.duration);
            videoDurationSpan.classList.add('video-item-duration');
            videoInfoDiv.appendChild(videoDurationSpan);

            videoItemDiv.appendChild(videoInfoDiv);

            // Botón de eliminar vídeo
            const deleteVideoMenuDiv = document.createElement('div');
            deleteVideoMenuDiv.classList.add('delete-menu');
            deleteVideoMenuDiv.innerHTML = `
                <button class="delete-menu-button" aria-label="Opciones de video">
                    <i class="fas fa-ellipsis-h"></i>
                </button>
                <div class="delete-menu-content hidden">
                    <button class="menu-option move-video-up" data-video-id="${video.videoId}" data-playlist-id="${playlist.id}"><i class="fas fa-arrow-up"></i> Mover Arriba</button>
                    <button class="menu-option move-video-down" data-video-id="${video.videoId}" data-playlist-id="${playlist.id}"><i class="fas fa-arrow-down"></i> Mover Abajo</button>
                    <button class="menu-option delete-video" data-video-id="${video.videoId}" data-playlist-id="${playlist.id}"><i class="fas fa-trash-alt"></i> Eliminar</button>
                    <button class="menu-option add-to-another-playlist" data-video-id="${video.videoId}" data-video-title="${video.title}" data-video-thumbnail="${video.thumbnail}" data-video-duration="${video.duration}" data-source-playlist-id="${playlist.id}"><i class="fas fa-plus"></i> Añadir a otra playlist</button>
                </div>
            `;
            videoItemDiv.appendChild(deleteVideoMenuDiv);

            // Event listeners para los botones de eliminar/mover
            const deleteButton = deleteVideoMenuDiv.querySelector('.delete-menu-button');
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation(); // Evitar que el clic se propague al documento
                closeAllContextMenus(); // Cerrar otros menús abiertos
                const menuContent = deleteButton.nextElementSibling;
                menuContent.classList.toggle('hidden');
            });

            deleteVideoMenuDiv.querySelector('.delete-video').addEventListener('click', (event) => {
                event.stopPropagation();
                removeVideoFromPlaylist(event.currentTarget.dataset.playlistId, event.currentTarget.dataset.videoId);
                closeAllContextMenus();
            });
            deleteVideoMenuDiv.querySelector('.move-video-up').addEventListener('click', (event) => {
                event.stopPropagation();
                moveVideoInPlaylist(event.currentTarget.dataset.playlistId, event.currentTarget.dataset.videoId, -1);
                closeAllContextMenus();
            });
            deleteVideoMenuDiv.querySelector('.move-video-down').addEventListener('click', (event) => {
                event.stopPropagation();
                moveVideoInPlaylist(event.currentTarget.dataset.playlistId, event.currentTarget.dataset.videoId, 1);
                closeAllContextMenus();
            });

            // Event listener para "Añadir a otra playlist"
            const addToAnotherPlaylistButton = deleteVideoMenuDiv.querySelector('.add-to-another-playlist');
            addToAnotherPlaylistButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const button = event.currentTarget;
                const videoData = {
                    videoId: button.dataset.videoId,
                    title: button.dataset.videoTitle,
                    thumbnail: button.dataset.videoThumbnail,
                    duration: parseInt(button.dataset.videoDuration, 10),
                };
                const sourcePlaylistId = button.dataset.sourcePlaylistId;
                showPlaylistSelectionPopup(button, videoData, 'transfer', sourcePlaylistId);
                closeAllContextMenus();
            });


            // Añadir listener para reproducción al hacer clic en el item
            videoItemDiv.addEventListener('click', () => {
                if (!event.target.closest('.delete-menu')) { // Evitar activar si click en menú
                    playVideoFromPlaylist(playlist.id, video.videoId);
                }
            });

            videoListDiv.appendChild(videoItemDiv);
        });
        playlistDiv.appendChild(videoListDiv);
        playlistsContainer.appendChild(playlistDiv);
    });
}

// --- NUEVA Función: Cerrar todos los menús contextuales de 3 puntos ---
function closeAllContextMenus() {
    document.querySelectorAll('.delete-menu-content:not(.hidden)').forEach(menu => {
        menu.classList.add('hidden');
    });
}
// --- NUEVA Función: Cerrar todos los popups de selección de playlist ---
function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu:not(.hidden)').forEach(popup => {
        popup.remove(); // Eliminar el popup del DOM
    });
}

// --- Nueva: Función para mostrar el popup de selección de playlist ---
function showPlaylistSelectionPopup(triggerElement, videoData, actionType, sourcePlaylistId = null) {
    // Eliminar cualquier popup existente para evitar múltiples abiertos
    closePlaylistSelectionPopups();

    const popupDiv = document.createElement('div');
    popupDiv.classList.add('playlist-selection-popup-menu'); // Clase CSS
    popupDiv.innerHTML = '<p>Mover/Copiar a playlist:</p>';

    // Añadir una opción para cada playlist
    playlistsData.forEach(playlist => {
        // No mostrar la playlist de origen como opción para transferir
        if (actionType === 'transfer' && playlist.id === sourcePlaylistId) {
            return;
        }

        const optionButton = document.createElement('button');
        optionButton.textContent = playlist.name;
        optionButton.classList.add('menu-option'); // Reutiliza clase
        optionButton.addEventListener('click', (event) => {
            event.stopPropagation();
            if (actionType === 'add') {
                addVideoToSpecificPlaylist(videoData, playlist.id);
            } else if (actionType === 'transfer') {
                // Si es 'transfer', primero eliminar de la original y luego añadir a la nueva
                removeVideoFromPlaylist(sourcePlaylistId, videoData.videoId, false); // No mostrar mensaje aquí
                addVideoToSpecificPlaylist(videoData, playlist.id);
            }
            popupDiv.remove(); // Cerrar popup después de seleccionar
        });
        popupDiv.appendChild(optionButton);
    });

    // Posicionar el popup debajo del elemento que lo disparó
    const rect = triggerElement.getBoundingClientRect();
    popupDiv.style.position = 'absolute';
    popupDiv.style.top = `${rect.bottom + window.scrollY + 5}px`;
    popupDiv.style.left = `${rect.left + window.scrollX}px`;
    popupDiv.style.zIndex = '1000'; // Asegurar que esté por encima de otros elementos

    document.body.appendChild(popupDiv); // Añadir al body

    // Asegurarse de que el popup se cierre al hacer clic fuera
    setTimeout(() => { // Pequeño retraso para evitar que el clic actual lo cierre
        document.addEventListener('click', closePlaylistSelectionPopups, { once: true });
    }, 100);
}


// --- Manejo de la expansión/contracción de playlists ---
function togglePlaylistExpand(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist) {
        playlist.isExpanded = !playlist.isExpanded;
        updatePlaylistsUI(); // Redibujar para reflejar el cambio
    }
}

// --- Manejo de eliminar playlist ---
function removePlaylist(playlistId) {
    // Confirmación visual
    if (!confirm("¿Estás seguro de que quieres eliminar esta playlist?")) {
        return;
    }
    const index = playlistsData.findIndex(p => p.id === playlistId);
    if (index !== -1) {
        const removedPlaylist = playlistsData.splice(index, 1);
        mostrarMensajeFlotante(`Playlist "${removedPlaylist[0].name}" eliminada.`);
        console.log(`Playlist ${playlistId} eliminada.`);
        // Si la playlist actual estaba reproduciendo, detener y reiniciar
        if (currentPlayingInfo.playlistId === playlistId) {
            stopVideo(); // Detener reproducción
            currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
            console.log("Reproducción detenida, playlist actual eliminada.");
        }
        updatePlaylistsUI(); // Actualizar la UI
        updateCurrentPlayingIndex(); // Recalcular índice aplanado
        checkAndEnablePlayButton(); // Actualizar estado del botón Play
    }
}

// --- Manejo de eliminar video de playlist ---
function removeVideoFromPlaylist(playlistId, videoId, showMessage = true) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist) {
        const videoIndex = playlist.videos.findIndex(v => v.videoId === videoId);
        if (videoIndex !== -1) {
            const removedVideo = playlist.videos.splice(videoIndex, 1);
            if (showMessage) {
                mostrarMensajeFlotante(`"${removedVideo[0].title}" eliminado de "${playlist.name}".`);
            }
            console.log(`Video ${videoId} eliminado de playlist ${playlistId}.`);

            // Si el video eliminado era el que se estaba reproduciendo actualmente
            if (currentPlayingInfo.videoId === videoId && currentPlayingInfo.playlistId === playlistId) {
                console.log("El video actualmente reproduciéndose ha sido eliminado. Saltando al siguiente...");
                playNextVideo(); // Intentar reproducir el siguiente video
            } else {
                updateCurrentPlayingIndex(); // Recalcular índice aplanado
            }
            updatePlaylistsUI(); // Actualizar la UI
            checkAndEnablePlayButton(); // Actualizar estado del botón Play
        }
    }
}

// --- Manejo de mover video dentro de playlist ---
function moveVideoInPlaylist(playlistId, videoId, direction) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    const index = playlist.videos.findIndex(v => v.videoId === videoId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < playlist.videos.length) {
        const [movedVideo] = playlist.videos.splice(index, 1);
        playlist.videos.splice(newIndex, 0, movedVideo);
        mostrarMensajeFlotante(`"${movedVideo.title}" movido.`);
        console.log(`Video ${videoId} movido en playlist ${playlistId} de ${index} a ${newIndex}.`);
        updatePlaylistsUI();
        updateCurrentPlayingIndex(); // Recalcular índice aplanado
    }
}

// --- Manejo de mover playlist ---
function movePlaylist(playlistId, direction) {
    const index = playlistsData.findIndex(p => p.id === playlistId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < playlistsData.length) {
        const [movedPlaylist] = playlistsData.splice(index, 1);
        playlistsData.splice(newIndex, 0, movedPlaylist);
        mostrarMensajeFlotante(`Playlist "${movedPlaylist.name}" movida.`);
        console.log(`Playlist ${playlistId} movida de ${index} a ${newIndex}.`);
        updatePlaylistsUI();
        updateCurrentPlayingIndex(); // Recalcular índice aplanado
    }
}

// Módulo: Funcionalidad de Reproducción

let reproduccionIniciada = false; // Flag para controlar el estado de reproducción

// Función para reproducir un video específico (por videoId y opcionalmente playlistId)
function playVideo(videoId, playlistId = null) {
    if (!playersInitialized) {
        console.warn("Reproductores no inicializados aún.");
        mostrarMensajeFlotante("Los reproductores aún no están listos. Inténtalo de nuevo en unos segundos.");
        return;
    }

    const flatList = getFlattenedPlaylist();
    let targetIndex = -1;

    if (playlistId) {
        targetIndex = flatList.findIndex(v => v.videoId === videoId && v.sourcePlaylistId === playlistId);
    } else {
        // Si no se da playlistId, buscar la primera ocurrencia del video
        targetIndex = flatList.findIndex(v => v.videoId === videoId);
    }

    if (targetIndex === -1) {
        console.error(`Video ${videoId} (en playlist ${playlistId || 'cualquiera'}) no encontrado en la lista aplanada.`);
        mostrarMensajeFlotante("El video solicitado no se encontró en tus playlists cargadas.");
        return;
    }

    const videoToPlay = flatList[targetIndex];

    // Verificar si ya está sonando el mismo video en el mismo player
    const activePlayer = (currentPlayer === 1 ? player1 : player2);
    try {
        if (activePlayer && activePlayer.getPlayerState() !== -1 && activePlayer.getVideoData()?.video_id === videoId) {
            if (activePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                console.log(`Video ${videoId} ya está reproduciéndose. No se hace nada.`);
                return;
            } else {
                console.log(`Video ${videoId} ya está en el reproductor pero no reproduciendo. Reanudando.`);
                activePlayer.playVideo();
                reproduccionIniciada = true;
                updatePlayButtonIcon(true);
                return;
            }
        }
    } catch (e) {
        console.warn("Error al verificar estado del reproductor actual:", e);
    }

    console.log(`Intentando reproducir video: ${videoToPlay.title} (${videoToPlay.videoId}) desde flattenedIndex: ${targetIndex}`);

    // Si ya estamos en una transición, intentar abortarla o manejarla
    if (isTransitioning) {
        console.log("Ya hay una transición en curso, intentando abortar/interrumpir.");
        // Podríamos decidir qué hacer: detener el fade actual, forzar el nuevo video, etc.
        // Por ahora, simplemente cargaremos el nuevo video en el 'otro' reproductor.
    }

    // Determinar el player "siguiente" (el que no está activo, o el 1 si no hay activo)
    const nextPlayerNum = (currentPlayer === 1 ? 2 : 1);
    const nextPlayer = (nextPlayerNum === 1 ? player1 : player2);
    const activePlayerElement = document.getElementById(`player${currentPlayer}`);
    const nextPlayerElement = document.getElementById(`player${nextPlayerNum}`);

    // Pre-cargar el video en el siguiente reproductor
    nextPlayer.loadVideoById(videoToPlay.videoId);
    isTransitioning = true; // Establecer flag de transición
    reproduccionIniciada = true; // Marcar reproducción como iniciada
    updatePlayButtonIcon(true); // Actualizar icono a pausa

    // Actualizar currentPlayingInfo *inmediatamente* con el video que se INTENTA reproducir
    currentPlayingInfo.playlistId = videoToPlay.sourcePlaylistId;
    currentPlayingInfo.videoId = videoToPlay.videoId;
    currentPlayingInfo.flattenedIndex = targetIndex;
    updatePlaylistsUI(); // Actualizar UI para reflejar el resaltado

    // Iniciar crossfade y cambiar z-index
    setTimeout(() => { // Pequeño delay para asegurar que loadVideoById empiece a cargar
        // Ocultar el player activo actual y mostrar el siguiente
        activePlayerElement.classList.add('fade-out');
        activePlayerElement.classList.remove('fade-in');
        activePlayerElement.style.zIndex = '1'; // El player que se va a ocultar

        nextPlayerElement.classList.add('fade-in');
        nextPlayerElement.classList.remove('fade-out');
        nextPlayerElement.style.zIndex = '2'; // El player que se va a mostrar

        // Iniciar la reproducción del siguiente reproductor (si no se inició ya automáticamente)
        if (nextPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
            console.log(`Intentando playVideo() en player ${nextPlayerNum} después de load.`);
            nextPlayer.playVideo();
        }

        // Manejar el final del crossfade visual y de audio
        // El crossfade de audio se maneja en monitorPlayers ahora.
        // Aquí solo la lógica visual:
        setTimeout(() => {
            // El player que estaba activo puede ser pausado y enviado al fondo
            if (activePlayer && typeof activePlayer.pauseVideo === 'function') {
                try { activePlayer.pauseVideo(); } catch (e) { console.warn("Error al pausar el player viejo:", e); }
            }
            if (activePlayerElement) {
                 activePlayerElement.classList.add('hidden'); // Ocultar completamente al final del crossfade
                 activePlayerElement.classList.remove('fade-out'); // Limpiar clase
            }
            // currentPlayer se actualizará en onPlayerStateChange cuando el nuevo reproductor entre en PLAYING
            isTransitioning = false; // Transición visual terminada
            console.log("Transición visual completada.");
        }, CROSSFADE_DURATION * 1000); // Esperar la duración completa del crossfade

    }, 100); // Un pequeño retraso para permitir la preparación del iframe
}


// Función para reproducir un video desde la lista de reproducción
function playVideoFromPlaylist(playlistId, videoId) {
    console.log(`Reproducir videoId: ${videoId} desde playlistId: ${playlistId}`);
    playVideo(videoId, playlistId);
}

// Funciones de control de reproducción
function togglePlayPause() {
    if (!playersInitialized) {
        mostrarMensajeFlotante("Los reproductores no están listos aún.");
        return;
    }
    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        mostrarMensajeFlotante("No hay videos en la playlist para reproducir.");
        return;
    }

    const activePlayer = (currentPlayer === 1 ? player1 : player2);
    if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') {
         console.warn("No hay reproductor activo o no está listo.");
         // Si no hay player activo, intentar reproducir el primer video de la lista aplanada
         if (flatList.length > 0) {
              console.log("No hay player activo, intentando reproducir el primer video.");
              playVideo(flatList[0].videoId, flatList[0].sourcePlaylistId);
         }
         return;
    }

    const playerState = activePlayer.getPlayerState();

    if (playerState === YT.PlayerState.PLAYING) {
        activePlayer.pauseVideo();
        reproduccionIniciada = false;
        updatePlayButtonIcon(false); // Pausa
    } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
        // Si está pausado o en cola, intentar reproducir
        // Asegúrate de que currentPlayingInfo esté actualizado si se pausó y luego reanuda
        if (currentPlayingInfo.videoId && currentPlayingInfo.flattenedIndex !== -1) {
            activePlayer.playVideo();
            reproduccionIniciada = true;
            updatePlayButtonIcon(true); // Reproduciendo
        } else {
             // Si no hay info de reproducción, intentar reproducir el primer video
            console.log("Player en pausa/cola pero sin currentPlayingInfo, intentando reproducir el primer video.");
            playVideo(flatList[0].videoId, flatList[0].sourcePlaylistId);
        }
    } else if (playerState === YT.PlayerState.ENDED || playerState === -1 /* unstarted */) {
         // Si terminó o no ha iniciado, reproducir el primer video o el siguiente
         if (currentPlayingInfo.flattenedIndex !== -1) {
             playNextVideo(); // Si ya había algo reproduciendo, pasar al siguiente
         } else {
            playVideo(flatList[0].videoId, flatList[0].sourcePlaylistId); // Reproducir el primero
         }
    }
}

function playNextVideo() {
    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("No hay videos para reproducir.");
        stopVideo();
        return;
    }

    // Determinar el índice del siguiente video
    let nextIndex;
    if (currentPlayingInfo.flattenedIndex === -1) {
        nextIndex = 0; // Si no hay nada sonando, empezar desde el principio
    } else {
        nextIndex = currentPlayingInfo.flattenedIndex + 1;
        if (nextIndex >= flatList.length) {
            nextIndex = 0; // Volver al principio si se llegó al final de la playlist
        }
    }

    const nextVideo = flatList[nextIndex];
    console.log(`Reproduciendo siguiente video: ${nextVideo.title} (Índice: ${nextIndex})`);
    playVideo(nextVideo.videoId, nextVideo.sourcePlaylistId);
}

function playPrevVideo() {
    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("No hay videos para reproducir.");
        stopVideo();
        return;
    }

    // Determinar el índice del video anterior
    let prevIndex;
    if (currentPlayingInfo.flattenedIndex === -1) {
        prevIndex = flatList.length - 1; // Si no hay nada sonando, ir al último
    } else {
        prevIndex = currentPlayingInfo.flattenedIndex - 1;
        if (prevIndex < 0) {
            prevIndex = flatList.length - 1; // Volver al final si se llegó al principio
        }
    }

    const prevVideo = flatList[prevIndex];
    console.log(`Reproduciendo video anterior: ${prevVideo.title} (Índice: ${prevIndex})`);
    playVideo(prevVideo.videoId, prevVideo.sourcePlaylistId);
}

function stopVideo() {
    if (player1 && typeof player1.stopVideo === 'function') {
        try { player1.stopVideo(); } catch (e) { console.warn("Error al detener player1:", e); }
    }
    if (player2 && typeof player2.stopVideo === 'function') {
        try { player2.stopVideo(); } catch (e) { console.warn("Error al detener player2:", e); }
    }
    reproduccionIniciada = false;
    currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
    updatePlayButtonIcon(false); // Pausa
    updatePlaylistsUI(); // Quitar resaltado de video actual
    resetVisualPlayers(); // Restablecer visibilidad y z-index
    console.log("Reproducción detenida y reproductores reseteados visualmente.");
}

function resetVisualPlayers() {
    const player1Element = document.getElementById('player1');
    const player2Element = document.getElementById('player2');

    if (player1Element) {
        player1Element.classList.add('hidden'); // Ocultar por defecto
        player1Element.classList.remove('fade-in', 'fade-out'); // Limpiar clases de transición
        player1Element.style.zIndex = '1';
    }
    if (player2Element) {
        player2Element.classList.add('hidden'); // Ocultar por defecto
        player2Element.classList.remove('fade-in', 'fade-out'); // Limpiar clases de transición
        player2Element.style.zIndex = '1';
    }
    // Asegurar que solo uno (o ninguno) sea visible si no hay reproducción activa
    // Si no hay reproducción activa, ambos deben estar hidden
    if (!reproduccionIniciada && player1Element && player2Element) {
        player1Element.classList.add('hidden');
        player2Element.classList.add('hidden');
    }
}


// --- Actualizar icono del botón Play ---
const botonPlay = document.getElementById('botonPlay');
function updatePlayButtonIcon(isPlaying) {
    if (!botonPlay) return;
    botonPlay.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}


// Módulo: Barra de Progreso y Monitor de Reproducción

const timeElapsedSpan = document.getElementById('timeElapsed');
const timeRemainingSpan = document.getElementById('timeRemaining');
const progressBarDiv = document.getElementById('progressBar');
const progressSeekBar = document.getElementById('progressSeek-bar'); // El contenedor clickeable

function monitorPlayers() {
    if (!reproduccionIniciada) {
        timeElapsedSpan.textContent = "0:00";
        timeRemainingSpan.textContent = "0:00";
        if (progressBarDiv) progressBarDiv.style.width = '0%';
        return;
    }

    const activePlayer = (currentPlayer === 1 ? player1 : player2);
    if (!activePlayer || typeof activePlayer.getCurrentTime !== 'function' || typeof activePlayer.getDuration !== 'function') {
        return;
    }

    const currentTime = activePlayer.getCurrentTime();
    const duration = activePlayer.getDuration();

    if (duration > 0) {
        const elapsedPercentage = (currentTime / duration) * 100;
        if (progressBarDiv) progressBarDiv.style.width = `${elapsedPercentage}%`;
        timeElapsedSpan.textContent = formatDuration(currentTime);
        timeRemainingSpan.textContent = formatDuration(duration - currentTime);

        // --- Lógica de Crossfade de Audio (Volumen) ---
        const flatList = getFlattenedPlaylist();
        const currentVideo = flatList[currentPlayingInfo.flattenedIndex];

        if (currentVideo && !isTransitioning && !isAudioFading) {
            // Verificar si el video está cerca del final para iniciar el crossfade de salida
            if (duration - currentTime <= CROSSFADE_DURATION && currentPlayingInfo.flattenedIndex < flatList.length - 1) {
                console.log("Iniciando crossfade de salida...");
                isAudioFading = true; // Prevenir múltiples llamadas
                startAudioFade(activePlayer, 'out', () => {
                    console.log("Crossfade de salida completado. Iniciando siguiente video.");
                    playNextVideo();
                });
            }
        }
        // --- Lógica de SponsorBlock ---
        checkAndSkipSegment(activePlayer);
    }
}

// Función para el crossfade de audio
function startAudioFade(player, direction, callback) {
    const startVolume = direction === 'out' ? 100 : 0;
    const endVolume = direction === 'out' ? 0 : 100;
    const volumeStep = (endVolume - startVolume) / (CROSSFADE_DURATION * 10); // 10 pasos por segundo

    let currentVolume = startVolume;
    isAudioFading = true; // Set the flag

    const fadeInterval = setInterval(() => {
        currentVolume += volumeStep;
        if ((direction === 'out' && currentVolume <= endVolume) || (direction === 'in' && currentVolume >= endVolume)) {
            currentVolume = endVolume;
            player.setVolume(currentVolume);
            clearInterval(fadeInterval);
            isAudioFading = false; // Reset the flag
            if (callback) callback();
            console.log(`Crossfade de audio '${direction}' terminado.`);
        } else {
            player.setVolume(currentVolume);
        }
    }, 100); // Actualizar cada 100ms
}

// Seek a través de la barra de progreso
if (progressSeekBar) {
    progressSeekBar.addEventListener('click', (event) => {
        const activePlayer = (currentPlayer === 1 ? player1 : player2);
        if (!activePlayer || typeof activePlayer.getDuration !== 'function') return;

        const rect = progressSeekBar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const width = rect.width;
        const newTime = (clickX / width) * activePlayer.getDuration();

        activePlayer.seekTo(newTime, true);
        console.log(`Buscando a: ${formatDuration(newTime)}`);
    });
}


// Módulo: Funciones Utilitarias (Formato, etc.)

// Formatear duración de segundos a MM:SS
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const formattedSeconds = remainingSeconds < 10 ? '0' + remainingSeconds : remainingSeconds;
    return `${minutes}:${formattedSeconds}`;
}

// Parsear duración de formato ISO 8601 (PT#M#S) a segundos o directamente si ya es número
function parseDuration(duration) {
    if (typeof duration === 'number') return duration; // Ya es segundos
    
    const p = duration.indexOf('P');
    if (p === -1) return 0; // No es formato ISO 8601
    
    let totalSeconds = 0;
    const timePart = duration.substring(p + 1); // Remove 'P'
    
    const matches = timePart.match(/(\d+H)?(\d+M)?(\d+S)?/);
    if (!matches) return 0;

    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    const seconds = parseInt(matches[3] || '0');

    totalSeconds += hours * 3600;
    totalSeconds += minutes * 60;
    totalSeconds += seconds;

    return totalSeconds;
}


// Módulo: SponsorBlock Integration (Simplified Piped API)

async function fetchSponsorSegments(videoId) {
    if (segmentosCache[videoId]) {
        return segmentosCache[videoId];
    }
    try {
        const response = await fetch(`/.netlify/functions/sponsorblock?video_id=${videoId}`);
        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Error fetching SponsorBlock segments:", errorBody.error || response.statusText);
            return []; // Retornar array vacío en caso de error
        }
        const data = await response.json();
        const segments = data || []; // Asegurarse de que sea un array
        segmentosCache[videoId] = segments;
        console.log(`Segmentos de SponsorBlock para ${videoId}:`, segments);
        return segments;
    } catch (error) {
        console.error("Error en fetchSponsorSegments:", error);
        return [];
    }
}

async function checkAndSkipSegment(player, forceCheck = false) {
    if (!player || typeof player.getPlayerState !== 'function' || !player.getVideoData) {
        return;
    }

    const videoId = player.getVideoData()?.video_id;
    if (!videoId) return;

    const playerState = player.getPlayerState();
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();

    // Solo actuar si está reproduciendo o si se fuerza la comprobación (ej. al inicio de un video)
    if (playerState !== YT.PlayerState.PLAYING && !forceCheck) {
        return;
    }

    // Evitar re-saltos inmediatos después de un skip
    if (videoId === lastSeekVideoId && Math.abs(currentTime - lastSeekEndTime) < 0.5) {
        // console.log("Evitando re-salto inmediato.");
        return;
    }

    const segments = await fetchSponsorSegments(videoId);
    if (segments.length === 0) return;

    for (const segment of segments) {
        const [segmentStart, segmentEnd] = segment.segment;
        const category = segment.category;

        // Comprobar si el tiempo actual está dentro de un segmento a saltar
        if (currentTime >= segmentStart && currentTime < segmentEnd) {
            // Asegurarse de que sea una categoría a saltar (puedes expandir esto)
            if (['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'filler'].includes(category)) {
                let skipToTime = segmentEnd + 0.1; // Saltar un poco más allá del final del segmento
                // Si el segmento 'outro' lleva al final del video y hay siguiente video en la playlist,
                // activar un crossfade especial a ese siguiente video.
                if (category === 'outro' && (duration - segmentEnd) < 5) { // Si el 'outro' es cerca del final del video
                     const flatList = getFlattenedPlaylist();
                     const currentIndex = flatList.findIndex(v => v.videoId === videoId);
                     if (currentIndex !== -1 && currentIndex < flatList.length - 1) { // Si no es el último video
                         console.log(`Detectado segmento 'outro' cerca del final. Iniciando crossfade a siguiente video.`);
                         hasOutroCrossfadeStarted = true; // Activar el flag
                         // No hacer seek, dejar que el crossfade de audio se active y luego playNextVideo
                         return; // Salir sin hacer seekTo
                     }
                }

                console.log(`Saltando segmento de ${category}: ${formatDuration(segmentStart)} - ${formatDuration(segmentEnd)}. Salto a ${formatDuration(skipToTime)}`);
                player.seekTo(skipToTime, true);
                lastSeekEndTime = skipToTime;
                lastSeekVideoId = videoId;
                // Mostrar mensaje flotante al usuario
                mostrarMensajeFlotante(`Saltando: ${category.charAt(0).toUpperCase() + category.slice(1)}`);
                return; // Solo salta un segmento a la vez
            }
        }
    }
}

// Módulo: Listeners de Eventos y Carga Inicial

document.addEventListener('DOMContentLoaded', () => {
    // Cargar la API de YouTube una vez que el DOM esté listo
    loadYouTubeAPI();

    // Asignar listeners a los botones de control de reproducción
    document.getElementById('botonPlay').addEventListener('click', togglePlayPause);
    document.getElementById('botonStop').addEventListener('click', stopVideo);
    document.getElementById('botonNext').addEventListener('click', playNextVideo);
    document.getElementById('botonPrev').addEventListener('click', playPrevVideo);

    // Asignar listeners a los botones de Google SignIn/SignOut AHORA DENTRO de DOMContentLoaded
    // Estos estaban fuera y causaban el error 'null'
    const signInButton = document.getElementById('googleSignInButton');
    const signOutButton = document.getElementById('googleSignOutButton');

    if (signInButton) { // Añadir una comprobación de existencia por si acaso, aunque con DOMContentLoaded no debería ser null
        signInButton.addEventListener('click', handleAuthClick);
    } else {
        console.warn("Elemento #googleSignInButton no encontrado al cargar el DOM.");
    }

    if (signOutButton) { // Igual para el botón de cerrar sesión
        signOutButton.addEventListener('click', handleSignOutClick);
    } else {
        console.warn("Elemento #googleSignOutButton no encontrado al cargar el DOM.");
    }


    // Listener para la barra de búsqueda
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query);
            // Limpiar resultados anteriores y mostrar spinner si es necesario
            resultsDiv.innerHTML = '';
            showLoadingSpinner(); // Mostrar spinner de página completa si la búsqueda es lenta
        } else {
            mostrarMensajeFlotante("Por favor, introduce un término de búsqueda.");
        }
    });

    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            searchButton.click();
        }
    });

    // Iniciar la actualización de la UI de playlists
    updatePlaylistsUI();

    // Comentar la llamada inicial a mostrarMensajeFlotante si no la necesitas
    // mostrarMensajeFlotante("¡Bienvenido a YT CrossMix!");

    // Inicialmente, deshabilitar botón Play si no hay videos cargados
    document.getElementById('botonPlay').disabled = true;

    // Asegurarse de que el spinner de carga de página completa esté oculto al inicio
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
