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
    flattenedIndex: -1, // Índice en la lista aplanada para reproducción
    player: null // Referencia al objeto YT.Player actualmente activo
};
// Variables para Búsqueda y Scroll Infinito
let isLoadingMore = false; // Flag para evitar cargas múltiples simultáneas
let nextPageContext = null; // Para guardar información de la siguiente página (si la API la provee)
let currentSearchQuery = ''; // Guarda la última consulta realizada
const resultsContainer = document.getElementById('resultsContainer'); // Contenedor scrollable
const resultsDiv = document.getElementById('results'); // Contenedor de la grilla

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para cachear segmentos de SponsorBlock por videoId
let currentSkipSegment = null; // Para rastrear el segmento de skip actual

// Referencias a elementos del DOM
const searchInput = document.getElementById('searchInput');
const searchInput2 = document.getElementById('searchInput2');
const playlistContainer = document.getElementById('playlistContainer');
const addButton = document.getElementById('añadirUrlButton');
const playButton = document.getElementById('botonPlay');
const prevButton = document.getElementById('botonPrev');
const nextButton = document.getElementById('botonNext');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const totalDurationDisplay = document.getElementById('totalDurationDisplay');
const volumeSlider = document.getElementById('volumeSlider');
const upNextList = document.getElementById('upNextList');

// -- Firebase / Firestore --
let db; // Objeto Firestore
let auth; // Objeto Auth
let currentUser; // Usuario actual
let userPlaylistsRef; // Referencia a la colección de playlists del usuario
let playlistsUnsubscribe; // Función para desuscribirse de los cambios en las playlists
const APP_COLLECTION_ID = 'yt-crossmix-app'; // ID de la colección de la app

// Inicialización de Firebase (llamada desde firebase-init.js)
window.initFirebase = (firestore, firebaseAuth, user) => {
    db = firestore;
    auth = firebaseAuth;
    currentUser = user;
    console.log('🔥 Firebase inicializado en app.js para el usuario:', currentUser.uid);

    // Inicializar la referencia a las playlists del usuario
    userPlaylistsRef = db.collection('artifacts').doc(APP_COLLECTION_ID).collection('users').doc(currentUser.uid).collection('playlists');

    // Cargar y escuchar cambios en las playlists
    loadAndListenToPlaylists();
};

// Módulo: Funciones de Utilidad
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "0:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('hidden');
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('hidden');
}

function showFloatingMessage(message, type = 'info', duration = 3000) {
    const container = document.getElementById('floatingMessageContainer');
    if (!container) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('mensaje-flotante', type);
    messageDiv.textContent = message;

    container.appendChild(messageDiv);

    // Fade out y remover
    setTimeout(() => {
        messageDiv.classList.add('fadeOut');
        messageDiv.addEventListener('transitionend', () => messageDiv.remove());
    }, duration);
}

function showError(message, details = '') {
    console.error('Error:', message, details);
    showFloatingMessage(message + (details ? ` (${details})` : ''), 'error', 5000);
}

// Módulo: YouTube Player API
function onYouTubeIframeAPIReady() {
    youtubeAPIReady = true;
    console.log("YouTube Iframe API está listo.");
    // Asegurarse de que los reproductores se inicialicen solo una vez y con los elementos correctos
    if (!playersInitialized) {
        player1 = createPlayer('player1');
        player2 = createPlayer('player2');
        playersInitialized = true;
        console.log("Reproductores player1 y player2 inicializados.");
    }
}

function createPlayer(playerId) {
    console.log(`Intentando crear reproductor para ${playerId}`);
    const playerElement = document.getElementById(playerId);
    if (!playerElement) {
        console.error(`Elemento DOM #${playerId} no encontrado para crear el reproductor.`);
        return null;
    }

    return new YT.Player(playerId, {
        height: '100%',
        width: '100%',
        videoId: '', // No video ID initially
        playerVars: {
            'controls': 0, // Hide default controls
            'autoplay': 0,
            'fs': 0, // Hide fullscreen button
            'modestbranding': 1, // Hide YouTube logo
            'rel': 0, // Don't show related videos
            'showinfo': 0,
            'iv_load_policy': 3, // Disable annotations
            'disablekb': 1, // Disable keyboard controls
            'playsinline': 1 // Enable inline playback on iOS
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log(`Player ${event.target.h.id} está listo.`);
    // Opcional: configurar volumen inicial si es la primera vez
    if (volumeSlider && event.target.getVolume() !== parseInt(volumeSlider.value)) {
        event.target.setVolume(parseInt(volumeSlider.value));
    }
    // Si no hay un video cargado, el botón de play puede estar deshabilitado
    if (event.target.getPlaylist() || event.target.getVideoData().video_id) {
         playButton.disabled = false;
         nextButton.disabled = false;
         prevButton.disabled = false;
    }
}

function onPlayerError(event) {
    console.error(`Error en el reproductor ${event.target.h.id}:`, event.data);
    let errorMessage = "Un error desconocido ocurrió.";
    switch (event.data) {
        case 2:
            errorMessage = "ID de video inválido o el video no existe.";
            break;
        case 5:
            errorMessage = "Error en el reproductor de HTML5.";
            break;
        case 100:
            errorMessage = "Video no encontrado o privado.";
            break;
        case 101:
        case 150:
            errorMessage = "El propietario no permite la reproducción en reproductores incrustados.";
            break;
        default:
            break;
    }
    showError(`Error de reproducción: ${errorMessage}`);
    // Intentar pasar al siguiente video automáticamente
    playNextVideo();
}

/**
 * Carga y reproduce un video en el reproductor apropiado.
 * @param {string} videoId El ID del video de YouTube/Piped.
 * @param {number} startTime El tiempo de inicio en segundos.
 * @param {boolean} [isCrossfade=false] Indica si es parte de una transición crossfade.
 */
function loadVideo(videoId, startTime, isCrossfade = false) {
    if (!playersInitialized || (!player1 && !player2)) {
        showError("Los reproductores de YouTube no están inicializados.");
        return;
    }

    const activePlayerInstance = (currentPlayer === 1) ? player1 : player2;
    const inactivePlayerInstance = (currentPlayer === 1) ? player2 : player1;

    console.log(`LoadVideo: Cargando video ${videoId} en player ${currentPlayer}. Crossfade: ${isCrossfade}`);

    if (activePlayerInstance && typeof activePlayerInstance.loadVideoById === 'function') {
        // Asegúrate de que el reproductor activo esté visible y en el z-index correcto
        const activePlayerElement = document.getElementById(`player${currentPlayer}`);
        activePlayerElement.classList.remove('hidden', 'fade-out');
        activePlayerElement.classList.add('fade-in'); // Asegura que esté visible
        activePlayerElement.style.zIndex = '10'; // Asegura que esté al frente

        // Oculta el otro reproductor si no estamos en crossfade
        if (!isCrossfade) {
            const inactivePlayerElement = document.getElementById(`player${(currentPlayer === 1) ? 2 : 1}`);
            if (inactivePlayerElement) {
                inactivePlayerElement.classList.add('hidden');
                inactivePlayerElement.classList.remove('fade-in', 'fade-out');
                inactivePlayerElement.style.zIndex = '1';
            }
        }

        activePlayerInstance.loadVideoById({
            videoId: videoId,
            startSeconds: startTime,
            suggestedQuality: 'hd720' // Puede ser 'large', 'medium', 'small', 'hd720', 'hd1080'
        });
        activePlayerInstance.playVideo(); // Intentar reproducir inmediatamente
        
        currentPlayingInfo.player = activePlayerInstance; // Actualizar la referencia del reproductor activo

        // Actualizar la duración total del video si es posible
        if (activePlayerInstance.getDuration) {
            totalDurationDisplay.textContent = formatTime(activePlayerInstance.getDuration());
        }
    } else {
        showError("El reproductor activo no está listo para cargar videos. Inténtalo de nuevo.");
        console.error(`Active player (${currentPlayer}) is not ready or loadVideoById is not a function.`);
    }
}


function onPlayerStateChange(event) {
    const playerElementId = event.target.h.id;
    console.log(`Estado del reproductor ${playerElementId} cambió a: ${event.data}`);

    const isCurrentPlayer = (event.target === currentPlayingInfo.player);

    if (event.data === YT.PlayerState.PLAYING) {
        playButton.innerHTML = '<i class="fas fa-pause"></i>';
        startMonitoringProgress();
        showFloatingMessage(`Reproduciendo: ${currentPlayingInfo.title || 'Video desconocido'}`);
        // Solo para el reproductor activo:
        if (isCurrentPlayer) {
            updateVisualPlayingIndicators(currentPlayingInfo.videoId); // Actualiza íconos de play
            handleSponsorBlockSegments(currentPlayingInfo.videoId, event.target.getCurrentTime());
            // Asegurarse de que el player actual esté en el z-index correcto y visible
            document.getElementById(playerElementId).style.zIndex = '10';
            document.getElementById(playerElementId).classList.remove('hidden', 'fade-out');
            document.getElementById(playerElementId).classList.add('fade-in');
        }
    } else if (event.data === YT.PlayerState.PAUSED) {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        stopMonitoringProgress();
    } else if (event.data === YT.PlayerState.ENDED) {
        console.log(`Player ${playerElementId} terminó el video.`);
        stopMonitoringProgress(); // Detener el monitoreo del progreso del video terminado
        if (!isTransitioning && isCurrentPlayer) { // Solo si no estamos en una transición de crossfade y es el reproductor principal
            console.log("Video terminado y no en transición de crossfade. Reproduciendo el siguiente.");
            playNextVideo();
        } else if (isTransitioning && !isCurrentPlayer) {
            // Si el reproductor inactivo (el que terminó) aún está en estado de crossfade, asegúrense de que se oculte
            const inactivePlayerElement = document.getElementById(playerElementId);
            if (inactivePlayerElement && !inactivePlayerElement.classList.contains('hidden')) {
                inactivePlayerElement.classList.add('hidden');
                inactivePlayerElement.classList.remove('fade-in', 'fade-out');
                inactivePlayerElement.style.zIndex = '1';
                console.log(`Reproductor inactivo ${playerElementId} ocultado después de finalizar.`);
            }
        }
    } else if (event.data === YT.PlayerState.BUFFERING) {
        console.log(`Player ${playerElementId} está en buffering.`);
        // Puedes mostrar un indicador de carga si lo deseas
    }
}


// Módulo: Control de Reproducción
let progressUpdateInterval; // Declarar aquí para detenerlo globalmente

function startMonitoringProgress() {
    if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
    }
    progressUpdateInterval = setInterval(() => {
        if (currentPlayingInfo.player && typeof currentPlayingInfo.player.getCurrentTime === 'function') {
            const currentTime = currentPlayingInfo.player.getCurrentTime();
            const duration = currentPlayingInfo.player.getDuration();

            currentTimeDisplay.textContent = formatTime(currentTime);
            totalDurationDisplay.textContent = formatTime(duration);

            if (duration > 0) {
                const progress = (currentTime / duration) * 100;
                progressFill.style.width = `${progress}%`;
                progressHandle.style.left = `${progress}%`;
            }

            // Monitorear segmentos de SponsorBlock
            handleSponsorBlockSegments(currentPlayingInfo.videoId, currentTime);

            // Iniciar crossfade si la duración es la correcta
            if (!isTransitioning && !isAudioFading && duration > 0 && (duration - currentTime <= CROSSFADE_DURATION)) {
                console.log(`Tiempo restante: ${duration - currentTime}. Iniciando crossfade.`);
                startCrossfade();
            }
        }
    }, 1000); // Actualizar cada segundo
}

function stopMonitoringProgress() {
    clearInterval(progressUpdateInterval);
}


async function handleSponsorBlockSegments(videoId, currentTime) {
    if (!videoId) return;

    if (!segmentosCache[videoId]) {
        try {
            const userId = currentUser.uid; // Obtener el userId del usuario autenticado
            const response = await fetch(`/.netlify/functions/sponsorblock?videoId=${videoId}&userId=${userId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const segments = await response.json();
            segmentosCache[videoId] = segments;
            console.log(`Segmentos SB cargados para ${videoId}:`, segments);
        } catch (error) {
            console.error(`Error al cargar segmentos de SponsorBlock para ${videoId}:`, error);
            segmentosCache[videoId] = []; // Cachear como vacío para evitar reintentos
            return;
        }
    }

    const segments = segmentosCache[videoId];
    if (!segments || segments.length === 0) return;

    const player = currentPlayingInfo.player;
    if (!player || typeof player.getCurrentTime !== 'function' || typeof player.seekTo !== 'function') {
        console.warn("Reproductor no disponible para manejar segmentos SB.");
        return;
    }

    // Lógica para saltar segmentos
    for (const segment of segments) {
        const [segmentStart, segmentEnd] = segment.segment;

        // Skip automático de segmentos que no son 'outro'
        if (segment.category !== 'outro' && currentTime >= segmentStart && currentTime < segmentEnd && currentSkipSegment !== segment) {
            console.log(`Saltando segmento de ${segment.category}: ${formatTime(segmentStart)} - ${formatTime(segmentEnd)}`);
            player.seekTo(segmentEnd, true); // seekTo el final del segmento
            currentSkipSegment = segment; // Marcar el segmento como saltado
            return; // Salir después de saltar un segmento
        }
        // Manejo de 'outro' para crossfade
        if (segment.category === 'outro' && !hasOutroCrossfadeStarted && !isTransitioning && currentTime >= (segmentEnd - CROSSFADE_DURATION) && currentTime < segmentEnd) {
            console.log(`Detectado segmento 'outro' en ${videoId}. Iniciando crossfade.`);
            startCrossfade();
            hasOutroCrossfadeStarted = true; // Prevenir múltiples disparos
            return;
        }
    }
    // Resetear currentSkipSegment si ya no estamos dentro de él
    if (currentSkipSegment && (currentTime < currentSkipSegment.segment[0] || currentTime >= currentSkipSegment.segment[1])) {
        currentSkipSegment = null;
    }
    // Resetear hasOutroCrossfadeStarted si el video avanza más allá del segmento outro
    if (hasOutroCrossfadeStarted && player.getCurrentTime() > segments.find(s => s.category === 'outro')?.segment[1]) {
        hasOutroCrossfadeStarted = false;
    }
}


function startCrossfade() {
    if (isTransitioning) {
        console.log("Ya en transición, omitiendo nuevo crossfade.");
        return;
    }

    console.log("Iniciando crossfade...");
    isTransitioning = true; // Set flag
    hasOutroCrossfadeStarted = false; // Reset for next video

    stopMonitoringProgress(); // Detener el monitoreo del progreso del reproductor actual

    const activePlayerInstance = currentPlayingInfo.player;
    const inactivePlayerInstance = (currentPlayer === 1) ? player2 : player1; // El otro reproductor

    const activePlayerElement = document.getElementById(`player${currentPlayer}`);
    const inactivePlayerElement = document.getElementById(`player${(currentPlayer === 1) ? 2 : 1}`);

    // Asegurarse de que el reproductor inactivo sea visible para la transición
    inactivePlayerElement.classList.remove('hidden', 'fade-out');
    inactivePlayerElement.classList.add('fade-in');
    inactivePlayerElement.style.zIndex = '5'; // Por debajo del activo, para que se vea a través

    // Obtener el siguiente video antes de cambiar el currentPlayingInfo
    const nextVideo = getNextVideoInQueue();
    if (!nextVideo) {
        console.log("No hay siguiente video para crossfade. Terminando crossfade.");
        isTransitioning = false;
        playButton.innerHTML = '<i class="fas fa-play"></i>'; // Reset play button
        showFloatingMessage("No hay más videos en la cola.", 'info');
        stopMonitoringProgress();
        // Ocultar el player activo si no hay más videos y no hay crossfade
        activePlayerElement.classList.add('fade-out');
        setTimeout(() => {
            activePlayerElement.classList.add('hidden');
            activePlayerElement.classList.remove('fade-out');
            activePlayerElement.style.zIndex = '1';
        }, CROSSFADE_DURATION * 1000);
        return;
    }

    console.log(`Preparando siguiente video para crossfade: ${nextVideo.title}`);
    const nextVideoId = nextVideo.videoId;
    const nextVideoStartTime = 0; // Siempre empezar el siguiente video desde el principio

    // Cargar el siguiente video en el reproductor inactivo
    inactivePlayerInstance.loadVideoById({
        videoId: nextVideoId,
        startSeconds: nextVideoStartTime,
        suggestedQuality: 'hd720'
    });

    // Iniciar fundido de audio para el reproductor actual
    fadeAudioOut(activePlayerInstance, () => {
        console.log("Audio del reproductor saliente fundido a cero.");
        // Una vez que el audio del reproductor saliente está a 0, pausarlo
        activePlayerInstance.pauseVideo();
        isAudioFading = false;
    });

    // Iniciar el video siguiente en el reproductor inactivo inmediatamente
    inactivePlayerInstance.playVideo();
    console.log(`Siguiente video iniciado en player inactivo (${inactivePlayerInstance.h.id}).`);

    // Actualizar el estado de la reproducción al nuevo video
    currentPlayingInfo.playlistId = nextVideo.playlistId;
    currentPlayingInfo.videoId = nextVideo.videoId;
    currentPlayingInfo.title = nextVideo.title;
    currentPlayingInfo.flattenedIndex = nextVideo.flattenedIndex;

    // Actualizar el reproductor activo después de un pequeño retraso para permitir el inicio del otro.
    // Esto asegura que el `currentPlayingInfo.player` apunte al que ahora está sonando.
    setTimeout(() => {
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
        currentPlayingInfo.player = (currentPlayer === 1) ? player1 : player2;
        console.log(`CurrentPlayer actualizado a: ${currentPlayer}`);

        // Iniciar el fundido de audio para el nuevo reproductor
        fadeAudioIn(currentPlayingInfo.player, () => {
            console.log("Audio del nuevo reproductor fundido a volumen normal.");
            // Cuando el fundido ha terminado, la transición visual también debería estar cerca del final
            // Asegúrate de que el player que termina la transición esté en el frente y el otro oculto
            activePlayerElement.classList.add('fade-out'); // Saliente se desvanece
            activePlayerElement.style.zIndex = '1'; // El saliente se va al fondo

            inactivePlayerElement.classList.remove('fade-out', 'hidden'); // Entrante se asegura de estar visible
            inactivePlayerElement.classList.add('fade-in');
            inactivePlayerElement.style.zIndex = '10'; // El entrante se va al frente

            setTimeout(() => {
                // Asegurar que el player saliente esté completamente oculto después del tiempo de crossfade
                activePlayerElement.classList.add('hidden');
                activePlayerElement.classList.remove('fade-out', 'fade-in'); // Limpiar clases
                console.log(`Player ${activePlayerElement.id} ocultado.`);
            }, CROSSFADE_DURATION * 1000); // Esperar la duración completa del crossfade para ocultar

            isTransitioning = false;
            // Reiniciar monitoreo de progreso para el nuevo reproductor
            startMonitoringProgress();
            updateVisualPlayingIndicators(currentPlayingInfo.videoId);
            updateUpNextList();
        });
    }, 500); // Pequeño retraso para que el otro reproductor se cargue/inicie
}

function fadeAudioOut(player, callback) {
    if (!player || typeof player.setVolume !== 'function' || typeof player.getVolume !== 'function') {
        console.error("Player no válido para fadeAudioOut.");
        if (callback) callback();
        return;
    }
    isAudioFading = true;
    let volume = player.getVolume();
    const fadeStep = volume / (CROSSFADE_DURATION * 10); // Reduce el volumen en 10 pasos por segundo
    const fadeInterval = setInterval(() => {
        volume -= fadeStep;
        if (volume <= 0) {
            player.setVolume(0);
            clearInterval(fadeInterval);
            if (callback) callback();
            console.log("Audio fundido a 0.");
        } else {
            player.setVolume(Math.max(0, volume));
        }
    }, 100); // Cada 100ms
}

function fadeAudioIn(player, callback) {
    if (!player || typeof player.setVolume !== 'function' || typeof player.getVolume !== 'function') {
        console.error("Player no válido para fadeAudioIn.");
        if (callback) callback();
        return;
    }
    isAudioFading = true;
    const targetVolume = parseInt(volumeSlider.value);
    let volume = player.getVolume(); // Empezar desde el volumen actual del player (debería ser 0 si acaba de empezar)
    const fadeStep = targetVolume / (CROSSFADE_DURATION * 10); // Incrementa el volumen en 10 pasos por segundo
    const fadeInterval = setInterval(() => {
        volume += fadeStep;
        if (volume >= targetVolume) {
            player.setVolume(targetVolume);
            clearInterval(fadeInterval);
            if (callback) callback();
            isAudioFading = false;
            console.log("Audio fundido a volumen normal.");
        } else {
            player.setVolume(Math.min(targetVolume, volume));
        }
    }, 100); // Cada 100ms
}


function playPauseVideo() {
    if (!currentPlayingInfo.player) {
        showError("No hay video cargado para reproducir/pausar.");
        return;
    }

    const playerState = currentPlayingInfo.player.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
        currentPlayingInfo.player.pauseVideo();
    } else {
        currentPlayingInfo.player.playVideo();
    }
}

function playNextVideo() {
    if (!currentPlayingInfo.player) {
        showError("No hay video cargado para avanzar.");
        return;
    }

    const flatVideos = getFlattenedVideos();
    const nextIndex = currentPlayingInfo.flattenedIndex + 1;

    if (nextIndex < flatVideos.length) {
        const nextVideo = flatVideos[nextIndex];
        console.log(`Reproduciendo siguiente video: ${nextVideo.title}`);
        
        // Actualizar currentPlayingInfo antes de cargar el video
        currentPlayingInfo.playlistId = nextVideo.playlistId;
        currentPlayingInfo.videoId = nextVideo.videoId;
        currentPlayingInfo.title = nextVideo.title;
        currentPlayingInfo.flattenedIndex = nextIndex;

        loadVideo(nextVideo.videoId, 0); // Siempre empezar desde 0 al avanzar
        updateVisualPlayingIndicators(nextVideo.videoId);
        updateUpNextList(); // Actualizar la lista "Siguiente en la cola"
    } else {
        showFloatingMessage("Fin de la playlist. No hay más videos en la cola.", 'info');
        console.log("Fin de la playlist.");
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        // Opcional: pausar el reproductor y resetear la barra de progreso
        if (currentPlayingInfo.player) {
            currentPlayingInfo.player.stopVideo();
        }
        progressFill.style.width = '0%';
        progressHandle.style.left = '0%';
        currentTimeDisplay.textContent = '0:00';
        totalDurationDisplay.textContent = '0:00';
        // Ocultar el reproductor principal
        document.getElementById(`player${currentPlayer}`).classList.add('hidden');
        document.getElementById(`player${currentPlayer}`).classList.remove('fade-in');
        document.getElementById(`player${currentPlayer}`).style.zIndex = '1';

        currentPlayingInfo.videoId = null; // Reset videoId
        currentPlayingInfo.flattenedIndex = -1; // Reset index
        updateVisualPlayingIndicators(null); // Quita todos los iconos de play
        updateUpNextList(); // Vaciar la lista "Siguiente en la cola"
    }
}

function playPrevVideo() {
    if (!currentPlayingInfo.player) {
        showError("No hay video cargado para retroceder.");
        return;
    }

    const flatVideos = getFlattenedVideos();
    const prevIndex = currentPlayingInfo.flattenedIndex - 1;

    if (prevIndex >= 0) {
        const prevVideo = flatVideos[prevIndex];
        console.log(`Reproduciendo video anterior: ${prevVideo.title}`);
        
        // Actualizar currentPlayingInfo antes de cargar el video
        currentPlayingInfo.playlistId = prevVideo.playlistId;
        currentPlayingInfo.videoId = prevVideo.videoId;
        currentPlayingInfo.title = prevVideo.title;
        currentPlayingInfo.flattenedIndex = prevIndex;

        loadVideo(prevVideo.videoId, 0); // Siempre empezar desde 0 al retroceder
        updateVisualPlayingIndicators(prevVideo.videoId);
        updateUpNextList(); // Actualizar la lista "Siguiente en la cola"
    } else {
        showFloatingMessage("Inicio de la playlist. No hay videos anteriores.", 'info');
        console.log("Inicio de la playlist.");
    }
}

function seekTo(event) {
    if (!currentPlayingInfo.player || typeof currentPlayingInfo.player.getDuration !== 'function') return;

    const progressBarRect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - progressBarRect.left;
    const width = progressBarRect.width;
    const duration = currentPlayingInfo.player.getDuration();
    const seekTime = (clickX / width) * duration;

    currentPlayingInfo.player.seekTo(seekTime, true); // true para permitir que se reproduzca
}

function setVolume() {
    if (player1 && typeof player1.setVolume === 'function') {
        player1.setVolume(volumeSlider.value);
    }
    if (player2 && typeof player2.setVolume === 'function') {
        player2.setVolume(volumeSlider.value);
    }
}

// Módulo: Gestión de Playlists (Firebase)
async function loadAndListenToPlaylists() {
    if (playlistsUnsubscribe) {
        playlistsUnsubscribe(); // Desuscribirse de escuchas anteriores
        console.log('Desuscrito de playlists anteriores.');
    }

    if (!userPlaylistsRef) {
        console.error("userPlaylistsRef no está definido. Firebase no inicializado correctamente.");
        return;
    }

    showLoadingSpinner();
    playlistsUnsubscribe = userPlaylistsRef.orderBy('order', 'asc').onSnapshot(async (snapshot) => {
        console.log('Cambios detectados en las playlists.');
        const fetchedPlaylists = [];
        for (const doc of snapshot.docs) {
            const playlist = doc.data();
            playlist.id = doc.id; // Añadir el ID del documento
            playlist.videos = []; // Inicializar videos como vacío

            // Si es una URL de playlist, cargar sus videos si no están ya en caché o si ha pasado mucho tiempo
            if (playlist.url && playlist.isYoutubePlaylist) {
                try {
                    const videoIds = await fetchPlaylistVideos(playlist.url);
                    // Mapear los IDs a un formato similar al de búsqueda
                    playlist.videos = videoIds.map(vId => ({
                        videoId: vId.videoId,
                        title: vId.title,
                        duration: vId.duration, // Asegúrate de que esto se obtenga en fetchPlaylistVideos
                        thumbnail: vId.thumbnail,
                        playlistId: playlist.id // Asignar el ID de la playlist a cada video
                    }));
                } catch (e) {
                    console.error(`Error al cargar videos para la playlist ${playlist.name} (${playlist.id}):`, e);
                    playlist.videos = []; // Asegurar que sea un array vacío en caso de error
                    showError(`No se pudieron cargar videos para la playlist: ${playlist.name}`, e.message);
                }
            } else if (playlist.videosData) { // Si es una playlist de videos individuales
                playlist.videos = playlist.videosData.map(video => ({
                    videoId: video.videoId,
                    title: video.title,
                    duration: video.duration,
                    thumbnail: video.thumbnail,
                    playlistId: playlist.id // Asignar el ID de la playlist a cada video
                }));
            }
            fetchedPlaylists.push(playlist);
        }
        playlistsData = fetchedPlaylists; // Reemplazar con las playlists actualizadas
        displayPlaylists(); // Volver a renderizar
        updateUpNextList(); // Actualizar la cola si la playlist actual cambió
        hideLoadingSpinner();
    }, (error) => {
        console.error("Error al escuchar cambios en las playlists:", error);
        showError("Error al cargar tus playlists", error.message);
        hideLoadingSpinner();
    });
}


async function addPlaylistFromUrl(url) {
    if (!url) {
        showFloatingMessage("Por favor, introduce una URL de playlist.", "warning");
        return;
    }

    showLoadingSpinner();
    try {
        let playlistId;
        let playlistName;
        let thumbnailUrl;
        let isYoutubePlaylist = false;
        let videosData = [];

        // Validar si es una URL de YouTube Music o YouTube
        const youtubeMusicPlaylistMatch = url.match(/music\.youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/);
        const youtubePlaylistMatch = url.match(/(?:youtube\.com\/(?:playlist\?list=|embed\/videoseries\?list=)|youtu\.be\/playlist\?list=)([a-zA-Z0-9_-]+)/);

        if (youtubeMusicPlaylistMatch || youtubePlaylistMatch) {
            playlistId = youtubeMusicPlaylistMatch ? youtubeMusicPlaylistMatch[1] : youtubePlaylistMatch[1];
            isYoutubePlaylist = true;

            // Para obtener el nombre y la miniatura, se podría usar la API de Piped/YouTube si tuvieras una forma de consultarlo.
            // Por simplicidad, por ahora, usaremos un nombre genérico o requeriremos al usuario que lo añada.
            playlistName = `Playlist Externa (${playlistId.substring(0, 5)}...)`;
            thumbnailUrl = ''; // O se podría intentar cargar una miniatura genérica o de un video de la playlist
            showFloatingMessage(`Se añadió la playlist de YouTube/Piped. Los videos se cargarán al expandirla.`, 'success');
        } else {
            // Asumir que son IDs de videos o una URL que debe ser manejada como video individual
            // Aquí puedes decidir cómo manejar URLs que no son de playlist
            showFloatingMessage("URL no reconocida como playlist de YouTube. Añadiendo como video individual si es un ID válido.", "warning");
            // Para URLs de videos individuales, puedes buscar el video y añadirlo a una nueva playlist "Mis Videos"
            const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
            if (videoIdMatch) {
                const videoId = videoIdMatch[1];
                const videoInfo = await fetchVideoDetails(videoId); // Necesitarás una función para esto
                if (videoInfo) {
                    playlistName = `Video: ${videoInfo.title.substring(0, 30)}...`;
                    thumbnailUrl = videoInfo.thumbnail;
                    videosData.push({
                        videoId: videoInfo.videoId,
                        title: videoInfo.title,
                        duration: videoInfo.duration,
                        thumbnail: videoInfo.thumbnail
                    });
                    isYoutubePlaylist = false; // Esto no es una playlist de YT, es una playlist de un solo video
                    showFloatingMessage(`Video "${videoInfo.title.substring(0, 30)}..." añadido como playlist individual.`, 'success');
                } else {
                    throw new Error("No se pudo obtener información del video con la URL proporcionada.");
                }
            } else {
                throw new Error("URL no válida para playlist o video.");
            }
        }

        const newPlaylistRef = userPlaylistsRef.doc(); // Crear un nuevo documento con ID automático
        await newPlaylistRef.set({
            name: playlistName,
            url: url,
            isYoutubePlaylist: isYoutubePlaylist,
            videosData: videosData.length > 0 ? videosData : null, // Solo guardar si hay videos individuales
            thumbnailUrl: thumbnailUrl,
            order: playlistsData.length, // Para mantener el orden
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        searchInput2.value = ''; // Limpiar el input
    } catch (e) {
        showError("Error al añadir playlist/video", e.message);
        console.error("Error al añadir playlist/video:", e);
    } finally {
        hideLoadingSpinner();
    }
}

// Función auxiliar para obtener detalles de un video individual
async function fetchVideoDetails(videoId) {
    const instanceUrl = getRandomPipedInstance();
    try {
        const response = await fetch(`${instanceUrl}/streams/${videoId}`);
        if (!response.ok) {
            throw new Error(`Error al obtener detalles del video: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            videoId: data.videoId,
            title: data.title,
            duration: data.duration, // Duración en segundos
            thumbnail: data.thumbnailUrl,
        };
    } catch (error) {
        console.error("Error fetching video details from Piped:", error);
        showError("Error al obtener detalles del video.", error.message);
        return null;
    }
}


async function fetchPlaylistVideos(playlistUrl) {
    // Aquí puedes usar la API de Piped para obtener videos de una playlist.
    // Ejemplo de cómo construir la URL para Piped, si tuvieras una función para extraer ID de playlist.
    // Asumiendo que playlistUrl ya tiene el ID de playlist adecuado.
    const playlistIdMatch = playlistUrl.match(/(?:list=|embed\/videoseries\?list=)([a-zA-Z0-9_-]+)/);
    const playlistId = playlistIdMatch ? playlistIdMatch[1] : null;

    if (!playlistId) {
        throw new Error("URL de playlist no válida.");
    }

    const instanceUrl = getRandomPipedInstance();
    const apiUrl = `${instanceUrl}/playlists/${playlistId}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Videos obtenidos de Piped para playlist ${playlistId}:`, data.relatedStreams.length);
        return data.relatedStreams.map(item => ({
            videoId: item.url.split('v=')[1] || item.url.split('/').pop(), // Asegurar que sea el ID de video
            title: item.title,
            duration: item.duration, // Duración en segundos
            thumbnail: item.thumbnail,
            // Aquí puedes añadir más datos si los necesitas, como el ID de la playlist padre si fuera una sub-playlist
        }));
    } catch (error) {
        console.error(`Error al obtener videos de la playlist ${playlistId} de Piped:`, error);
        throw error;
    }
}

function displayPlaylists() {
    playlistContainer.innerHTML = '';
    playlistsData.forEach(playlist => {
        const playlistGroup = document.createElement('div');
        playlistGroup.classList.add('playlist-group');
        playlistGroup.dataset.playlistId = playlist.id;

        const header = document.createElement('div');
        header.classList.add('playlist-group-header');
        header.innerHTML = `
            <img src="${playlist.thumbnailUrl || './img/default-playlist.jpg'}" alt="Playlist Thumbnail" class="playlist-group-thumb">
            <span class="playlist-group-name">${playlist.name}</span>
            <i class="fas fa-chevron-down expand-icon"></i>
            <div class="playlist-options-menu delete-menu" data-playlist-id="${playlist.id}">
                <button class="delete-menu-button"><i class="fas fa-ellipsis-v"></i></button>
                <div class="delete-menu-content">
                    <button class="play-playlist-button" data-playlist-id="${playlist.id}"><i class="fas fa-play"></i> Reproducir</button>
                    <button class="delete-playlist-button" data-playlist-id="${playlist.id}"><i class="fas fa-trash"></i> Eliminar</button>
                </div>
            </div>
        `;
        playlistGroup.appendChild(header);

        const videosContainer = document.createElement('div');
        videosContainer.classList.add('playlist-group-videos');
        playlistGroup.appendChild(videosContainer);

        header.addEventListener('click', (e) => {
            // Evitar que el clic en los botones del menú de opciones propague y expanda/colapse la playlist
            if (e.target.closest('.delete-menu-button') || e.target.closest('.delete-menu-content button')) {
                return;
            }
            playlistGroup.classList.toggle('expanded');
            if (playlistGroup.classList.contains('expanded')) {
                // Si expandido, cargar videos si no están ya cargados y actualizar scrollHeight
                renderPlaylistVideos(playlist.id, videosContainer);
            } else {
                videosContainer.style.maxHeight = '0';
            }
        });

        // Event listeners para los botones de las opciones del menú
        header.querySelector('.play-playlist-button').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevenir que expanda/colapse la playlist
            const id = e.target.dataset.playlistId;
            const targetPlaylist = playlistsData.find(p => p.id === id);
            if (targetPlaylist && targetPlaylist.videos && targetPlaylist.videos.length > 0) {
                // Establecer el primer video de la playlist como el actual y reproducir
                const firstVideo = {
                    ...targetPlaylist.videos[0],
                    playlistId: id, // Asegurar que el video tenga la ID de la playlist
                    flattenedIndex: targetPlaylist.videos[0].flattenedIndex // Asegurar el índice plano
                };
                setCurrentPlayingVideo(firstVideo);
                loadVideo(firstVideo.videoId, 0);
            } else {
                showFloatingMessage('Esta playlist no tiene videos para reproducir.', 'warning');
            }
            closeAllContextMenus();
        });

        header.querySelector('.delete-playlist-button').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevenir que expanda/colapse la playlist
            const idToDelete = e.target.dataset.playlistId;
            showConfirmDialog('¿Estás seguro de que quieres eliminar esta playlist?', () => {
                deletePlaylist(idToDelete);
                closeAllContextMenus();
            });
        });

        playlistContainer.appendChild(playlistGroup);
    });
    updateVisualPlayingIndicators(currentPlayingInfo.videoId);
}

function renderPlaylistVideos(playlistId, containerElement) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist || !playlist.videos) {
        containerElement.innerHTML = `<p class="no-videos-message">No hay videos en esta playlist.</p>`;
        containerElement.style.maxHeight = containerElement.scrollHeight + 'px';
        return;
    }

    containerElement.innerHTML = ''; // Limpiar antes de renderizar
    playlist.videos.forEach((video, index) => {
        const videoElement = document.createElement('div');
        videoElement.classList.add('playlist-item');
        videoElement.dataset.videoId = video.videoId;
        videoElement.dataset.playlistId = playlist.id;
        videoElement.dataset.flattenedIndex = getFlattenedVideos().findIndex(v => v.videoId === video.videoId && v.playlistId === playlist.id);


        videoElement.innerHTML = `
            <div class="image-container">
                <img src="${video.thumbnail}" alt="Video Thumbnail" class="playlist-thumbnail">
                <span class="playing-icon hidden"><i class="fas fa-play"></i></span>
            </div>
            <div class="text-container">
                <h4 class="item-title">${video.title}</h4>
                <span class="duration">${formatTime(video.duration)}</span>
            </div>
            <div class="playlist-options-menu delete-menu">
                <button class="delete-menu-button"><i class="fas fa-ellipsis-v"></i></button>
                <div class="delete-menu-content">
                    <button class="play-video-button" data-video-id="${video.videoId}" data-playlist-id="${playlist.id}" data-flattened-index="${videoElement.dataset.flattenedIndex}"><i class="fas fa-play"></i> Reproducir ahora</button>
                    <button class="add-to-other-playlist-button" data-video-id="${video.videoId}" data-video-title="${video.title}" data-video-duration="${video.duration}" data-video-thumbnail="${video.thumbnail}"><i class="fas fa-plus"></i> Añadir a otra playlist</button>
                    <button class="move-video-button" data-video-id="${video.videoId}" data-current-playlist-id="${playlist.id}"><i class="fas fa-arrows-alt"></i> Mover a playlist</button>
                    <button class="remove-video-button" data-video-id="${video.videoId}" data-playlist-id="${playlist.id}"><i class="fas fa-trash"></i> Quitar de esta playlist</button>
                </div>
            </div>
        `;
        videoElement.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-menu-button') && !e.target.closest('.delete-menu-content')) {
                const clickedVideoId = videoElement.dataset.videoId;
                const clickedPlaylistId = videoElement.dataset.playlistId;
                const clickedFlattenedIndex = parseInt(videoElement.dataset.flattenedIndex);
                
                const videoData = getFlattenedVideos().find(v => 
                    v.videoId === clickedVideoId && 
                    v.playlistId === clickedPlaylistId && 
                    v.flattenedIndex === clickedFlattenedIndex
                );

                if (videoData) {
                    setCurrentPlayingVideo(videoData);
                    loadVideo(videoData.videoId, 0);
                }
            }
        });

        // Add event listeners for new buttons
        videoElement.querySelector('.play-video-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = e.target.dataset.videoId;
            const playlistId = e.target.dataset.playlistId;
            const flattenedIndex = parseInt(e.target.dataset.flattenedIndex);
            const videoData = getFlattenedVideos().find(v => v.videoId === videoId && v.playlistId === playlistId && v.flattenedIndex === flattenedIndex);
            if (videoData) {
                setCurrentPlayingVideo(videoData);
                loadVideo(videoId, 0);
            }
            closeAllContextMenus();
        });

        videoElement.querySelector('.add-to-other-playlist-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const videoData = {
                videoId: e.target.dataset.videoId,
                title: e.target.dataset.videoTitle,
                duration: parseFloat(e.target.dataset.videoDuration),
                thumbnail: e.target.dataset.videoThumbnail
            };
            showAddToPlaylistPopup(videoData);
            closeAllContextMenus();
        });

        videoElement.querySelector('.move-video-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = e.target.dataset.videoId;
            const currentPlaylistId = e.target.dataset.currentPlaylistId;
            const videoData = playlist.videos.find(v => v.videoId === videoId); // Get full video data from current playlist
            if (videoData) {
                showMoveToPlaylistPopup(videoData, currentPlaylistId);
            }
            closeAllContextMenus();
        });

        videoElement.querySelector('.remove-video-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = e.target.dataset.videoId;
            const targetPlaylistId = e.target.dataset.playlistId;
            showConfirmDialog('¿Estás seguro de que quieres quitar este video de la playlist?', () => {
                removeVideoFromPlaylist(videoId, targetPlaylistId);
                closeAllContextMenus();
            });
        });

        containerElement.appendChild(videoElement);
    });

    // Asegurar que el contenedor se expanda para mostrar todo el contenido
    // setTimeout necesario para que el DOM se haya renderizado y scrollHeight sea correcto
    setTimeout(() => {
        containerElement.style.maxHeight = containerElement.scrollHeight + 'px';
    }, 0);
    updateVisualPlayingIndicators(currentPlayingInfo.videoId);
}


async function deletePlaylist(playlistId) {
    showLoadingSpinner();
    try {
        await userPlaylistsRef.doc(playlistId).delete();
        showFloatingMessage("Playlist eliminada.", "success");
        // La actualización de playlistsData y displayPlaylists se manejará por el onSnapshot
    } catch (e) {
        showError("Error al eliminar playlist", e.message);
        console.error("Error al eliminar playlist:", e);
    } finally {
        hideLoadingSpinner();
    }
}

async function addVideoToPlaylist(video, playlistId) {
    showLoadingSpinner();
    try {
        const playlistRef = userPlaylistsRef.doc(playlistId);
        const doc = await playlistRef.get();

        if (doc.exists) {
            const playlistData = doc.data();
            const videosData = playlistData.videosData || [];

            // Evitar duplicados
            if (!videosData.some(v => v.videoId === video.videoId)) {
                videosData.push(video);
                await playlistRef.update({ videosData: videosData });
                showFloatingMessage(`"${video.title.substring(0, 20)}..." añadido a la playlist.`, "success");
            } else {
                showFloatingMessage(`"${video.title.substring(0, 20)}..." ya está en esta playlist.`, "warning");
            }
        } else {
            showError("Playlist no encontrada.", "La playlist a la que intentas añadir el video no existe.");
        }
    } catch (e) {
        showError("Error al añadir video a playlist", e.message);
        console.error("Error al añadir video a playlist:", e);
    } finally {
        hideLoadingSpinner();
    }
}

async function removeVideoFromPlaylist(videoId, playlistId) {
    showLoadingSpinner();
    try {
        const playlistRef = userPlaylistsRef.doc(playlistId);
        const doc = await playlistRef.get();

        if (doc.exists) {
            const playlistData = doc.data();
            let videosData = playlistData.videosData || [];

            videosData = videosData.filter(video => video.videoId !== videoId);

            await playlistRef.update({ videosData: videosData });
            showFloatingMessage("Video eliminado de la playlist.", "success");
        } else {
            showError("Playlist no encontrada.", "La playlist de la que intentas eliminar el video no existe.");
        }
    } catch (e) {
        showError("Error al eliminar video de playlist", e.message);
        console.error("Error al eliminar video de playlist:", e);
    } finally {
        hideLoadingSpinner();
    }
}

async function moveVideoToPlaylist(video, currentPlaylistId, targetPlaylistId) {
    if (currentPlaylistId === targetPlaylistId) {
        showFloatingMessage("El video ya está en esta playlist.", "info");
        return;
    }

    showLoadingSpinner();
    try {
        // 1. Añadir el video a la playlist de destino
        await addVideoToPlaylist(video, targetPlaylistId);

        // 2. Eliminar el video de la playlist de origen
        await removeVideoFromPlaylist(video.videoId, currentPlaylistId);

        showFloatingMessage(`Video movido exitosamente.`, "success");
    } catch (e) {
        showError("Error al mover video entre playlists", e.message);
        console.error("Error al mover video entre playlists:", e);
    } finally {
        hideLoadingSpinner();
    }
}

function updateUpNextList() {
    upNextList.innerHTML = '';
    const messageElement = upNextList.closest('.up-next-section').querySelector('.no-videos-message');

    if (!currentPlayingInfo.playlistId || currentPlayingInfo.flattenedIndex === -1) {
        messageElement.classList.remove('hidden');
        return;
    }

    const flattenedVideos = getFlattenedVideos();
    const startIndex = currentPlayingInfo.flattenedIndex + 1;
    const videosToShow = flattenedVideos.slice(startIndex, startIndex + 5); // Mostrar los próximos 5 videos

    if (videosToShow.length === 0) {
        messageElement.classList.remove('hidden');
        return;
    }

    messageElement.classList.add('hidden'); // Ocultar el mensaje si hay videos
    videosToShow.forEach(video => {
        const item = document.createElement('div');
        item.classList.add('up-next-item');
        item.innerHTML = `
            <img src="${video.thumbnail}" alt="Thumbnail" />
            <div class="up-next-item-details">
                <p class="title">${video.title}</p>
                <span class="duration">${formatTime(video.duration)}</span>
            </div>
        `;
        upNextList.appendChild(item);
    });
}


// Funciones auxiliares para la lógica de playlists y reproducción
/**
 * Aplana todas las playlists en un solo array de videos para facilitar la navegación secuencial.
 * Asigna un `flattenedIndex` y `playlistId` a cada video.
 * @returns {Array} Un array de todos los videos de todas las playlists.
 */
function getFlattenedVideos() {
    let flattened = [];
    let currentIndex = 0;
    playlistsData.forEach(playlist => {
        if (playlist.videos) {
            playlist.videos.forEach(video => {
                flattened.push({
                    ...video,
                    playlistId: playlist.id,
                    flattenedIndex: currentIndex
                });
                currentIndex++;
            });
        }
    });
    return flattened;
}

/**
 * Establece la información del video que se está reproduciendo actualmente.
 * @param {object} video - El objeto video que incluye videoId, title, duration, playlistId, flattenedIndex.
 */
function setCurrentPlayingVideo(video) {
    currentPlayingInfo.videoId = video.videoId;
    currentPlayingInfo.title = video.title;
    currentPlayingInfo.duration = video.duration;
    currentPlayingInfo.playlistId = video.playlistId;
    currentPlayingInfo.flattenedIndex = video.flattenedIndex; // Asegúrate de que este índice se calcule correctamente al aplanar
    console.log("Current playing info set:", currentPlayingInfo);
}

// Módulo: Búsqueda
async function searchPipedVideos(query, nextPageContext = null) {
    if (isLoadingMore) return; // Evitar llamadas duplicadas
    isLoadingMore = true;
    showLoadingSpinner();
    resultsDiv.innerHTML = ''; // Limpiar resultados anteriores en una nueva búsqueda

    let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
    if (nextPageContext) {
        apiUrl += `&nextpage=${encodeURIComponent(JSON.stringify(nextPageContext))}`;
    }

    console.log("Fetching search results from:", apiUrl); // Log de la URL
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Search results received:", data); // Log de los resultados

        // `nextPageContext` es lo que la API de Piped devuelve para la paginación.
        // Asegúrate de que tu función Netlify lo devuelva correctamente.
        window.nextPageContext = data.nextPage; // Almacena el contexto para la próxima carga
        
        displaySearchResults(data.items);
    } catch (e) {
        showError("Error al buscar videos", e.message);
        console.error("Error al buscar videos:", e);
        resultsDiv.innerHTML = `<p class="error-message">Error al cargar resultados de búsqueda: ${e.message}</p>`;
    } finally {
        hideLoadingSpinner();
        isLoadingMore = false;
    }
}

function displaySearchResults(items) {
    if (!items || items.length === 0) {
        resultsDiv.innerHTML = '<p class="no-videos-message">No se encontraron resultados para tu búsqueda.</p>';
        return;
    }

    resultsDiv.innerHTML = ''; // Clear previous results
    items.forEach(item => {
        // Filtrar solo videos (Piped también puede devolver otros tipos de ítems)
        if (item.type === 'video') {
            const template = document.getElementById('search-result-template');
            const clone = document.importNode(template.content, true);

            const videoElement = clone.querySelector('.search-result-item');
            const thumbnailImg = clone.querySelector('.result-thumbnail');
            const durationSpan = clone.querySelector('.duration');
            const titleH3 = clone.querySelector('.result-title');
            const addButton = clone.querySelector('.add-to-playlist');

            thumbnailImg.src = item.thumbnail;
            thumbnailImg.alt = item.title;
            durationSpan.textContent = formatTime(item.duration);
            titleH3.textContent = item.title;

            addButton.addEventListener('click', () => {
                showAddToPlaylistPopup({
                    videoId: item.url.split('v=')[1] || item.url.split('/').pop(), // Extraer ID del video
                    title: item.title,
                    duration: item.duration,
                    thumbnail: item.thumbnail
                });
            });

            videoElement.addEventListener('click', (e) => {
                // Prevenir que el clic en el botón de añadir active la reproducción
                if (e.target.closest('.add-to-playlist')) {
                    return;
                }
                const videoId = item.url.split('v=')[1] || item.url.split('/').pop();
                setCurrentPlayingVideo({
                    videoId: videoId,
                    title: item.title,
                    duration: item.duration,
                    thumbnail: item.thumbnail,
                    playlistId: null, // No asociado a una playlist específica al reproducir desde búsqueda
                    flattenedIndex: -1 // No tiene índice plano
                });
                loadVideo(videoId, 0);
            });
            resultsDiv.appendChild(clone);
        }
    });
}

// Módulo: Popups y Menús Contextuales
function showAddToPlaylistPopup(video) {
    closePlaylistSelectionPopups(); // Cierra cualquier popup existente

    const popup = document.createElement('div');
    popup.classList.add('playlist-selection-popup-menu');
    popup.innerHTML = `
        <h3>Añadir "${video.title.substring(0, 25)}..." a:</h3>
        <ul class="playlist-selection-list">
            ${playlistsData.map(p => `
                <li data-playlist-id="${p.id}">${p.name}</li>
            `).join('')}
            <li data-new-playlist="true">+ Crear nueva playlist</li>
        </ul>
        <button class="close-popup-button"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(popup);

    // Posicionar popup cerca del searchInput2 o en el centro
    const inputRect = searchInput2.getBoundingClientRect();
    popup.style.top = `${inputRect.bottom + 10}px`;
    popup.style.left = `${inputRect.left}px`;

    // Cerrar el popup
    popup.querySelector('.close-popup-button').addEventListener('click', () => {
        popup.remove();
    });

    // Manejar la selección de playlist
    popup.querySelectorAll('.playlist-selection-list li').forEach(item => {
        item.addEventListener('click', async () => {
            if (item.dataset.newPlaylist) {
                const newPlaylistName = prompt("Introduce el nombre de la nueva playlist:");
                if (newPlaylistName) {
                    showLoadingSpinner();
                    try {
                        const newPlaylistRef = userPlaylistsRef.doc();
                        await newPlaylistRef.set({
                            name: newPlaylistName,
                            isYoutubePlaylist: false, // Nueva playlist de videos individuales
                            videosData: [video], // Añadir el video directamente
                            thumbnailUrl: video.thumbnail, // Usar la miniatura del primer video
                            order: playlistsData.length,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        showFloatingMessage(`Playlist "${newPlaylistName}" creada y video añadido.`, "success");
                    } catch (e) {
                        showError("Error al crear nueva playlist", e.message);
                        console.error("Error al crear nueva playlist:", e);
                    } finally {
                        hideLoadingSpinner();
                    }
                }
            } else {
                const playlistId = item.dataset.playlistId;
                await addVideoToPlaylist(video, playlistId);
            }
            popup.remove();
        });
    });
}


function showMoveToPlaylistPopup(video, currentPlaylistId) {
    closePlaylistSelectionPopups(); // Cierra cualquier popup existente

    const popup = document.createElement('div');
    popup.classList.add('playlist-selection-popup-menu'); // Reutilizar clase
    popup.innerHTML = `
        <h3>Mover "${video.title.substring(0, 25)}..." a:</h3>
        <ul class="playlist-selection-list">
            ${playlistsData.filter(p => p.id !== currentPlaylistId).map(p => `
                <li data-playlist-id="${p.id}">${p.name}</li>
            `).join('')}
            <li data-new-playlist="true">+ Crear nueva playlist y mover</li>
        </ul>
        <button class="close-popup-button"><i class="fas fa-times"></i></button>
    `;

    document.body.appendChild(popup);

    // Posicionar popup (ejemplo, ajustar según necesidad)
    const inputRect = searchInput2.getBoundingClientRect();
    popup.style.top = `${inputRect.bottom + 10}px`;
    popup.style.left = `${inputRect.left}px`;


    popup.querySelector('.close-popup-button').addEventListener('click', () => {
        popup.remove();
    });

    popup.querySelectorAll('.playlist-selection-list li').forEach(item => {
        item.addEventListener('click', async () => {
            if (item.dataset.newPlaylist) {
                const newPlaylistName = prompt("Introduce el nombre de la nueva playlist:");
                if (newPlaylistName) {
                    showLoadingSpinner();
                    try {
                        const newPlaylistRef = userPlaylistsRef.doc();
                        await newPlaylistRef.set({
                            name: newPlaylistName,
                            isYoutubePlaylist: false,
                            videosData: [video],
                            thumbnailUrl: video.thumbnail,
                            order: playlistsData.length,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        showFloatingMessage(`Video movido a la nueva playlist "${newPlaylistName}".`, "success");
                        // Eliminar de la playlist actual después de añadir a la nueva
                        await removeVideoFromPlaylist(video.videoId, currentPlaylistId);
                    } catch (e) {
                        showError("Error al crear nueva playlist y mover video", e.message);
                        console.error("Error al crear nueva playlist y mover video:", e);
                    } finally {
                        hideLoadingSpinner();
                    }
                }
            } else {
                const targetPlaylistId = item.dataset.playlistId;
                await moveVideoToPlaylist(video, currentPlaylistId, targetPlaylistId);
            }
            popup.remove();
        });
    });
}


function closeAllContextMenus() {
    document.querySelectorAll('.delete-menu-content').forEach(menu => {
        menu.style.display = 'none';
    });
}

function closePlaylistSelectionPopups() {
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(popup => {
        popup.remove();
    });
}

function showConfirmDialog(message, onConfirm) {
    showFloatingMessage(message, 'warning', 0); // Duración 0 para que no se oculte automáticamente

    const confirmMessageDiv = document.querySelector('.mensaje-flotante.warning');
    if (!confirmMessageDiv) return;

    const buttonsHtml = `
        <div class="message-buttons">
            <button id="confirmYes">Sí</button>
            <button id="confirmNo">No</button>
        </div>
    `;
    confirmMessageDiv.insertAdjacentHTML('beforeend', buttonsHtml);

    const confirmYesBtn = confirmMessageDiv.querySelector('#confirmYes');
    const confirmNoBtn = confirmMessageDiv.querySelector('#confirmNo');

    confirmYesBtn.addEventListener('click', () => {
        onConfirm();
        confirmMessageDiv.remove();
    });
    confirmNoBtn.addEventListener('click', () => {
        confirmMessageDiv.remove();
    });
}


// Módulo: UI Indicators
function updateVisualPlayingIndicators(playingVideoId) {
    // Eliminar la clase 'playing' y el icono de todos los videos de la playlist
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('playing');
        const icon = item.querySelector('.playing-icon');
        if (icon) icon.classList.add('hidden');
    });

    // Eliminar la clase 'playing' de todos los grupos de playlist
    document.querySelectorAll('.playlist-group').forEach(group => {
        group.classList.remove('playing');
    });

    if (playingVideoId) {
        // Encontrar el video que está sonando y añadir la clase 'playing'
        const playingVideoElement = document.querySelector(`.playlist-item[data-video-id="${playingVideoId}"][data-playlist-id="${currentPlayingInfo.playlistId}"]`);
        if (playingVideoElement) {
            playingVideoElement.classList.add('playing');
            const icon = playingVideoElement.querySelector('.playing-icon');
            if (icon) icon.classList.remove('hidden');

            // También marcar el grupo de playlist como 'playing'
            const parentPlaylistGroup = playingVideoElement.closest('.playlist-group');
            if (parentPlaylistGroup) {
                parentPlaylistGroup.classList.add('playing');
                // Asegurarse de que la playlist esté expandida para que se vea el video
                if (!parentPlaylistGroup.classList.contains('expanded')) {
                    parentPlaylistGroup.classList.add('expanded');
                    const videosContainer = parentPlaylistGroup.querySelector('.playlist-group-videos');
                    if (videosContainer) {
                        // Re-renderizar para asegurar que los videos estén cargados y el scrollHeight sea correcto
                        renderPlaylistVideos(parentPlaylistGroup.dataset.playlistId, videosContainer);
                        // Hacer scroll hacia el elemento
                        setTimeout(() => {
                            playingVideoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }, 300); // Pequeño retraso para la expansión
                    }
                } else {
                    // Si ya está expandido, solo hacer scroll
                    playingVideoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }
}


// Módulo: Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Carga la API de YouTube Iframe.
    // window.onYouTubeIframeAPIReady se llamará automáticamente cuando cargue.
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Event listeners para botones del reproductor
    playButton.addEventListener('click', playPauseVideo);
    nextButton.addEventListener('click', playNextVideo);
    prevButton.addEventListener('click', playPrevVideo);

    // Event listener para la barra de progreso
    progressBar.addEventListener('click', seekTo);
    // Para arrastrar el handle
    let isDragging = false;
    progressHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.classList.add('no-select'); // Evitar selección de texto al arrastrar
    });
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const progressBarRect = progressBar.getBoundingClientRect();
            let newX = e.clientX - progressBarRect.left;
            if (newX < 0) newX = 0;
            if (newX > progressBarRect.width) newX = progressBarRect.width;
            
            const progress = (newX / progressBarRect.width);
            const duration = currentPlayingInfo.player.getDuration();
            const seekTime = progress * duration;

            progressFill.style.width = `${progress * 100}%`;
            progressHandle.style.left = `${progress * 100}%`;
            currentTimeDisplay.textContent = formatTime(seekTime);
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            document.body.classList.remove('no-select');
            const progressBarRect = progressBar.getBoundingClientRect();
            let newX = e.clientX - progressBarRect.left;
            if (newX < 0) newX = 0;
            if (newX > progressBarRect.width) newX = progressBarRect.width;

            const progress = (newX / progressBarRect.width);
            const duration = currentPlayingInfo.player.getDuration();
            const seekTime = progress * duration;
            
            currentPlayingInfo.player.seekTo(seekTime, true);
        }
    });

    // Event listener para el slider de volumen
    volumeSlider.addEventListener('input', setVolume);

    // Event listener para el input de búsqueda principal (en el header)
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentSearchQuery = searchInput.value.trim(); // Guardar la consulta
            if (currentSearchQuery) {
                searchPipedVideos(currentSearchQuery);
            } else {
                showFloatingMessage("Por favor, introduce un término de búsqueda.", "warning");
            }
        }
    });

    // Event listener para el input de añadir URL de playlist (en la sidebar)
    searchInput2.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addPlaylistFromUrl(searchInput2.value.trim());
        }
    });
    addButton.addEventListener('click', () => {
        addPlaylistFromUrl(searchInput2.value.trim());
    });

    // Event listener para scroll infinito en resultados de búsqueda
    resultsContainer.addEventListener('scroll', () => {
        if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 100 && !isLoadingMore && window.nextPageContext) {
            console.log("Cargando más resultados...");
            searchPipedVideos(currentSearchQuery, window.nextPageContext);
        }
    });
});

// Cerrar menús contextuales y popups al hacer clic fuera
document.addEventListener('click', (event) => {
    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
    // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
    if (!event.target.closest('.playlist-selection-popup-menu')) {
        closePlaylistSelectionPopups();
    }
}, true); // Keep using the capture phase for better reliability

