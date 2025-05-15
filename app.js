// Módulo: Configuración y Variables Globales
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let monitorInterval; // Declarar fuera para controlar el intervalo
let playersInitialized = false; // Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let isTransitioning = false; // Flag para estado de transición
let isAudioFading = false; // Flag específico para la duración del fundido de audio
let hasOutroCrossfadeStarted = false; // Flag para indicar si el crossfade fue disparado por un segmento "outro" de SB

// --- NUEVO: Flags para sincronización del fundido de entrada del siguiente reproductor ---
let nextPlayerReadyForFadeIn = false;
let nextPlayerInstanceForFade = null; // Guarda la instancia del reproductor que se espera que haga fade-in
let previousPlayerInstanceForFade = null; // Guarda la instancia del reproductor que se espera que haga fade-out
let fadeStartTime = 0; // Para registrar cuándo comienza el fundido de audio


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
    }, 6000);// 6segundos
}
// mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!"); // Comentado para no molestar siempre


// --- Helper Players ---
function getActivePlayer() {
    return currentPlayer === 1 ? player1 : player2;
}
function getInactivePlayer() {
    return currentPlayer === 1 ? player2 : player1;
}
function getActivePlayerElement() {
    return document.getElementById(`player${currentPlayer}`);
}
function getInactivePlayerElement() {
    return document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
}

// --- Cache de Playlist Aplanada ---
let cachedFlatList = [];
let needsFlatListRefresh = true;

function getFlattenedPlaylist() {
    if (!needsFlatListRefresh && cachedFlatList.length > 0) return cachedFlatList;
    cachedFlatList = playlistsData.flatMap(p =>
        p.videos.map(v => ({ ...v, sourcePlaylistId: p.id }))
    );
    needsFlatListRefresh = false;
    return cachedFlatList;
}

function markFlatListDirty() {
    needsFlatListRefresh = true;
}


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
    const changedPlayer = event.target;
    const changedPlayerNum = changedPlayer === player1 ? 1 : 2;
    const videoId = changedPlayer.getVideoData()?.video_id;

    // --- CAMBIO IMPORTANTE: Lógica para `nextPlayerReadyForFadeIn` ---
    if (isTransitioning && changedPlayer === nextPlayerInstanceForFade && playerState === YT.PlayerState.PLAYING) {
        console.log(`onPlayerStateChange: Player ${changedPlayerNum} (nextPlayerInstanceForFade) está REPRODUCIENDO. Marcando nextPlayerReadyForFadeIn = true.`);
        nextPlayerReadyForFadeIn = true; // Señal para crossfadeAudio

        // Si el fundido de audio ya está en progreso para el reproductor anterior,
        // y ahora el nuevo está listo, nos aseguramos de que crossfadeAudio (o su lógica) lo incluya.
        if (isAudioFading && previousPlayerInstanceForFade) {
            console.log("onPlayerStateChange: El nuevo reproductor está listo, notificando/reactivando crossfade para el fundido de entrada.");
            // crossfadeAudio ya está corriendo, su intervalo detectará nextPlayerReadyForFadeIn
        }
    }
    // --- FIN CAMBIO ---

    if (playerState === YT.PlayerState.PLAYING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);

         // Esta lógica maneja la finalización de una transición cuando el *nuevo* video comienza a reproducir.
         if (isTransitioning && changedPlayer === nextPlayerInstanceForFade) {
             const newCurrentPlayer = (nextPlayerInstanceForFade === player1) ? 1 : 2;
             if (currentPlayer !== newCurrentPlayer) {
                 console.log(`onPlayerStateChange: Transición - Nuevo video (${videoId}) en Player ${newCurrentPlayer} ha comenzado. Actualizando currentPlayer a ${newCurrentPlayer}.`);
                 currentPlayer = newCurrentPlayer;
             }
             isTransitioning = false; // La transición PRINCIPAL (carga y visual) se considera completada.
                                     // isAudioFading se manejará independientemente por crossfadeAudio.
             console.log("onPlayerStateChange: Transición (visual/carga) completada. currentPlayer actualizado, isTransitioning=false.");
             
             // Limpiar las instancias de fade SOLO después de que la transición se completa Y el audio fade haya terminado
             // Esto se hará al final de crossfadeAudio.
             // nextPlayerInstanceForFade = null;
             // previousPlayerInstanceForFade = null;
         }

         const flatList = getFlattenedPlaylist();
         const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

         if (videoId && playingVideoIndex !== -1) {
              const playingVideoObject = flatList[playingVideoIndex];
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
              currentPlayingInfo.flattenedIndex = playingVideoIndex;
              // console.log(`onPlayerStateChange: Info de reproducción actualizada: ${playingVideoIndex} (Video: ${videoId})`);
              updatePlaylistsUI();

             if (currentPlayer !== changedPlayerNum && !isTransitioning) {
                  console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} (fuera de transición manejada).`);
                  currentPlayer = changedPlayerNum;
             }
             // console.log(`onPlayerStateChange: Reseteando flag hasOutroCrossfadeStarted.`);
             hasOutroCrossfadeStarted = false;

         } else if (videoId && playingVideoIndex === -1) { // Video sonando no está en la playlist
             console.warn(`onPlayerStateChange: Video desconocido (${videoId}) comenzó a reproducir en Player ${changedPlayerNum}.`);
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = null;
              currentPlayingInfo.flattenedIndex = -1;
               updatePlaylistsUI();
               if (currentPlayer !== changedPlayerNum && !isTransitioning) {
                   // console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} para video desconocido.`);
                    currentPlayer = changedPlayerNum;
               }
                // console.log(`onPlayerStateChange: Reseteando hasOutroCrossfadeStarted para video desconocido.`);
                hasOutroCrossfadeStarted = false;
         }

          // Llamar a checkAndSkipSegment con forceCheck=true al entrar en estado PLAYING
          if (videoId) {
             checkAndSkipSegment(changedPlayer, true); // Usar changedPlayer
          }

     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
     } else if (playerState === YT.PlayerState.BUFFERING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);
         if (isTransitioning && changedPlayer === nextPlayerInstanceForFade) {
             console.log("onPlayerStateChange: nextPlayerInstanceForFade está BUFFERING. Esperando PLAYING para activar nextPlayerReadyForFadeIn.");
         }
     } else if (playerState === YT.PlayerState.CUED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);
         // Si un video se queda en CUED después de un playVideo() durante la transición, podría ser un problema.
         if (isTransitioning && changedPlayer === nextPlayerInstanceForFade && reproduccionIniciada) {
            console.warn(`onPlayerStateChange: El reproductor siguiente ${changedPlayerNum} entró en CUED inesperadamente durante transición. Intentando playVideo() de nuevo.`);
            setTimeout(() => {
                try {
                    if (changedPlayer && typeof changedPlayer.playVideo === 'function' && changedPlayer.getPlayerState() === YT.PlayerState.CUED) {
                        changedPlayer.playVideo();
                    }
                } catch(e) { console.error("Error reintentando playVideo desde CUED:", e); }
            }, 300);
         }
     } else if (playerState === YT.PlayerState.ENDED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
         const endedVideoMatchesCurrent = (videoId && currentPlayingInfo.videoId === videoId);

         // Si el video que TERMINÓ es el que estaba sonando (currentPlayer) Y NO estamos en medio de una transición o fundido.
         if (changedPlayerNum === currentPlayer && endedVideoMatchesCurrent && !isTransitioning && !isAudioFading) {
             console.log(`onPlayerStateChange: Video actual (${videoId}) en Player ${changedPlayerNum} terminó. Intentando playNextVideo.`);
             playNextVideo();
         } else if (changedPlayerNum !== currentPlayer) {
             // console.log(`onPlayerStateChange: Otro player ${changedPlayerNum} (no el activo) terminó. Video: ${videoId}.`);
         }
    }
}

// Módulo: Interacción con API de Búsqueda (Piped)
const performSearch = async (query, nextPage = null) => {
    if (!resultsDiv) return;

    if (!nextPage) {
        console.log(`Iniciando NUEVA búsqueda para: ${query}`);
        currentSearchQuery = query;
        nextPageContext = null;
        resultsDiv.innerHTML = '<p>Buscando...</p>';
    } else {
        console.log(`Cargando MÁS resultados para: ${currentSearchQuery} (Página: ${nextPage})`);
        showLoadMoreSpinner();
    }
    isLoadingMore = true;

    try {
        let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(currentSearchQuery)}`;
        if (nextPage) {
            apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`;
        }
        const response = await fetch(apiUrl);
        if (!response.ok) {
            let errorDetails = `Error: ${response.status} ${response.statusText}`;
            try {
                const errorBody = await response.json();
                errorDetails = errorBody.error || errorDetails;
            } catch (e) { /* ignore */ }
            const error = new Error(errorDetails); // Crear un objeto Error
            error.status = response.status; // Añadir status si es útil
            throw error;
        }
        const data = await response.json();
        displaySearchResultsPiped(data, !!nextPage);
    } catch (error) {
        console.error("Error fetching search results (app.js):", error.message, error);
        const displayError = error.message || "Error desconocido al buscar.";
        if (!nextPage) resultsDiv.innerHTML = `<p>${displayError}</p>`;
        else mostrarMensajeFlotante(displayError);
        hideLoadMoreSpinner();
        isLoadingMore = false;
    }
};

const displaySearchResultsPiped = (results, append = false) => {
    if (!resultsDiv) {
        console.error("Results div not found!");
        return;
    }
    if (!append) {
        resultsDiv.innerHTML = '';
    }
    if (!results || !results.items || !Array.isArray(results.items) || results.items.length === 0) {
        if (!append && (!results || results.items?.length === 0)) { 
            resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
        }
        nextPageContext = results?.nextpage || null; 
        isLoadingMore = false;
        hideLoadMoreSpinner();
        return;
    }

    nextPageContext = results.nextpage || null;
    // console.log("Next page context:", nextPageContext);

    results.items.forEach(video => {
        const authorName = video.uploaderName || 'Autor Desconocido';
        const videoId = video.videoId || video.url?.split('v=')[1];

        if (!videoId) {
            console.warn("Resultado omitido, no se pudo obtener videoId:", video);
            return;
        }
        if (append && resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
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
        const addToPlaylistButton = document.createElement('button');
        addToPlaylistButton.innerHTML = '<i class="fa-solid fa-plus"></i><span class="add-text"> Añadir</span>';
        addToPlaylistButton.classList.add('add-to-playlist', 'search-result-add-button'); 
        addToPlaylistButton.dataset.videoId = videoId;
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        const durationSeconds = typeof video.duration === 'number' ? video.duration : parseDuration(video.duration);
        addToPlaylistButton.dataset.videoDuration = durationSeconds;
        
        addToPlaylistButton.addEventListener('click', (event) => {
            const button = event.currentTarget;
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration, 10),
            };
            handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addToPlaylistButton);
        videoDiv.appendChild(detailsDiv);
        resultsDiv.appendChild(videoDiv);
    }); 

    if (append) {
        hideLoadMoreSpinner();
    }
    isLoadingMore = false;
};

function handleSearchResultAddClick(event, videoData) {
    event.preventDefault(); 
    event.stopPropagation(); 
    const addButton = event.currentTarget; 
    const userLoadedPlaylists = playlistsData.filter(p => p.id !== 'manual' || p.videos.length > 0);
    if (userLoadedPlaylists.length === 0) {
        addVideoToManualPlaylist(videoData); 
    } else {
        showPlaylistSelectionPopup(addButton, videoData, 'add'); 
  }
}

function addVideoToManualPlaylist(videoData) {
    const manualPlaylistId = 'manual';
    let manualPlaylist = playlistsData.find(p => p.id === manualPlaylistId);

    if (!manualPlaylist) {
        manualPlaylist = {
            id: manualPlaylistId,
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://via.placeholder.com/50?text=+',
            videos: [],
            isExpanded: true
        };
        playlistsData.unshift(manualPlaylist);
    }

    const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
        return;
    }

    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0, 
    };

    manualPlaylist.videos.push(videoObject);
    mostrarMensajeFlotante(`Video añadido a "${manualPlaylist.name}": ${videoObject.title}`);
    updatePlaylistsUI(); 
    checkAndEnablePlayButton(); 
}

function addVideoToSpecificPlaylist(videoData, targetPlaylistId) {
    const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
    if (!targetPlaylist) {
        mostrarMensajeFlotante("Error: No se encontró la playlist destino.");
        return;
    }

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

    let targetIndex = targetPlaylist.videos.length; 
    if (currentPlayingInfo.playlistId === targetPlaylistId && currentPlayingInfo.flattenedIndex >= 0) {
        const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentPlayingInfo.videoId);
        if (currentVideoLocalIndex !== -1) {
            targetIndex = currentVideoLocalIndex + 1; 
        }
    }
    targetPlaylist.videos.splice(targetIndex, 0, videoObject);
    mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
    updatePlaylistsUI(); 
    updateCurrentPlayingIndex(); 
    checkAndEnablePlayButton(); 
}

function checkAndEnablePlayButton() {
     const flatList = getFlattenedPlaylist();
     if (flatList.length > 0 && playersInitialized) {
         botonPlay.disabled = false;
     }
}

const handleScroll = () => {
    if (isLoadingMore || !nextPageContext || !currentSearchQuery) {
        return;
    }
    const scrollThreshold = 300; 
    const bottomReached = resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - scrollThreshold;
    if (bottomReached) {
        performSearch(currentSearchQuery, nextPageContext);
    }
};
resultsContainer.addEventListener('scroll', handleScroll);

function showLoadMoreSpinner() {
    let spinner = document.getElementById('loadMoreSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadMoreSpinner';
        spinner.className = 'loading-spinner-small';
        resultsContainer.appendChild(spinner); 
    }
    spinner.style.display = 'flex';
}
function hideLoadMoreSpinner() {
    const spinner = document.getElementById('loadMoreSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

// Módulo: Manejo de Playlists (getFlattenedPlaylist ya está definida)

function updateCurrentPlayingIndex() {
    const flatList = getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;

     try {
         if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player1.getVideoData()?.video_id;
             activePlayerNum = 1;
         } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
             playingVideoId = player2.getVideoData()?.video_id;
             activePlayerNum = 2;
         }
     } catch (e) {
         // console.error("Error getting playing video data:", e);
     }
    
    if (playingVideoId) {
         if (currentPlayingInfo.videoId !== playingVideoId || currentPlayingInfo.flattenedIndex < 0) {
             const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
             if (newFlatIndex !== -1) {
                  const currentVideoObject = flatList[newFlatIndex];
                  currentPlayingInfo.videoId = playingVideoId;
                  currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                  currentPlayingInfo.flattenedIndex = newFlatIndex;
                  updatePlaylistsUI();
             } else {
                  currentPlayingInfo.flattenedIndex = -1; 
             }
         }
          if (activePlayerNum && currentPlayer !== activePlayerNum && !isTransitioning) { // Solo cambiar si no estamos en medio de una transición
             // console.log(`Sincronizando currentPlayer a ${activePlayerNum} (updateCurrentPlayingIndex)`);
             currentPlayer = activePlayerNum;
          }

    } else {
         if (currentPlayingInfo.flattenedIndex !== -1 && !isTransitioning && !isAudioFading) { // No resetear si estamos en transición
            // console.log("Reproducción detenida o sin iniciar, reseteando índice aplanado.");
            currentPlayingInfo.videoId = null;
            currentPlayingInfo.playlistId = null;
            currentPlayingInfo.flattenedIndex = -1;
            updatePlaylistsUI();
         }
    }
}

async function handlePlaylistLoaded(playlistInfo) { 
    if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
        const failedPlaylistId = playlistInfo?.id || playlistInfo?.url?.split('list=')[1] || 'desconocida';
        mostrarMensajeFlotante(`No se encontraron videos válidos en la playlist ${failedPlaylistId}.`);
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
    })).filter(v => v.videoId); 

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

    const manualPlaylistIndex = playlistsData.findIndex(p => p.id === 'manual');
    if (manualPlaylistIndex !== -1) {
        playlistsData.splice(manualPlaylistIndex + 1, 0, newPlaylist);
    } else {
        playlistsData.push(newPlaylist);
    }
    mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`);
    updatePlaylistsUI();
    checkAndEnablePlayButton();
}

function updatePlaylistsUI() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;
    const currentScrollTop = playlistContainer.scrollTop; 
    playlistContainer.innerHTML = ''; 

     const playingVideoId = currentPlayingInfo.videoId;

    if (playlistsData.length === 0) {
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
         if (playlist.isExpanded) {
              // videosDiv.style.maxHeight = '1000px'; // Se ajustará dinámicamente
         } else {
              videosDiv.style.maxHeight = '0px';
         }
        playlist.videos.forEach((video) => {
            const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
            videosDiv.appendChild(item);
        });

        groupDiv.appendChild(videosDiv);
        playlistContainer.appendChild(groupDiv);

         if (playlist.isExpanded) {
             requestAnimationFrame(() => { 
                videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
             });
         }
    });

    playlistContainer.scrollTop = currentScrollTop; 
    enableDragAndDrop();
}

function createPlaylistItemElement(video, playlistId, playingVideoId) {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.draggable = true; 
    item.dataset.videoId = video.videoId; 
    item.dataset.playlistId = playlistId; 

    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    const img = document.createElement('img');
    img.src = video.thumbnail; 
    img.alt = video.title; 
    img.className = 'drag-handle'; 
    img.loading = 'lazy'; 
    imageContainer.appendChild(img);

    if (video.videoId === playingVideoId) {
        item.classList.add('playing'); 
        const icon = document.createElement('i'); 
        icon.className = 'fa-solid fa-volume-high playing-icon';
        imageContainer.appendChild(icon);
    }
    item.appendChild(imageContainer); 

    const textContainer = document.createElement('div');
    textContainer.innerHTML = `
        <p style="margin: 0; font-size: 12px; font-weight: bold;" title="${video.title}">${video.title}</p>
        <p style="margin: 0; font-size: 10px; color: #999;">Duración: ${formatDuration(video.duration)}</p>
    `;
    item.appendChild(textContainer); 

    const deleteMenu = document.createElement('div'); 
    deleteMenu.className = 'delete-menu';
    const menuButton = document.createElement('button'); 
    menuButton.className = 'delete-menu-button';
    menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    const menuContent = document.createElement('div'); 
    menuContent.className = 'delete-menu-content'; 
    menuContent.style.display = 'none'; // Oculto por defecto

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button-item'; 
    deleteButton.title = 'Eliminar de esta playlist';
    deleteButton.innerHTML = '<i class="fa-solid fa-xmark"></i> Eliminar';
    menuContent.appendChild(deleteButton);

    const playNextButton = document.createElement('button');
    playNextButton.className = 'play-next-button'; 
    playNextButton.title = 'Poner después del video actual';
    playNextButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i> Reproducir Despues';
    menuContent.appendChild(playNextButton); 

    const moveToPlaylistButton = document.createElement('button');
    moveToPlaylistButton.className = 'move-to-playlist-button'; 
    moveToPlaylistButton.title = 'Mover este video a otra playlist';
    moveToPlaylistButton.innerHTML = '<i class="fa-solid fa-folder-tree"></i> Mover a playlist';
    menuContent.appendChild(moveToPlaylistButton); 

    deleteMenu.appendChild(menuButton);
    deleteMenu.appendChild(menuContent);
    item.appendChild(deleteMenu);

    menuButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        closeAllContextMenus();
        if (menuContent.style.display === 'block' || menuContent.classList.contains('visible')) {
            menuContent.style.display = 'none';
            menuContent.classList.remove('visible'); 
        } else {
            menuContent.style.display = 'block';
            menuContent.classList.add('visible'); 
        }
    });
    deleteButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        deleteVideo(playlistId, video.videoId); 
        closeAllContextMenus(); 
    });

    playNextButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        closeAllContextMenus(); 
        const sourceVideoId = video.videoId; 
        const sourcePId = playlistId; 
        let targetFlatIndex;
        if (currentPlayingInfo.flattenedIndex < 0) {
             targetFlatIndex = 0;
        } else {
             targetFlatIndex = currentPlayingInfo.flattenedIndex + 1;
        }
        const flatList = getFlattenedPlaylist();
        targetFlatIndex = Math.max(0, Math.min(targetFlatIndex, flatList.length)); 
        let cumulativeIndex = 0;
        let targetLocalIndex = -1; 
        let targetPlaylistId = null; 
        for (const p of playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;
            if (targetFlatIndex < endOfPlaylistIndex || (targetFlatIndex === endOfPlaylistIndex && p === playlistsData[playlistsData.length -1]) ) {
                targetPlaylistId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex; 
                targetLocalIndex = Math.min(targetLocalIndex, p.videos.length);
                break; 
            }
            cumulativeIndex += playlistVideoCount; 
        }
        if (targetPlaylistId !== null && targetLocalIndex !== -1) {
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePId);
             const sourceLocalIndex = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;
             if (!(sourcePId === targetPlaylistId && sourceLocalIndex === targetLocalIndex)) {
                moveVideo(sourceVideoId, sourcePId, targetPlaylistId, targetLocalIndex); 
             }
        } else {
            console.error("createPlaylistItemElement: No se pudo determinar la playlist/índice destino para 'Reproducir Despues'.");
            mostrarMensajeFlotante("Error al calcular la posición para 'Reproducir Después'.");
        }
    });
    moveToPlaylistButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        const sourceVideoId = video.videoId; 
        const sourcePId = playlistId; 
        const videoDataForMove = {
            videoId: sourceVideoId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
        };
        showPlaylistSelectionPopup(menuButton, videoDataForMove, 'move', sourcePId); 
    });
    return item;
}

function showPlaylistSelectionPopup(anchorElement, videoData, actionType, sourcePlaylistId = null) {
    closePlaylistSelectionPopups();
    closeAllContextMenus();
    const menu = document.createElement('div');
    menu.className = 'playlist-selection-popup-menu add-to-playlist-menu';
    let availablePlaylists = playlistsData;
    let popupTitleText = '';
    let itemClickHandler = null;

    if (actionType === 'add') {
        popupTitleText = "Añadir video a:";
        itemClickHandler = (event) => {
            event.stopPropagation();
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            addVideoToSpecificPlaylist(videoData, targetPId);
            closePlaylistSelectionPopups();
        };
    } else if (actionType === 'move') {
        popupTitleText = "Mover video a:";
        availablePlaylists = playlistsData.filter(p => p.id !== sourcePlaylistId);
        if (availablePlaylists.length === 0) {
            mostrarMensajeFlotante("No hay otras playlists a las que mover.");
            return;
        }
        itemClickHandler = (event) => {
            event.stopPropagation();
            const targetPId = event.currentTarget.dataset.targetPlaylistId;
            moveVideo(videoData.videoId, sourcePlaylistId, targetPId, 0); // Mover al inicio
            closePlaylistSelectionPopups();
        };
    } else { 
        console.error("showPlaylistSelectionPopup: Invalid actionType:", actionType);
        return; 
    }

    const title = document.createElement('div');
    title.textContent = popupTitleText;
    title.className = 'playlist-selection-popup-title move-to-playlist-popup-title add-to-playlist-popup-title';
    menu.appendChild(title);

    availablePlaylists.forEach(playlist => {
        const item = document.createElement('button');
        item.className = 'playlist-selection-popup-item add-to-playlist-menu-item';
        item.dataset.targetPlaylistId = playlist.id; 
        item.innerHTML = `
            <img src="${playlist.thumbnailUrl || 'https://via.placeholder.com/50?text=?'}"" alt="" loading="lazy">
            <span>${playlist.name}</span>
        `;
        item.title = `${popupTitleText} "${playlist.name}"`; 
        item.addEventListener('click', itemClickHandler);
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const anchorRect = anchorElement.getBoundingClientRect();
    let top = window.scrollY + anchorRect.bottom + 2; 
    let left = window.scrollX + anchorRect.left;
    menu.style.position = 'absolute';
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.minWidth = `${anchorRect.width + 50}px`;
    menu.style.zIndex = '1000'; 

    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth - 10) { 
            left = window.scrollX + anchorRect.right - menuRect.width;
            menu.style.left = `${Math.max(10, left)}px`;
        }
        if (menuRect.left < 10) {
            menu.style.left = '10px';
        }
        if (menuRect.bottom > window.innerHeight - 10) { 
            top = window.scrollY + anchorRect.top - menuRect.height - 2; 
            menu.style.top = `${Math.max(10, top)}px`;
        }
         if (menuRect.top < 10) {
            menu.style.top = '10px';
        }
    });

    setTimeout(() => {
         document.addEventListener('click', closePlaylistSelectionPopups, { once: true, capture: true });
         menu.addEventListener('click', e => e.stopPropagation());
    }, 10); 
}

function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(menu => menu.remove());
}

function closeAllContextMenus() {
     document.querySelectorAll('#playlistContainer .delete-menu-content').forEach(menu => {
          menu.style.display = 'none';
          menu.classList.remove('visible'); // Asegurar que se quite la clase si se usa
     });
}

function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;
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
            requestAnimationFrame(() => { videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px'; });
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        } else {
            videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';
            requestAnimationFrame(() => { videosDiv.style.maxHeight = '0px'; });
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        }
    } else { 
        updatePlaylistsUI(); 
    }
}

function handleTransitionEnd(event) {
    if (event.propertyName !== 'max-height') {
        return;
    }
    const videosDiv = event.target;
    const groupDiv = videosDiv.closest('.playlist-group');
    const playlistId = groupDiv?.dataset.playlistId;
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist && videosDiv) {
        if (playlist.isExpanded) {
            videosDiv.style.maxHeight = 'none';
        } 
    }
}

function deleteVideo(playlistId, videoId) {
    const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
    if (playlistIndex === -1) return;
    const videoIndex = playlistsData[playlistIndex].videos.findIndex(v => v.videoId === videoId);
    if (videoIndex === -1) return;
    const deletedVideoTitle = playlistsData[playlistIndex].videos[videoIndex].title;
    playlistsData[playlistIndex].videos.splice(videoIndex, 1); 
    mostrarMensajeFlotante(`Video "${deletedVideoTitle}" eliminado.`);
    if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
         mostrarMensajeFlotante(`Playlist "${playlistsData[playlistIndex].name}" eliminada (vacía).`);
         playlistsData.splice(playlistIndex, 1);
    }
    updatePlaylistsUI(); 
    updateCurrentPlayingIndex(); 
}

function enableDragAndDrop() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;
    let draggedItemElement = null; 
    let draggedVideoData = null;   
    let placeholder = document.querySelector('.playlist-item.placeholder'); // Intentar reutilizar
    if (!placeholder) { // Crear solo si no existe
        placeholder = document.createElement('div');
        placeholder.className = 'playlist-item placeholder';
        // Estilos básicos del placeholder, puedes definirlos mejor en CSS
        placeholder.style.height = '40px'; 
        placeholder.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        placeholder.style.border = '1px dashed #007bff';
        placeholder.style.margin = '4px 0';
    }


    playlistContainer.querySelectorAll('.playlist-item:not(.placeholder)').forEach(item => { // Excluir placeholder de ser draggable
        item.addEventListener('dragstart', (event) => {
            const targetItem = event.target.closest('.playlist-item:not(.placeholder)');
            if (!targetItem) return;
            draggedItemElement = targetItem;
            draggedVideoData = {
                videoId: targetItem.dataset.videoId,
                sourcePlaylistId: targetItem.dataset.playlistId
            };
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedVideoData.videoId); 
            setTimeout(() => targetItem.classList.add('dragging'), 0);
        });
        item.addEventListener('dragend', () => {
            if (draggedItemElement) draggedItemElement.classList.remove('dragging');
            if (placeholder.parentNode) placeholder.remove(); 
            document.querySelectorAll('.drag-over-area').forEach(el => el.classList.remove('drag-over-area'));
            draggedItemElement = null; draggedVideoData = null;
        });
        item.addEventListener('dragover', (event) => {
             event.preventDefault(); 
             event.dataTransfer.dropEffect = 'move';
             const targetItem = event.target.closest('.playlist-item:not(.placeholder)');
             if (!targetItem || targetItem === draggedItemElement) return; 
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY < targetRect.height / 2) targetItem.parentNode.insertBefore(placeholder, targetItem);
              else targetItem.parentNode.insertBefore(placeholder, targetItem.nextSibling);
        });
        item.addEventListener('drop', (event) => {
            event.preventDefault();
             if (placeholder.parentNode) placeholder.remove();
            const targetItem = event.target.closest('.playlist-item:not(.placeholder)');
            if (!targetItem || !draggedVideoData || targetItem === draggedItemElement) {
                return;
            }
            const targetPlaylistId = targetItem.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain'); 
             const videoElements = Array.from(targetItem.parentNode.children).filter(el => el !== placeholder && !el.classList.contains('dragging'));
             let targetIndex = videoElements.indexOf(targetItem);
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY >= targetRect.height / 2) targetIndex++; 
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });
    playlistContainer.querySelectorAll('.playlist-group-videos').forEach(container => {
        container.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move';
             // Mostrar placeholder si el contenedor está vacío o si se arrastra al final del contenedor
             if (container.children.length === 0 || (event.target === container && !container.querySelector('.playlist-item:not(.placeholder):hover'))) {
                 if (Array.from(container.children).filter(el=>el !== placeholder).length === 0) { // si solo está el placeholder o está vacío
                    container.appendChild(placeholder);
                    container.classList.add('drag-over-area');
                 }
             } else if (event.offsetY > container.scrollHeight - 20 && !placeholder.parentNode) { // Cerca del final y ph no está
                 container.appendChild(placeholder);
                 container.classList.add('drag-over-area');
             }
        });
         container.addEventListener('dragleave', (event) => {
             if (!container.contains(event.relatedTarget) || event.relatedTarget === null) { // Si el mouse sale del contenedor
                  container.classList.remove('drag-over-area');
                  // Solo remover el placeholder si no es el único elemento y no estamos sobre otro item
                  if (placeholder.parentNode === container && (Array.from(container.children).filter(el => el !== placeholder).length > 0 || !event.relatedTarget?.closest('.playlist-item'))) {
                    // placeholder.remove(); // Comentado para evitar que desaparezca muy rápido
                  }
             }
         });
        container.addEventListener('drop', (event) => {
            event.preventDefault();
            if (placeholder.parentNode === event.currentTarget) { // Asegurarse que el drop es en el area correcta
                placeholder.remove();
            }
            container.classList.remove('drag-over-area');
            const groupDiv = event.target.closest('.playlist-group');
            if (!groupDiv || !draggedVideoData) return;

            const targetPlaylistId = groupDiv.dataset.playlistId;
            const droppedVideoId = event.dataTransfer.getData('text/plain');
             const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
             const targetIndex = targetPlaylist ? targetPlaylist.videos.length : 0; 
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });
}

function moveVideo(videoId, sourcePlaylistId, targetPlaylistId, targetIndex) {
    if (!videoId || !sourcePlaylistId || !targetPlaylistId) {
        console.error("moveVideo: Argumentos inválidos.");
        return;
    }
    const sourcePlaylistIndex = playlistsData.findIndex(p => p.id === sourcePlaylistId);
    if (sourcePlaylistIndex === -1) return;
    const sourcePlaylist = playlistsData[sourcePlaylistIndex];
    const videoIndexInSource = sourcePlaylist.videos.findIndex(v => v.videoId === videoId);
    if (videoIndexInSource === -1) return;
    const targetPlaylistIndex = playlistsData.findIndex(p => p.id === targetPlaylistId);
    if (targetPlaylistIndex === -1) return;
    const targetPlaylist = playlistsData[targetPlaylistIndex];
    const [movedVideoData] = sourcePlaylist.videos.splice(videoIndexInSource, 1);
    targetIndex = Math.max(0, Math.min(targetIndex, targetPlaylist.videos.length));
    targetPlaylist.videos.splice(targetIndex, 0, movedVideoData);
    // console.log(`Video ${videoId} movido de ${sourcePlaylistId} a ${targetPlaylistId} en índice ${targetIndex}.`);
    markFlatListDirty(); // Marcar que la lista aplanada necesita refrescarse
    updatePlaylistsUI();
    updateCurrentPlayingIndex();
}

// Módulo: Reproducción y Crossfade
async function playNextVideo() {
    const currentFlatIndex = currentPlayingInfo.flattenedIndex;
    console.log(`playNextVideo: Llamada. Índice actual: ${currentFlatIndex}, isTransitioning=${isTransitioning}, isAudioFading=${isAudioFading}, nextPlayerReady=${nextPlayerReadyForFadeIn}`);

    // Protección más robusta contra transiciones múltiples o spam de "next"
    if (isTransitioning && !nextPlayerReadyForFadeIn) {
        console.warn("playNextVideo: Transición visual/carga ya en curso y el siguiente player no está listo para el fundido de audio. Cancelando nueva solicitud.");
        return;
    }
    // Si el audio está activamente fundiéndose Y no ha pasado mucho tiempo, evitar reiniciar.
    if (isAudioFading && (Date.now() - fadeStartTime < (CROSSFADE_DURATION * 1000 * 0.7))) { // ej. 70% de la duración
        console.warn("playNextVideo: Fundido de audio recién iniciado o en progreso activo. Esperando un poco.");
        return;
    }

    isTransitioning = true; // Marcar inicio de la transición (carga y visual)
    nextPlayerReadyForFadeIn = false; // Resetear para la nueva transición
    nextPlayerInstanceForFade = null; 
    previousPlayerInstanceForFade = null;
    console.log(`playNextVideo: *** Transición PRINCIPAL INICIADA. Flags reseteados. ***`);

    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        stopMonitoring();
        reproduccionIniciada = false;
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        document.getElementById('botonPlay').disabled = true;
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        updatePlaylistsUI();
        isTransitioning = false;
        console.log(`playNextVideo: *** Transición ABORTADA (Sin videos). ***`);
        return;
    }

    let nextIndex = currentFlatIndex + 1;
    if (nextIndex >= flatList.length) {
        askToRepeatPlaylist();
        isTransitioning = false; // Se resetea aquí porque no hay "siguiente" video que esperar.
        console.log(`playNextVideo: *** Transición FINALIZADA (Fin de lista). ***`);
        return;
    }

    const previousVideoIdForCleanup = currentPlayingInfo.videoId;

    try {
        const nextVideo = flatList[nextIndex];
        if (!nextVideo || !nextVideo.videoId) {
             throw new Error(`Video siguiente inválido en el índice aplanado ${nextIndex}.`);
        }
        
        const nextVideoId = nextVideo.videoId;
        const currentPlayerLogicalNum = currentPlayer; // El que está sonando ahora
        const previousPlayer = (currentPlayerLogicalNum === 1) ? player1 : player2;
        const nextPlayer = (currentPlayerLogicalNum === 1) ? player2 : player1;

        previousPlayerInstanceForFade = previousPlayer; // Guardamos el que se va a desvanecer
        nextPlayerInstanceForFade = nextPlayer;     // Guardamos el que esperamos que haga fade-in

        const currentPlayerElement = document.getElementById(`player${currentPlayerLogicalNum}`);
        const nextPlayerElement = document.getElementById(`player${currentPlayerLogicalNum === 1 ? 2 : 1}`);

        if (!previousPlayer?.setVolume || !nextPlayer?.cueVideoById || !nextPlayer?.playVideo || !nextPlayer?.setVolume) {
             throw new Error("Instancias de reproductores o funciones de API requeridas faltan para el crossfade.");
        }

        console.log(`playNextVideo: Cargando video ${nextVideoId} en Player ${nextPlayer === player1 ? 1 : 2}.`);
        nextPlayer.cueVideoById(nextVideoId);
        
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden', 'fade-out'); // Asegurar que esté visible para la transición
        }
        
        try { previousPlayer.setVolume(previousPlayer.getVolume() || 100); } catch(e) { previousPlayer.setVolume(100); }
        try { nextPlayer.setVolume(0); } catch(e) { console.warn("Error seteando volumen inicial del nextPlayer a 0", e); }

        // Actualizar el estado lógico inmediatamente para el resaltado en la UI.
        currentPlayingInfo = {
             flattenedIndex: nextIndex,
             videoId: nextVideo.videoId,
             playlistId: nextVideo.sourcePlaylistId
        };
        updatePlaylistsUI(); // Actualizar el resaltado

        // Iniciar transiciones visuales
        if (currentPlayerElement) currentPlayerElement.classList.add('fade-out');
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('fade-in', 'fade-out', 'hidden'); 
            requestAnimationFrame(() => nextPlayerElement.classList.add('fade-in'));
        }

        // Iniciar reproducción del video encolado en el siguiente reproductor (a volumen 0).
         try {
            console.log(`playNextVideo: Llamando a playVideo() en Player ${nextPlayer === player1 ? 1:2} (nextPlayerInstanceForFade) para iniciar reproducción para fundido de entrada.`);
            nextPlayer.playVideo();
            // onPlayerStateChange se encargará de marcar nextPlayerReadyForFadeIn = true cuando comience a reproducir.
         } catch(e) {
             console.error("playNextVideo: Error llamando a playVideo en reproductor siguiente:", e);
              isTransitioning = false; nextPlayerReadyForFadeIn = false; // Resetear flags importantes
               if (currentPlayerElement) currentPlayerElement.classList.remove('fade-out');
               if (nextPlayerElement) nextPlayerElement.classList.remove('fade-in');
               // Revertir estado lógico
                const prevVideoFromList = flatList[currentFlatIndex]; // Usar el índice *antes* del intento de incremento
                currentPlayingInfo = {
                    flattenedIndex: currentFlatIndex,
                    videoId: prevVideoFromList ? prevVideoFromList.videoId : null,
                    playlistId: prevVideoFromList ? prevVideoFromList.sourcePlaylistId : null,
                };
                updatePlaylistsUI();
               throw e; 
         }

        // Iniciar el Fundido de Audio. La función adaptada manejará la sincronización.
        console.log(`playNextVideo: Iniciando crossfadeAudio (fade-out de ${previousPlayer === player1 ? 1:2}, fade-in de ${nextPlayer === player1 ? 1:2} esperará ready flag).`);
        crossfadeAudio(previousPlayer, nextPlayer);

        // Manejar la Limpieza después de las Transiciones Visuales
        let transitionEndHandler = (event) => {
            if (event.propertyName !== 'opacity' || event.target !== currentPlayerElement) {
                return; 
            }
            console.log(`playNextVideo: Evento transitionend visual disparado en ${event.target.id}. Realizando limpieza visual.`);
            event.target.removeEventListener('transitionend', transitionEndHandler);
            clearTimeout(transitionEndHandler.fallbackTimeoutId);

            try {
                // Detener explícitamente el video anterior.
                 if (previousPlayer && typeof previousPlayer.stopVideo === 'function' && previousPlayer.getPlayerState() !== YT.PlayerState.ENDED) {
                      console.log(`playNextVideo: Limpieza visual - Llamando a stopVideo() en Player previo ${previousPlayer === player1 ? 1:2}.`);
                      previousPlayer.stopVideo();
                 }
                // Ocultar completamente el contenedor del reproductor antiguo
                if (currentPlayerElement) {
                    currentPlayerElement.classList.remove('fade-out', 'fade-in'); 
                    currentPlayerElement.classList.add('hidden'); 
                }
                // CORRECCIÓN VISUAL: Asegurar que el nuevo player no tenga clases de transición activas innecesarias
                if (nextPlayerElement) {
                    nextPlayerElement.classList.remove('fade-in', 'hidden', 'fade-out'); 
                }
                // Limpieza de datos (SponsorBlock)
                if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                    delete segmentosCache[previousVideoIdForCleanup];
                }
                if (lastSeekVideoId === previousVideoIdForCleanup) {
                     lastSeekEndTime = -1; lastSeekVideoId = null;
                }
            } catch (cleanupError) {
                 console.error("playNextVideo: Error durante la limpieza de transitionend visual:", cleanupError);
            }
            // isTransitioning se resetea en onPlayerStateChange cuando el NUEVO reproductor entra en estado PLAYING.
        };

        if (currentPlayerElement) {
            currentPlayerElement.addEventListener('transitionend', transitionEndHandler);
            const fallbackTimeoutMs = CROSSFADE_DURATION * 1000 + 500; // Margen extra
            transitionEndHandler.fallbackTimeoutId = setTimeout(() => {
                console.warn(`playNextVideo: setTimeout de respaldo para transitionend disparado.`);
                if (currentPlayerElement) {
                     currentPlayerElement.removeEventListener('transitionend', transitionEndHandler);
                }
                transitionEndHandler({ propertyName: 'opacity', target: currentPlayerElement, isFallback: true });
            }, fallbackTimeoutMs);
        } else {
            console.warn("playNextVideo: currentPlayerElement no encontrado para transición visual, limpiando inmediatamente.");
            if (previousPlayer?.stopVideo) previousPlayer.stopVideo();
            // Si la parte visual falla catastróficamente, podría ser necesario resetear más flags.
            // isTransitioning = false; // Se maneja en onPlayerStateChange
            // isAudioFading = false; // Se maneja en crossfadeAudio
        }

    } catch (error) {
        console.error("playNextVideo: Error CRÍTICO durante playNextVideo:", error);
        isTransitioning = false; 
        isAudioFading = false; 
        nextPlayerReadyForFadeIn = false;
        nextPlayerInstanceForFade = null;
        previousPlayerInstanceForFade = null;

        const previousVideo = flatList[currentFlatIndex]; 
         currentPlayingInfo.flattenedIndex = currentFlatIndex >= 0 ? currentFlatIndex : -1;
         currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
         currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
        mostrarMensajeFlotante(`Error cambiando video: ${error.message}`);
        updatePlaylistsUI(); 
        try { if(player1) player1.stopVideo(); if(player2) player2.stopVideo(); } catch(e){}
        stopMonitoring(); 
         document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
         reproduccionIniciada = false; 
    }
}

function crossfadeAudio(playerToFadeOut, playerToFadeIn) {
    if (isAudioFading && (Date.now() - fadeStartTime < CROSSFADE_DURATION * 1000 * 0.85)) { // Evitar reinicio muy rápido
         console.log("Crossfade Audio: Fundido ya en curso y no cerca de terminar. Saltando nueva solicitud.");
         return;
    }
    
    fadeStartTime = Date.now(); // Registrar inicio del fundido
    console.log(`Crossfade Audio START @ ${new Date(fadeStartTime).toLocaleTimeString()}: Desvaneciendo ${playerToFadeOut === player1 ? 1:2}, Fundiendo ${playerToFadeIn === player1 ? 1:2} (esperará 'ready' flag).`);
    isAudioFading = true;

    const pOut = playerToFadeOut; 
    const pIn = playerToFadeIn;   

    if (!pOut || typeof pOut.setVolume !== 'function' || !pIn || typeof pIn.setVolume !== 'function') {
        console.error("Crossfade Audio: Reproductores inválidos pasados como argumentos.");
        isAudioFading = false;
        nextPlayerReadyForFadeIn = false; // Asegurar reseteo
        return; 
    }

    let volOutInitial = 100; // Asumir que empieza al máximo o leer actual
    try { volOutInitial = pOut.getVolume(); } catch(e) { console.warn("Error obteniendo volOutInitial, usando 100"); }
    
    let volInCurrent = 0; // El volumen actual del player entrante, debería ser 0
    try { volInCurrent = pIn.getVolume(); } catch(e) { console.warn("Error obteniendo volInCurrent, usando 0"); }


    const steps = Math.max(1, Math.floor(CROSSFADE_DURATION * 20)); // ej. 20 pasos por segundo para suavidad
    const intervalTime = Math.max(50, Math.floor(CROSSFADE_DURATION * 1000 / steps)); // Intervalo de ~50ms
    
    let currentStep = 0;

    if (window.crossfadeIntervalId) {
        clearInterval(window.crossfadeIntervalId);
        window.crossfadeIntervalId = null;
    }

    window.crossfadeIntervalId = setInterval(() => {
        currentStep++;
        const progress = Math.min(1, currentStep / steps); // No exceder 1

        // Fundido de SALIDA (siempre procede desde su volumen inicial)
        const newVolOut = Math.max(0, volOutInitial * (1 - progress));
        try {
            if (pOut && typeof pOut.setVolume === 'function') pOut.setVolume(newVolOut);
        } catch (e) {
            console.error("CrossfadeAudio: Error seteando volumen pOut", e);
            clearInterval(window.crossfadeIntervalId); isAudioFading = false; nextPlayerReadyForFadeIn = false; return;
        }

        // Fundido de ENTRADA (solo si está listo)
        if (nextPlayerReadyForFadeIn) { // Si el flag está activo
            // El objetivo es subir desde el volInCurrent (que debería ser 0) hasta 100
            const targetVolIn = 100;
            const newVolIn = Math.min(targetVolIn, volInCurrent + (targetVolIn - volInCurrent) * progress);
            try {
                if (pIn && typeof pIn.setVolume === 'function') pIn.setVolume(newVolIn);
            } catch (e) {
                console.warn("CrossfadeAudio: Error seteando volumen pIn", e);
                // Considerar si se debe detener el intervalo si pIn falla repetidamente
            }
        } else {
            // Mantener el volumen de pIn en 0 (o su valor inicial si no es 0 y no está listo) si aún no está listo.
            try { 
                if (pIn && typeof pIn.setVolume === 'function' && pIn.getVolume() !== 0) {
                    // console.log("CrossfadeAudio Interval: pIn no listo, forzando volumen a 0.");
                    pIn.setVolume(0); 
                }
            } catch(e){ /* ignore */ }
        }
        
        if (progress >= 1) { // Fundido completado
            clearInterval(window.crossfadeIntervalId);
            window.crossfadeIntervalId = null;
            const fadeEndTime = Date.now();
            console.log(`Crossfade audio FINALIZADO @ ${new Date(fadeEndTime).toLocaleTimeString()} (Duración: ${(fadeEndTime - fadeStartTime)/1000}s).`);
            
            try { 
                if(pOut && typeof pOut.setVolume === 'function') pOut.setVolume(0); // Asegurar volumen final
                if(pIn && typeof pIn.setVolume === 'function' && nextPlayerReadyForFadeIn) pIn.setVolume(100); // Asegurar volumen final si se activó
                else if (pIn && typeof pIn.setVolume === 'function') pIn.setVolume(0); // Si nunca estuvo listo, que quede en 0
            } catch(e) { console.warn("CrossfadeAudio: Error seteando volúmenes finales exactos", e); }

            isAudioFading = false;
            nextPlayerReadyForFadeIn = false; // Resetear para la próxima transición
            // currentPlayer ya debería haberse actualizado en onPlayerStateChange cuando pIn comenzó a sonar.
            // Limpieza final de instancias de fade globales
            previousPlayerInstanceForFade = null;
            nextPlayerInstanceForFade = null;
            console.log("Crossfade Audio: Flags y referencias de fade reseteados.");
        }
    }, intervalTime);
}

function askToRepeatPlaylist() {
    const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
    if (repeat) {
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 }; // Resetear índice
        playFirstVideo(); // Iniciar desde el principio
    } else {
        stopMonitoring();
        mostrarMensajeFlotante("Playlist finalizada. Gracias por usar YT CrossMix :)");
        try {
            if(player1) player1.stopVideo();
            if(player2) player2.stopVideo();
         } catch(e) {}
         document.getElementById('botonPlay').disabled = getFlattenedPlaylist().length === 0; // Habilitar Play si hay videos
         reproduccionIniciada = false; // Permitir reiniciar con Play
    }
}

function playFirstVideo() {
    if (!playersInitialized) {
        console.error('Los reproductores no están inicializados.');
        mostrarMensajeFlotante("Los reproductores aún no están listos.");
        return;
    }
    // Detener cualquier proceso de transición o fundido anterior
    stopMonitoring(); 
    isTransitioning = false; 
    isAudioFading = false;
    nextPlayerReadyForFadeIn = false;
    nextPlayerInstanceForFade = null;
    previousPlayerInstanceForFade = null;
    if (window.crossfadeIntervalId) { // Limpiar intervalo de fundido si existiera
        clearInterval(window.crossfadeIntervalId);
        window.crossfadeIntervalId = null;
    }


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
            if (player2) { 
                player2.stopVideo(); 
                // player2.clearVideo(); // Opcional, puede causar un flash si se oculta/muestra rápido
            }
             document.getElementById('player2').classList.add('hidden');
             document.getElementById('player2').classList.remove('fade-in', 'fade-out');


            player1.loadVideoById(firstVideo.videoId); // Usar loadVideoById para el primer video
            player1.setVolume(100);
            document.getElementById('player1').classList.remove('hidden', 'fade-out', 'fade-in');
            
            currentPlayer = 1; // Player 1 es el activo
            reproduccionIniciada = true; // Marcar que la reproducción ha comenzado
            document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>'; // Icono pausa
            document.getElementById('botonPlay').disabled = false; // Habilitar botón pausa

            startMonitoring();
            updatePlaylistsUI();
        } catch (e) {
             console.error("Error al iniciar el primer video:", e);
             mostrarMensajeFlotante("Error al intentar reproducir el primer video.");
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

// Módulo: Monitoreo de Reproductores
function startMonitoring() {
    if (!monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 300);
        console.log('Monitoreo reiniciado/iniciado (intervalo: 300ms).');
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
    if (!playersInitialized || !reproduccionIniciada) {
        return; 
    }

    const activePlayer = (currentPlayer === 1) ? player1 : player2;

    // Chequeo más robusto del reproductor activo
    if (!activePlayer || typeof activePlayer.getPlayerState !== 'function' || 
        typeof activePlayer.getCurrentTime !== 'function' || 
        typeof activePlayer.getDuration !== 'function' || 
        typeof activePlayer.getVideoData !== 'function') {
        // console.warn("Monitor: El reproductor activo es inválido o no está completamente listo.");
        return; 
    }

    try { // Envolver en try-catch para errores inesperados del API de YT
        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id; 

        if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
            checkAndSkipSegment(activePlayer); 
            return; 
        }
        
        if (segmentosCache[videoId] === undefined) { // Si es undefined, iniciar obtención
            obtenerSegmentosSponsorBlock(videoId).then(() => checkAndSkipSegment(activePlayer));
        } else if (segmentosCache[videoId] !== 'fetching') { // Si no está obteniendo y no es undefined
            checkAndSkipSegment(activePlayer);
        } // Si es 'fetching', esperar al próximo ciclo


        const timeRemaining = videoDuration - currentTime;

        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CROSSFADE_DURATION + 0.5 && // La ventana comienza CROSSFADE_DURATION + buffer antes del final
            timeRemaining > 0.1 && // Asegurarse de que el tiempo restante sea positivo y no justo en el final
            !isTransitioning && // Evitar disparar si ya estamos en transición visual/carga
            !isAudioFading &&   // Evitar disparar si ya estamos en fundido de audio
            !hasOutroCrossfadeStarted) 
             {
            console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) dentro de la ventana de crossfade (${CROSSFADE_DURATION}s + buffer). Disparando playNextVideo basado en tiempo.`);
            playNextVideo();
        }

        const inactivePlayer = (currentPlayer === 1) ? player2 : player1;
         if (inactivePlayer && typeof inactivePlayer.getPlayerState === 'function' && typeof inactivePlayer.stopVideo === 'function') {
            const inactiveState = inactivePlayer.getPlayerState();
            if (inactiveState === YT.PlayerState.PLAYING &&
                !isTransitioning && !isAudioFading && // Solo si no estamos en ningún tipo de transición
                 inactivePlayer !== activePlayer) // Y realmente es el inactivo
                {
                console.warn("Monitor: Reproductor inactivo detectado aún REPRODUCIENDO fuera de transición/fundido. Deteniéndolo.");
                try {
                    inactivePlayer.stopVideo();
                } catch(e) { console.error("Monitor: Error deteniendo reproductor inactivo:", e); }
            }
        }
    } catch (error) {
        // console.error("Error en monitorPlayers (posiblemente API de YouTube):", error);
        // Esto puede ocurrir si el reproductor se vuelve inválido entre comprobaciones.
    }
}

function checkAndSkipSegment(player, forceCheck = false) {
    if (!player || typeof player.getCurrentTime !== 'function' || typeof player.getVideoData !== 'function') return;

    const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData()?.video_id;

    if (!videoId || isNaN(currentTime)) {
        return;
    }

    const playerState = player.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) {
        return;
    }

    if (videoId !== lastSeekVideoId) {
        lastSeekEndTime = -1; 
        lastSeekVideoId = videoId; 
    } else {
         if (lastSeekEndTime !== -1 && currentTime >= lastSeekEndTime + 0.2) { 
             lastSeekEndTime = -1; 
         }
         if (lastSeekEndTime !== -1) {
             return; 
         }
    }

    const segments = segmentosCache[videoId]; 

    if (segments === undefined) {
        // console.log(`checkAndSkipSegment: Segmentos undefined para ${videoId}. Iniciando obtención.`);
        obtenerSegmentosSponsorBlock(videoId); 
        return; 
    }
     if (segments === 'fetching') {
         return; 
     }
    if (segments === null || segments.length === 0) {
        return; 
    }
    const segmentToSkip = segments.find(segment => {
        const start = segment.startTime; 
        const end = segment.endTime;     
        const isWithinSegment = currentTime >= start && currentTime < end;
        const isAfterLastSeek = lastSeekEndTime === -1 || end > lastSeekEndTime;
        return isWithinSegment && isAfterLastSeek;
    });

    if (segmentToSkip) {
        const segmentStart = segmentToSkip.startTime; 
        const segmentEnd = segmentToSkip.endTime;     
        const segmentType = segmentToSkip.category;   
        if (segmentType === 'outro') {
            const timeRemainingInSegment = segmentEnd - currentTime;
            // console.log(`SPONSORBLOCK OUTRO: Detectado (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. Restante: ${timeRemainingInSegment.toFixed(1)}s.`);
            if (timeRemainingInSegment <= CROSSFADE_DURATION + 0.5 && timeRemainingInSegment > 0 && !isTransitioning && !isAudioFading && !hasOutroCrossfadeStarted) {
                 console.log(`SPONSORBLOCK OUTRO: Tiempo restante en ventana. Disparando playNextVideo.`);
                 hasOutroCrossfadeStarted = true; 
                 playNextVideo(); 
            }
        } else {
            const skipToTime = segmentEnd; 
             console.log(`SPONSORBLOCK SKIP: Saltando (${segmentType}) de ${segmentStart.toFixed(1)}s a ${segmentEnd.toFixed(1)}s. A ${skipToTime.toFixed(1)}s.`);
            try {
                player.seekTo(skipToTime, true); 
                lastSeekEndTime = skipToTime; 
            } catch (e) {
                console.error("SPONSORBLOCK SKIP: Error realizando seekTo:", e);
            }
        }
    }
}

async function obtenerSegmentosSponsorBlock(videoId) {
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) {
         return Array.isArray(segmentosCache[videoId]) ? segmentosCache[videoId] : null;
    }
    segmentosCache[videoId] = 'fetching';
    // console.log(`SB Fetch: Iniciando obtención para ${videoId}.`);
    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; 
    const apiUrl = `/api/segments/${videoId}`; 
    try {
        const response = await fetch(apiUrl, {
            headers: { 'X-UserID': userId }
        });
        if (!response.ok) {
             throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
              throw new Error(`API SB Error: Respuesta no es un array`);
        }
        // console.log(`SB Fetch: Segmentos recibidos para ${videoId} (crudos): ${data.length}`);
        const validSegments = data.filter(segment => {
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                return false; 
            }
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);
            if (isNaN(start) || isNaN(end)) return false; 
            if (start < 0 || end < 0 || end < start) return false; 
            return true;
        });
        // console.log(`SB Fetch: Segmentos válidos para ${videoId}: ${validSegments.length}`);
        validSegments.sort((a, b) => a.startTime - b.startTime); 
        segmentosCache[videoId] = validSegments; 
        return validSegments; 
    } catch (error) {
        // console.error(`SB Fetch: Error para ${apiUrl}:`, error);
        segmentosCache[videoId] = null; 
        return null; 
    }
}

// Módulo: Manejo de Eventos y Botones
const botonPlay = document.getElementById("botonPlay");
let reproduccionIniciada = false; 
botonPlay.disabled = true; 
botonPlay.addEventListener('click', () => {
     const activePlayer = (currentPlayer === 1 && player1) ? player1 : (player2 || player1); 
     if (!playersInitialized || !activePlayer || typeof activePlayer.getPlayerState !== 'function') {
          mostrarMensajeFlotante("El reproductor no está listo o es inválido.");
          if (!youtubeAPIReady) loadYouTubeAPI();
          else if (!playersInitialized && youtubeAPIReady && typeof YT !== 'undefined' && YT.Player) initializePlayers();
          return;
     }

     const playerState = activePlayer.getPlayerState();
     if (!reproduccionIniciada) {
          const flatList = getFlattenedPlaylist();
          if (flatList.length > 0) {
               playFirstVideo(); 
          } else {
               mostrarMensajeFlotante("No hay videos en la lista para reproducir.");
          }
     } else {
           if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                botonPlay.innerHTML = '<i class="fas fa-play"></i>'; 
                stopMonitoring(); 
           } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED || playerState === YT.PlayerState.ENDED) {
               activePlayer.playVideo();
               botonPlay.innerHTML = '<i class="fas fa-pause"></i>'; 
               startMonitoring(); 
           }
     }
});

document.getElementById('botonNext').addEventListener('click', () => {
     if (!reproduccionIniciada){
        mostrarMensajeFlotante("Inicia la reproducción primero con el botón Play.");
        return;
     }
     console.log("Botón Mix/Next presionado.");
     stopMonitoring(); // Detener monitoreo brevemente para evitar doble salto
     playNextVideo(); 
     // El monitoreo se reiniciará cuando el nuevo video comience (vía onPlayerStateChange -> startMonitoring en playFirstVideo o indirectamente)
     // O explícitamente si es necesario: setTimeout(startMonitoring, CROSSFADE_DURATION * 1000 + 1000); 
});

const searchInput = document.getElementById('searchInput');
const debouncedSearch = debounce((query) => {
    performSearch(query); 
}, 500);

searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (query.length > 2) {
        debouncedSearch(query);
    } else {
        resultsDiv.innerHTML = ''; 
        currentSearchQuery = '';
        nextPageContext = null;
        isLoadingMore = false;
        hideLoadMoreSpinner();
    }
});

const añadirUrlButton = document.getElementById('añadirUrlButton');
const searchInput2 = document.getElementById('searchInput2');

añadirUrlButton.addEventListener('click', async () => {
    const url = searchInput2.value.trim();
    const playlistIdFromUrl = extractPlaylistId(url); 

    if (!playlistIdFromUrl) {
        alert('URL de la playlist no válida.');
        return;
    }
    mostrarMensajeFlotante("Buscando información de la playlist...");
    searchInput2.value = ''; 

    try {
        const playlistInfo = await getPlaylistInfo(playlistIdFromUrl); 
        if (playlistInfo) {
            playlistInfo.id = playlistIdFromUrl; 
            handlePlaylistLoaded(playlistInfo); 
        } 
    } catch (error) {
         // getPlaylistInfo ya muestra error en consola, aquí mostramos al usuario
         mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
    }
});

// --- Funciones Auxiliares (Debounce, Formato Duración, Parseo Duración, etc.) ---
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) {
        return "0:00"; 
    }
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}`;
}

function parseDuration(durationInput) {
    if (typeof durationInput === 'number') {
        return Math.floor(durationInput); 
    }
    if (typeof durationInput !== 'string') return 0;

    const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (isoMatch) {
        const hours = parseInt(isoMatch[1] || '0', 10);
        const minutes = parseInt(isoMatch[2] || '0', 10);
        const seconds = parseFloat(isoMatch[3] || '0');
        return Math.floor(hours * 3600 + minutes * 60 + seconds);
    }

    const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
        return timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 3 && !isNaN(timeParts[0]) && !isNaN(timeParts[1]) && !isNaN(timeParts[2])) {
        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }

    const directNumber = parseInt(durationInput, 10);
    if (!isNaN(directNumber)) {
         return directNumber;
    }
    return 0; 
}

const pipedInstances = [ 
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party"
];
function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}

async function fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            // console.log(`WorkspaceDataWithRetry: Intento ${retries + 1} para ${url}`);
            const response = await fetch(url, options);
            if (!response.ok) {
                 let errorBodyText = `HTTP error! status: ${response.status}`;
                 try { errorBodyText = await response.text(); } catch(e){}
                throw new Error(errorBodyText);
            }
            return await response.json(); 
        } catch (error) {
            // console.error(`Error fetching ${url}, reintento ${retries + 1}/${maxRetries + 1}:`, error.message);
            retries++;
            if (retries <= maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retries)); 
            } else {
                 // console.error(`WorkspaceDataWithRetry: Fallaron todos los ${maxRetries + 1} intentos para ${url}`);
                throw error; 
            }
        }
    }
}

async function getPlaylistInfo(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
    try {
        const data = await fetchDataWithRetry(targetUrl);
        if (!data || !data.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos.");
        }
        return data;
    } catch (error) {
        console.error("Error al obtener la información de la playlist:", error.message);
        throw error; 
    }
}

function extractPlaylistId(url) {
    try {
        const urlObject = new URL(url);
        return urlObject.searchParams.get('list');
    } catch (e) {
        console.error("URL inválida para extraer ID de playlist:", url);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
     if (!playlistsData.some(p => p.id === 'manual')) {
        playlistsData.unshift({ id: 'manual', name: 'Mis Vídeos Añadidos', thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico', videos: [], isExpanded: true });
     }
     updatePlaylistsUI(); 
     loadYouTubeAPI(); 
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        closePlaylistSelectionPopups(); 
    }
}, true);
