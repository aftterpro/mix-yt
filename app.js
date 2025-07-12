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

const YOUTUBE_LIBRARY_SOURCE_ID = 'youtube_library'; // ID para identificar estas playlists


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
// Módulo: Integración con la Biblioteca de YouTube (Escucha de eventos de auth.js)

/**
 * Procesa las playlists obtenidas de la API de YouTube y las añade a la aplicación.
 * @param {Array} youtubePlaylists - El array de playlists de la API de Google.
 */
function addYouTubeLibraryPlaylists(youtubePlaylists) {
    if (!youtubePlaylists || youtubePlaylists.length === 0) {
        mostrarMensajeFlotante("No se encontraron playlists en tu biblioteca de YouTube.");
        return;
    }

    // Transforma los datos de la API al formato que usa nuestra app
    const formattedPlaylists = youtubePlaylists.map(playlist => {
        // Ignorar playlists que no tienen título o items
        if (!playlist.snippet.title || playlist.contentDetails.itemCount === 0) {
            return null;
        }
        return {
            id: playlist.id,
            name: playlist.snippet.title,
            // Usar thumbnail de alta calidad si está disponible, si no, el por defecto
            thumbnailUrl: playlist.snippet.thumbnails.high?.url || playlist.snippet.thumbnails.default.url,
            videos: [], // Los videos se cargarán desde Piped al hacer clic en la playlist
            isExpanded: false,
            source: YOUTUBE_LIBRARY_SOURCE_ID, // Marcar como playlist de la biblioteca de YT
            isLoaded: false, // Marcar que los videos aún no se han cargado
        };
    }).filter(p => p !== null); // Filtrar las playlists nulas

    // Añadir las nuevas playlists al principio de la lista de datos
    playlistsData.unshift(...formattedPlaylists);
    
    mostrarMensajeFlotante(`${formattedPlaylists.length} playlists de tu biblioteca han sido añadidas.`);
    updatePlaylistsUI(); // Refrescar la interfaz
}


/**
 * Elimina todas las playlists que fueron cargadas desde la biblioteca de YouTube.
 */
function clearYouTubeLibraryPlaylists() {
    const initialCount = playlistsData.length;
    playlistsData = playlistsData.filter(p => p.source !== YOUTUBE_LIBRARY_SOURCE_ID);
    const removedCount = initialCount - playlistsData.length;
    
    if (removedCount > 0) {
        console.log(`Se eliminaron ${removedCount} playlists de la biblioteca de YouTube.`);
        updatePlaylistsUI(); // Actualizar la interfaz para que desaparezcan
    }
}

// --- Listener para cuando se obtienen las playlists ---
document.addEventListener('playlistsFetched', (event) => {
    console.log("Evento 'playlistsFetched' recibido en app.js");
    const libraryPlaylists = event.detail;
    addYouTubeLibraryPlaylists(libraryPlaylists);
});

// --- Listener para cuando el usuario cierra sesión ---
document.addEventListener('userLoggedOut', () => {
    console.log("Evento 'userLoggedOut' recibido en app.js");
    clearYouTubeLibraryPlaylists();
});
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

         // Ajustar max-height después de añadir contenido si está expandido (para animación)
         if (playlist.isExpanded) {
             // Pequeño delay para asegurar que los elementos estén en el DOM
             // requestAnimationFrame(() => { // O setTimeout(..., 0)
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
             // });
         }
    });

    playlistContainer.scrollTop = currentScrollTop; // Restaurar posición scroll

    // Volver a habilitar Drag and Drop (Fase 1 - dentro de la misma lista)
    enableDragAndDrop();
}
/**
 * Actualiza de forma inteligente solo la UI de una playlist específica,
 * evitando un redibujado completo de todo el contenedor.
 * @param {string} playlistId - El ID de la playlist a actualizar.
 */
function updateSinglePlaylistUI(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);

    if (!groupDiv) {
        console.warn(`updateSinglePlaylistUI: No se encontró el grupo en el DOM para la playlist ${playlistId}.`);
        // Si no se encuentra, como fallback, redibujar todo para evitar inconsistencias.
        updatePlaylistsUI();
        return;
    }

    // Caso especial: si la playlist se quedó vacía y no es la manual, la eliminamos del DOM.
    if (playlist && playlist.videos.length === 0 && playlist.id !== 'manual') {
        // Opcional: mostrar mensaje antes de eliminar la playlist de la lista de datos.
        mostrarMensajeFlotante(`Playlist "${playlist.name}" eliminada (vacía).`);
        playlistsData = playlistsData.filter(p => p.id !== playlistId);
        groupDiv.style.transition = 'opacity 0.3s ease';
        groupDiv.style.opacity = '0';
        setTimeout(() => groupDiv.remove(), 300); // Eliminar del DOM tras la animación
        return;
    }
    
    // Si la playlist todavía existe, actualizamos su contenido.
    if (playlist) {
        // 1. Actualizar el contador en el header
        const headerName = groupDiv.querySelector('.playlist-group-name');
        if (headerName) {
            headerName.textContent = `${playlist.name} (${playlist.videos.length})`;
        }

        // 2. Redibujar solo la lista de videos de esta playlist
        const videosDiv = groupDiv.querySelector('.playlist-group-videos');
        if (videosDiv) {
            const playingVideoId = currentPlayingInfo.videoId;
            videosDiv.innerHTML = ''; // Limpiar solo esta lista de videos
            playlist.videos.forEach(video => {
                const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
                videosDiv.appendChild(item);
            });
            
            // Re-habilitar drag & drop solo para los nuevos elementos de esta playlist
            enableDragAndDrop(videosDiv);

            // Ajustar la altura para mantener la animación de expandir/colapsar
            if (playlist.isExpanded) {
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            }
        }
    }
}
// --- Helper para crear elemento de Video en Playlist ---
function createPlaylistItemElement(video, playlistId, playingVideoId) {
    // Crear el contenedor principal para el item de la playlist
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.draggable = true; // Permitir arrastrar para drag and drop
    item.dataset.videoId = video.videoId; // Almacenar ID del video en el dataset
    item.dataset.playlistId = playlistId; // Almacenar ID de la playlist en el dataset

    // Contenedor para la imagen (thumbnail)
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    const img = document.createElement('img');
    img.src = video.thumbnail; // URL del thumbnail
    img.alt = video.title; // Texto alternativo para accesibilidad
    img.className = 'drag-handle'; // Clase para usar como manejador de arrastre
    img.loading = 'lazy'; // Carga perezosa para optimización
    imageContainer.appendChild(img);

    // Resaltar si el video está sonando actualmente
    if (video.videoId === playingVideoId) {
        item.classList.add('playing'); // Agregar clase 'playing' al item
        const icon = document.createElement('i'); // Icono de volumen/sonando
        icon.className = 'fa-solid fa-volume-high playing-icon';
        imageContainer.appendChild(icon);
    }
    item.appendChild(imageContainer); // Añadir contenedor de imagen al item principal

    // Contenedor para el texto (título y duración)
    const textContainer = document.createElement('div');
    // Usar innerHTML para agregar fácilmente múltiples párrafos con estilos inline básicos
    textContainer.innerHTML = `
        <p style="margin: 0; font-size: 12px; font-weight: bold;" title="${video.title}">${video.title}</p>
        <p style="margin: 0; font-size: 10px; color: #999;">Duración: ${formatDuration(video.duration)}</p>
    `;
    item.appendChild(textContainer); // Añadir contenedor de texto al item principal

    // --- Estructura del Menú Contextual (los 3 puntos) ---
    const deleteMenu = document.createElement('div'); // Contenedor para el botón y el contenido del menú
    deleteMenu.className = 'delete-menu';
    const menuButton = document.createElement('button'); // El botón de 3 puntos que abre/cierra el menú
    menuButton.className = 'delete-menu-button';
    menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    const menuContent = document.createElement('div'); // Contenedor principal del contenido del menú (las opciones: Eliminar, Mover, etc.)
    menuContent.className = 'delete-menu-content'; // Asegúrate de que tu CSS oculte esto por defecto (display: none;)

    // --- Botones del Menú ---

    // 1. Botón "Eliminar"
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button-item'; // Clase para estilizar los items del menú
    deleteButton.title = 'Eliminar de esta playlist';
    deleteButton.innerHTML = '<i class="fa-solid fa-xmark"></i> Eliminar';
    menuContent.appendChild(deleteButton); // Añadir botón Eliminar al contenido del menú

    // 2. Botón "Reproducir Después"
    const playNextButton = document.createElement('button');
    playNextButton.className = 'play-next-button'; // Clase para estilizar
    playNextButton.title = 'Poner después del video actual';
    playNextButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i> Reproducir Despues';
    menuContent.appendChild(playNextButton); // Añadir botón Reproducir Después al contenido del menú

    // 3. Botón "Mover a otra playlist" (Este disparará el popup genérico)
    const moveToPlaylistButton = document.createElement('button');
    moveToPlaylistButton.className = 'move-to-playlist-button'; // Clase para estilizar
    moveToPlaylistButton.title = 'Mover este video a otra playlist';
    moveToPlaylistButton.innerHTML = '<i class="fa-solid fa-folder-tree"></i> Mover a playlist';
    menuContent.appendChild(moveToPlaylistButton); // Añadir botón Mover a playlist al contenido del menú


    // --- Añadir el botón del menú y el contenido del menú al contenedor deleteMenu ---
    deleteMenu.appendChild(menuButton);
    deleteMenu.appendChild(menuContent);
    // Añadir el contenedor deleteMenu (que contiene el botón y el menú desplegable) al item principal
    item.appendChild(deleteMenu);

    // --- Listeners de Eventos ---

    // --- Listener para el botón de 3 puntos (menuButton) ---
    // Este listener controla la visibilidad del contenido del menú (menuContent)
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Detener la propagación para que el click no cierre inmediatamente el menú via el listener global

        // Cerrar cualquier otro menú contextual abierto antes de abrir este
        // Asegúrate de que tu función closeAllContextMenus() cierre todos los elementos con la clase .delete-menu-content
        closeAllContextMenus();

        // Alternar la visualización del contenido de este menú específico
        // Verificar el estilo de visualización actual o si tiene la clase 'visible'
        if (menuContent.style.display === 'block' || menuContent.classList.contains('visible')) {
            // Si está visible, ocultarlo
            menuContent.style.display = 'none';
            menuContent.classList.remove('visible'); // Eliminar clase si la usas para estilizar
        } else {
            // Si está oculto, mostrarlo
            menuContent.style.display = 'block';
            // Opcional: Posicionar el menú relativo al botón si tu CSS no lo hace (ajustar valores si es necesario)
            // menuContent.style.position = 'absolute'; // Si el contenedor padre (deleteMenu) tiene relative/absolute
            // menuContent.style.top = `${menuButton.offsetHeight}px`; // Posicionar justo debajo del botón
            // menuContent.style.left = '0'; // Alinear a la izquierda del botón

            menuContent.classList.add('visible'); // Agregar clase si la usas para estilizar
        }
    });
    // --- Listener para el botón "Eliminar" (sin cambios en lógica interna) ---
    deleteButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Evitar que el click dentro del menú cierre el menú globalmente
        deleteVideo(playlistId, video.videoId); // Llamar a tu función para eliminar el video
        closeAllContextMenus(); // Cerrar el menú después de realizar la acción
    });

    // --- Listener para el botón "Reproducir Despues" (lógica de mover/insertar) ---
    playNextButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Evitar que el click dentro del menú cierre el menú globalmente
        console.log("Click en 'Reproducir Despues'");
        closeAllContextMenus(); // Cerrar el menú

        const sourceVideoId = video.videoId; // ID del video a mover
        const sourcePlaylistId = playlistId; // ID de la playlist de origen

        // --- Lógica para calcular la posición de "Reproducir Después" ---
        let targetFlatIndex;
        // Si no hay nada sonando (-1), ponerlo al inicio o después del primero si ya hay algo
        if (currentPlayingInfo.flattenedIndex < 0) {
             // Si el video a reproducir después es el primero de su propia playlist y no hay nada sonando, ponerlo en el índice aplanado 0.
             // Si no, ponerlo en el índice aplanado 0 (será el primero).
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
             const sourceIndexInOwn = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

             // Si es el primer video de su playlist O la playlist de origen es la manual (donde se añaden nuevos)
             if (sourceIndexInOwn === 0 || sourcePlaylistId === 'manual') {
                  targetFlatIndex = 0; // Ponerlo al principio absoluto
             } else {
                  targetFlatIndex = 0; // Si no es el primer video de su playlist, ponerlo al principio absoluto también
             }
            console.log(`Nada sonando, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex}`);
        } else {
             // Si ya hay algo sonando, ponerlo justo después del video actual
             targetFlatIndex = currentPlayingInfo.flattenedIndex + 1;
             console.log(`Sonando ${currentPlayingInfo.videoId}, moviendo ${sourceVideoId} a índice aplanado ${targetFlatIndex} (después del actual).`);
        }
        // Asegurarse de que el índice aplanado destino no exceda el tamaño total de la lista
        const flatList = getFlattenedPlaylist();
        targetFlatIndex = Math.max(0, Math.min(targetFlatIndex, flatList.length)); // Permite añadir al final (índice == length)


        // --- Lógica para encontrar la playlist destino y el índice local a partir del índice aplanado ---
        let cumulativeIndex = 0;
        let targetLocalIndex = -1; // Índice dentro de la playlist destino
        let targetPlaylistId = null; // ID de la playlist destino

        for (const p of playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;

            // Si el índice aplanado destino cae dentro de esta playlist O
            // si el índice aplanado destino es justo al final de esta playlist Y es la última playlist,
            // significa que el video debe insertarse aquí.
            if (targetFlatIndex < endOfPlaylistIndex || (targetFlatIndex === endOfPlaylistIndex && p === playlistsData[playlistsData.length -1]) ) {
                targetPlaylistId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex; // El índice local es la diferencia

                // Asegurarse de que el índice local no exceda el tamaño actual de la playlist (para añadir al final)
                targetLocalIndex = Math.min(targetLocalIndex, p.videos.length);

                break; // Encontramos la playlist destino, salimos del bucle
            }
            cumulativeIndex += playlistVideoCount; // Sumar el tamaño de la playlist actual
        }

        // Ejecutar la función de movimiento si se encontró una playlist y un índice destino válidos
        if (targetPlaylistId !== null && targetLocalIndex !== -1) {
             // Asegurarse de que no estamos intentando moverlo a la misma posición de donde viene
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
             const sourceLocalIndex = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;

             if (!(sourcePlaylistId === targetPlaylistId && sourceLocalIndex === targetLocalIndex)) {
                console.log(`Moviendo ${sourceVideoId} (de ${sourcePlaylistId}) a Playlist ${targetPlaylistId} en índice local ${targetLocalIndex} para 'Reproducir Después'`);
                moveVideo(sourceVideoId, sourcePlaylistId, targetPlaylistId, targetLocalIndex); // Llamar a la función general de mover
             } else {
                  console.log(`Video ${sourceVideoId} ya está en la posición de 'Reproducir Después', no se mueve.`);
             }
        } else {
            console.error("createPlaylistItemElement: No se pudo determinar la playlist/índice destino para 'Reproducir Despues'.");
            mostrarMensajeFlotante("Error al calcular la posición para 'Reproducir Después'.");
        }
    });
    // --- Listener para el botón "Mover a playlist" (MODIFICADO) ---
    // Este listener dispara la nueva función genérica de popup de selección de playlist.
    // Ya lo modificaste en un paso anterior, solo asegúrate de que este es el código que tienes.
    moveToPlaylistButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Detener la propagación del evento de click
        console.log("Click en 'Mover a playlist'");

        // Define los datos del video y el ID de la playlist de origen necesarios para la acción de mover
        const sourceVideoId = video.videoId; // Obtener ID del video del objeto 'video' pasado a la función
        const sourcePlaylistId = playlistId; // Obtener ID de la playlist del parámetro 'playlistId'

        // Crear un objeto videoData simplificado necesario por el manejador del popup genérico
        // La función moveVideo eventualmente solo necesita el videoId, pero pasar más contexto puede ser útil.
        const videoDataForMove = {
            videoId: sourceVideoId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
        };

        // Llamar a la nueva función genérica que muestra el popup de selección de playlist con:
        // - El botón del menú (el de 3 puntos) como elemento de anclaje para el posicionamiento
        // - Los datos del video que se está moviendo
        // - El tipo de acción 'move'
        // - El sourcePlaylistId desde el cual se está moviendo el video
        showPlaylistSelectionPopup(menuButton, // Anclaje al elemento del botón de 3 puntos
                                     videoDataForMove,
                                     'move', // Indicar que la acción es 'mover'
                                     sourcePlaylistId); // Pasar el ID de la playlist de origen
    });
    // Devolver el elemento item completo que fue creado
    return item;
}
// --- NEW: Generic Playlist Selection Popup ---
// Handles both "Add to Playlist" and "Move to Playlist"
function showPlaylistSelectionPopup(anchorElement, videoData, actionType, sourcePlaylistId = null) {
    // Close any other open popups of this type
    closePlaylistSelectionPopups();
    // Also close the main context menus (3 dots menu) to avoid overlap
    closeAllContextMenus();

    const menu = document.createElement('div');
    // Use a specific class for this popup type, reuse styling from add-to-playlist-menu
    menu.className = 'playlist-selection-popup-menu add-to-playlist-menu';

    let availablePlaylists = playlistsData; // Start with all playlists
    let popupTitleText = '';
    let itemClickHandler = null;

    if (actionType === 'add') {
        // Logic for adding from search results
        popupTitleText = "Add video to:";
        // No filtering needed, allow adding to any playlist including manual
        // The addVideoToSpecificPlaylist function handles duplicate checks.
        availablePlaylists = playlistsData;

        itemClickHandler = (event) => {
            event.stopPropagation(); // Prevent event from bubbling further
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            console.log(`Adding ${videoData.videoId} to playlist ${targetPId}`);
            // Call the function that handles adding to a specific playlist
            addVideoToSpecificPlaylist(videoData, targetPId);
            // Close the popup after an item is clicked
            closePlaylistSelectionPopups();
        };

    } else if (actionType === 'move') {
        // Logic for moving from within a playlist
        popupTitleText = "Move video to:";
        // Filter out the source playlist itself, as you can't move a video to the playlist it's already in via this menu.
        availablePlaylists = playlistsData.filter(p => p.id !== sourcePlaylistId);

        // If there are no other playlists to move to, show a message and don't show the popup.
        if (availablePlaylists.length === 0) {
            mostrarMensajeFlotante("No other playlists to move to.");
            return;
        }

        itemClickHandler = (event) => {
            event.stopPropagation(); // Prevent event from bubbling further
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            console.log(`Moving ${videoData.videoId} from ${sourcePlaylistId} to ${targetPId}`);
            // When moving via this menu, insert at the start of the target list (index 0)
            const targetInsertionIndex = 0;
            // Use the general moveVideo function which handles source and target playlists
            moveVideo(videoData.videoId, sourcePlaylistId, targetPId, targetInsertionIndex);
            // Close the popup after an item is clicked
            closePlaylistSelectionPopups();
        };
    } else {
        // Handle case where actionType is invalid
        console.error("showPlaylistSelectionPopup: Invalid actionType:", actionType);
        return;
    }

     // Create the title element for the popup
    const title = document.createElement('div');
    title.textContent = popupTitleText;
    // Use styling from both move and add titles for flexibility
    title.className = 'playlist-selection-popup-title move-to-playlist-popup-title add-to-playlist-popup-title';
    menu.appendChild(title);

    // Create buttons for each available playlist
    availablePlaylists.forEach(playlist => {
        const item = document.createElement('button');
        // Use styling from previous item types
        item.className = 'playlist-selection-popup-item add-to-playlist-menu-item';
        item.dataset.targetPlaylistId = playlist.id; // Store the target playlist ID on the button

        // Add thumbnail and name to the button
        item.innerHTML = `
            <img src="${playlist.thumbnailUrl || 'https://via.placeholder.com/50?text=?'}"" alt="" loading="lazy">
            <span>${playlist.name}</span>
        `;
        item.title = `${popupTitleText} "${playlist.name}"`; // Dynamic button title attribute

        // Add the previously defined click handler
        item.addEventListener('click', itemClickHandler);
        menu.appendChild(item);
    });

    // --- Positioning Logic ---
    // Append the menu to the body to avoid overflow issues within smaller containers
    document.body.appendChild(menu);
    // Get the position of the element that triggered the popup (e.g., the '+' or '...' button)
    const anchorRect = anchorElement.getBoundingClientRect();

    // Calculate initial position (e.g., aligned to the left/bottom of the anchor element)
    let top = window.scrollY + anchorRect.bottom + 2; // 2px padding below anchor
    let left = window.scrollX + anchorRect.left;

    menu.style.position = 'absolute';
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    // Set a minimum width based on the anchor element, plus some padding
    menu.style.minWidth = `${anchorRect.width + 50}px`;
    menu.style.zIndex = '1000'; // Ensure it's above other content

    // --- Adjust Position to fit on screen ---
    // Use requestAnimationFrame to ensure the menu is in the DOM and has dimensions before calculating adjustments
    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();

        // Adjust horizontally if it goes off the right edge
        if (menuRect.right > window.innerWidth - 10) { // 10px margin from the right edge
            // Align the right edge of the menu with the right edge of the anchor (or near it)
            left = window.scrollX + anchorRect.right - menuRect.width;
            // Ensure it doesn't go off the left edge after adjusting
            menu.style.left = `${Math.max(10, left)}px`;
        }
        // Adjust horizontally if it goes off the left edge (less common if aligning left, but good practice)
        if (menuRect.left < 10) {
            menu.style.left = '10px';
        }

        // Adjust vertically if it goes off the bottom edge
        if (menuRect.bottom > window.innerHeight - 10) { // 10px margin from the bottom edge
            // Position the menu above the anchor element
            top = window.scrollY + anchorRect.top - menuRect.height - 2; // 2px padding above anchor
            // Ensure it doesn't go off the top edge after adjusting
             menu.style.top = `${Math.max(10, top)}px`;
        }
         // Adjust vertically if it goes off the top edge (less common)
         if (menuRect.top < 10) {
            menu.style.top = '10px';
        }
    });


    // --- Add listener to close if clicked outside ---
    // Use a small timeout to prevent the click that opened the menu from immediately closing it
    setTimeout(() => {
         // Add a one-time event listener on the document during the capture phase
         // The capture phase ensures the click is intercepted before it reaches elements inside the menu.
         document.addEventListener('click', closePlaylistSelectionPopups, { once: true, capture: true });
         // Stop propagation of clicks *inside* the menu itself to prevent the document listener from triggering
         menu.addEventListener('click', e => e.stopPropagation());
    }, 10); // 10ms delay should be sufficient

}

// --- NEW: Generic function to close playlist selection popups ---
// Finds all elements with the class 'playlist-selection-popup-menu' and removes them from the DOM.
function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(menu => menu.remove());
}
// --- NUEVA: Función para cerrar TODOS los menús contextuales (3 puntos) ---
function closeAllContextMenus() {
     document.querySelectorAll('#playlistContainer .delete-menu-content').forEach(menu => {
          menu.style.display = 'none';
     });
}
// --- Función para alternar expansión/colapso ---
function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    // --- LÓGICA AÑADIDA PARA CARGA BAJO DEMANDA ---
// Si es una playlist de la biblioteca de YouTube y sus videos no han sido cargados aún
if (playlist.source === YOUTUBE_LIBRARY_SOURCE_ID && !playlist.isLoaded) {
    console.log(`Cargando videos de la biblioteca para: ${playlist.name} usando la API de Google.`);
    mostrarMensajeFlotante(`Cargando "${playlist.name}"...`);
    
    // ▼▼▼ CAMBIO PRINCIPAL: LLAMAR A LA NUEVA FUNCIÓN AUTENTICADA ▼▼▼
    getYouTubeLibraryPlaylistItems(playlist.id)
        .then(loadedVideos => {
            // El resto de la lógica puede permanecer igual, ya que `getYouTubeLibraryPlaylistItems`
            // devolverá los videos en el formato que tu aplicación ya espera.
            playlist.videos = loadedVideos;
            playlist.isLoaded = true; // Marcar como cargada
            playlist.isExpanded = true; // Expandir después de cargar
            updatePlaylistsUI(); // Actualizar la UI
            checkAndEnablePlayButton();
        })
        .catch(error => {
            console.error("Error al cargar videos de la playlist de la biblioteca:", error);
            mostrarMensajeFlotante(`Error al cargar: ${error.message || 'La playlist podría ser inválida.'}`);
            // Opcional: desmarcar para reintentar
            playlist.isLoaded = false;
        });
    
    return; // Detenemos la ejecución aquí, la UI se actualizará cuando los datos lleguen.
}
// --- FIN DE LA LÓGICA AÑADIDA ---

    // Alternar el estado (lógica original)
    playlist.isExpanded = !playlist.isExpanded;

    const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);
    const videosDiv = groupDiv?.querySelector('.playlist-group-videos');
    const icon = groupDiv?.querySelector('.expand-icon');

    if (groupDiv && videosDiv && icon) {
        groupDiv.classList.toggle('expanded', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-up', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-down', !playlist.isExpanded);

        videosDiv.removeEventListener('transitionend', handleTransitionEnd);

        if (playlist.isExpanded) {
            videosDiv.style.display = 'block';
            videosDiv.style.maxHeight = '0px'; 
            requestAnimationFrame(() => {
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            });
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        } else {
            videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            requestAnimationFrame(() => {
                 videosDiv.style.maxHeight = '0px';
            });
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        }
    } else {
        console.warn("Elementos no encontrados para toggle, re-renderizando UI completa.");
        updatePlaylistsUI();
    }
}
async function getYouTubeLibraryPlaylistItems(playlistId) {
    try {
        let allVideos = [];
        let nextPageToken = null;

        do {
            const response = await gapi.client.youtube.playlistItems.list({
                'part': ['snippet', 'contentDetails'],
                'playlistId': playlistId,
                'maxResults': 50,
                'pageToken': nextPageToken
            });

            const result = response.result;
            if (result.items) {
                const formattedVideos = result.items
                    .map(item => {
                        // Comprobamos existencia de los campos y miniaturas
                        const thumbnails = item?.snippet?.thumbnails;
                        const videoId = item?.contentDetails?.videoId;
                        const title = item?.snippet?.title;
                        const highThumb = thumbnails?.high?.url;
                        const defaultThumb = thumbnails?.default?.url;
                        // Si no hay videoId o miniatura, lo omitimos
                        if (!videoId || (!highThumb && !defaultThumb)) {
                            console.warn('Item de playlist omitido por falta de datos:', item);
                            return null;
                        }
                        return {
                            videoId,
                            title: title || 'Sin título',
                            thumbnail: highThumb || defaultThumb,
                            duration: 0,
                        };
                    })
                    .filter(v => v !== null && v.videoId);

                allVideos = allVideos.concat(formattedVideos);
            }
            nextPageToken = result.nextPageToken;
        } while (nextPageToken);

        return allVideos;

    } catch (err) {
        console.error("Error al obtener videos de la playlist de YouTube:", err);
        throw new Error(err.result?.error?.message || "No se pudieron obtener los videos.");
    }
}
// --- Función manejadora para el final de la transición ---
function handleTransitionEnd(event) {
    // Asegurarse que la transición completada sea de 'max-height'
    if (event.propertyName !== 'max-height') {
        return;
    }

    const videosDiv = event.target;
    const groupDiv = videosDiv.closest('.playlist-group');
    const playlistId = groupDiv?.dataset.playlistId;
    const playlist = playlistsData.find(p => p.id === playlistId);

    if (playlist && videosDiv) {
        if (playlist.isExpanded) {
            // Si terminó de expandirse, quitar max-height para que la altura sea automática
            videosDiv.style.maxHeight = 'none';
            // console.log(`Playlist ${playlistId} expandida, max-height: none`);
        } else {
            // Si terminó de colapsarse, ahora sí podemos ocultarlo con display si queremos
            // videosDiv.style.display = 'none'; // Opcional, max-height 0 ya lo oculta visualmente
            // console.log(`Playlist ${playlistId} colapsada, max-height: 0`);
        }
    }
}

// --- Eliminar Video ---
function deleteVideo(playlistId, videoId) {
    const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
    if (playlistIndex === -1) return;

    const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
    if (videoIndex === -1) return;

    const deletedVideoTitle = playlistsData[playlistIndex].videos[videoIndex].title;
    playlistsData[playlistIndex].videos.splice(videoIndex, 1); // Eliminar del array
    // Opcional: Eliminar playlist si queda vacía (excepto la manual)
    if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
         playlistsData.splice(playlistIndex, 1);
    }

    updateSinglePlaylistUI(playlistId); // <-- Nueva línea eficiente
    updateCurrentPlayingIndex(); // Recalcular índice por si acaso
}

// --- REESCRIBIR COMPLETAMENTE enableDragAndDrop ---
function enableDragAndDrop(scopeElement = document) {
    const playlistContainer = scopeElement === document 
        ? document.getElementById('playlistContainer') 
        : scopeElement.closest('.playlist-group');

    if (!playlistContainer) return;

    let draggedItemElement = null;
    let draggedVideoData = null;
    let placeholder = null;

    function createPlaceholder() {
        const ph = document.createElement('div');
        ph.className = 'playlist-item placeholder';
        ph.style.height = '40px';
        ph.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        ph.style.border = '1px dashed #007bff';
        ph.style.margin = '4px 0';
        return ph;
    }
    placeholder = createPlaceholder();

    const itemsToMakeDraggable = (scopeElement === document) 
        ? playlistContainer.querySelectorAll('.playlist-item') 
        : scopeElement.querySelectorAll('.playlist-item');

    itemsToMakeDraggable.forEach(item => {
        item.addEventListener('dragstart', (event) => {
            const targetItem = event.target.closest('.playlist-item');
            if (!targetItem) return;

            draggedItemElement = targetItem;
            draggedVideoData = {
                videoId: targetItem.dataset.videoId,
                sourcePlaylistId: targetItem.dataset.playlistId
            };

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedVideoData.videoId);

            setTimeout(() => targetItem.classList.add('dragging'), 0);
            console.log(`Drag Start: Video ${draggedVideoData.videoId} from Playlist ${draggedVideoData.sourcePlaylistId}`);
        });

        item.addEventListener('dragend', (event) => {
            if (draggedItemElement) {
                draggedItemElement.classList.remove('dragging');
            }
            if(placeholder && placeholder.parentNode) {
                 placeholder.remove();
            }
            document.querySelectorAll('.drag-over-area').forEach(el => el.classList.remove('drag-over-area'));
            draggedItemElement = null;
            draggedVideoData = null;
        });

         item.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move';
             const targetItem = event.target.closest('.playlist-item');
             if (!targetItem || targetItem === draggedItemElement) return;

              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY < targetRect.height / 2) {
                   targetItem.parentNode.insertBefore(placeholder, targetItem);
              } else {
                   targetItem.parentNode.insertBefore(placeholder, targetItem.nextSibling);
              }
        });

        item.addEventListener('drop', (event) => {
            event.preventDefault();
             if (placeholder && placeholder.parentNode) {
                 placeholder.remove();
             }
            const targetItem = event.target.closest('.playlist-item');
            if (!targetItem || !draggedVideoData || targetItem === draggedItemElement) {
                console.log("Drop sobre item inválido o sobre sí mismo.");
                return;
            }

            const targetPlaylistId = targetItem.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain');

             let targetIndex = Array.from(targetItem.parentNode.children)
                .filter(el => el.classList.contains('playlist-item') && !el.classList.contains('placeholder') && !el.classList.contains('dragging'))
                .indexOf(targetItem);

              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY >= targetRect.height / 2) {
                   targetIndex++;
              }

            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) sobre item ${targetItem.dataset.videoId} (Playlist ${targetPlaylistId}, índice ${targetIndex})`);

            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });

    const containersToListen = (scopeElement === document)
        ? playlistContainer.querySelectorAll('.playlist-group-videos')
        : playlistContainer.querySelectorAll('.playlist-group-videos');

    containersToListen.forEach(container => {
        container.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move';
             if (container.children.length === 0 || event.offsetY > container.scrollHeight - 20) {
                 container.classList.add('drag-over-area');
                  if (!placeholder.parentNode || placeholder.nextSibling) {
                     container.appendChild(placeholder);
                  }
             } else {
                 container.classList.remove('drag-over-area');
             }
        });

         container.addEventListener('dragleave', (event) => {
             if (!container.contains(event.relatedTarget)) {
                  container.classList.remove('drag-over-area');
                   if(placeholder.parentNode === container) placeholder.remove();
             }
         });

        container.addEventListener('drop', (event) => {
            event.preventDefault();
             if (placeholder && placeholder.parentNode) {
                 placeholder.remove();
             }
             container.classList.remove('drag-over-area');
            const groupDiv = event.target.closest('.playlist-group');
            if (!groupDiv || !draggedVideoData) return;

            const targetPlaylistId = groupDiv.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain');

             const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
             const targetIndex = targetPlaylist ? targetPlaylist.videos.length : 0;

            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) al final de Playlist ${targetPlaylistId}`);
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });
}
// --- Función Unificada para Mover Videos (dentro y entre playlists) ---
function moveVideo(videoId, sourcePlaylistId, targetPlaylistId, targetIndex) {
    if (!videoId || !sourcePlaylistId || !targetPlaylistId) {
        console.error("moveVideo: Argumentos inválidos.");
        return;
    }

    // Encontrar playlist origen
    const sourcePlaylistIndex = playlistsData.findIndex(p => p.id === sourcePlaylistId);
    if (sourcePlaylistIndex === -1) {
        console.error(`moveVideo: Playlist origen ${sourcePlaylistId} no encontrada.`);
        return;
    }
    const sourcePlaylist = playlistsData[sourcePlaylistIndex];

    // Encontrar video en playlist origen
    const videoIndexInSource = sourcePlaylist.videos.findIndex(v => v.videoId === videoId);
    if (videoIndexInSource === -1) {
        console.error(`moveVideo: Video ${videoId} no encontrado en playlist origen ${sourcePlaylistId}.`);
        return;
    }

    // Encontrar playlist destino
    const targetPlaylistIndex = playlistsData.findIndex(p => p.id === targetPlaylistId);
    if (targetPlaylistIndex === -1) {
        console.error(`moveVideo: Playlist destino ${targetPlaylistId} no encontrada.`);
        return;
    }
    const targetPlaylist = playlistsData[targetPlaylistIndex];

    // --- Lógica de Movimiento ---
    // 1. Quitar el video de la playlist origen
    const [movedVideoData] = sourcePlaylist.videos.splice(videoIndexInSource, 1);

    // 2. Asegurar que targetIndex esté dentro de los límites de la playlist destino
    targetIndex = Math.max(0, Math.min(targetIndex, targetPlaylist.videos.length));

    // 3. Insertar el video en la playlist destino en el índice correcto
    targetPlaylist.videos.splice(targetIndex, 0, movedVideoData);

    console.log(`Video ${videoId} movido de ${sourcePlaylistId} a ${targetPlaylistId} en índice ${targetIndex}.`);

    // 4. Actualizar la UI 
     if (sourcePlaylistId === targetPlaylistId) {
        // Si el video se movió dentro de la misma playlist, solo actualizamos esa.
        updateSinglePlaylistUI(sourcePlaylistId);
    } else {
        // Si se movió a otra playlist, actualizamos ambas.
        updateSinglePlaylistUI(sourcePlaylistId);
        updateSinglePlaylistUI(targetPlaylistId);
    }

    // 5. Recalcular el índice de reproducción aplanado
    // Es crucial llamar a esto DESPUÉS de actualizar playlistsData
    updateCurrentPlayingIndex();
}

// Módulo: Reproducción y Crossfade (Adaptado Parcialmente)
async function playNextVideo() {
    const currentFlatIndex = currentPlayingInfo.flattenedIndex;
    console.log(`playNextVideo [Data]: Llamada. Índice aplanado actual: ${currentFlatIndex}, isTransitioning=${isTransitioning}, isAudioFading=${isAudioFading}`);

    // Protección para evitar iniciar una nueva transición si ya hay una activa
    if (isTransitioning) {
        console.warn("playNextVideo [Data]: Transición principal ya en curso, cancelando.");
        return;
    }

    isTransitioning = true; // Marcar el inicio del proceso de transición
    console.log(`playNextVideo [Data]: *** Transición PRINCIPAL INICIADA desde índice aplanado ${currentFlatIndex}. Flag isTransitioning=true. ***`);

    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("playNextVideo [Data]: No hay videos en la lista aplanada.");
        stopMonitoring();
        reproduccionIniciada = false;
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        document.getElementById('botonPlay').disabled = true;
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        updatePlaylistsUI();
        isTransitioning = false; // Resetear flag al salir temprano
        console.log(`playNextVideo [Data]: *** Transición ABORTADA (Sin videos). Flag isTransitioning=false. ***`);
        return;
    }

    let nextIndex = currentFlatIndex + 1;

    if (nextIndex >= flatList.length) {
        console.log('playNextVideo [Data]: Fin de la lista aplanada detectado.');
        askToRepeatPlaylist();
        isTransitioning = false; // Resetear flag al llegar al final
        console.log(`playNextVideo [Data]: *** Transición FINALIZADA (Fin de lista). Flag isTransitioning=false. ***`);
        return;
    }

    const previousVideoIdForCleanup = currentPlayingInfo.videoId; // Guardar ID del video saliente para limpieza

    try {
        const nextVideo = flatList[nextIndex];
        if (!nextVideo || !nextVideo.videoId) {
             throw new Error(`Video siguiente inválido en el índice aplanado ${nextIndex}.`);
        }
        const nextVideoId = nextVideo.videoId;

        // Identificar reproductores basándose en el reproductor lógico actual (el que va a desvanecerse)
        const currentPlayerLogicalNum = currentPlayer; // Número del reproductor que está sonando (debería desvanecerse)
        const previousPlayerInstance = (currentPlayerLogicalNum === 1) ? player1 : player2; // La instancia del reproductor actual
        const nextPlayerInstance = (currentPlayerLogicalNum === 1) ? player2 : player1;     // La instancia del reproductor que sonará después

        // Obtener los elementos DOM correspondientes para aplicar clases CSS
        const currentPlayerElement = document.getElementById(`player${currentPlayerLogicalNum}`);
        const nextPlayerElement = document.getElementById(`player${currentPlayerLogicalNum === 1 ? 2 : 1}`);

        // Validar instancias de reproductores y métodos requeridos
        if (!previousPlayerInstance || typeof previousPlayerInstance.setVolume !== 'function' || typeof previousPlayerInstance.getVolume !== 'function' ||
            !nextPlayerInstance || typeof nextPlayerInstance.cueVideoById !== 'function' || typeof nextPlayerInstance.playVideo !== 'function' || typeof nextPlayerInstance.setVolume !== 'function' || typeof nextPlayerInstance.getPlayerState !== 'function') {
             throw new Error("Instancias de reproductores o funciones de API requeridas faltan para el crossfade.");
        }

        // --- Paso 1: Preparar el siguiente video (cargarlo sin reproducir) ---
        console.log(`playNextVideo [Data]: Llamando a cueVideoById('${nextVideoId}') en Player ${currentPlayerLogicalNum === 1 ? 2 : 1}.`);
        nextPlayerInstance.cueVideoById(nextVideoId);

        // Asegurarse de que el contenedor del siguiente reproductor esté listo y en la capa correcta para la superposición visual
        // Debe estar visible y no en estado de desvanecimiento antes de que comience la transición.
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden', 'fade-out'); // Asegurarse de que esté visible y no desvaneciéndose
            // El CSS debería manejar el z-index para la superposición: el reproductor entrante (nextPlayerElement) necesita un z-index más alto
        } else { console.warn("playNextVideo [Data]: Elemento DOM para nextPlayerElement no encontrado."); }


        // --- Paso 2: Establecer volúmenes iniciales ANTES de iniciar la reproducción/desvanecimiento ---
        // Asegurarse de que el reproductor anterior esté a volumen completo (o al que tenía) al inicio del desvanecimiento.
        // Asegurarse de que el reproductor siguiente esté silenciado (volumen 0) antes de que comience su reproducción para el fundido de entrada.
        try { previousPlayerInstance.setVolume(previousPlayerInstance.getVolume() || 100); console.log(`playNextVideo [Data]: Volumen inicial reproductor previo: ${previousPlayerInstance.getVolume()}`); } catch(e) { console.warn("playNextVideo [Data]: Error obteniendo/estableciendo volumen de reproductor previo, por defecto 100:", e); previousPlayerInstance.setVolume(100); }
        try { nextPlayerInstance.setVolume(0); console.log(`playNextVideo [Data]: Volumen inicial reproductor siguiente: 0`);} catch(e) { console.warn("playNextVideo [Data]: Error estableciendo volumen de reproductor siguiente a 0:", e); }

        // Actualizar el estado lógico inmediatamente para el resaltado en la UI.
        // Esto actualiza currentPlayingInfo a los detalles del *siguiente* video.
        currentPlayingInfo = {
             flattenedIndex: nextIndex,
             videoId: nextVideo.videoId,
             playlistId: nextVideo.sourcePlaylistId
        };
        console.log(`playNextVideo [Data]: Estado lógico actualizado a índice ${nextIndex} (Video: ${nextVideoId}).`);
        updatePlaylistsUI(); // Actualizar el resaltado en la UI basado en el nuevo estado lógico


        // --- Paso 3: Iniciar las Transiciones Visual y de Audio SIMULTÁNEAMENTE ---

        // Aplicar clases CSS para iniciar el desvanecimiento visual en el reproductor actual y el fundido de entrada en el siguiente.
        // Esto debería activar las transiciones CSS definidas en tu hoja de estilos.
        if (currentPlayerElement) {
            currentPlayerElement.classList.add('fade-out');
        } else { console.warn("playNextVideo [Data]: Elemento DOM para currentPlayerElement no encontrado."); }
        if (nextPlayerElement) {
             nextPlayerElement.classList.remove('fade-in'); // Eliminar por si estaba de un intento previo
            nextPlayerElement.classList.add('fade-in');
        }

        // Iniciar la reproducción del video cargado en el siguiente reproductor.
        // Esto es necesario ahora para que su flujo de audio esté disponible (a volumen 0).
         try {
            console.log(`playNextVideo [Data]: Estado de Player ${currentPlayerLogicalNum === 1 ? 2 : 1} ANTES de playVideo(): ${nextPlayerInstance.getPlayerState()}`); // Log estado antes
            if (nextPlayerInstance && typeof nextPlayerInstance.playVideo === 'function') {
                 console.log(`playNextVideo [Data]: Llamando a playVideo() en Player ${currentPlayerLogicalNum === 1 ? 2 : 1} para iniciar reproducción para fundido de entrada.`);
                 nextPlayerInstance.playVideo();
                 // El audio comenzará a cargar/reproducir, pero su volumen es 0 debido a setVolume(0) anterior.
                 // El manejador onPlayerStateChange debería eventualmente capturar BUFFERING y luego PLAYING.
            } else {
                 console.warn(`playNextVideo [Data]: Instancia de reproductor siguiente inválida o playVideo falta, no se puede iniciar reproducción para fundido.`);
                  throw new Error("Fallo al iniciar reproducción en reproductor siguiente."); // Propagar error al bloque catch
            }
             console.log(`playNextVideo [Data]: Estado de Player ${currentPlayerLogicalNum === 1 ? 2 : 1} DESPUÉS de playVideo(): ${nextPlayerInstance.getPlayerState()}`); // Log estado después
         } catch(e) {
             console.error("playNextVideo [Data]: Error llamando a playVideo en reproductor siguiente:", e);
              // Si playVideo falla, abortar la transición limpiamente
              isTransitioning = false; // Resetear el flag principal de transición
               // Eliminar clases visuales que pudieran haberse aplicado
               if (currentPlayerElement) currentPlayerElement.classList.remove('fade-out');
               if (nextPlayerElement) nextPlayerElement.classList.remove('fade-in');
               // Revertir estado lógico? Tal vez quedarse en el video actual?
                currentPlayingInfo.flattenedIndex = currentFlatIndex; // Revertir índice
                currentPlayingInfo.videoId = previousVideoIdForCleanup;
                currentPlayingInfo.playlistId = flatList[currentFlatIndex]?.sourcePlaylistId || null;
                updatePlaylistsUI(); // Actualizar UI de vuelta
               throw e; // Volver a lanzar el error para que sea capturado por el try/catch principal
         }

        // Iniciar el Fundido de Audio después de un pequeño retraso.
        // Este retraso da al reproductor de YouTube un momento para comenzar a cargar/preparar el flujo de audio
        // después de la llamada a playVideo(), antes de que comencemos a ajustar su volumen.
        const audioFadeStartDelay = 50; // Milisegundos de retraso antes de iniciar el fundido de audio (ajustar si es necesario)
        console.log(`playNextVideo [Data]: Programando crossfadeAudio en ${audioFadeStartDelay}ms.`);
        setTimeout(() => {
            console.log(`playNextVideo [Data]: Iniciando crossfadeAudio.`);
            // Llamar a la función crossfadeAudio, pasando las instancias específicas de reproductores involucradas.
            // crossfadeAudio gestionará el desvanecimiento de volúmenes durante el CROSSFADE_DURATION definido.
             crossfadeAudio(previousPlayerInstance, nextPlayerInstance); // Usar la función crossfadeAudio modificada
        }, audioFadeStartDelay); // Retraso antes de iniciar el fundido de audio


        // --- Paso 4: Manejar la Limpieza después de las Transiciones (Al completar el Desvanecimiento Visual) ---
        // Esta parte se activa por el final de la transición de desvanecimiento visual en el reproductor saliente.
        // Maneja tareas como detener el video antiguo, ocultar su contenedor y limpiar datos.

        let transitionEndHandler = (event) => {
            // Asegurarse de que este listener solo se dispare para la transición de 'opacity' en el elemento correcto (el reproductor saliente)
            // Esto evita que se dispare en otras posibles transiciones (como z-index) o elementos.
            if (event.propertyName !== 'opacity' || event.target !== currentPlayerElement) {
                return; // Ignorar si no es la transición de opacity o no es el elemento que estamos desvaneciendo
            }

            console.log(`playNextVideo [Data]: Evento transitionend disparado en ${event.target.id} por propiedad ${event.propertyName}. Realizando limpieza.`);

            // Eliminar el event listener para evitar que se dispare múltiples veces
            event.target.removeEventListener('transitionend', transitionEndHandler);
            // Limpiar el timeout de respaldo, ya que el evento transitionend se disparó exitosamente
            clearTimeout(transitionEndHandler.fallbackTimeoutId);


            // --- Lógica de Limpieza (Esto se ejecuta después de que el desvanecimiento visual se completa) ---
            try {
                console.log(`playNextVideo [Data]: Limpieza de transición iniciada.`);

                // Detener explícitamente el video anterior.
                // Esto es más seguro ahora que su audio se ha desvanecido.
                 if (previousPlayerInstance && typeof previousPlayerInstance.stopVideo === 'function' && previousPlayerInstance.getPlayerState() !== YT.PlayerState.ENDED) {
                      console.log(`playNextVideo [Data]: Limpieza - Llamando a stopVideo() en Player previo ${currentPlayerLogicalNum}.`);
                      previousPlayerInstance.stopVideo();
                 }

                // Ocultar completamente el contenedor del reproductor antiguo después del desvanecimiento
                if (currentPlayerElement) {
                    currentPlayerElement.classList.remove('fade-out', 'fade-in'); // Eliminar cualquier clase de desvanecimiento
                    currentPlayerElement.classList.add('hidden'); // Ocultar completamente el contenedor
                }
                // Eliminar la clase fade-in del contenedor del nuevo reproductor (ya debería estar completamente visible)
                if (nextPlayerElement) {
                    nextPlayerElement.classList.remove('fade-in');
                     // Asegurarse de que el siguiente reproductor esté en z-index o capa predeterminada si se ajustó con CSS
                }

                // Limpieza de datos (como caché de SponsorBlock) relacionada con el video ANTERIOR
                if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                    console.log(`playNextVideo [Data]: Limpieza - Limpiando caché SB para video ANTERIOR: ${previousVideoIdForCleanup}`);
                    delete segmentosCache[previousVideoIdForCleanup];
                }
                // Restablecer el seguimiento del último salto si fue para el video que acaba de terminar
                if (lastSeekVideoId === previousVideoIdForCleanup) {
                     lastSeekEndTime = -1;
                     lastSeekVideoId = null;
                }

            } catch (cleanupError) {
                 console.error("playNextVideo [Data]: Error durante la limpieza de transitionend:", cleanupError);
                 // Si la limpieza falla, intentar asegurar que los flags se reseteen como salvaguarda.
                 // isTransitioning se resetea principalmente en onPlayerStateChange cuando el NUEVO video comienza a reproducir.
                 isAudioFading = false; // El fundido de audio también debería haber terminado o detenerse a estas alturas
                 console.log(`playNextVideo [Data]: *** Limpieza de Transición INTERRUMPIDA (Error). isAudioFading reseteado. ***`);
            } finally {
                 // Este bloque se ejecuta después del try/catch en el manejador transitionend.
                 // El reseteo del flag principal isTransitioning ocurre en onPlayerStateChange cuando el NUEVO reproductor entra en estado PLAYING.
                 console.log(`playNextVideo [Data]: Limpieza de transitionend FINALIZADA.`);
                 // El cambio lógico de currentPlayer se maneja en onPlayerStateChange cuando el nuevo reproductor confirma el estado PLAYING.
            }
        };

        // Agregar el event listener para el evento transitionend en el elemento que se está desvaneciendo (currentPlayerElement)
        if (currentPlayerElement) {
            console.log(`playNextVideo [Data]: Agregando listener de transitionend a ${currentPlayerElement.id}`);
            currentPlayerElement.addEventListener('transitionend', transitionEndHandler);

            // --- Agregar un setTimeout de respaldo por si transitionend no se dispara ---
            // Esta es una medida de seguridad para navegadores o escenarios donde el evento transitionend podría no dispararse de forma fiable.
            // La duración de respaldo debe ser ligeramente mayor que la duración de la transición CSS.
            const fallbackTimeoutMs = CROSSFADE_DURATION * 1000 + 200; // CROSSFADE_DURATION en ms + pequeño buffer
            console.log(`playNextVideo [Data]: Estableciendo setTimeout de respaldo (${fallbackTimeoutMs}ms).`);
            const fallbackTimeoutId = setTimeout(() => {
                console.warn(`playNextVideo [Data]: setTimeout de respaldo disparado después de ${fallbackTimeoutMs}ms. Asumiendo que la transición falló o no se disparó.`);
                // Si el timeout se dispara, eliminar el listener de transitionend (si se había agregado)
                if (currentPlayerElement) {
                     currentPlayerElement.removeEventListener('transitionend', transitionEndHandler);
                }
                // Ejecutar la lógica de limpieza directamente, omitiendo el evento transitionend.
                // Pasar un objeto de evento simulado que parezca un transitionend para opacity en el elemento correcto
                // El flag isFallback puede usarse dentro del manejador si es necesario.
                transitionEndHandler({ propertyName: 'opacity', target: currentPlayerElement, isFallback: true });
            }, fallbackTimeoutMs);

             // Almacenar el ID del timeout en la propia función manejadora para que pueda ser limpiado desde dentro del manejador
             transitionEndHandler.fallbackTimeoutId = fallbackTimeoutId;

        } else {
            // Si el elemento del reproductor saliente no se encuentra por alguna razón, ejecutar la lógica de limpieza inmediatamente como respaldo.
            console.warn("playNextVideo [Data]: currentPlayerElement no encontrado para transición, ejecutando limpieza inmediatamente como respaldo.");
            try {
                 console.log(`playNextVideo [Data]: Ejecutando lógica post-transición inmediatamente.`);

                 // Detener el video anterior inmediatamente
                 if (previousPlayerInstance && typeof previousPlayerInstance.stopVideo === 'function') {
                      console.log(`playNextVideo [Data]: Llamando a stopVideo() en Player previo ${currentPlayerLogicalNum} inmediatamente.`);
                      previousPlayerInstance.stopVideo();
                 }

                 // Ocultar el elemento del reproductor anterior previsto si se encuentra en el DOM
                 const intendedPreviousElement = document.getElementById(`player${currentPlayerLogicalNum}`);
                 if (intendedPreviousElement) {
                      intendedPreviousElement.classList.remove('fade-out', 'fade-in');
                      intendedPreviousElement.classList.add('hidden');
                 }
                  // Eliminar fade-in del elemento del reproductor siguiente si se encuentra
                  if (nextPlayerElement) {
                      nextPlayerElement.classList.remove('fade-in');
                  }

                 // Limpieza de datos (ya manejada arriba en el bloque try principal, pero bueno ser seguro)
                 if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                      delete segmentosCache[previousVideoIdForCleanup];
                 }
                 if (lastSeekVideoId === previousVideoIdForCleanup) {
                       lastSeekEndTime = -1;
                       lastSeekVideoId = null;
                 }
                 // Los flags ya se resetearon en error crítico antes de esta ruta inmediata

            } catch (immediateError) {
                 console.error("playNextVideo [Data]: Error durante la lógica post-transición inmediata:", immediateError);
            } finally {
                 isAudioFading = false; // Asumir que el fundido de audio no comenzaría o completaría limpiamente aquí
                 // isTransitioning ya se reseteó en error crítico al inicio de playNextVideo si ocurrió un error crítico temprano.
                 console.log(`playNextVideo [Data]: Flags reseteados después de ejecución de lógica inmediata.`);
                 // El cambio lógico de currentPlayer se maneja en onPlayerStateChange cuando el siguiente reproductor confirma el estado PLAYING.
            }
        }


    } catch (error) {
        console.error("playNextVideo [Data]: Error CRÍTICO durante playNextVideo:", error);
        // Asegurarse de que los flags se reseteen y el estado se revierta en caso de error crítico *antes* de que comience la transición
        // Este bloque catch maneja errores que ocurren *antes* de que se configure el manejador transitionend.
        isTransitioning = false; // Resetear flag principal de transición
        isAudioFading = false; // Asegurarse de que el flag de fundido de audio también se resetee
        // Revertir el estado lógico a la información del video que se suponía que estaba reproduciendo antes de este intento de transición fallido
        const previousVideo = flatList[currentFlatIndex]; // Usar el índice *antes* del intento de incremento
         currentPlayingInfo.flattenedIndex = currentFlatIndex >= 0 ? currentFlatIndex : -1;
         currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
         currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
        console.log(`playNextVideo [Data]: *** Transición INTERRUMPIDA (Error Crítico). Flag=false. Estado REVERTIDO a índice ${currentFlatIndex} ***`);
        mostrarMensajeFlotante(`Error cambiando video: ${error.message}`);
        updatePlaylistsUI(); // Actualizar la UI para reflejar el estado revertido
        stopMonitoring(); // Detener el monitoreo en caso de error crítico
         // Asegurarse de que el estado del botón sea correcto - ¿tal vez volver al botón de Play?
         document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
         reproduccionIniciada = false; // Permitir intentar reiniciar con Play
    }
}
function crossfadeAudio(playerToFadeOut, playerToFadeIn) {
    const fadeStartTime = Date.now();

    // Protección contra iniciar un nuevo fundido si ya hay uno en curso
    if (isAudioFading) {
         console.log("Crossfade Audio: Ya desvaneciendo, saltando nueva solicitud.");
         // Si se solicita un nuevo fundido mientras uno está activo, ¿debería detenerse el existente?
         // Por ahora, simplemente saltamos la nueva solicitud. Si el comportamiento es extraño, considerar detener el anterior.
         return;
    }

    // Usar los reproductores pasados como argumentos para determinar quién se desvanece y quién entra
    const previousPlayer = playerToFadeOut; // El reproductor cuyo volumen disminuirá
    const nextPlayer = playerToFadeIn;     // El reproductor cuyo volumen aumentará

    // Validar las instancias de reproductores y los métodos requeridos
    if (!previousPlayer || !nextPlayer || typeof previousPlayer.setVolume !== 'function' || typeof nextPlayer.setVolume !== 'function') {
        console.error("Crossfade Audio: Reproductores inválidos pasados como argumentos.");
        isAudioFading = false; // Asegurarse de que el flag se resetee si la entrada es inválida
        return; // Salir de la ejecución de la función
    }

    // Loguear qué reproductores se están desvaneciendo basándose en su referencia interna (player1/player2) para depuración
    console.log(`Crossfade START @ ${new Date(fadeStartTime).toLocaleTimeString()}: Desvaneciendo Player ${previousPlayer === player1 ? 1:2}, Fundiendo Player ${nextPlayer === player1 ? 1:2}`);
    isAudioFading = true; // <<<--- MARCAR EL INICIO DEL PROCESO DE FUNDIDO DE AUDIO

    // Los volúmenes iniciales se espera que se establezcan en playNextVideo (por ejemplo, previousPlayer en 100, nextPlayer en 0)
    // El intervalo ahora gestionará el fundido desde esos volúmenes iniciales hacia los volúmenes objetivo (0 y 100).

    let currentVolume = previousPlayer.getVolume(); // Iniciar desvanecimiento desde su volumen actual
    let nextVolume = nextPlayer.getVolume();      // Iniciar fundido de entrada desde su volumen actual (debería ser 0 desde playNextVideo)

    // Asegurar que los volúmenes iniciales estén dentro del rango válido [0, 100]
    currentVolume = Math.max(0, Math.min(100, currentVolume));
    nextVolume = Math.max(0, Math.min(100, nextVolume));

    // Calcular el número de pasos y el tiempo de intervalo para el fundido
    const crossfadeSteps = Math.max(1, Math.floor(CROSSFADE_DURATION * 10)); // Apuntar a 10 pasos por segundo para suavidad
    const volumeStep = crossfadeSteps > 0 ? 100 / crossfadeSteps : 100; // Cuánto cambia el volumen por paso
    const intervalTime = crossfadeSteps > 0 ? Math.max(10, Math.floor(CROSSFADE_DURATION * 1000 / crossfadeSteps)) : 100; // Tiempo entre pasos (mínimo 10ms)

    // Limpiar cualquier intervalo de crossfade anterior por si acaso
    if (window.crossfadeIntervalId) {
        clearInterval(window.crossfadeIntervalId);
        window.crossfadeIntervalId = null;
        console.log("Crossfade: Intervalo previo limpiado.");
    }

    // Iniciar el intervalo para ajustar volúmenes gradualmente
    const intervalId = setInterval(() => {
         // Volver a validar reproductores dentro del intervalo. Las instancias de reproductor podrían volverse inválidas.
         if (!previousPlayer || !nextPlayer || typeof previousPlayer.setVolume !== 'function' || typeof nextPlayer.setVolume !== 'function') {
             console.error(`Crossfade Interval @ ${Date.now() - fadeStartTime}ms: Reproductores inválidos en intervalo, deteniendo fundido.`);
             clearInterval(intervalId);
             window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
             isAudioFading = false; // <<<--- RESETEAR FLAG EN ERROR
             return; // Detener la ejecución del intervalo
        }

        // Calcular los nuevos volúmenes para este paso
        currentVolume = Math.max(0, currentVolume - volumeStep); // Disminuir volumen del reproductor de salida, no bajar de 0
        nextVolume = Math.min(100, nextVolume + volumeStep);      // Aumentar volumen del reproductor de entrada, no subir de 100

        try {
            // Aplicar los nuevos volúmenes a las instancias de reproductores
            if(previousPlayer) previousPlayer.setVolume(currentVolume);
            if(nextPlayer) nextPlayer.setVolume(nextVolume);
        } catch (e) {
             // Loguear cualquier error durante el establecimiento de volumen y detener el fundido
             console.error(`Crossfade Interval @ ${Date.now() - fadeStartTime}ms: Error estableciendo volumen:`, e);
             clearInterval(intervalId);
             window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
             isAudioFading = false; // <<<--- RESETEAR FLAG EN ERROR
             return; // Detener la ejecución del intervalo
        }

        // --- Verificar si el crossfade está completo ---
        // El fundido está completo cuando el reproductor de salida está en o por debajo de 0 volumen Y
        // el reproductor de entrada está en o por encima de 100 volumen.
        if (currentVolume <= 0 && nextVolume >= 100) {
            // Limpiar el intervalo cuando el fundido haya terminado
            clearInterval(intervalId);
            window.crossfadeIntervalId = null; // Limpiar el ID del intervalo
            const fadeEndTime = Date.now();
            console.log(`Crossfade audio FINALIZADO @ ${new Date(fadeEndTime).toLocaleTimeString()} (Duración: ${(fadeEndTime - fadeStartTime)/1000}s).`);
            isAudioFading = false; // <<<--- MARCAR EL FIN DEL PROCESO DE FUNDIDO DE AUDIO

             // Opcional: Agregar una callback o un evento aquí si algo necesita suceder exactamente cuando termina el fundido de audio
             // (como detener el video anterior si no se hizo en el manejador transitionend)
        }
    }, intervalTime); // Ejecutar la función del intervalo cada 'intervalTime' milisegundos
    window.crossfadeIntervalId = intervalId; // Almacenar el ID del intervalo
}
// --- Preguntar para repetir ---
function askToRepeatPlaylist() {
    // Usar confirm() o un modal más elegante
    const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
    if (repeat) {
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 }; // Resetear índice
        playFirstVideo(); // Iniciar desde el principio
    } else {
        stopMonitoring();
        mostrarMensajeFlotante("Playlist finalizada. Gracias por usar YT CrossMix :)");
        // Quizás detener ambos players y limpiar estado
         try {
            if(player1) player1.stopVideo();
            if(player2) player2.stopVideo();
         } catch(e) {}
         document.getElementById('botonPlay').disabled = getFlattenedPlaylist().length === 0; // Habilitar Play si hay videos
         reproduccionIniciada = false; // Permitir reiniciar con Play
    }
}

// --- Reproducir Primer Video ---
function playFirstVideo() {
    if (!playersInitialized) {
        console.error('Los reproductores no están inicializados.');
        return;
    }
    stopMonitoring();
    isTransitioning = false; // Asegurarse que no esté en transición

    const flatList = getFlattenedPlaylist();
    if (flatList.length > 0) {
        const firstVideo = flatList[0];
        // Configurar estado inicial
        currentPlayingInfo.flattenedIndex = 0;
        currentPlayingInfo.videoId = firstVideo.videoId;
        currentPlayingInfo.playlistId = firstVideo.sourcePlaylistId;

        console.log('Reproduciendo el primer video:', firstVideo.videoId);

        try {
            // Player 1 siempre inicia
            if (player2) player2.stopVideo(); // Detener player 2
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);

            document.getElementById('player1').classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2').classList.add('hidden');
            currentPlayer = 1; // Player 1 es el activo

            reproduccionIniciada = true; // Marcar que la reproducción ha comenzado
            document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>'; // Icono pausa

            startMonitoring();
            updatePlaylistsUI();
        } catch (e) {
             console.error("Error al iniciar el primer video:", e);
             reproduccionIniciada = false; // Falló el inicio
              document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        }
    } else {
         console.log("No hay videos en la lista para reproducir.");
         mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
         document.getElementById('botonPlay').disabled = true;
          reproduccionIniciada = false;
    }
}
// Módulo: Monitoreo de Reproductores (Adaptado Parcialmente)

function startMonitoring() {
    if (!monitorInterval) {
        // Usar intervalo más corto para precisión en saltos y crossfade
        monitorInterval = setInterval(monitorPlayers, 300); // 300ms
        console.log('Monitoreo iniciado (intervalo: 300ms).');
    }
}
function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('Monitoreo detenido.');
    }
}
function monitorPlayers() {
    // Log opcional para depuración:
    // console.log(`Monitor: Corriendo (Transitioning: ${isTransitioning}, AudioFading: ${isAudioFading}, hasOutroCrossfadeStarted: ${hasOutroCrossfadeStarted}, Initialized: ${playersInitialized}, reproduccionIniciada: ${reproduccionIniciada})`);

    if (!playersInitialized || !reproduccionIniciada) {
        return; // No ejecutar la lógica de monitoreo si no está listo
    }

    const activePlayer = (currentPlayer === 1) ? player1 : player2;

    if (!activePlayer || typeof activePlayer.getPlayerState !== 'function' || typeof activePlayer.getCurrentTime !== 'function' || typeof activePlayer.getDuration !== 'function' || typeof activePlayer.getVideoData !== 'function') {
        console.warn("Monitor: El reproductor activo es inválido.");
        stopMonitoring(); // Detener el monitoreo si el reproductor activo es inválido
        return;
    }

    const playerState = activePlayer.getPlayerState();
    const currentTime = activePlayer.getCurrentTime();
    const videoDuration = activePlayer.getDuration();
    const videoId = activePlayer.getVideoData()?.video_id; // Obtener videoId de forma segura

    if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
        checkAndSkipSegment(activePlayer); // Aún así, verificar SponsorBlock incluso si la duración es extraña
        return; // No se pueden realizar comprobaciones basadas en tiempo
    }

     // Asegurarse de que los segmentos de SponsorBlock se obtengan y almacenen en caché si no lo están ya
     // La lógica para evitar bucles de fetch está en checkAndSkipSegment y obtenerSegmentosSponsorBlock
    if (!segmentosCache[videoId]) {
        // Llamar a checkAndSkipSegment para iniciar la obtención si es necesario
         checkAndSkipSegment(activePlayer);
         // No es necesario retornar, checkAndSkipSegment maneja la lógica si los segmentos aún no están listos
    } else if (segmentosCache[videoId] === 'fetching') {
         // Si está obteniendo, simplemente esperar al próximo tick.
          checkAndSkipSegment(activePlayer); // Aún llamamos para que checkAndSkipSegment maneje el estado 'fetching'
    } else {
        // Si los segmentos están en caché ([] o [segmentos...]), verificar y saltar
         checkAndSkipSegment(activePlayer);
    }


    // --- Verificar Tiempo Restante para Disparar Crossfade (Disparo basado en tiempo) ---
    // Disparar playNextVideo si el tiempo restante está dentro de la ventana de CROSSFADE_DURATION,
    // Y NO estamos ya en un proceso de transición,
    // Y el crossfade AÚN NO ha sido disparado por la lógica de detección de "outro".
    const timeRemaining = videoDuration - currentTime;
    // console.log(`Monitor: Tiempo restante: ${timeRemaining.toFixed(1)}s`);

    // Disparar el crossfade basado en el tiempo restante SOLAMENTE si:
    // 1. El reproductor está realmente en estado PLAYING
    // 2. El tiempo restante es menor o igual que la duración del crossfade MÁS un pequeño buffer
    // 3. El tiempo restante es mayor que 0
    // 4. NO estamos ya en un proceso de transición (`isTransitioning` es false)
    // 5. El crossfade AÚN NO ha sido disparado por la lógica de detección de "outro" (`hasOutroCrossfadeStarted` es false)
    if (playerState === YT.PlayerState.PLAYING &&
        timeRemaining <= CROSSFADE_DURATION + 0.5 && // La ventana comienza CROSSFADE_DURATION + buffer antes del final
        timeRemaining > 0 && // Asegurarse de que el tiempo restante sea positivo
        !isTransitioning && // Evitar disparar si ya estamos en transición
        !hasOutroCrossfadeStarted) // Crucial: No disparar si un "outro" ya lo hizo
         {
        console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade (${CROSSFADE_DURATION}s + buffer). Disparando playNextVideo basado en tiempo.`);
        playNextVideo();
    }

    // --- Salvaguarda: Considerar detener el reproductor inactivo si sigue sonando inesperadamente ---
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1; // El reproductor que NO es el lógico actual
     if (inactivePlayer && typeof inactivePlayer.getPlayerState === 'function' && typeof inactivePlayer.stopVideo === 'function') {
        const inactiveState = inactivePlayer.getPlayerState();
        if (inactiveState === YT.PlayerState.PLAYING &&
            !isTransitioning && !isAudioFading &&
             inactivePlayer !== activePlayer)
            {
            console.warn("Monitor: Reproductor inactivo detectado aún REPRODUCIENDO fuera de transición/fundido. Deteniéndolo.");
            try {
                inactivePlayer.stopVideo();
            } catch(e) { console.error("Monitor: Error deteniendo reproductor inactivo:", e); }
        }
    }
}
// --- SponsorBlock: Chequear y Saltar Segmento ---
function checkAndSkipSegment(player, forceCheck = false) {
    const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData()?.video_id;

    if (!videoId || isNaN(currentTime)) {
        // console.log("SB Check: No hay videoId o currentTime válido.");
        return;
    }

    const playerState = player.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) {
         // console.log(`SB Check: Reproductor no reproduciendo o cargando (Estado: ${playerState}). Saltando comprobación.`);
        return;
    }

    // --- Manejar el seguimiento del último salto ---
    if (videoId !== lastSeekVideoId) {
        console.log(`checkAndSkipSegment: Video cambió a ${videoId}. Reseteando lastSeekEndTime.`);
        lastSeekEndTime = -1; // Resetear para el nuevo video
        lastSeekVideoId = videoId; // Rastrear videoId actual
    } else {
         if (lastSeekEndTime !== -1 && currentTime >= lastSeekEndTime + 0.2) { // Agregar un pequeño buffer
             console.log(`checkAndSkipSegment: Reseteando lastSeekEndTime (${lastSeekEndTime.toFixed(2)}) porque currentTime (${currentTime.toFixed(2)}) pasó el punto.`);
             lastSeekEndTime = -1; // Limpiar último salto
         }
         if (lastSeekEndTime !== -1) {
             // console.log(`SB Check: Esperando después de salto previo (${lastSeekEndTime.toFixed(2)}).`);
             return; // No verificar segmentos justo después de un salto
         }
    }

    // --- Buscar Segmentos ---
    const segments = segmentosCache[videoId]; // Obtener el estado actual del caché

    // Si segmentosCache[videoId] es undefined, iniciamos la obtención (que establece el estado a 'fetching').
    if (segments === undefined) {
        console.log(`checkAndSkipSegment: Segmentos undefined para ${videoId}. Iniciando obtención.`);
        obtenerSegmentosSponsorBlock(videoId); // Llamada asíncrona que establece el estado 'fetching'
        return; // Salir para este tick del monitor
    }

    // Si segmentosCache[videoId] es 'fetching', simplemente salimos.
     if (segments === 'fetching') {
         // console.log(`SB Check: Segmentos aún obteniendo para ${videoId}. Esperando.`);
         return; // Salir para este tick del monitor
     }

    // --- CORRECCIÓN: Manejar caso null o array vacío ---
    // Si llegamos aquí, 'segments' es un array ([] o [segmentos...]) o null (si la obtención falló).
    // Si es null o un array vacío, no hay segmentos que verificar. Salir.
    if (segments === null || segments.length === 0) {
        // console.log(`SB Check: No hay segmentos para verificar para ${videoId} (caché nulo o vacío).`);
        return; // Salir si null o array vacío
    }

    // Si llegamos aquí, 'segments' es un array no vacío [segmentos...].
    // Proceder a encontrar y saltar segmentos.

    // --- Procesar Segmentos (Si hay) ---
    const segmentToSkip = segments.find(segment => {
        // --- MODIFICACIÓN: Leer los tiempos de las propiedades startTime y endTime ---
        const start = segment.startTime; // Leer directamente de segment.startTime
        const end = segment.endTime;     // Leer directamente de segment.endTime

        // NOTA: La validación de que start y end son números ya se hizo en obtenerSegmentosSponsorBlock.
        // No es estrictamente necesario volver a verificar isNaN aquí si la validación previa funcionó.

        // Verificar si el tiempo actual está dentro del segmento (inicio <= currentTime < fin)
        const isWithinSegment = currentTime >= start && currentTime < end;

        // Verificar si el final de este segmento es después del tiempo del último salto
        const isAfterLastSeek = lastSeekEndTime === -1 || end > lastSeekEndTime;

        return isWithinSegment && isAfterLastSeek;
    });

    // Si se encontró un segmento para saltar
    if (segmentToSkip) {
        // --- MODIFICACIÓN: Leer los tiempos y tipo de las propiedades directas ---
        const segmentStart = segmentToSkip.startTime; // Leer directamente de startTime
        const segmentEnd = segmentToSkip.endTime;     // Leer directamente de endTime
        const segmentType = segmentToSkip.category;   // Leer directamente de category

        // --- Manejar Segmentos Outro Específicamente ---
        if (segmentType === 'outro') {
            const timeRemainingInSegment = segmentEnd - currentTime;
            console.log(`SPONSORBLOCK OUTRO: Segmento outro detectado (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Tiempo restante en el outro: ${timeRemainingInSegment.toFixed(1)}s.`);

            // Si el tiempo restante en el outro está dentro de la ventana de crossfade (+ buffer),
            // Y NO estamos ya en transición, Y el crossfade AÚN NO ha sido disparado por outro, disparamos playNextVideo.
            if (timeRemainingInSegment <= CROSSFADE_DURATION + 0.5 && timeRemainingInSegment > 0 && !isTransitioning && !hasOutroCrossfadeStarted) {
                 console.log(`SPONSORBLOCK OUTRO: Tiempo restante en outro (${timeRemainingInSegment.toFixed(1)}s) dentro de la ventana de crossfade (${CROSSFADE_DURATION}s + buffer). Disparando playNextVideo basado en outro.`);
                 hasOutroCrossfadeStarted = true; // Establecer flag
                 playNextVideo(); // Iniciar crossfade
            } else {
                 console.log(`SPONSORBLOCK OUTRO: Tiempo restante en outro (${timeRemainingInSegment.toFixed(1)}s) fuera de la ventana de crossfade (${CROSSFADE_DURATION}s). No se realiza salto inmediato.`);
            }
             // NO realizar seekTo para outros.

        } else {
            // --- Manejar Otros Tipos de Segmentos (Sponsor, Self-promo, etc.) ---
            const skipToTime = segmentEnd; // El punto de salto es el final del segmento
             console.log(`SPONSORBLOCK SKIP: Saltando segmento (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Saltando a ${skipToTime.toFixed(1)}s.`);

            try {
                player.seekTo(skipToTime, true); // Realizar el salto.
                lastSeekEndTime = skipToTime; // Registrar el tiempo de salto para evitar re-saltos
            } catch (e) {
                console.error("SPONSORBLOCK SKIP: Error realizando seekTo:", e);
            }
        }
    }

     // --- hasOutroCrossfadeStarted se resetea en onPlayerStateChange (estado PLAYING del NUEVO video) ---
}
// --- SponsorBlock: Obtener Segmentos ---
async function obtenerSegmentosSponsorBlock(videoId) {
    // Si ya hay segmentos en caché (es un array) o ya se está obteniendo ('fetching'), no hacer nada.
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) {
         // console.log(`SB Fetch: Segmentos ya en caché o obteniendo para ${videoId}. Saliendo.`);
         return null; // O simplemente return; si la función no necesita retornar un valor aquí
    }

    // Si llegamos aquí, segmentosCache[videoId] es undefined.
    // Marcar el estado como 'fetching' SINCRÓNICAMENTE ANTES de la llamada await fetch.
    segmentosCache[videoId] = 'fetching';
    console.log(`SB Fetch: Iniciando obtención para ${videoId}. Marcando estado 'fetching'.`);

    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; // Tu userId
    const apiUrl = `/api/segments/${videoId}`; // URL relativa a tu función Netlify
    console.log(`SB Fetch: Llamando a la API local SB: ${apiUrl}`);

    try {
        // Tu llamada fetch con el encabezado X-UserID
        const response = await fetch(apiUrl, {
            headers: {
                'X-UserID': userId // Tu encabezado X-UserID
            }
        });

        if (!response.ok) {
             console.error(`SB Fetch: Error desde la API SB (${apiUrl}): ${response.status} ${response.statusText}`);
             throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
             console.warn(`SB Fetch: La API SB (${apiUrl}) no devolvió un array para ${videoId}. Respuesta:`, data);
              throw new Error(`API SB Error: Respuesta no es un array`);
        }

        console.log(`SB Fetch: Segmentos recibidos de API SB para ${videoId} (crudos): ${data.length}`);

        // --- LÓGICA DE VALIDACIÓN DE SEGMENTOS AJUSTADA para startTime/endTime ---
        const validSegments = data.filter(segment => {
            // 1. Verificar que el segmento existe y tiene las propiedades startTime y endTime
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                console.warn(`SB Fetch: Segmento inválido detectado (faltan startTime/endTime):`, segment);
                return false; // Filtrar segmento inválido
            }

            // 2. Verificar que startTime y endTime son números válidos
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);

            if (isNaN(start) || isNaN(end)) {
                 console.warn(`SB Fetch: Segmento inválido detectado (startTime/endTime no son números válidos):`, segment);
                 console.warn("Segmento inválido:", segment); // Log detallado del segmento problemático
                 return false; // Filtrar segmento inválido
            }

            // 3. Opcional: Comprobación básica de coherencia de tiempos (end >= start)
            if (start < 0 || end < 0 || end < start) {
                 console.warn(`SB Fetch: Segmento inválido detectado (tiempos incoherentes):`, segment);
                 console.warn("Segmento inválido:", segment); // Log detallado del segmento problemático
                 return false; // Filtrar segmento inválido
            }

            // Si pasa todas las comprobaciones, el segmento es válido
            return true;
        });

        console.log(`SB Fetch: Segmentos válidos después de validación para ${videoId}: ${validSegments.length}`);
        // Opcional: Ordenar segmentos válidos por tiempo de inicio
        validSegments.sort((a, b) => a.startTime - b.startTime); // Ordenar usando las propiedades numéricas

        // Añadir duración del video si viene en el primer segmento válido (si tu API la incluye)
        if (validSegments.length > 0 && typeof validSegments[0].videoDuration !== 'undefined') {
             console.log(`SB Fetch: Duración del video según SB para ${videoId}: ${validSegments[0].videoDuration}s`);
             // Si necesitas usar esta duración en otro lugar, podrías almacenarla:
             // segmentosCache[videoId].videoDuration = validSegments[0].videoDuration;
        }


        // Almacenar los SEGMENTOS VÁLIDOS (el array filtrado) en caché
        segmentosCache[videoId] = validSegments; // Almacenar el array (puede ser vacío si ninguno fue válido)
        return validSegments; // Devolver el array filtrado (puede ser vacío)

    } catch (error) {
        console.error(`SB Fetch: Error en fetch/procesamiento SB para ${apiUrl}:`, error);
        // En caso de cualquier error, establecer segmentosCache[videoId] a null.
        segmentosCache[videoId] = null; // Establecer a null en caché
        return null; // Devolver null para indicar el fallo
    }
    // Después de fetch (exitoso o fallido), segmentosCache[videoId] ya no será 'fetching'.
}
// Módulo: Manejo de Eventos y Botones

// --- Botón Play/Pause Principal --- (Asumiendo que botonPlay ahora también pausa)
const botonPlay = document.getElementById("botonPlay");
let reproduccionIniciada = false; // Para controlar el primer Play

botonPlay.disabled = true; // Deshabilitado al inicio
botonPlay.addEventListener('click', () => {
     const activePlayer = currentPlayer === 1 ? player1 : player2;
     if (!playersInitialized || !activePlayer) {
          mostrarMensajeFlotante("El reproductor no está listo.");
          return;
     }

     const playerState = activePlayer.getPlayerState();

     if (!reproduccionIniciada) {
         // --- Primer Play ---
          const flatList = getFlattenedPlaylist();
          if (flatList.length > 0) {
               reproduccionIniciada = true;
               playFirstVideo(); // Inicia la reproducción desde el principio
               botonPlay.innerHTML = '<i class="fas fa-pause"></i>'; // Cambiar icono a Pausa
               // botonPlay.disabled = true; // Deshabilitar hasta que termine? O dejar para pausar
          } else {
               mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
          }
     } else {
          // --- Play/Pause después del inicio ---
           if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                botonPlay.innerHTML = '<i class="fas fa-play"></i>'; // Cambiar icono a Play
                stopMonitoring(); // Detener monitoreo al pausar manualmente
           } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
               activePlayer.playVideo();
               botonPlay.innerHTML = '<i class="fas fa-pause"></i>'; // Cambiar icono a Pausa
               startMonitoring(); // Reanudar monitoreo
           }
     }
});


// --- Botón Next ---
document.getElementById('botonNext').addEventListener('click', () => {
     if (!reproduccionIniciada){
        mostrarMensajeFlotante("Inicia la reproducción primero con el botón Play.");
        return;
     }
     console.log("Botón Mix/Next presionado.");
     // Detener monitoreo brevemente para evitar doble salto
     stopMonitoring();
     playNextVideo(); // Llama a la función adaptada
     // El monitoreo se reiniciará automáticamente si la reproducción continúa
     // O se puede reiniciar aquí con un pequeño delay
     setTimeout(startMonitoring, 500);
});

// --- Búsqueda por palabras ---
const searchInput = document.getElementById('searchInput');
const debouncedSearch = debounce((query) => {
    performSearch(query); // Llama a la búsqueda inicial
}, 500);

searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (query.length > 2) {
        debouncedSearch(query);
    } else {
        resultsDiv.innerHTML = ''; // Limpiar si input corto o vacío
        currentSearchQuery = '';
        nextPageContext = null;
        isLoadingMore = false;
        hideLoadMoreSpinner();
    }
});

// --- Añadir Playlist por URL ---
const añadirUrlButton = document.getElementById('añadirUrlButton');
const searchInput2 = document.getElementById('searchInput2');

añadirUrlButton.addEventListener('click', async () => {
    const url = searchInput2.value.trim();
    const playlistIdFromUrl = extractPlaylistId(url); // Función existente

    if (!playlistIdFromUrl) {
        alert('URL de la playlist no válida.');
        return;
    }
    searchInput2.value = ''; // Limpiar input inmediatamente

    try {
        const playlistInfo = await getPlaylistInfo(playlistIdFromUrl); // Función existente
        if (playlistInfo) {
            // Pasar ID explícitamente si la API no lo devuelve consistentemente
            playlistInfo.id = playlistIdFromUrl;
            handlePlaylistLoaded(playlistInfo); // Llamar a la nueva función de manejo
        } else {
            // getPlaylistInfo ya debería mostrar error si falla
            // mostrarMensajeFlotante('No se pudo obtener información de la playlist.');
        }
    } catch (error) {
         console.error("Error en proceso de añadir URL:", error);
         mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
    }
});
// --- Funciones Auxiliares (Debounce, Formato Duración, Parseo Duración, etc.) ---

// Debounce para la busqueda
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Formato MM:SS para mostrar duración
function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) {
        return "0:00"; // Devolver 0:00 si es inválido
    }
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}`;
}

// Parsear duración (de varios formatos a segundos)
function parseDuration(durationInput) {
    if (typeof durationInput === 'number') {
        return Math.floor(durationInput); // Devolver entero si ya es número
    }
    if (typeof durationInput !== 'string') return 0;

    // Intentar formato PT0H0M0S (YouTube API a veces)
    const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (isoMatch) {
        const hours = parseInt(isoMatch[1] || '0', 10);
        const minutes = parseInt(isoMatch[2] || '0', 10);
        const seconds = parseFloat(isoMatch[3] || '0');
        return Math.floor(hours * 3600 + minutes * 60 + seconds);
    }

    // Intentar formato MM:SS o HH:MM:SS
    const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        return timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 3 && !isNaN(timeParts[0]) && !isNaN(timeParts[1]) && !isNaN(timeParts[2])) {
        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }

    // Intentar parsear como número directo (si es string "180")
    const directNumber = parseInt(durationInput, 10);
    if (!isNaN(directNumber)) {
         return directNumber;
    }

    return 0; // Fallback
}
// --- Carga de Playlist desde URL (Piped API + Proxy + Retry) ---
const pipedInstances = [ // Lista de instancias Piped
   //  "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party"
   
];
function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}
// Función fetch con reintentos (usada por getPlaylistInfo)
async function fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            console.log(`fetchDataWithRetry: Intento ${retries + 1} para ${url}`);
            const response = await fetch(url, options);
            if (!response.ok) {
                 // Intentar leer cuerpo del error
                 let errorBodyText = `HTTP error! status: ${response.status}`;
                 try { errorBodyText = await response.text(); } catch(e){}
                throw new Error(errorBodyText);
            }
            return await response.json(); // Asume que la respuesta es JSON
        } catch (error) {
            console.error(`Error fetching ${url}, reintento ${retries + 1}/${maxRetries + 1}:`, error.message);
            retries++;
            if (retries <= maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retries)); // Incrementar delay
            } else {
                 console.error(`fetchDataWithRetry: Fallaron todos los ${maxRetries + 1} intentos para ${url}`);
                throw error; // Lanza el error después de todos los reintentos
            }
        }
    }
}
// Obtener info de Playlist usando Piped
async function getPlaylistInfo(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
    try {
        // Pasar directamente targetUrl si no necesitas proxy
        const data = await fetchDataWithRetry(targetUrl);
        if (!data || !data.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos.");
        }
        // Devolver data completa, handlePlaylistLoaded extraerá lo necesario
        return data;
    } catch (error) {
        console.error("Error al obtener la información de la playlist:", error.message);
        mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
        // return null; // Devolver null ya no es necesario, el error se propaga
         throw error; // Re-lanzar para que el .catch en el listener lo maneje
    }
}
// Extraer ID de playlist de URL
function extractPlaylistId(url) {
    try {
        const urlObject = new URL(url);
        return urlObject.searchParams.get('list');
    } catch (e) {
        console.error("URL inválida para extraer ID de playlist:", url);
        return null;
    }
}
// Al iniciar la app, revisa si ya hay un token guardado
function checkGoogleTokenOnLoad() {
    const token = localStorage.getItem('google_token');
    if (token) {
        // Token disponible, puedes continuar autenticado
        console.log('Token encontrado en localStorage:', token);
        // Llama aquí a tu función de inicialización autenticada
        onGoogleSignInSuccess(token);
    } else {
        // No hay token, muestra el botón de login
   //     showGoogleLoginButton();
    }
}
// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
     // Asegurarse que la playlist manual exista al inicio (si no hay datos guardados)
     if (!playlistsData.some(p => p.id === 'manual')) {
        playlistsData.push({ id: 'manual', name: 'Mis Vídeos Añadidos', thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico', videos: [], isExpanded: true });
     }
     updatePlaylistsUI(); // Render inicial de la UI de playlists
     loadYouTubeAPI(); // Iniciar carga de la API de YouTube
});
// Llama a token si hay
window.onload = () => {
    checkGoogleTokenOnLoad();
};
// Cerrar menús contextuales si se hace click fuera
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
