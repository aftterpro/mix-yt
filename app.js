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
    const playlistContainer = document.getElementById('playlistContainer');
    playlistContainer.insertAdjacentElement('afterend', mensajeDiv);

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => {
            mensajeDiv.remove();
        }, 1000);
    }, 6000);
}
// mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!");


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
    document.head.appendChild(script);
}

function onYouTubeIframeAPIReady() {
    initializePlayers();
}

function initializePlayers() {
    if (player1 && player2) return;

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        playerVars: { 'playsinline': 1 },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
    player2 = new YT.Player('player2', {
        height: '100%',
        width: '100%',
        playerVars: { 'playsinline': 1 },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    if (player1 && typeof player1.getPlayerState === 'function' &&
        player2 && typeof player2.getPlayerState === 'function') {
        if (!playersInitialized) {
            playersInitialized = true;
            console.log("Ambos reproductores listos.");
            const flatList = getFlattenedPlaylist();
            document.getElementById('botonPlay').disabled = flatList.length === 0;
        }
    }
    if (playersInitialized && !monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 300);
        console.log('Monitor iniciado (intervalo: 300ms)');
    }
}

function onPlayerError(event) {
    console.error("Error del reproductor:", event.data, "Player:", event.target === player1 ? '1' : '2');
    let videoTitle = "este video";
    try {
      const videoData = event.target.getVideoData();
      if(videoData && videoData.title) {
        videoTitle = `"${videoData.title}"`;
      }
    } catch (e) { /* Ignorar */ }

    let errorMsg = `Ocurrió un error desconocido (${event.data}) al reproducir ${videoTitle}.`;
    switch (event.data) {
        case 2: errorMsg = `Error: ID de video inválido para ${videoTitle}.`; break;
        case 5: errorMsg = `Error al reproducir ${videoTitle}. (Posible problema de HTML5 o derechos).`; break;
        case 100: errorMsg = `Error: Video ${videoTitle} no encontrado.`; break;
        case 101:
        case 150: errorMsg = `Error: El propietario de ${videoTitle} no permite la reproducción incrustada.`; break;
    }
    mostrarMensajeFlotante(errorMsg);

    if ([2, 5, 100, 101, 150].includes(event.data)) {
         console.log("Intentando saltar al siguiente video debido a error...");
         setTimeout(playNextVideo, 500);
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
        nextPlayerReadyForFadeIn = true;

        // Si el fundido de audio ya está en progreso para el reproductor anterior,
        // y ahora el nuevo está listo, nos aseguramos de que crossfadeAudio (o su lógica) lo incluya.
        // La función crossfadeAudio adaptada manejará esto.
        if (isAudioFading && previousPlayerInstanceForFade) {
            console.log("onPlayerStateChange: El nuevo reproductor está listo, notificando/reactivando crossfade para el fundido de entrada.");
            // No es necesario llamar a crossfadeAudio de nuevo si su intervalo ya está verificando nextPlayerReadyForFadeIn
            // pero asegurarse que los volúmenes se ajusten correctamente es clave.
            // crossfadeAudio(previousPlayerInstanceForFade, nextPlayerInstanceForFade); // <-- Se podría llamar aquí si crossfadeAudio no lo maneja internamente
        }
    }
    // --- FIN CAMBIO ---


    if (playerState === YT.PlayerState.PLAYING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está REPRODUCIENDO. Video: ${videoId || 'Unknown ID'}`);

         if (isTransitioning && changedPlayer === nextPlayerInstanceForFade) {
             // Esta es la confirmación de que el nuevo video ha comenzado a reproducirse.
             // Ahora podemos considerar la transición casi completa y cambiar el currentPlayer lógico.
             const newCurrentPlayer = (nextPlayerInstanceForFade === player1) ? 1 : 2;
             if (currentPlayer !== newCurrentPlayer) {
                 console.log(`onPlayerStateChange: Transición - Nuevo video (${videoId}) en Player ${newCurrentPlayer} ha comenzado. Actualizando currentPlayer a ${newCurrentPlayer}.`);
                 currentPlayer = newCurrentPlayer;
             }
             isTransitioning = false; // La transición principal (carga y visual) se considera completada.
             // isAudioFading se manejará por crossfadeAudio.
             console.log("onPlayerStateChange: Transición completada (nuevo video sonando). currentPlayer actualizado, isTransitioning=false.");
             
             // Limpiar las instancias de fade después de que la transición ha finalizado
             nextPlayerInstanceForFade = null;
             previousPlayerInstanceForFade = null;
             // nextPlayerReadyForFadeIn también se podría resetear aquí o al final de crossfadeAudio
         }


         const flatList = getFlattenedPlaylist();
         const playingVideoIndex = flatList.findIndex(v => v.videoId === videoId);

         if (videoId && playingVideoIndex !== -1) {
              const playingVideoObject = flatList[playingVideoIndex];
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = playingVideoObject.sourcePlaylistId;
              currentPlayingInfo.flattenedIndex = playingVideoIndex;
              updatePlaylistsUI();

             if (currentPlayer !== changedPlayerNum && !isTransitioning) { // Solo cambiar si no estamos en medio de una transición manejada
                  console.log(`onPlayerStateChange: Estableciendo currentPlayer a ${changedPlayerNum} (fuera de transición).`);
                  currentPlayer = changedPlayerNum;
             }
             hasOutroCrossfadeStarted = false;

         } else if (videoId) { // Video sonando pero no en la playlist (ej. después de una búsqueda y reproducción directa no implementada)
              console.warn(`onPlayerStateChange: Video desconocido (${videoId}) comenzó a reproducir en Player ${changedPlayerNum}.`);
              currentPlayingInfo.videoId = videoId;
              currentPlayingInfo.playlistId = null; // No pertenece a una playlist conocida
              currentPlayingInfo.flattenedIndex = -1;
              updatePlaylistsUI();
              if (currentPlayer !== changedPlayerNum && !isTransitioning) {
                   currentPlayer = changedPlayerNum;
              }
              hasOutroCrossfadeStarted = false;
         }

          if (videoId) {
             checkAndSkipSegment(changedPlayer, true);
          }

     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('onPlayerStateChange: Video pausado en Player', changedPlayerNum);
     } else if (playerState === YT.PlayerState.BUFFERING) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está BUFFERING. Video: ${videoId || 'Unknown ID'}`);
         // Si este es el nextPlayerInstanceForFade, es una buena señal, está cargando.
         if (isTransitioning && changedPlayer === nextPlayerInstanceForFade) {
             console.log("onPlayerStateChange: nextPlayerInstanceForFade está BUFFERING.");
             // No marcamos nextPlayerReadyForFadeIn aquí, esperamos a PLAYING para asegurar que el audio realmente pueda empezar.
         }

     } else if (playerState === YT.PlayerState.CUED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} está CUED. Video: ${videoId || 'Unknown ID'}`);
     } else if (playerState === YT.PlayerState.ENDED) {
         console.log(`onPlayerStateChange: Player ${changedPlayerNum} estado ENDED. Video: ${videoId || 'Unknown ID'}`);
         const endedVideoMatchesCurrent = (videoId && currentPlayingInfo.videoId === videoId);

         if (endedVideoMatchesCurrent && !isTransitioning && !isAudioFading) {
             console.log(`onPlayerStateChange: Video actual (${videoId}) terminó. Intentando playNextVideo.`);
             playNextVideo();
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
            throw new Error(errorDetails);
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
    if (!resultsDiv) return;
    if (!append) resultsDiv.innerHTML = '';

    if (!results || !results.items || !Array.isArray(results.items) || results.items.length === 0) {
        if (!append) resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
        nextPageContext = results?.nextpage || null;
        isLoadingMore = false;
        hideLoadMoreSpinner();
        return;
    }
    nextPageContext = results.nextpage || null;

    results.items.forEach(video => {
        const authorName = video.uploaderName || 'Autor Desconocido';
        const videoId = video.videoId || video.url?.split('v=')[1];
        if (!videoId) return;
        if (append && resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) return;

        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;
        // ... (resto del código de displaySearchResultsPiped sin cambios) ...
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
    if (append) hideLoadMoreSpinner();
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
            id: manualPlaylistId, name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://via.placeholder.com/50?text=+', videos: [], isExpanded: true
        };
        playlistsData.unshift(manualPlaylist);
    }
    const isDuplicate = manualPlaylist.videos.some(video => video.videoId === videoData.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante(`"${videoData.title}" ya está en "${manualPlaylist.name}".`);
        return;
    }
    const videoObject = {
        videoId: videoData.videoId, title: videoData.title || "Título no disponible",
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
        videoId: videoData.videoId, title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: videoData.duration || 0,
    };
    let targetIndex = targetPlaylist.videos.length;
    if (currentPlayingInfo.playlistId === targetPlaylistId && currentPlayingInfo.flattenedIndex >= 0) {
        const currentVideoLocalIndex = targetPlaylist.videos.findIndex(v => v.videoId === currentPlayingInfo.videoId);
        if (currentVideoLocalIndex !== -1) targetIndex = currentVideoLocalIndex + 1;
    }
    targetPlaylist.videos.splice(targetIndex, 0, videoObject);
    mostrarMensajeFlotante(`Video añadido a "${targetPlaylist.name}": ${videoObject.title}`);
    updatePlaylistsUI();
    updateCurrentPlayingIndex();
    checkAndEnablePlayButton();
}

function checkAndEnablePlayButton() {
     const flatList = getFlattenedPlaylist();
     if (flatList.length > 0 && playersInitialized) botonPlay.disabled = false;
}

const handleScroll = () => {
    if (isLoadingMore || !nextPageContext || !currentSearchQuery) return;
    const scrollThreshold = 300;
    const bottomReached = resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - scrollThreshold;
    if (bottomReached) performSearch(currentSearchQuery, nextPageContext);
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
    if (spinner) spinner.style.display = 'none';
}

// Módulo: Manejo de Playlists
// getFlattenedPlaylist ya está definida arriba

function updateCurrentPlayingIndex() {
    const flatList = getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;
    try {
        if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player1.getVideoData()?.video_id; activePlayerNum = 1;
        } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player2.getVideoData()?.video_id; activePlayerNum = 2;
        }
    } catch (e) { console.error("Error getting playing video data:", e); }
    
    if (playingVideoId) {
        if (currentPlayingInfo.videoId !== playingVideoId || currentPlayingInfo.flattenedIndex < 0) {
            const newFlatIndex = flatList.findIndex(v => v.videoId === playingVideoId);
            if (newFlatIndex !== -1) {
                 const currentVideoObject = flatList[newFlatIndex];
                 currentPlayingInfo.videoId = playingVideoId;
                 currentPlayingInfo.playlistId = currentVideoObject.sourcePlaylistId;
                 currentPlayingInfo.flattenedIndex = newFlatIndex;
                 updatePlaylistsUI();
            } else { currentPlayingInfo.flattenedIndex = -1; }
        }
         if (activePlayerNum && currentPlayer !== activePlayerNum && !isTransitioning) currentPlayer = activePlayerNum;
    } else {
        if (currentPlayingInfo.flattenedIndex !== -1) {
           currentPlayingInfo.videoId = null; currentPlayingInfo.playlistId = null;
           currentPlayingInfo.flattenedIndex = -1; updatePlaylistsUI();
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
        videoId: video.url?.split('v=')[1], title: video.title || "Título Desconocido",
        thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: parseDuration(video.duration) || 0,
    })).filter(v => v.videoId);
    if (loadedVideos.length === 0) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" no contiene videos válidos.`);
        return;
    }
    const newPlaylist = {
        id: playlistId, name: playlistInfo.name || "Playlist Sin Nombre",
        thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || 'https://via.placeholder.com/50?text=?',
        videos: loadedVideos, isExpanded: true
    };
    const manualPlaylistIndex = playlistsData.findIndex(p => p.id === 'manual');
    if (manualPlaylistIndex !== -1) playlistsData.splice(manualPlaylistIndex + 1, 0, newPlaylist);
    else playlistsData.push(newPlaylist);
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
        if (playlist.isExpanded) videosDiv.style.maxHeight = '1000px'; // Temp or calculate
        else videosDiv.style.maxHeight = '0px';
        playlist.videos.forEach((video) => {
            const item = createPlaylistItemElement(video, playlist.id, playingVideoId);
            videosDiv.appendChild(item);
        });
        groupDiv.appendChild(videosDiv);
        playlistContainer.appendChild(groupDiv);
        if (playlist.isExpanded) {
            requestAnimationFrame(() => { videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px'; });
        }
    });
    playlistContainer.scrollTop = currentScrollTop;
    enableDragAndDrop();
}
// ... (createPlaylistItemElement, showPlaylistSelectionPopup, close...Popup, closeAllContextMenus, togglePlaylistExpansion, handleTransitionEnd, deleteVideo, enableDragAndDrop, moveVideo - sin cambios significativos, omitidos por brevedad, pero deben estar presentes)
// Reemplaza las funciones omitidas con tu código existente si no quieres que las modifique.
// Si necesitas que revise/modifique esas también, indícalo.

// --- CreatePlaylistItemElement (Mantenida como estaba, solo para asegurar que existe en el contexto) ---
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
        const sourcePlaylistId = playlistId; 
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
        let targetPId = null; 
        for (const p of playlistsData) {
            const playlistVideoCount = p.videos.length;
            const endOfPlaylistIndex = cumulativeIndex + playlistVideoCount;
            if (targetFlatIndex < endOfPlaylistIndex || (targetFlatIndex === endOfPlaylistIndex && p === playlistsData[playlistsData.length -1]) ) {
                targetPId = p.id;
                targetLocalIndex = targetFlatIndex - cumulativeIndex; 
                targetLocalIndex = Math.min(targetLocalIndex, p.videos.length);
                break; 
            }
            cumulativeIndex += playlistVideoCount; 
        }
        if (targetPId !== null && targetLocalIndex !== -1) {
             const sourcePlaylist = playlistsData.find(p => p.id === sourcePlaylistId);
             const sourceLocalIndex = sourcePlaylist ? sourcePlaylist.videos.findIndex(v => v.videoId === sourceVideoId) : -1;
             if (!(sourcePlaylistId === targetPId && sourceLocalIndex === targetLocalIndex)) {
                moveVideo(sourceVideoId, sourcePlaylistId, targetPId, targetLocalIndex); 
             }
        } else {
            mostrarMensajeFlotante("Error al calcular la posición para 'Reproducir Después'.");
        }
    });
    moveToPlaylistButton.addEventListener('click', (event) => {
        event.stopPropagation(); 
        const sourceVideoId = video.videoId; 
        const sourcePId = playlistId; 
        const videoDataForMove = {
            videoId: sourceVideoId, title: video.title,
            thumbnail: video.thumbnail, duration: video.duration,
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
    } else { return; }

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
        if (menuRect.left < 10) menu.style.left = '10px';
        if (menuRect.bottom > window.innerHeight - 10) {
            top = window.scrollY + anchorRect.top - menuRect.height - 2;
            menu.style.top = `${Math.max(10, top)}px`;
        }
        if (menuRect.top < 10) menu.style.top = '10px';
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
          menu.classList.remove('visible');
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
    } else { updatePlaylistsUI(); }
}

function handleTransitionEnd(event) {
    if (event.propertyName !== 'max-height') return;
    const videosDiv = event.target;
    const groupDiv = videosDiv.closest('.playlist-group');
    const playlistId = groupDiv?.dataset.playlistId;
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist && videosDiv) {
        if (playlist.isExpanded) videosDiv.style.maxHeight = 'none';
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
    let placeholder = document.querySelector('.playlist-item.placeholder');
    if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'playlist-item placeholder';
        // Estilos básicos del placeholder, puedes definirlos mejor en CSS
        placeholder.style.height = '40px'; 
        placeholder.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        placeholder.style.border = '1px dashed #007bff';
        placeholder.style.margin = '4px 0';
    }

    playlistContainer.querySelectorAll('.playlist-item:not(.placeholder)').forEach(item => {
        item.addEventListener('dragstart', (event) => {
            const targetItem = event.target.closest('.playlist-item:not(.placeholder)');
            if (!targetItem) return;
            draggedItemElement = targetItem;
            draggedVideoData = { videoId: targetItem.dataset.videoId, sourcePlaylistId: targetItem.dataset.playlistId };
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
            if (!targetItem || !draggedVideoData || targetItem === draggedItemElement) return;
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
            event.preventDefault(); event.dataTransfer.dropEffect = 'move';
            if (container.children.length === 0 || (!container.querySelector('.playlist-item:not(.placeholder)') && !placeholder.parentNode)) { // Si está vacío o solo tiene placeholder
                container.appendChild(placeholder);
                container.classList.add('drag-over-area');
            } else if (event.offsetY > container.scrollHeight - 20 && Array.from(container.children).every(child => child !== placeholder)) { // Cerca del final
                container.appendChild(placeholder);
                container.classList.add('drag-over-area');
            } else if (!container.querySelector('.playlist-item:not(.placeholder)')) {
                 // Si solo hay un placeholder y no es este, quitar el area
                 if(placeholder.parentNode === container) container.classList.add('drag-over-area');
                 else container.classList.remove('drag-over-area');
            }
        });
        container.addEventListener('dragleave', (event) => {
            if (!container.contains(event.relatedTarget) || event.relatedTarget === null) {
                container.classList.remove('drag-over-area');
                if (placeholder.parentNode === container && Array.from(container.children).filter(el => el !== placeholder).length === 0) {
                     // No quitar placeholder si es el único elemento, podría ser un drop target
                } else if (placeholder.parentNode === container && !container.querySelector('.playlist-item:not(.placeholder):hover')) {
                    // Solo quitar si no estamos a punto de dropear en un item
                }
            }
        });
        container.addEventListener('drop', (event) => {
            event.preventDefault();
            if (placeholder.parentNode) placeholder.remove();
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
    if (!videoId || !sourcePlaylistId || !targetPlaylistId) return;
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
    updatePlaylistsUI();
    updateCurrentPlayingIndex();
}


// Módulo: Reproducción y Crossfade
async function playNextVideo() {
    const currentFlatIndex = currentPlayingInfo.flattenedIndex;
    console.log(`playNextVideo: Llamada. Índice actual: ${currentFlatIndex}, isTransitioning=${isTransitioning}, isAudioFading=${isAudioFading}`);

    if (isTransitioning && !nextPlayerReadyForFadeIn) { // Permitir si la transición visual está en curso pero el audio del siguiente aún no ha empezado a hacer fade in
        console.warn("playNextVideo: Transición principal (visual o carga) ya en curso, y el siguiente player no está listo para fade in de audio. Cancelando nueva solicitud.");
        return;
    }
    if (isAudioFading && Date.now() - fadeStartTime < 1000) { // Prevenir spam si el audio fade acaba de empezar
        console.warn("playNextVideo: Fundido de audio recién iniciado, esperando un poco.");
        return;
    }


    isTransitioning = true;
    nextPlayerReadyForFadeIn = false; // Resetear para la nueva transición
    nextPlayerInstanceForFade = null; // Resetear
    previousPlayerInstanceForFade = null; // Resetear
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
        isTransitioning = false;
        console.log(`playNextVideo: *** Transición FINALIZADA (Fin de lista). ***`);
        return;
    }

    const previousVideoIdForCleanup = currentPlayingInfo.videoId;

    try {
        const nextVideo = flatList[nextIndex];
        if (!nextVideo || !nextVideo.videoId) throw new Error(`Video siguiente inválido en índice ${nextIndex}.`);
        
        const nextVideoId = nextVideo.videoId;
        const currentPlayerLogicalNum = currentPlayer;
        const previousPlayer = (currentPlayerLogicalNum === 1) ? player1 : player2;
        const nextPlayer = (currentPlayerLogicalNum === 1) ? player2 : player1;

        // --- CAMBIO: Guardar instancias para la sincronización del fundido ---
        previousPlayerInstanceForFade = previousPlayer;
        nextPlayerInstanceForFade = nextPlayer; // Guardamos el que esperamos que haga fade-in

        const currentPlayerElement = document.getElementById(`player${currentPlayerLogicalNum}`);
        const nextPlayerElement = document.getElementById(`player${currentPlayerLogicalNum === 1 ? 2 : 1}`);

        if (!previousPlayer?.setVolume || !nextPlayer?.cueVideoById || !nextPlayer?.playVideo || !nextPlayer?.setVolume) {
            throw new Error("Instancias de reproductores o funciones API faltan.");
        }

        console.log(`playNextVideo: Cargando ${nextVideoId} en Player ${nextPlayer === player1 ? 1 : 2}.`);
        nextPlayer.cueVideoById(nextVideoId);
        
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden', 'fade-out');
        }
        
        try { previousPlayer.setVolume(previousPlayer.getVolume() || 100); } catch(e) { previousPlayer.setVolume(100); }
        try { nextPlayer.setVolume(0); } catch(e) { console.warn("Error seteando volumen inicial del nextPlayer a 0", e); }

        currentPlayingInfo = {
             flattenedIndex: nextIndex, videoId: nextVideo.videoId, playlistId: nextVideo.sourcePlaylistId
        };
        updatePlaylistsUI();

        if (currentPlayerElement) currentPlayerElement.classList.add('fade-out');
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('fade-in', 'fade-out', 'hidden');
            requestAnimationFrame(() => nextPlayerElement.classList.add('fade-in'));
        }

        try {
            console.log(`playNextVideo: Llamando a playVideo() en Player ${nextPlayer === player1 ? 1:2} (nextPlayerInstanceForFade).`);
            nextPlayer.playVideo(); // El audio comenzará a cargar/reproducir, pero su volumen es 0.
                                   // onPlayerStateChange se encargará de nextPlayerReadyForFadeIn = true;
        } catch(e) {
            console.error("playNextVideo: Error llamando a playVideo en reproductor siguiente:", e);
            isTransitioning = false; nextPlayerReadyForFadeIn = false;
            if (currentPlayerElement) currentPlayerElement.classList.remove('fade-out');
            if (nextPlayerElement) nextPlayerElement.classList.remove('fade-in');
            // Revertir currentPlayingInfo
            const prevVideoFromList = flatList[currentFlatIndex];
            currentPlayingInfo = {
                flattenedIndex: currentFlatIndex,
                videoId: prevVideoFromList ? prevVideoFromList.videoId : null,
                playlistId: prevVideoFromList ? prevVideoFromList.sourcePlaylistId : null,
            };
            updatePlaylistsUI();
            throw e;
        }

        // --- CAMBIO: Iniciar solo el fundido de SALIDA aquí ---
        // El fundido de ENTRADA esperará a nextPlayerReadyForFadeIn
        console.log(`playNextVideo: Iniciando crossfadeAudio SOLO para fade-out de ${previousPlayer === player1 ? 1:2}.`);
        crossfadeAudio(previousPlayer, nextPlayer); // Pasamos ambos, pero crossfadeAudio decidirá cuándo empezar el fade-in.

        let transitionEndHandler = (event) => {
            if (event.propertyName !== 'opacity' || event.target !== currentPlayerElement) return;
            event.target.removeEventListener('transitionend', transitionEndHandler);
            clearTimeout(transitionEndHandler.fallbackTimeoutId);
            console.log(`playNextVideo: transitionend visual completado para ${event.target.id}. Limpieza.`);
            try {
                if (previousPlayer && typeof previousPlayer.stopVideo === 'function' && previousPlayer.getPlayerState() !== YT.PlayerState.ENDED) {
                    console.log(`playNextVideo: Limpieza - Llamando stopVideo() en Player previo.`);
                    previousPlayer.stopVideo();
                }
                if (currentPlayerElement) {
                    currentPlayerElement.classList.remove('fade-out', 'fade-in');
                    currentPlayerElement.classList.add('hidden');
                }
                // --- CORRECCIÓN VISUAL: No re-añadir fade-in al nextPlayerElement aquí ---
                if (nextPlayerElement) {
                    // La clase 'fade-in' se elimina naturalmente cuando la transición de opacidad y filtro llega a su fin.
                    // O se puede quitar explícitamente si es necesario, pero no volver a añadirla.
                    nextPlayerElement.classList.remove('fade-in'); // Asegurar que no persista si la transición no la quitó
                }

                if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                    delete segmentosCache[previousVideoIdForCleanup];
                }
                if (lastSeekVideoId === previousVideoIdForCleanup) {
                     lastSeekEndTime = -1; lastSeekVideoId = null;
                }
            } catch (cleanupError) {
                 console.error("playNextVideo: Error en limpieza de transitionend:", cleanupError);
            }
            // isTransitioning se resetea en onPlayerStateChange cuando el NUEVO video comienza a reproducir.
            // O se podría resetear aquí si es el final definitivo de la parte visual.
            // Pero es mejor esperar a que el nuevo player confirme PLAYING.
        };

        if (currentPlayerElement) {
            currentPlayerElement.addEventListener('transitionend', transitionEndHandler);
            const fallbackTimeoutMs = CROSSFADE_DURATION * 1000 + 500; // Un poco más de margen
            transitionEndHandler.fallbackTimeoutId = setTimeout(() => {
                console.warn(`playNextVideo: Fallback de transitionend disparado.`);
                if (currentPlayerElement) currentPlayerElement.removeEventListener('transitionend', transitionEndHandler);
                transitionEndHandler({ propertyName: 'opacity', target: currentPlayerElement, isFallback: true });
            }, fallbackTimeoutMs);
        } else {
            // Manejo si currentPlayerElement no existe (poco probable pero seguro)
            console.warn("playNextVideo: currentPlayerElement no encontrado para transición, limpiando inmediatamente.");
            if (previousPlayer?.stopVideo) previousPlayer.stopVideo();
            isAudioFading = false; // Resetear si la transición visual falla completamente
            // isTransitioning = false; // Ya se maneja en onPlayerStateChange
        }

    } catch (error) {
        console.error("playNextVideo: Error CRÍTICO:", error);
        isTransitioning = false;
        isAudioFading = false;
        nextPlayerReadyForFadeIn = false;
        nextPlayerInstanceForFade = null;
        previousPlayerInstanceForFade = null;

        const prevVideo = flatList[currentFlatIndex];
        currentPlayingInfo = {
             flattenedIndex: currentFlatIndex >= 0 ? currentFlatIndex : -1,
             videoId: prevVideo ? prevVideo.videoId : null,
             playlistId: prevVideo ? prevVideo.sourcePlaylistId : null
        };
        mostrarMensajeFlotante(`Error cambiando video: ${error.message}`);
        updatePlaylistsUI();
        // Considerar detener ambos players y el monitor
        try { if(player1) player1.stopVideo(); if(player2) player2.stopVideo(); } catch(e){}
        stopMonitoring();
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        reproduccionIniciada = false;
    }
}

let fadeStartTime = 0; // Para registrar cuándo comienza el fundido de audio
function crossfadeAudio(playerToFadeOut, playerToFadeIn) {
    // No usar playerToFadeOut y playerToFadeIn directamente si estamos dependiendo de los globales
    // previousPlayerInstanceForFade y nextPlayerInstanceForFade para la sincronización fina.
    // Pero para la lógica inicial del intervalo, los argumentos son útiles.

    if (isAudioFading && (Date.now() - fadeStartTime < CROSSFADE_DURATION * 1000 * 0.8)) { // Evitar reinicio rápido
         console.log("Crossfade Audio: Fundido ya en curso y no cerca de terminar. Saltando.");
         return;
    }
    
    fadeStartTime = Date.now();
    console.log(`Crossfade Audio START @ ${new Date(fadeStartTime).toLocaleTimeString()}: Intentando desvanecer ${playerToFadeOut === player1 ? 1:2}, fundir ${playerToFadeIn === player1 ? 1:2}`);
    isAudioFading = true;

    // Validar las instancias que se usarán en el intervalo
    const pOut = playerToFadeOut; // El que siempre debe empezar a desvanecerse
    const pIn = playerToFadeIn;   // El que esperará a nextPlayerReadyForFadeIn

    if (!pOut || typeof pOut.setVolume !== 'function' || !pIn || typeof pIn.setVolume !== 'function') {
        console.error("Crossfade Audio: Reproductores inválidos para el fundido.");
        isAudioFading = false;
        nextPlayerReadyForFadeIn = false; // Asegurar reseteo
        return;
    }

    let volOut = pOut.getVolume();
    let volIn = pIn.getVolume(); // Debería ser 0 si se seteó correctamente en playNextVideo

    // Asegurar que el volumen de entrada no suba si no está listo
    if (!nextPlayerReadyForFadeIn) {
        console.log("Crossfade Audio: pIn no está listo para fade in, manteniendo volIn en 0 inicialmente.");
        try { pIn.setVolume(0); } catch(e){} // Forzar a 0 si no está listo
        volIn = 0;
    }

    const steps = Math.max(1, Math.floor(CROSSFADE_DURATION * 20)); // Más pasos para suavidad (ej. 20 por seg)
    const intervalTime = Math.max(50, Math.floor(CROSSFADE_DURATION * 1000 / steps)); // Intervalo de ~50ms
    
    let currentStep = 0;

    if (window.crossfadeIntervalId) {
        clearInterval(window.crossfadeIntervalId);
    }

    window.crossfadeIntervalId = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;

        // Fundido de SALIDA (siempre procede)
        const newVolOut = Math.max(0, volOut * (1 - progress));
        try {
            if (pOut && typeof pOut.setVolume === 'function') pOut.setVolume(newVolOut);
        } catch (e) {
            console.error("Error seteando volumen pOut", e);
            clearInterval(window.crossfadeIntervalId); isAudioFading = false; nextPlayerReadyForFadeIn = false; return;
        }

        // Fundido de ENTRADA (solo si está listo)
        if (nextPlayerReadyForFadeIn) {
            const newVolIn = Math.min(100, volIn + (100 - volIn) * progress); // Sube hacia 100 gradualmente
            try {
                if (pIn && typeof pIn.setVolume === 'function') pIn.setVolume(newVolIn);
            } catch (e) {
                console.error("Error seteando volumen pIn", e);
                // No necesariamente detener todo el crossfade si solo falla el pIn, pero sí loguear.
            }
        } else {
            // Mantener el volumen de pIn en 0 si aún no está listo.
            try { if (pIn && typeof pIn.setVolume === 'function' && pIn.getVolume() !== 0) pIn.setVolume(0); } catch(e){}
        }
        
        if (progress >= 1) {
            clearInterval(window.crossfadeIntervalId);
            window.crossfadeIntervalId = null;
            const fadeEndTime = Date.now();
            console.log(`Crossfade audio FINALIZADO @ ${new Date(fadeEndTime).toLocaleTimeString()} (Duración: ${(fadeEndTime - fadeStartTime)/1000}s).`);
            
            try { // Asegurar que el volumen final sea exacto
                if(pOut && typeof pOut.setVolume === 'function') pOut.setVolume(0);
                if(pIn && typeof pIn.setVolume === 'function' && nextPlayerReadyForFadeIn) pIn.setVolume(100);
                else if (pIn && typeof pIn.setVolume === 'function') pIn.setVolume(0); // Si nunca estuvo listo
            } catch(e) { console.warn("Error seteando volúmenes finales", e); }

            isAudioFading = false;
            nextPlayerReadyForFadeIn = false; // Resetear para la próxima
            // El currentPlayer ya se cambió en onPlayerStateChange cuando el pIn empezó a sonar.
            // Limpieza final de instancias de fade
            previousPlayerInstanceForFade = null;
            nextPlayerInstanceForFade = null;
        }
    }, intervalTime);
}

function askToRepeatPlaylist() {
    const repeat = confirm('Llegaste al final de la lista. ¿Deseas repetir desde el principio?');
    if (repeat) {
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
        playFirstVideo();
    } else {
        stopMonitoring();
        mostrarMensajeFlotante("Playlist finalizada. Gracias por usar YT CrossMix :)");
        try { if(player1) player1.stopVideo(); if(player2) player2.stopVideo(); } catch(e) {}
        document.getElementById('botonPlay').disabled = getFlattenedPlaylist().length === 0;
        reproduccionIniciada = false;
    }
}

function playFirstVideo() {
    if (!playersInitialized) {
        mostrarMensajeFlotante("Los reproductores aún no están listos."); return;
    }
    stopMonitoring(); // Detener cualquier monitoreo/transición previa
    isTransitioning = false; 
    isAudioFading = false;
    nextPlayerReadyForFadeIn = false;
    nextPlayerInstanceForFade = null;
    previousPlayerInstanceForFade = null;
    if (window.crossfadeIntervalId) clearInterval(window.crossfadeIntervalId);


    const flatList = getFlattenedPlaylist();
    if (flatList.length > 0) {
        const firstVideo = flatList[0];
        currentPlayingInfo = { 
            flattenedIndex: 0, videoId: firstVideo.videoId, playlistId: firstVideo.sourcePlaylistId 
        };
        console.log('Reproduciendo el primer video:', firstVideo.videoId);
        try {
            if (player2) { player2.stopVideo(); player2.clearVideo(); } // Detener y limpiar player 2
             document.getElementById('player2').classList.add('hidden');
             document.getElementById('player2').classList.remove('fade-in', 'fade-out');


            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);
            document.getElementById('player1').classList.remove('hidden', 'fade-out', 'fade-in');
            
            currentPlayer = 1;
            reproduccionIniciada = true;
            document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';
            startMonitoring();
            updatePlaylistsUI();
        } catch (e) {
             console.error("Error al iniciar el primer video:", e);
             mostrarMensajeFlotante("Error al intentar reproducir el primer video.");
             reproduccionIniciada = false;
             document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        }
    } else {
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
    if (!playersInitialized || !reproduccionIniciada) return;
    const activePlayer = (currentPlayer === 1) ? player1 : player2;
    if (!activePlayer?.getPlayerState || !activePlayer?.getVideoData) {
        // console.warn("Monitor: Reproductor activo inválido.");
        // stopMonitoring(); // Podría ser muy agresivo detenerlo aquí siempre
        return;
    }

    try {
        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        if (!videoId || isNaN(videoDuration) || videoDuration <= 0) {
            checkAndSkipSegment(activePlayer);
            return;
        }

        if (!segmentosCache[videoId]) checkAndSkipSegment(activePlayer);
        else if (segmentosCache[videoId] === 'fetching') checkAndSkipSegment(activePlayer);
        else checkAndSkipSegment(activePlayer);
        
        const timeRemaining = videoDuration - currentTime;
        if (playerState === YT.PlayerState.PLAYING &&
            timeRemaining <= CROSSFADE_DURATION + 0.5 && 
            timeRemaining > 0 && 
            !isTransitioning && !isAudioFading && // No disparar si ya hay una transición de audio o visual en curso
            !hasOutroCrossfadeStarted) 
        {
            console.log(`Monitor: Tiempo restante (${timeRemaining.toFixed(1)}s) en ventana. Disparando playNextVideo (basado en tiempo).`);
            playNextVideo();
        }

        const inactivePlayer = (currentPlayer === 1) ? player2 : player1;
        if (inactivePlayer?.getPlayerState) {
            const inactiveState = inactivePlayer.getPlayerState();
            if (inactiveState === YT.PlayerState.PLAYING && !isTransitioning && !isAudioFading && inactivePlayer !== activePlayer) {
                console.warn("Monitor: Reproductor inactivo sonando fuera de transición. Deteniéndolo.");
                try { inactivePlayer.stopVideo(); } catch(e) { console.error("Error deteniendo inactivo:", e); }
            }
        }
    } catch (e) {
        // console.error("Error en monitorPlayers:", e);
        // Podría ocurrir si el player es destruido o inválido momentáneamente
    }
}
// ... (checkAndSkipSegment, obtenerSegmentosSponsorBlock sin cambios significativos, omitidos por brevedad)
// Reemplaza las funciones omitidas con tu código existente.

// --- checkAndSkipSegment (Mantenida como estaba) ---
function checkAndSkipSegment(player, forceCheck = false) {
    const currentTime = player.getCurrentTime();
    const videoId = player.getVideoData()?.video_id;
    if (!videoId || isNaN(currentTime)) return;
    const playerState = player.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING && !forceCheck) return;

    if (videoId !== lastSeekVideoId) {
        lastSeekEndTime = -1; lastSeekVideoId = videoId;
    } else {
         if (lastSeekEndTime !== -1 && currentTime >= lastSeekEndTime + 0.2) lastSeekEndTime = -1;
         if (lastSeekEndTime !== -1) return; 
    }
    const segments = segmentosCache[videoId];
    if (segments === undefined) { obtenerSegmentosSponsorBlock(videoId); return; }
    if (segments === 'fetching') return; 
    if (segments === null || segments.length === 0) return; 

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
            if (timeRemainingInSegment <= CROSSFADE_DURATION + 0.5 && timeRemainingInSegment > 0 && !isTransitioning && !hasOutroCrossfadeStarted) {
                 hasOutroCrossfadeStarted = true; 
                 playNextVideo(); 
            }
        } else {
            const skipToTime = segmentEnd; 
            try {
                player.seekTo(skipToTime, true); 
                lastSeekEndTime = skipToTime; 
            } catch (e) { console.error("SPONSORBLOCK SKIP: Error realizando seekTo:", e); }
        }
    }
}
// --- obtenerSegmentosSponsorBlock (Mantenida como estaba) ---
async function obtenerSegmentosSponsorBlock(videoId) {
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) return null;
    segmentosCache[videoId] = 'fetching';
    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; 
    const apiUrl = `/api/segments/${videoId}`; 
    try {
        const response = await fetch(apiUrl, { headers: { 'X-UserID': userId }});
        if (!response.ok) throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error(`API SB Error: Respuesta no es un array`);
        const validSegments = data.filter(segment => {
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') return false;
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);
            if (isNaN(start) || isNaN(end)) return false; 
            if (start < 0 || end < 0 || end < start) return false; 
            return true;
        });
        validSegments.sort((a, b) => a.startTime - b.startTime); 
        segmentosCache[videoId] = validSegments; 
        return validSegments; 
    } catch (error) {
        segmentosCache[videoId] = null; 
        return null; 
    }
}


// Módulo: Manejo de Eventos y Botones
const botonPlay = document.getElementById("botonPlay");
let reproduccionIniciada = false;
botonPlay.disabled = true;
botonPlay.addEventListener('click', () => {
     const activePlayer = (currentPlayer === 1 && player1) ? player1 : (player2 || player1); // Fallback a player1 si player2 no está listo pero es el current
     if (!playersInitialized || !activePlayer || typeof activePlayer.getPlayerState !== 'function') {
          mostrarMensajeFlotante("El reproductor no está listo o es inválido.");
          // Intentar reinicializar o cargar API si es necesario
          if (!youtubeAPIReady) loadYouTubeAPI();
          else if (!playersInitialized && youtubeAPIReady && typeof YT !== 'undefined' && YT.Player) initializePlayers();
          return;
     }

     const playerState = activePlayer.getPlayerState();
     if (!reproduccionIniciada) {
          const flatList = getFlattenedPlaylist();
          if (flatList.length > 0) {
               playFirstVideo();
          } else mostrarMensajeFlotante("No hay videos en la lista.");
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
        mostrarMensajeFlotante("Inicia la reproducción primero con el botón Play."); return;
     }
     console.log("Botón Mix/Next presionado.");
     stopMonitoring(); // Detener temporalmente
     playNextVideo(); 
     // El monitoreo se reinicia en playFirstVideo o si playNextVideo es exitoso y el nuevo video empieza a sonar
     // O se puede reiniciar aquí con startMonitoring() si se considera necesario un reinicio explícito
     // setTimeout(startMonitoring, CROSSFADE_DURATION * 1000 + 1000); // Reiniciar después de que termine el crossfade
});

const searchInput = document.getElementById('searchInput');
const debouncedSearch = debounce((query) => performSearch(query), 500);
searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (query.length > 2) debouncedSearch(query);
    else {
        resultsDiv.innerHTML = ''; currentSearchQuery = ''; nextPageContext = null;
        isLoadingMore = false; hideLoadMoreSpinner();
    }
});

const añadirUrlButton = document.getElementById('añadirUrlButton');
const searchInput2 = document.getElementById('searchInput2');
añadirUrlButton.addEventListener('click', async () => {
    const url = searchInput2.value.trim();
    const playlistIdFromUrl = extractPlaylistId(url);
    if (!playlistIdFromUrl) { alert('URL de la playlist no válida.'); return; }
    mostrarMensajeFlotante("Buscando información de la playlist...");
    searchInput2.value = '';
    try {
        const playlistInfo = await getPlaylistInfo(playlistIdFromUrl);
        if (playlistInfo) {
            playlistInfo.id = playlistIdFromUrl; // Asegurar ID
            handlePlaylistLoaded(playlistInfo);
        }
    } catch (error) {
         mostrarMensajeFlotante(`Error al cargar playlist: ${error.message}`);
    }
});

// --- Funciones Auxiliares ---
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => { func.apply(this, args); }, delay);
    };
}
function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) return "0:00";
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
function parseDuration(durationInput) {
    if (typeof durationInput === 'number') return Math.floor(durationInput);
    if (typeof durationInput !== 'string') return 0;
    const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (isoMatch) {
        return Math.floor((parseInt(isoMatch[1]||0)*3600) + (parseInt(isoMatch[2]||0)*60) + (parseFloat(isoMatch[3]||0)));
    }
    const timeParts = durationInput.split(':').map(p => parseInt(p, 10));
    if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) return timeParts[0]*60 + timeParts[1];
    if (timeParts.length === 3 && !isNaN(timeParts[0])&&!isNaN(timeParts[1])&&!isNaN(timeParts[2])) return timeParts[0]*3600 + timeParts[1]*60 + timeParts[2];
    const directNum = parseInt(durationInput, 10);
    return !isNaN(directNum) ? directNum : 0;
}

const pipedInstances = ["https://pipedapi.reallyaweso.me", "https://pipedapi.ducks.party"];
function getRandomPipedInstance() { return pipedInstances[Math.floor(Math.random() * pipedInstances.length)]; }

async function fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                 let errorBodyText = `HTTP error! status: ${response.status}`;
                 try { errorBodyText = await response.text(); } catch(e){}
                throw new Error(errorBodyText);
            }
            return await response.json();
        } catch (error) {
            retries++;
            if (retries <= maxRetries) await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
            else throw error;
        }
    }
}
async function getPlaylistInfo(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
    try {
        const data = await fetchDataWithRetry(targetUrl);
        if (!data || !data.relatedStreams) throw new Error("Respuesta API no contiene videos válidos.");
        return data;
    } catch (error) { console.error("Error al obtener playlist:", error.message); throw error; }
}
function extractPlaylistId(url) {
    try { return new URL(url).searchParams.get('list'); }
    catch (e) { return null; }
}

document.addEventListener('DOMContentLoaded', () => {
     if (!playlistsData.some(p => p.id === 'manual')) {
        playlistsData.unshift({ id: 'manual', name: 'Mis Vídeos Añadidos', thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico', videos: [], isExpanded: true });
     }
     updatePlaylistsUI();
     loadYouTubeAPI();
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('.delete-menu')) closeAllContextMenus();
    if (!event.target.closest('.playlist-selection-popup-menu')) closePlaylistSelectionPopups();
}, true);
