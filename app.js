// app.js - Módulo: Configuración y Variables Globales

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
const resultsContainer = document.getElementById('resultsContainer'); // Contenedor scrollable (asegúrate de que este ID existe en tu HTML)
const resultsDiv = document.getElementById('results'); // Contenedor de la grilla

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para cachear segmentos de SponsorBlock por ID de video
let isSponsorBlockActive = true; // Estado para activar/desactivar SponsorBlock
let currentSegments = []; // Segmentos del video actualmente en reproducción
let skipInterval; // Intervalo para verificar si se debe saltar un segmento

// --- Funciones de Reproductor de YouTube ---

// Función que se ejecuta cuando la API de YouTube Player está lista
function onYouTubeIframeAPIReady() {
    console.log("YouTube Iframe API Ready.");
    playersInitialized = true; // Marcar que los reproductores pueden ser creados
    initializePlayers(); // Inicializar los reproductores
}

// Función para inicializar o crear los reproductores
function initializePlayers() {
    if (!playersInitialized) return; // Esperar a que la API esté lista

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        playerVars: {
            'autoplay': 0, // No autoplay inicialmente
            'controls': 0, // Sin controles nativos
            'disablekb': 1, // Deshabilitar controles de teclado
            'fs': 0, // No permitir pantalla completa
            'iv_load_policy': 3, // Ocultar anotaciones
            'modestbranding': 1, // Logo YouTube pequeño
            'rel': 0, // No mostrar videos relacionados al final
            'showinfo': 0, // No mostrar info del video
            'enablejsapi': 1, // Habilitar JS API
            'loop': 0 // No loop por defecto, se maneja manualmente para playlists
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });

    player2 = new YT.Player('player2', {
        height: '100%',
        width: '100%',
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'iv_load_policy': 3,
            'modestbranding': 1,
            'rel': 0,
            'showinfo': 0,
            'enablejsapi': 1,
            'loop': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    // console.log(`Player ${event.target.getIframe().id} ready.`);
    // Opcional: Cargar un video inicial si es necesario
    // event.target.loadVideoById('dQw4w9WgXcQ'); // Rick Astley for testing
    // Si tienes alguna lógica para iniciar la reproducción al cargar, irá aquí.
}

function onPlayerStateChange(event) {
    const player = event.target;
    const playerId = player.getIframe().id;
    // console.log(`Player ${playerId} state changed: ${event.data}`);

    // Manejar el crossfade cuando un video termina (estado ENDED)
    if (event.data === YT.PlayerState.ENDED) {
        console.log(`Video en ${playerId} ha terminado. Preparando crossfade.`);
        // Si no hay más videos en la playlist, detener.
        if (currentPlayingInfo.playlistId && currentPlayingInfo.flattenedIndex !== -1) {
            const currentPlaylist = playlistsData.find(p => p.id === currentPlayingInfo.playlistId);
            if (currentPlaylist && currentPlayingInfo.flattenedIndex < currentPlaylist.videos.length - 1) {
                // Hay un siguiente video, iniciar el crossfade.
                startCrossfade(playerId);
            } else {
                console.log("Último video de la playlist terminado.");
                // Ocultar reproductores y resetear UI si es el último video de una playlist
                player1.stopVideo(); // Asegúrate de detener ambos
                player2.stopVideo();
                document.getElementById('player1').classList.add('hidden');
                document.getElementById('player2').classList.add('hidden');
                // Podrías reiniciar currentPlayingInfo aquí
                currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
                // Actualizar UI del reproductor a estado inactivo
                document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
                stopMonitor(); // Detener el monitoreo de tiempo
                updateProgressBar(0, 0); // Resetear barra de progreso
            }
        }
    } else if (event.data === YT.PlayerState.PLAYING) {
        // Cuando un video empieza a reproducirse, iniciar el monitoreo del tiempo.
        if (!monitorInterval) {
            startMonitor();
        }
        // Asegúrate de que el botón de play muestre pausa
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';
    } else if (event.data === YT.PlayerState.PAUSED) {
        stopMonitor();
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
    } else if (event.data === YT.PlayerState.BUFFERING) {
        // Opcional: Mostrar algún indicador de carga
    } else if (event.data === YT.PlayerState.CUED) {
        // Video cargado y listo para reproducir
    }
}


// --- Funciones de Crossfade ---

async function startCrossfade(finishedPlayerId) {
    if (isTransitioning) return; // Evitar transiciones simultáneas
    isTransitioning = true;
    hasOutroCrossfadeStarted = false; // Resetear el flag de SponsorBlock

    const nextPlayer = (finishedPlayerId === 'player1') ? player2 : player1;
    const currentActivePlayer = (finishedPlayerId === 'player1') ? player1 : player2;

    const nextVideoInfo = getNextVideoInPlaylist();
    if (!nextVideoInfo) {
        console.log("No hay siguiente video en la playlist para el crossfade.");
        isTransitioning = false;
        // Limpiar después del último video
        currentActivePlayer.stopVideo();
        nextPlayer.stopVideo();
        document.getElementById('player1').classList.add('hidden');
        document.getElementById('player2').classList.add('hidden');
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        stopMonitor();
        updateProgressBar(0, 0);
        return;
    }

    // Actualizar currentPlayingInfo al siguiente video ANTES de cargar
    currentPlayingInfo.videoId = nextVideoInfo.id;
    currentPlayingInfo.flattenedIndex++; // Avanzar el índice

    try {
        // Asegurarse de que el siguiente reproductor esté visible pero con opacidad 0
        const nextPlayerElement = document.getElementById(nextPlayer.getIframe().id);
        nextPlayerElement.classList.remove('hidden'); // Asegurarse de que no esté 'display: none'
        nextPlayerElement.classList.add('fade-in'); // Aplicar estilo fade-in

        await nextPlayer.loadVideoById(nextVideoInfo.id);
        nextPlayer.setVolume(0); // Empezar mudo
        nextPlayer.playVideo();

        // Aplicar la clase 'fade-out' al reproductor actual
        const currentActivePlayerElement = document.getElementById(currentActivePlayer.getIframe().id);
        currentActivePlayerElement.classList.add('fade-out');

        // Swap de z-index: traer el nuevo al frente, el viejo al fondo
        currentActivePlayerElement.style.zIndex = '2';
        nextPlayerElement.style.zIndex = '3';

        // Animar el volumen: de 0 a 100 para nextPlayer, de 100 a 0 para currentActivePlayer
        isAudioFading = true; // Indicar que el audio está en transición
        animateVolume(currentActivePlayer, 100, 0, CROSSFADE_DURATION * 1000);
        animateVolume(nextPlayer, 0, 100, CROSSFADE_DURATION * 1000);

        // Esperar a que la animación de crossfade termine
        setTimeout(() => {
            currentActivePlayer.stopVideo(); // Detener el video anterior completamente
            currentActivePlayerElement.classList.remove('fade-out');
            currentActivePlayerElement.classList.add('hidden'); // Ocultar completamente
            currentActivePlayerElement.style.zIndex = '2'; // Resetear z-index

            nextPlayerElement.classList.remove('fade-in'); // Quitar la clase de transición
            nextPlayerElement.style.zIndex = '3'; // Asegurar que esté en frente

            isTransitioning = false;
            isAudioFading = false; // La transición de audio ha terminado

            // Actualizar el reproductor "actual" para la siguiente ronda
            currentPlayer = (currentPlayer === 1) ? 2 : 1;
            console.log(`Crossfade completo. Reproductor actual: ${nextPlayer.getIframe().id}`);

            // Actualizar el estilo de 'currently-playing-video' en la UI
            updateCurrentlyPlayingVideoUI();

            // Cargar segmentos de SponsorBlock para el nuevo video
            fetchAndApplySponsorBlockSegments(nextVideoInfo.id);

        }, CROSSFADE_DURATION * 1000); // Duración de la transición en ms

    } catch (error) {
        console.error("Error durante el crossfade:", error);
        isTransitioning = false;
        isAudioFading = false;
        // En caso de error, intenta detener ambos y limpiar
        currentActivePlayer.stopVideo();
        nextPlayer.stopVideo();
        document.getElementById('player1').classList.add('hidden');
        document.getElementById('player2').classList.add('hidden');
        // Manejar el error, quizás pasar al siguiente video o mostrar mensaje
    }
}

// Función auxiliar para animar el volumen
function animateVolume(player, startVolume, endVolume, duration) {
    const startTime = performance.now();
    const range = endVolume - startVolume;

    function frame() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1); // Clamp between 0 and 1
        const currentVolume = startVolume + range * progress;
        player.setVolume(Math.round(currentVolume));

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }
    requestAnimationFrame(frame);
}

// Obtiene el siguiente video en la playlist o null si es el final
function getNextVideoInPlaylist() {
    if (!currentPlayingInfo.playlistId) return null;

    const currentPlaylist = playlistsData.find(p => p.id === currentPlayingInfo.playlistId);
    if (!currentPlaylist || !currentPlaylist.videos || currentPlaylist.videos.length === 0) return null;

    const nextIndex = currentPlayingInfo.flattenedIndex + 1;
    if (nextIndex < currentPlaylist.videos.length) {
        return currentPlaylist.videos[nextIndex];
    }
    return null; // No hay más videos en esta playlist
}

// Obtiene el video anterior en la playlist
function getPrevVideoInPlaylist() {
    if (!currentPlayingInfo.playlistId || currentPlayingInfo.flattenedIndex <= 0) return null;

    const currentPlaylist = playlistsData.find(p => p.id === currentPlayingInfo.playlistId);
    if (!currentPlaylist || !currentPlaylist.videos || currentPlaylist.videos.length === 0) return null;

    const prevIndex = currentPlayingInfo.flattenedIndex - 1;
    if (prevIndex >= 0) {
        return currentPlaylist.videos[prevIndex];
    }
    return null;
}

// --- Funciones de Control de Reproducción ---

function getCurrentPlayer() {
    return (currentPlayer === 1) ? player1 : player2;
}

function getOtherPlayer() {
    return (currentPlayer === 1) ? player2 : player1;
}

function playVideo(videoObj) {
    // Detener y ocultar el reproductor inactivo
    const otherPlayer = getOtherPlayer();
    const otherPlayerElement = document.getElementById(otherPlayer.getIframe().id);
    if (otherPlayerElement) {
        otherPlayer.stopVideo();
        otherPlayerElement.classList.add('hidden');
    }

    const activePlayer = getCurrentPlayer();
    const activePlayerElement = document.getElementById(activePlayer.getIframe().id);

    currentPlayingInfo.videoId = videoObj.id;
    currentPlayingInfo.playlistId = videoObj.playlistId; // Asegúrate de que el video tenga una playlistId asociada
    currentPlayingInfo.flattenedIndex = videoObj.flattenedIndex;

    activePlayerElement.classList.remove('hidden'); // Asegurarse de que esté visible
    activePlayer.loadVideoById(videoObj.id);
    activePlayer.setVolume(100);
    activePlayer.playVideo();

    startMonitor(); // Iniciar monitoreo del progreso

    // Actualizar el botón de play a pausa
    document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';

    // Actualizar el estilo de 'currently-playing-video' en la UI
    updateCurrentlyPlayingVideoUI();

    // Cargar segmentos de SponsorBlock para el nuevo video
    fetchAndApplySponsorBlockSegments(videoObj.id);
}

// Asigna event listeners a los botones de control de audio/video
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('botonPlay').addEventListener('click', togglePlayPause);
    document.getElementById('botonNext').addEventListener('click', playNextVideo);
    document.getElementById('botonPrev').addEventListener('click', playPrevVideo);
    document.getElementById('botonStop').addEventListener('click', stopVideoPlayback);

    // Event listener para la barra de progreso
    const progressSeekBar = document.querySelector('.progress-seek-bar');
    if (progressSeekBar) {
        progressSeekBar.addEventListener('click', seekVideo);
    }
});


function togglePlayPause() {
    const player = getCurrentPlayer();
    if (!player || !player.getPlayerState) return;

    const playerState = player.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        stopMonitor();
    } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.ENDED || playerState === YT.PlayerState.CUED) {
        player.playVideo();
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';
        startMonitor();
    }
}

function playNextVideo() {
    const nextVideoInfo = getNextVideoInPlaylist();
    if (nextVideoInfo) {
        playVideo(nextVideoInfo);
    } else {
        mostrarMensajeFlotante("No hay más videos en la playlist.");
    }
}

function playPrevVideo() {
    const prevVideoInfo = getPrevVideoInPlaylist();
    if (prevVideoInfo) {
        playVideo(prevVideoInfo);
    } else {
        mostrarMensajeFlotante("Estás en el primer video de la playlist.");
    }
}

function stopVideoPlayback() {
    const player = getCurrentPlayer();
    if (player && player.stopVideo) {
        player.stopVideo();
        stopMonitor(); // Detener el monitoreo de tiempo
        document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
        updateProgressBar(0, 0); // Resetear barra de progreso
        // Ocultar el reproductor activo
        const activePlayerElement = document.getElementById(player.getIframe().id);
        activePlayerElement.classList.add('hidden');
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 }; // Resetear info
        updateCurrentlyPlayingVideoUI(); // Limpiar el marcado de "playing" en la UI
    }
}


// --- Funciones de Monitoreo de Progreso ---

function startMonitor() {
    if (monitorInterval) clearInterval(monitorInterval); // Limpiar cualquier intervalo previo
    monitorInterval = setInterval(updateProgress, 1000); // Actualizar cada segundo
}

function stopMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

function updateProgress() {
    const player = getCurrentPlayer();
    if (!player || !player.getCurrentTime || !player.getDuration || isAudioFading) return;

    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();

    if (duration > 0) {
        const progress = (currentTime / duration) * 100;
        updateProgressBar(currentTime, duration);
        checkSponsorBlock(currentTime); // Verifica SponsorBlock
    }
}

function updateProgressBar(currentTime, duration) {
    const progressBarFill = document.getElementById('progressBar');
    const timeElapsedSpan = document.getElementById('timeElapsed');
    const timeRemainingSpan = document.getElementById('timeRemaining');

    if (duration > 0) {
        const progressPercent = (currentTime / duration) * 100;
        progressBarFill.style.width = `${progressPercent}%`;

        timeElapsedSpan.textContent = formatTime(currentTime);
        timeRemainingSpan.textContent = formatTime(duration - currentTime);
    } else {
        progressBarFill.style.width = '0%';
        timeElapsedSpan.textContent = '0:00';
        timeRemainingSpan.textContent = '0:00';
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function seekVideo(event) {
    const progressBar = event.currentTarget;
    const clickX = event.offsetX;
    const width = progressBar.clientWidth;
    const seekTime = (clickX / width) * getCurrentPlayer().getDuration();
    getCurrentPlayer().seekTo(seekTime, true);
}

// --- Funciones de Interfaz de Usuario (UI) ---

// Renderiza o actualiza la lista de playlists en la sidebar
function updatePlaylistsUI() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;

    playlistContainer.innerHTML = ''; // Limpiar el contenedor actual

    if (playlistsData.length === 0) {
        playlistContainer.innerHTML = '<p class="text-light">No hay playlists para mostrar. Inicia sesión en Google y asegúrate de tener playlists públicas o sin listar.</p>';
        return;
    }

    playlistsData.forEach(playlist => {
        const playlistItem = document.createElement('div');
        playlistItem.className = 'playlist-item';
        playlistItem.dataset.playlistId = playlist.id;

        // Añadir clase 'expanded' si la playlist está expandida
        if (playlist.isExpanded) {
            playlistItem.classList.add('expanded');
        }

        // Añadir clase 'currently-playing' si es la playlist activa
        if (currentPlayingInfo.playlistId === playlist.id) {
            playlistItem.classList.add('currently-playing');
        }

        playlistItem.innerHTML = `
            <img src="${playlist.thumbnailUrl}" alt="${playlist.name}" class="playlist-thumbnail">
            <div class="playlist-info">
                <span class="playlist-name">${playlist.name}</span>
                <span class="playlist-video-count">${playlist.videoCount} videos</span>
            </div>
            <div class="playlist-item-actions">
                <button class="expand-playlist-button" title="Expandir/Contraer">
                    <i class="fas ${playlist.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                </button>
                <button class="delete-playlist-button" title="Eliminar Playlist (Solo UI)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        playlistContainer.appendChild(playlistItem);

        // Añadir listener para expandir/contraer
        playlistItem.querySelector('.expand-playlist-button').addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que el clic en el botón afecte al elemento padre
            togglePlaylistExpansion(playlist.id);
        });

        // Listener para eliminar playlist (solo de la UI)
        playlistItem.querySelector('.delete-playlist-button').addEventListener('click', (e) => {
            e.stopPropagation();
            deletePlaylistFromUI(playlist.id);
        });

        // Listener para reproducir la playlist
        playlistItem.addEventListener('click', () => {
            playPlaylist(playlist.id);
        });


        // Si la playlist está expandida, renderizar sus videos
        if (playlist.isExpanded && playlist.videos) {
            renderPlaylistVideos(playlist.id, playlist.videos, playlistContainer);
        }
    });
}

// Renderiza los videos de una playlist específica
function renderPlaylistVideos(playlistId, videos, parentContainer) {
    const playlistVideosList = document.createElement('ul');
    playlistVideosList.className = 'playlist-videos-list';
    playlistVideosList.dataset.playlistId = playlistId; // Para identificar a qué playlist pertenece

    videos.forEach((video, index) => {
        const videoItem = document.createElement('li');
        videoItem.className = 'playlist-video-item';
        videoItem.dataset.videoId = video.id;
        videoItem.dataset.flattenedIndex = index; // Guardar el índice plano para la navegación
        videoItem.dataset.playlistId = playlistId;

        // Añadir clase si es el video actualmente en reproducción
        if (currentPlayingInfo.playlistId === playlistId && currentPlayingInfo.videoId === video.id) {
            videoItem.classList.add('currently-playing-video');
        }

        videoItem.innerHTML = `
            <i class="fas fa-grip-lines playlist-video-drag-handle"></i>
            <img src="${video.thumbnailUrl}" alt="${video.title}" class="playlist-video-thumbnail">
            <div class="playlist-video-info">
                <span class="playlist-video-title">${video.title}</span>
                <span class="playlist-video-channel">${video.channelTitle}</span>
            </div>
            <div class="playlist-item-actions">
                <button class="add-to-queue-button" title="Añadir a la cola"><i class="fas fa-plus"></i></button>
                <button class="delete-video-button" title="Eliminar Video (Solo UI)"><i class="fas fa-times"></i></button>
            </div>
        `;
        playlistVideosList.appendChild(videoItem);

        videoItem.addEventListener('click', (e) => {
            // Asegurarse de que el clic no sea en un botón de acción
            if (!e.target.closest('.add-to-queue-button') && !e.target.closest('.delete-video-button') && !e.target.closest('.playlist-video-drag-handle')) {
                playVideo({
                    id: video.id,
                    playlistId: playlistId,
                    flattenedIndex: index
                });
            }
        });

        // Listeners para los botones de acción del video
        videoItem.querySelector('.add-to-queue-button').addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar que se reproduzca el video
            mostrarMensajeFlotante(`Video "${video.title}" añadido a la cola.`);
            // Lógica para añadir a la cola
        });
        videoItem.querySelector('.delete-video-button').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVideoFromPlaylistUI(playlistId, video.id);
        });
    });

    // Encontrar el lugar correcto para insertar la lista de videos
    const playlistItemElement = parentContainer.querySelector(`.playlist-item[data-playlist-id="${playlistId}"]`);
    if (playlistItemElement) {
        playlistItemElement.insertAdjacentElement('afterend', playlistVideosList);
    }
}

// Alterna la expansión de una playlist
async function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    playlist.isExpanded = !playlist.isExpanded;

    if (playlist.isExpanded && (!playlist.videos || playlist.videos.length === 0)) {
        // Cargar videos solo si se expande y aún no se han cargado
        await getVideosForPlaylist(playlist.id);
    }
    updatePlaylistsUI(); // Volver a renderizar para reflejar los cambios
}

// Función para eliminar una playlist de la UI (sin afectar YouTube)
function deletePlaylistFromUI(playlistId) {
    playlistsData = playlistsData.filter(p => p.id !== playlistId);
    mostrarMensajeFlotante("Playlist eliminada de la interfaz (no de YouTube).");
    updatePlaylistsUI();
    // Si la playlist eliminada era la que se estaba reproduciendo, detener la reproducción
    if (currentPlayingInfo.playlistId === playlistId) {
        stopVideoPlayback();
    }
}

// Función para eliminar un video de una playlist en la UI
function deleteVideoFromPlaylistUI(playlistId, videoId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist && playlist.videos) {
        const initialVideoCount = playlist.videos.length;
        playlist.videos = playlist.videos.filter(v => v.id !== videoId);
        // Re-indexar los videos aplanados después de eliminar
        playlist.videos.forEach((v, idx) => v.flattenedIndex = idx);
        playlist.videoCount = playlist.videos.length; // Actualizar el conteo

        if (playlist.videos.length < initialVideoCount) {
            mostrarMensajeFlotante("Video eliminado de la playlist (no de YouTube).");
            updatePlaylistsUI();
            // Si el video eliminado era el que se estaba reproduciendo, manejar la reproducción
            if (currentPlayingInfo.playlistId === playlistId && currentPlayingInfo.videoId === videoId) {
                // Intenta reproducir el siguiente o el anterior
                playNextVideo(); // O puedes decidir stopVideoPlayback()
            }
        }
    }
}

// Lógica de reproducción de una playlist completa
async function playPlaylist(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    showLoadingSpinner();
    try {
        // Asegurarse de que los videos de la playlist estén cargados
        if (!playlist.videos || playlist.videos.length === 0) {
            await getVideosForPlaylist(playlist.id);
        }

        if (playlist.videos && playlist.videos.length > 0) {
            // Establecer la playlist activa y el primer video
            currentPlayingInfo.playlistId = playlist.id;
            currentPlayingInfo.flattenedIndex = 0; // Siempre empezar por el primer video
            playVideo(playlist.videos[0]);
            mostrarMensajeFlotante(`Iniciando playlist: ${playlist.name}`);
        } else {
            mostrarMensajeFlotante("La playlist no tiene videos o no se pudieron cargar.");
        }
    } catch (error) {
        console.error("Error al reproducir playlist:", error);
        mostrarMensajeFlotante("Error al reproducir playlist.");
    } finally {
        hideLoadingSpinner();
    }
}


// Función para obtener videos de una playlist específica (llamada por app.js)
async function getVideosForPlaylist(playlistId) {
    showLoadingSpinner();
    try {
        let videos = [];
        let nextPageToken = null;
        do {
            const response = await gapi.client.youtube.playlistItems.list({
                'part': ['snippet'],
                'playlistId': playlistId,
                'maxResults': 50,
                'pageToken': nextPageToken
            });
            if (response.result.items) {
                // Mapear los resultados a un formato más simple
                const mappedVideos = response.result.items.map((item, index) => ({
                    id: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    thumbnailUrl: item.snippet.thumbnails.default ? item.snippet.thumbnails.default.url : 'placeholder.jpg',
                    channelTitle: item.snippet.channelTitle,
                    playlistId: playlistId, // Añadir la playlistId al video
                    flattenedIndex: index // Añadir un índice para la navegación interna
                }));
                videos = videos.concat(mappedVideos);
            }
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        // Actualizar el objeto playlistData con los videos cargados
        const playlistIndex = playlistsData.findIndex(p => p.id === playlistId);
        if (playlistIndex !== -1) {
            playlistsData[playlistIndex].videos = videos;
            playlistsData[playlistIndex].videoCount = videos.length; // Actualizar conteo si es necesario
        }

    } catch (err) {
        console.error("Error al obtener videos de la playlist de YouTube:", err);
        // Manejar el error, quizás mostrar un mensaje al usuario
        mostrarMensajeFlotante("Error al cargar videos de la playlist.");
    } finally {
        hideLoadingSpinner();
    }
}

// Actualiza el marcado del video "currently playing" en la UI de playlists
function updateCurrentlyPlayingVideoUI() {
    // Quitar la clase de todos los videos primero
    document.querySelectorAll('.playlist-video-item.currently-playing-video').forEach(item => {
        item.classList.remove('currently-playing-video');
    });
    // Quitar la clase de todas las playlists
    document.querySelectorAll('.playlist-item.currently-playing').forEach(item => {
        item.classList.remove('currently-playing');
    });

    if (currentPlayingInfo.playlistId && currentPlayingInfo.videoId) {
        // Marcar la playlist
        const currentPlaylistElement = document.querySelector(`.playlist-item[data-playlist-id="${currentPlayingInfo.playlistId}"]`);
        if (currentPlaylistElement) {
            currentPlaylistElement.classList.add('currently-playing');
        }

        // Marcar el video
        const currentVideoElement = document.querySelector(`.playlist-video-item[data-playlist-id="${currentPlayingInfo.playlistId}"][data-video-id="${currentPlayingInfo.videoId}"]`);
        if (currentVideoElement) {
            currentVideoElement.classList.add('currently-playing-video');
            // Opcional: hacer scroll para que el video actual sea visible
            currentVideoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}


// --- Funciones de Búsqueda ---
async   const searchYouTube = async (query, nextPage = null) => {
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


function renderSearchResults(results, newSearch = false) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    if (newSearch) {
        resultsDiv.innerHTML = ''; // Limpiar resultados anteriores si es una nueva búsqueda
    }

    if (results.length === 0 && newSearch) {
        resultsDiv.innerHTML = '<p class="text-light">No se encontraron resultados para su búsqueda.</p>';
        return;
    }

    results.forEach(item => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-card';
        videoCard.dataset.videoId = item.id.videoId; // Guardar el ID del video

        const thumbnailUrl = item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'placeholder.jpg';

        videoCard.innerHTML = `
            <img src="${thumbnailUrl}" alt="${item.snippet.title}">
            <div class="video-card-info">
                <h4 class="video-card-title">${item.snippet.title}</h4>
                <p class="video-card-channel">${item.snippet.channelTitle}</p>
                <div class="video-card-actions">
                    <button class="add-to-playlist add-to-playlist-search-button" title="Añadir a playlist">
                        <i class="fas fa-plus"></i> <span class="add-text">Añadir</span>
                    </button>
                </div>
            </div>
        `;
        resultsDiv.appendChild(videoCard);

        // Listener para reproducir el video al hacer clic en la tarjeta (no en el botón)
        videoCard.addEventListener('click', (e) => {
            if (!e.target.closest('.add-to-playlist-search-button')) { // Asegurarse de no hacer clic en el botón
                playVideo({ id: item.id.videoId, playlistId: null, flattenedIndex: -1 }); // No es parte de una playlist
                mostrarMensajeFlotante(`Reproduciendo: ${item.snippet.title}`);
            }
        });

        // Listener para el botón "Añadir a playlist"
        videoCard.querySelector('.add-to-playlist-search-button').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevenir que el clic en el botón active el reproductor
            // Aquí llamarías a una función para abrir un selector de playlist o similar
            // Por ahora, solo un mensaje flotante
            mostrarMensajeFlotante(`Video "${item.snippet.title}" listo para añadir a playlist.`);
            // Implementa aquí la lógica para añadir el video a una playlist existente
            // showPlaylistSelectionPopup(item.id.videoId, item.snippet.title);
        });
    });
}

async function loadMoreSearchResults() {
    if (isLoadingMore || !nextPageContext) {
        return;
    }
    isLoadingMore = true;
    showLoadMoreSpinner(); // Mostrar spinner pequeño para carga adicional

    try {
        const response = await gapi.client.Youtube.list({
            'part': 'snippet',
            'q': currentSearchQuery,
            'type': 'video',
            'maxResults': 25,
            'pageToken': nextPageContext,
            'videoEmbeddable': 'true'
        });

        const newResults = response.result.items;
        nextPageContext = response.result.nextPageToken;

        renderSearchResults(newResults, false); // No limpiar resultados existentes

    } catch (err) {
        console.error('Error al cargar más resultados de YouTube:', err);
        mostrarMensajeFlotante("Error al cargar más resultados.");
    } finally {
        hideLoadMoreSpinner();
        isLoadingMore = false;
    }
}

// --- Funciones de SponsorBlock ---

async function fetchAndApplySponsorBlockSegments(videoId) {
    if (!isSponsorBlockActive) {
        currentSegments = [];
        return;
    }

    if (segmentosCache[videoId]) {
        currentSegments = segmentosCache[videoId];
        console.log(`Segmentos de SponsorBlock cargados desde caché para ${videoId}.`);
        return;
    }

    try {
        const response = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&category=sponsor&category=selfpromo&category=interaction&category=intro&category=outro&category=highlight`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        currentSegments = data && data.length > 0 ? data[0].segments : [];
        segmentosCache[videoId] = currentSegments;
        console.log(`Segmentos de SponsorBlock cargados para ${videoId}:`, currentSegments);
    } catch (error) {
        console.error("Error al obtener segmentos de SponsorBlock:", error);
        currentSegments = [];
    }
}

function checkSponsorBlock(currentTime) {
    if (!isSponsorBlockActive || currentSegments.length === 0 || isAudioFading || isTransitioning) {
        return;
    }

    const player = getCurrentPlayer();
    if (!player || !player.getCurrentTime || !player.getDuration) return;

    for (const segment of currentSegments) {
        const [segmentStart, segmentEnd] = segment.segment;
        const segmentCategory = segment.category;

        // Si el tiempo actual está dentro de un segmento
        if (currentTime >= segmentStart && currentTime < segmentEnd) {
            // console.log(`Saltando segmento: ${segmentCategory} de ${formatTime(segmentStart)} a ${formatTime(segmentEnd)}`);
            // Manejar 'outro' para iniciar crossfade antes de que termine el video
            if (segmentCategory === 'outro' && !hasOutroCrossfadeStarted) {
                console.log("Segmento 'outro' detectado. Iniciando crossfade anticipado.");
                hasOutroCrossfadeStarted = true; // Prevenir múltiples disparos
                startCrossfade(player.getIframe().id);
                return; // No intentar seekTo si ya estamos haciendo crossfade
            } else if (segmentCategory !== 'outro') { // Saltar otros segmentos
                player.seekTo(segmentEnd, true); // Saltar al final del segmento
                console.log(`Saltado segmento '${segmentCategory}' a ${formatTime(segmentEnd)}`);
                mostrarMensajeFlotante(`Saltando ${segmentCategory}...`);
                break; // Saltar solo un segmento a la vez
            }
        }
    }
}


// --- Funciones Utilitarias / Mensajes Flotantes ---

// Función para mostrar mensajes flotantes
function mostrarMensajeFlotante(mensaje) {
    const container = document.getElementById('floatingMessageContainer');
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'floating-message';
    messageDiv.textContent = mensaje;
    container.appendChild(messageDiv);

    // Mostrar el mensaje con una pequeña animación
    setTimeout(() => {
        messageDiv.classList.add('show');
    }, 10); // Pequeño retardo para que la transición funcione

    // Ocultar y eliminar el mensaje después de un tiempo
    setTimeout(() => {
        messageDiv.classList.remove('show');
        // Esperar a que la transición de ocultar termine antes de eliminar
        messageDiv.addEventListener('transitionend', () => {
            messageDiv.remove();
        }, { once: true });
    }, 3000); // Mensaje visible por 3 segundos
}


// --- Inicialización y Event Listeners ---

// Es importante que las funciones onYouTubeIframeAPIReady, gapiInitialize y gisInitalize
// se llamen desde el HTML en la carga de sus respectivos scripts.
// Este listener asegura que el código de app.js se ejecute cuando el DOM esté cargado.
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded in app.js");

    // Asociar eventos a los botones de búsqueda
    document.getElementById('searchButton').addEventListener('click', searchYouTube);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchYouTube();
        }
    });

    // Lógica para el scroll infinito en los resultados de búsqueda
    const resultsContainerElement = document.querySelector('.search-results-section');
    if (resultsContainerElement) {
        resultsContainerElement.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = resultsContainerElement;
            if (scrollHeight - scrollTop <= clientHeight + 100 && !isLoadingMore && nextPageContext) {
                loadMoreSearchResults();
            }
        });
    }

    // Inicializar los reproductores de YouTube cuando la API esté lista.
    // Esto se hará cuando onYouTubeIframeAPIReady sea llamado por el script de YouTube.
    // updatePlaylistsUI() se llamará desde auth.js después de la autenticación exitosa.
    // Los listeners de drag and drop se añadirán después de que la UI de playlist inicial sea renderizada.

    // Cierre inicial de spinners por si se quedaron pegados de una carga previa
    hideLoadingSpinner();
    // hideLoadMoreSpinner() ya se maneja en el CSS con .hidden para .loading-spinner-small
    document.getElementById('loadMoreSpinner').classList.add('hidden'); // Asegurarse que el spinner de carga de más esté oculto
});


// Función para mostrar el spinner de carga de página completa
// (Mantengo aquí ya que se usa en app.js para búsquedas/playlists)
// Idealmente, estas funciones podrían estar en un archivo de utilidades compartido.
// Si las has movido a auth.js, elimina estas duplicadas.
// En este caso las mantengo, pero ten cuidado con duplicados.
/*
function showLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.remove('hidden');
    }
}
function hideLoadingSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.classList.add('hidden');
    }
}
*/

// Event listener for global clicks to close popups - ensure it captures during the capture phase
document.addEventListener('click', (event) => {
    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    if (!event.target.closest('.delete-menu')) {
        // closeAllContextMenus(); // Asume que esta función existe
    }
    // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        // closePlaylistSelectionPopups(); // Asume que esta función existe
    }
}, true); // Keep using the capture phase for better reliability
