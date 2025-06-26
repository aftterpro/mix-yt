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

// --- VARIABLES GLOBALES PARA DATOS ---
// Playlists del usuario logueado (directamente de YouTube, no de Firebase)
let userYouTubePlaylists = [];
let currentPlayingInfo = { // Para rastrear qué video/playlist está sonando
    playlistId: null,
    videoId: null,
    flattenedIndex: -1, // Índice en la lista aplanada para reproducción
    player: null, // Referencia al objeto YT.Player actualmente activo
    title: null // Título del video actual
};

// Variables para Búsqueda y Scroll Infinito
let isLoadingMore = false; // Flag para evitar cargas múltiples simultáneas
let nextPageContext = null; // Para guardar información de la siguiente página (si la API la provee)
let currentSearchQuery = ''; // Guarda la última consulta realizada
const resultsContainer = document.getElementById('resultsContainer'); // Contenedor scrollable
const resultsDiv = document.getElementById('results'); // Contenedor de la grilla

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para almacenar en caché los segmentos de SponsorBlock por videoId
let ignoreSeek = false; // Para evitar bucles infinitos con SponsorBlock
const SPONSORBLOCK_API_URL = '/.netlify/functions/sponsorblock'; // Endpoint de tu Netlify Function para SponsorBlock

// --- CONFIGURACIÓN DE GOOGLE IDENTITY SERVICES (GIS) Y GAPI ---
// REEMPLAZA ESTO CON TU PROPIO CLIENT ID DE GOOGLE CLOUD
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE'; 
const GOOGLE_YOUTUBE_API_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile';

let googleAccessToken = null; // Almacena el token de acceso de Google para las llamadas a la API de YouTube

// === SELECTORES DE ELEMENTOS DOM ===
const searchInput = document.getElementById('searchInput'); // Input de búsqueda principal
const searchInput2 = document.getElementById('searchInput2'); // Input de "Añadir Link Playlist" (ahora deshabilitado para guardado)
const añadirUrlButton = document.getElementById('añadirUrlButton'); // Botón "Añadir a la playlist" (ahora deshabilitado para guardado)

// Selectores de los botones de Google Sign-In
const googleSignInButton = document.getElementById('googleSignInButton'); // El div donde GIS renderiza el botón
const googleSignOutButton = document.getElementById('googleSignOutButton');

// Selectores para el reproductor y controles
const player1Div = document.getElementById('player1');
const player2Div = document.getElementById('player2');
const botonPlay = document.getElementById('botonPlay');
const botonPrev = document.getElementById('botonPrev');
const botonNext = document.getElementById('botonNext');
const volumeSlider = document.getElementById('volumeSlider');
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const totalDurationDisplay = document.getElementById('totalDurationDisplay');
const upNextList = document.getElementById('upNextList');

// Controles del reproductor (botones nuevos)
const muteButton = document.getElementById('muteButton');
const shuffleButton = document.getElementById('shuffleButton');
const loopButton = document.getElementById('loopButton');
const skipIntroButton = document.getElementById('skipIntroButton');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');

// Contenedores de playlists del usuario
const userPlaylistsSection = document.getElementById('user-playlists-section');
const userPlaylistsContainer = document.getElementById('user-playlists-container');

// Selectores para los templates HTML
const searchResultTemplate = document.getElementById('search-result-template');
const playlistVideoTemplate = document.getElementById('playlist-video-template');
const userPlaylistCardTemplate = document.getElementById('user-playlist-card-template');


// Mapeo de errores de YouTube API
const YT_ERROR_MESSAGES = {
    2: 'La solicitud contiene un valor de parámetro no válido. Por ejemplo, especifica un ID de video que no tiene 11 caracteres o que contiene caracteres no válidos, como un signo de exclamación o un asterisco.',
    5: 'La acción solicitada solo se puede realizar en un reproductor HTML5.',
    100: 'El video solicitado no se encontró. Esto ocurre cuando un video se ha eliminado (por cualquier motivo) o se ha marcado como privado.',
    101: 'El propietario del video no permite que se reproduzca en reproductores incrustados.',
    150: 'El propietario del video no permite que se reproduzca en reproductores incrustados.'
};

// ===============================
// === GOOGLE IDENTITY SERVICES (GIS) INTEGRATION ===
// ===============================

// Función de callback llamada por Google Sign-In después de la autenticación
function handleAuthResponse(response) {
    console.log("Google Auth Response:", response);
    // Este `response.credential` es un ID token JWT. No es el token de acceso para la API de YouTube.
    // Necesitamos usar `initTokenClient` para obtener un token de acceso.
    showFloatingMessage('¡Inicio de sesión exitoso! Obteniendo permisos para YouTube...', 'info');
    acquireAccessToken(); // Pide el token de acceso
}
window.handleAuthResponse = handleAuthResponse; // Hacer global para que GIS lo pueda llamar

let tokenClient; // Cliente para adquirir tokens de acceso

// Inicializa el cliente de token para obtener tokens de acceso para las APIs de Google
function initTokenClient() {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_YOUTUBE_API_SCOPES,
        callback: (tokenResponse) => {
            console.log("Access Token Response:", tokenResponse);
            if (tokenResponse && tokenResponse.access_token) {
                googleAccessToken = tokenResponse.access_token;
                // Configura el cliente gapi con el token de acceso
                gapi.client.setToken({ access_token: googleAccessToken });
                console.log('Access token obtenido y gapi.client configurado.');
                showFloatingMessage('Permisos de YouTube concedidos.', 'success');
                // Ahora puedes cargar la API de YouTube y las playlists del usuario
                loadYouTubeClientAndPlaylists();
                updateSignInUI(true); // Actualiza la UI a estado logueado
            } else {
                console.error('No se pudo obtener el token de acceso.');
                showFloatingMessage('No se pudieron obtener los permisos de YouTube.', 'error');
                updateSignInUI(false); // Actualiza la UI a estado no logueado
            }
        },
    });
}


// Función para iniciar el flujo de autenticación y obtener el token de acceso
function acquireAccessToken() {
    if (!tokenClient) {
        console.error('Token client no inicializado.');
        showFloatingMessage('Error: Cliente de Google no listo. Intenta recargar.', 'error');
        return;
    }
    // `prompt: 'consent'` fuerza al usuario a ver la pantalla de consentimiento, útil para la primera vez
    // o si el scope ha cambiado. Para usos posteriores, puedes quitarlo o usar `none` si no quieres popup.
    tokenClient.requestAccessToken({ prompt: 'consent' }); 
}

// Función para cargar la API de YouTube Data v3 después de tener el token de acceso
async function loadYouTubeClientAndPlaylists() {
    try {
        if (!gapi.client.youtube) {
            await gapi.client.load('youtube', 'v3');
            console.log('YouTube Data API v3 cargada en gapi.client.');
        }
        // Una vez que la API está cargada y tenemos el token, podemos cargar las playlists
        loadUserPlaylists();
    } catch (error) {
        console.error('Error al cargar la API de YouTube Data v3:', error);
        showFloatingMessage('Error al cargar la API de YouTube.', 'error');
    }
}

// Actualiza la UI de los botones de inicio/cierre de sesión
function updateSignInUI(isSignedIn) {
    if (isSignedIn) {
        googleSignInButton.classList.add('hidden');
        googleSignOutButton.classList.remove('hidden');
        userPlaylistsSection.classList.remove('hidden'); // Mostrar sección de playlists de usuario
        userPlaylistsContainer.innerHTML = ''; // Limpiar mensaje inicial
    } else {
        googleSignInButton.classList.remove('hidden');
        googleSignOutButton.classList.add('hidden');
        userPlaylistsContainer.innerHTML = '<p>Inicia sesión con Google para ver tus playlists de YouTube.</p>';
    }
}

// Maneja el cierre de sesión de Google
function handleGoogleSignOut() {
    if (googleAccessToken) {
        // Revoca el token de acceso para cerrar la sesión
        window.google.accounts.oauth2.revoke(googleAccessToken, () => {
            console.log('Access token revocado. Sesión de Google cerrada.');
            googleAccessToken = null;
            gapi.client.setToken(null); // Limpia el token de gapi.client
            userYouTubePlaylists = []; // Limpia las playlists en la UI
            userPlaylistsContainer.innerHTML = '<p>Inicia sesión con Google para ver tus playlists de YouTube.</p>';
            showFloatingMessage('Sesión cerrada.', 'info');
            updateSignInUI(false); // Actualiza la UI
        });
    } else {
        console.log('No hay token de acceso para revocar.');
        showFloatingMessage('No hay sesión activa para cerrar.', 'warning');
    }
}


// ===============================
// === FUNCIONES PARA CARGAR PLAYLISTS DE YOUTUBE (DEL USUARIO LOGUEADO) ===
// ===============================

async function loadUserPlaylists() {
    if (!googleAccessToken || !gapi.client.youtube) {
        console.warn('No hay token de acceso o API de YouTube no cargada para obtener playlists del usuario.');
        userPlaylistsContainer.innerHTML = '<p>Necesitas iniciar sesión con Google y conceder permisos para ver tus playlists.</p>';
        return;
    }

    try {
        showLoadingSpinner();
        // Carga la lista de playlists del usuario autenticado
        const response = await gapi.client.youtube.playlists.list({
            'part': 'snippet,contentDetails',
            'mine': true,
            'maxResults': 50 // Número de resultados por página. Puedes paginar si tienes muchas.
        });

        hideLoadingSpinner();
        userYouTubePlaylists = response.result.items;
        console.log('Playlists del usuario (YouTube API):', userYouTubePlaylists);

        userPlaylistsContainer.innerHTML = ''; // Limpiar el contenedor antes de renderizar

        if (userYouTubePlaylists.length === 0) {
            userPlaylistsContainer.innerHTML = '<p>No se encontraron playlists en tu cuenta de YouTube.</p>';
            return;
        }

        userYouTubePlaylists.forEach(playlist => {
            const templateContent = userPlaylistCardTemplate.content.cloneNode(true);
            const playlistCard = templateContent.querySelector('.playlist-card');
            
            const thumbnail = playlistCard.querySelector('.playlist-thumbnail');
            if (thumbnail) {
                thumbnail.src = playlist.snippet.thumbnails?.medium?.url || 'https://placehold.co/120x90/000000/FFFFFF?text=No+Thumb';
                thumbnail.alt = playlist.snippet.title;
            }

            const name = playlistCard.querySelector('.playlist-name');
            if (name) name.textContent = playlist.snippet.title;

            const videoCount = playlistCard.querySelector('.playlist-video-count');
            if (videoCount) videoCount.textContent = `${playlist.contentDetails.itemCount} videos`;

            const loadButton = playlistCard.querySelector('.load-user-playlist-button');
            if (loadButton) {
                loadButton.dataset.playlistId = playlist.id;
                loadButton.addEventListener('click', (e) => {
                    // Cargar los videos de esta playlist de YouTube usando la API de Piped.video
                    const playlistId = e.target.dataset.playlistId;
                    showFloatingMessage(`Cargando videos de la playlist de YouTube: ${playlistId}`, 'info');
                    fetchAndDisplayPlaylistVideosFromYouTube(playlistId);
                });
            }
            userPlaylistsContainer.appendChild(templateContent);
        });

    } catch (error) {
        hideLoadingSpinner();
        console.error('Error al cargar las playlists de YouTube del usuario:', error);
        showFloatingMessage('Error al cargar tus playlists de YouTube. Asegúrate de haber concedido los permisos.', 'error');
        userPlaylistsContainer.innerHTML = '<p>Error al cargar tus playlists.</p>';
    }
}

// Nueva función para cargar videos de una playlist de YouTube a través de Piped
async function fetchAndDisplayPlaylistVideosFromYouTube(youtubePlaylistId) {
    showLoadingSpinner();
    try {
        const pipedInstance = getRandomPipedInstance();
        // Piped API tiene un endpoint para playlists de YouTube que devuelve los streams
        const response = await fetchDataWithRetry(`${pipedInstance}/playlists/${youtubePlaylistId}`);
        console.log("Videos de playlist de YouTube vía Piped:", response);

        const playlistVideos = response.relatedStreams.map(item => ({
            videoId: item.url.split('v=')[1] || item.url.split('/').pop(),
            title: item.title,
            duration: item.duration,
            thumbnail: item.thumbnail
        }));

        // Limpiar resultados de búsqueda anteriores y mostrar estos videos
        resultsDiv.innerHTML = '';
        currentSearchQuery = ''; // Limpiar búsqueda actual
        nextPageContext = null; // Reiniciar paginación

        if (playlistVideos.length > 0) {
            playlistVideos.forEach(video => {
                const templateContent = playlistVideoTemplate.content.cloneNode(true); // Usar el template de video de playlist
                const videoElement = templateContent.querySelector('.playlist-video-item');
                if (!videoElement) {
                    console.error("No se encontró .playlist-video-item en el template playlist-video-template.");
                    return;
                }

                // Populate elements
                const thumbnailImg = videoElement.querySelector('.video-thumbnail');
                if (thumbnailImg) {
                    thumbnailImg.src = video.thumbnail;
                    thumbnailImg.alt = video.title;
                }
                const titleEl = videoElement.querySelector('.video-title');
                if (titleEl) titleEl.textContent = video.title;
                const durationEl = videoElement.querySelector('.video-duration');
                if (durationEl) durationEl.textContent = formatTime(video.duration);

                // Play button
                const playBtn = videoElement.querySelector('.play-video-button');
                if (playBtn) {
                    playBtn.addEventListener('click', () => {
                        setCurrentPlayingVideo({
                            videoId: video.videoId,
                            title: video.title,
                            duration: video.duration,
                            thumbnail: video.thumbnail,
                            playlistId: youtubePlaylistId, // Asocia a la playlist de YouTube
                            flattenedIndex: -1 // No usamos flattenedIndex para estas playlists por ahora
                        });
                        loadVideo(video.videoId, 0);
                    });
                }
                // Deshabilitar botones de gestión de video si no hay backend de guardado
                const addBtn = videoElement.querySelector('.add-to-other-playlist-button');
                if (addBtn) addBtn.disabled = true;
                const moveBtn = videoElement.querySelector('.move-video-button');
                if (moveBtn) moveBtn.disabled = true;
                const removeBtn = videoElement.querySelector('.remove-video-button');
                if (removeBtn) removeBtn.disabled = true;

                resultsDiv.appendChild(templateContent); // Añade al contenedor de resultados de búsqueda
            });
        } else {
            resultsDiv.innerHTML = '<p class="no-videos-message">Esta playlist de YouTube no contiene videos.</p>';
        }
    } catch (error) {
        console.error('Error al cargar videos de playlist de YouTube a través de Piped:', error);
        showFloatingMessage(`Error al cargar videos de la playlist (${error.message})`, 'error');
        resultsDiv.innerHTML = '<p class="error-message">Error al cargar videos de la playlist.</p>';
    } finally {
        hideLoadingSpinner();
    }
}


// ===============================
// === FUNCIONES GENERALES DE UI Y REPRODUCCIÓN ===
// ===============================

// Función para mostrar/ocultar el spinner de carga
function showLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.remove('hidden');
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.classList.add('hidden');
}

// Función para mostrar mensajes flotantes
function showFloatingMessage(message, type = "info", duration = 3000) {
    const container = document.getElementById('floatingMessageContainer');
    if (!container) return;

    const messageElement = document.createElement('div');
    messageElement.className = `mensaje-flotante ${type}`;
    messageElement.textContent = message;

    container.appendChild(messageElement);

    setTimeout(() => {
        messageElement.classList.add('fadeOut');
        messageElement.addEventListener('transitionend', () => {
            messageElement.remove();
        });
    }, duration);
}

// === API DE YOUTUBE IFRAME ===
function onYouTubeIframeAPIReady() {
    console.log('YouTube Iframe API Ready');
    youtubeAPIReady = true;
    initializePlayers();
}

function initializePlayers() {
    if (playersInitialized || !youtubeAPIReady) return;

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        videoId: '',
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
            'origin': window.location.origin
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
        videoId: '',
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
            'origin': window.location.origin
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });

    playersInitialized = true;
}

function onPlayerReady(event) {
    event.target.setVolume(parseInt(volumeSlider.value));
    console.log(`Player ${event.target.getIframe().id} is ready.`);
}

function onPlayerStateChange(event) {
    const player = event.target;
    const playerDiv = player.getIframe().parentNode;

    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        botonPlay.innerHTML = '<i class="fas fa-pause"></i>';
        startMonitoringProgress();
        showFloatingMessage(`Reproduciendo: ${player.getVideoData().title || 'Video desconocido'}`);
        if (player === currentPlayingInfo.player) {
            updateVisualPlayingIndicators(currentPlayingInfo.videoId);
            handleSponsorBlockSegments(currentPlayingInfo.videoId, player.getCurrentTime());
            playerDiv.style.zIndex = '10';
            playerDiv.classList.remove('hidden', 'fade-out');
            playerDiv.classList.add('fade-in');
        }
    } else if (player.getPlayerState() === YT.PlayerState.PAUSED) {
        botonPlay.innerHTML = '<i class="fas fa-play"></i>';
        stopMonitoringProgress();
    } else if (player.getPlayerState() === YT.PlayerState.ENDED) {
        console.log(`Video ended on player ${playerDiv.id}.`);
        stopMonitoringProgress();
        if (!isTransitioning && player === currentPlayingInfo.player) {
            console.log("Video terminado y no en transición de crossfade. Reproduciendo el siguiente.");
            playNextVideo();
        } else if (isTransitioning && player !== currentPlayingInfo.player) {
            const inactivePlayerElement = playerDiv;
            if (inactivePlayerElement && !inactivePlayerElement.classList.contains('hidden')) {
                inactivePlayerElement.classList.add('hidden');
                inactivePlayerElement.classList.remove('fade-in', 'fade-out');
                inactivePlayerElement.style.zIndex = '1';
                console.log(`Reproductor inactivo ${playerDiv.id} ocultado después de finalizar.`);
            }
        }
    } else if (player.getPlayerState() === YT.PlayerState.BUFFERING) {
        console.log(`Player ${playerDiv.id} está en buffering.`);
    }
}

function onPlayerError(event) {
    const player = event.target;
    const playerDivId = player.getIframe().id;
    const errorCode = event.data;
    const errorMessage = YT_ERROR_MESSAGES[errorCode] || `Error desconocido: ${errorCode}`;
    console.error(`Error en el reproductor ${playerDivId}: ${errorMessage}`);
    showFloatingMessage(`Error de reproducción: ${errorMessage}`, "error", 5000);
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
        showFloatingMessage("Los reproductores de YouTube no están inicializados.", "error");
        return;
    }

    const activePlayerInstance = (currentPlayer === 1) ? player1 : player2;
    const inactivePlayerInstance = (currentPlayer === 1) ? player2 : player1;

    console.log(`LoadVideo: Cargando video ${videoId} en player ${currentPlayer}. Crossfade: ${isCrossfade}`);

    if (activePlayerInstance && typeof activePlayerInstance.loadVideoById === 'function') {
        const activePlayerElement = document.getElementById(`player${currentPlayer}`);
        activePlayerElement.classList.remove('hidden', 'fade-out');
        activePlayerElement.classList.add('fade-in');
        activePlayerElement.style.zIndex = '10';

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
            suggestedQuality: 'hd720'
        });
        activePlayerInstance.playVideo();
        
        currentPlayingInfo.player = activePlayerInstance;

        if (activePlayerInstance.getDuration) {
            totalDurationDisplay.textContent = formatTime(activePlayerInstance.getDuration());
        }
    } else {
        showFloatingMessage("El reproductor activo no está listo para cargar videos. Inténtalo de nuevo.", "error");
        console.error(`Active player (${currentPlayer}) is not ready or loadVideoById is not a function.`);
    }
}


function getCurrentPlayer() {
    return currentPlayer === 1 ? player1 : player2;
}

function getInactivePlayer() {
    return currentPlayer === 1 ? player2 : player1;
}

function playPauseVideo() {
    if (!currentPlayingInfo.player) {
        showFloatingMessage("No hay video cargado para reproducir/pausar.", "error");
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
    // Lógica de `playNextVideo` debe ser adaptada para trabajar con la nueva estructura de playlists
    // (ya sea la lista aplanada de resultados de búsqueda o una playlist de YouTube cargada)
    // Por ahora, se asume una `getFlattenedVideos` genérica o se usará la lista de videos del último contexto cargado
    showFloatingMessage("La función de 'Siguiente video' necesita ser adaptada a la nueva gestión de playlists.", "warning");
    // Implementación futura: Obtener el siguiente video de la playlist actualmente "activa" (buscada o de YouTube)
}

function playPrevVideo() {
    showFloatingMessage("La función de 'Video anterior' necesita ser adaptada a la nueva gestión de playlists.", "warning");
}

function seekTo(event) {
    if (!currentPlayingInfo.player || typeof currentPlayingInfo.player.getDuration !== 'function') return;

    const progressBarRect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - progressBarRect.left;
    const width = progressBarRect.width;
    const duration = currentPlayingInfo.player.getDuration();
    const seekTime = (clickX / width) * duration;

    currentPlayingInfo.player.seekTo(seekTime, true);
}

function setVolume() {
    if (player1 && typeof player1.setVolume === 'function') {
        player1.setVolume(volumeSlider.value);
    }
    if (player2 && typeof player2.setVolume === 'function') {
        player2.setVolume(volumeSlider.value);
    }
}

function startMonitoringProgress() {
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(() => {
        const player = getCurrentPlayer();
        if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
            const currentTime = player.getCurrentTime();
            const duration = player.getDuration();
            updateProgressBar(currentTime, duration);
            checkForSponsorBlockSegments(currentTime, player);
            checkForOutroCrossfade(currentTime, duration, player);
        }
    }, 1000);
}

function stopMonitoringProgress() {
    clearInterval(monitorInterval);
    monitorInterval = null;
}

function updateProgressBar(currentTime, duration) {
    if (duration > 0) {
        const progress = (currentTime / duration) * 100;
        progressFill.style.width = `${progress}%`;
        currentTimeDisplay.textContent = formatTime(currentTime);
        totalDurationDisplay.textContent = formatTime(duration);
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

async function fetchSponsorBlockSegments(videoId) {
    if (!videoId) return [];
    if (segmentosCache[videoId]) {
        console.log(`Segmentos SB para ${videoId} encontrados en caché.`);
        return segmentosCache[videoId];
    }
    showLoadingSpinner();
    try {
        // En un entorno de solo frontend sin Firebase Auth, no hay currentUser.uid.
        // SponsorBlock API permite llamadas sin userID, pero la moderación es anónima.
        // Si necesitas un UserID para SponsorBlock, deberás gestionar la persistencia de un ID anónimo manualmente.
        const response = await fetch(`${SPONSORBLOCK_API_URL}/segments/${videoId}`); // Sin X-UserID si no hay Firebase Auth

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`HTTP error! status: ${response.status}, details: ${errorData.message}`);
        }

        const segments = await response.json();
        segmentosCache[videoId] = segments;
        console.log(`Segmentos SB obtenidos para ${videoId}:`, segments);
        hideLoadingSpinner();
        return segments;
    } catch (error) {
        console.error(`Error al obtener segmentos de SponsorBlock para ${videoId}:`, error);
        showFloatingMessage('Error al cargar segmentos de SponsorBlock.', 'error');
        hideLoadingSpinner();
        return [];
    }
}

async function checkForSponsorBlockSegments(currentTime, player) {
    if (ignoreSeek) return;

    const currentVideoId = player.getVideoData().video_id;
    if (!currentVideoId) return;

    if (!segmentosCache[currentVideoId]) {
        fetchSponsorBlockSegments(currentVideoId);
        return;
    }

    const segments = segmentosCache[currentVideoId];
    if (segments && segments.length === 0) return; // Se cambió para manejar `null` o array vacío

    for (const segment of segments) {
        if (typeof segment.segment !== 'object' || segment.segment.length !== 2) {
            console.warn('Segmento SponsorBlock con formato incorrecto:', segment);
            continue;
        }
        const [start, end] = segment.segment;

        if (currentTime >= start && currentTime < end) {
            if (segment.category === 'sponsor' || segment.category === 'intro') {
                console.log(`Saltando segmento de ${segment.category}: ${formatTime(start)} - ${formatTime(end)}`);
                ignoreSeek = true;
                player.seekTo(end, true);
                showFloatingMessage(`Saltando sección de ${segment.category}.`, 'info', 2000);
                setTimeout(() => {
                    ignoreSeek = false;
                }, 1000);
                return;
            }
        }
    }
}

function checkForOutroCrossfade(currentTime, duration, player) {
    if (isTransitioning || hasOutroCrossfadeStarted) return;

    const currentVideoId = player.getVideoData().video_id;
    if (!currentVideoId) return;

    const segments = segmentosCache[currentVideoId] || [];
    if (segments.length === 0) return;

    for (const segment of segments) {
        if (typeof segment.segment !== 'object' || segment.segment.length !== 2) {
            continue;
        }
        const [start, end] = segment.segment;

        if (segment.category === 'outro') {
            const outroCrossfadeStartTime = end - CROSSFADE_DURATION;

            if (currentTime >= outroCrossfadeStartTime && currentTime < end) {
                console.log(`Detectado segmento 'outro'. Iniciando crossfade hacia el siguiente video.`);
                hasOutroCrossfadeStarted = true;
                startCrossfade();
                break;
            }
        }
    }
}

function startCrossfade() {
    if (isTransitioning) {
        console.log("Ya en transición, omitiendo nuevo crossfade.");
        return;
    }

    console.log("Iniciando crossfade...");
    isTransitioning = true;
    hasOutroCrossfadeStarted = false;

    stopMonitoringProgress();

    const activePlayerInstance = currentPlayingInfo.player;
    const inactivePlayerInstance = (currentPlayer === 1) ? player2 : player1;

    const activePlayerElement = document.getElementById(`player${currentPlayer}`);
    const inactivePlayerElement = document.getElementById(`player${(currentPlayer === 1) ? 2 : 1}`);

    inactivePlayerElement.classList.remove('hidden', 'fade-out');
    inactivePlayerElement.classList.add('fade-in');
    inactivePlayerElement.style.zIndex = '5';

    const nextVideo = getNextVideoInQueue(); // Necesitas implementar getNextVideoInQueue basado en el contexto actual
    if (!nextVideo) {
        console.log("No hay siguiente video para crossfade. Terminando crossfade.");
        isTransitioning = false;
        botonPlay.innerHTML = '<i class="fas fa-play"></i>';
        showFloatingMessage("No hay más videos en la cola.", 'info');
        stopMonitoringProgress();
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
    const nextVideoStartTime = 0;

    inactivePlayerInstance.loadVideoById({
        videoId: nextVideoId,
        startSeconds: nextVideoStartTime,
        suggestedQuality: 'hd720'
    });

    fadeAudioOut(activePlayerInstance, () => {
        console.log("Audio del reproductor saliente fundido a cero.");
        activePlayerInstance.pauseVideo();
        isAudioFading = false;
    });

    inactivePlayerInstance.playVideo();
    console.log(`Siguiente video iniciado en player inactivo (${inactivePlayerInstance.h.id}).`);

    currentPlayingInfo.playlistId = nextVideo.playlistId;
    currentPlayingInfo.videoId = nextVideo.videoId;
    currentPlayingInfo.title = nextVideo.title;
    currentPlayingInfo.flattenedIndex = nextVideo.flattenedIndex;

    setTimeout(() => {
        currentPlayer = (currentPlayer === 1) ? 2 : 1;
        currentPlayingInfo.player = (currentPlayer === 1) ? player1 : player2;
        console.log(`CurrentPlayer actualizado a: ${currentPlayer}`);

        fadeAudioIn(currentPlayingInfo.player, () => {
            console.log("Audio del nuevo reproductor fundido a volumen normal.");
            activePlayerElement.classList.add('fade-out');
            activePlayerElement.style.zIndex = '1';

            inactivePlayerElement.classList.remove('fade-out', 'hidden');
            inactivePlayerElement.classList.add('fade-in');
            inactivePlayerElement.style.zIndex = '10';

            setTimeout(() => {
                activePlayerElement.classList.add('hidden');
                activePlayerElement.classList.remove('fade-out', 'fade-in');
                console.log(`Player ${activePlayerElement.id} ocultado.`);
            }, CROSSFADE_DURATION * 1000);

            isTransitioning = false;
            startMonitoringProgress();
            updateVisualPlayingIndicators(currentPlayingInfo.videoId);
            updateUpNextList();
        });
    }, 500);
}

function fadeAudioOut(player, callback) {
    if (!player || typeof player.setVolume !== 'function' || typeof player.getVolume !== 'function') {
        console.error("Player no válido para fadeAudioOut.");
        if (callback) callback();
        return;
    }
    isAudioFading = true;
    let volume = player.getVolume();
    const fadeStep = volume / (CROSSFADE_DURATION * 10);
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
    }, 100);
}

function fadeAudioIn(player, callback) {
    if (!player || typeof player.setVolume !== 'function' || typeof player.getVolume !== 'function') {
        console.error("Player no válido para fadeAudioIn.");
        if (callback) callback();
        return;
    }
    isAudioFading = true;
    const targetVolume = parseInt(volumeSlider.value);
    let volume = player.getVolume();
    const fadeStep = targetVolume / (CROSSFADE_DURATION * 10);
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
    }, 100);
}


// Módulo: Piped API Helpers
const pipedInstances = [
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party",
    "https://pipedapi.kavin.rocks"
];

function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}

async function fetchDataWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            console.log(`fetchDataWithRetry: Intento ${retries + 1} para ${url}`);
            const response = await fetch(url, options);
            if (!response.ok) {
                 let errorBodyText = `HTTP error! status: ${response.status}`;
                 try { errorBodyText = await response.text(); } catch(e){}
                throw new Error(errorBodyText);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching ${url}, reintento ${retries + 1}/${maxRetries + 1}:`, error.message);
            retries++;
            if (retries <= maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelay * retries));
            } else {
                 console.error(`fetchDataWithRetry: Fallaron todos los ${maxRetries + 1} intentos para ${url}`);
                throw error;
            }
        }
    }
}

async function fetchVideoDetails(videoId) {
    const instanceUrl = getRandomPipedInstance();
    try {
        const data = await fetchDataWithRetry(`${instanceUrl}/streams/${videoId}`);
        return {
            videoId: data.videoId,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnailUrl,
        };
    } catch (error) {
        console.error("Error fetching video details from Piped:", error);
        throw new Error(`Error al obtener detalles del video: ${error.message}`);
    }
}

async function fetchPlaylistDetailsFromPiped(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    try {
        const data = await fetchDataWithRetry(`${instanceUrl}/playlists/${playlistId}`);
        return {
            name: data.name,
            thumbnailUrl: data.thumbnailUrl,
            relatedStreams: data.relatedStreams
        };
    } catch (error) {
        console.error(`Error al obtener detalles de la playlist ${playlistId} de Piped:`, error);
        throw new Error(`Error al obtener detalles de la playlist: ${error.message}`);
    }
}

async function fetchPlaylistVideos(playlistUrl) {
    const playlistIdMatch = playlistUrl.match(/(?:list=|embed\/videoseries\?list=)([a-zA-Z0-9_-]+)/);
    const playlistId = playlistIdMatch ? playlistIdMatch[1] : null;

    if (!playlistId) {
        throw new Error("URL de playlist no válida.");
    }

    try {
        const playlistInfo = await fetchPlaylistDetailsFromPiped(playlistId);
        if (!playlistInfo || !playlistInfo.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos para la playlist.");
        }
        console.log(`Videos obtenidos de Piped para playlist ${playlistId}: ${playlistInfo.relatedStreams.length}`);
        return playlistInfo.relatedStreams.map(item => ({
            videoId: item.url.split('v=')[1] || item.url.split('/').pop(),
            title: item.title,
            duration: item.duration,
            thumbnail: item.thumbnail,
        }));
    } catch (error) {
        console.error(`Error al obtener videos de la playlist ${playlistId} de Piped:`, error);
        throw error;
    }
}

// === Funciones de UI para playlists (ahora solo muestra playlists de YouTube) ===
function displayPlaylists() {
    // Esta función ya no se usa para las playlists "Mi Biblioteca" en este nuevo enfoque.
    // userPlaylistsContainer se encarga de mostrar las playlists de YouTube directamente.
}

function updateUpNextList() {
    upNextList.innerHTML = '';
    const messageElement = upNextList.closest('.up-next-section').querySelector('.no-videos-message');

    // Lógica para 'Siguiente en la cola' debería depender del contexto de la playlist actual
    // Si estamos viendo una playlist de YouTube cargada, usar sus videos
    // Si estamos en resultados de búsqueda, usar los siguientes de la búsqueda
    messageElement.classList.remove('hidden'); // Mostrar siempre por ahora
    upNextList.innerHTML = '<p class="no-videos-message">La cola de "Siguiente" se actualizará con la implementación de la navegación de playlist.</p>';
}

function getFlattenedVideos() {
    // Esta función debería adaptarse a cómo manejes la lista actual de videos (resultados de búsqueda, o videos de una playlist de YouTube cargada)
    // Por ahora, devuelve una lista vacía.
    return [];
}

function setCurrentPlayingVideo(video) {
    currentPlayingInfo.videoId = video.videoId;
    currentPlayingInfo.title = video.title;
    currentPlayingInfo.duration = video.duration;
    // currentPlayingInfo.playlistId y flattenedIndex ya no son directamente aplicables de la misma manera sin Firebase
    currentPlayingInfo.playlistId = video.playlistId || null;
    currentPlayingInfo.flattenedIndex = video.flattenedIndex || -1;
    currentPlayingInfo.player = getCurrentPlayer(); // Asegura que el player sea el actual
    console.log("Current playing info set:", currentPlayingInfo);
}

// Módulo: Búsqueda
async function searchPipedVideos(query, append = false) {
    if (isLoadingMore) return;
    isLoadingMore = true;
    showLoadingSpinner();
    
    if (!append) {
        resultsDiv.innerHTML = ''; 
        nextPageContext = null;
    }

    let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
    if (nextPageContext) {
        apiUrl += `&nextpage=${encodeURIComponent(nextPageContext)}`;
    }

    console.log("Fetching search results from:", apiUrl);
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log("Search results received:", data);

        nextPageContext = data.nextPage || null;
        
        displaySearchResultsPiped(data.items, append);
    } catch (e) {
        showFloatingMessage(`Error al buscar videos (${e.message})`, "error");
        console.error("Error al buscar videos:", e);
        if (!append) {
            resultsDiv.innerHTML = `<p class="error-message">Error al cargar resultados de búsqueda: ${e.message}</p>`;
        }
    } finally {
        hideLoadingSpinner();
        isLoadingMore = false;
    }
}

function displaySearchResultsPiped(items, append = false) {
    if (!items || items.length === 0) {
        if (!append) {
            resultsDiv.innerHTML = '<p class="no-videos-message">No se encontraron resultados para tu búsqueda.</p>';
        }
        return;
    }

    if (!append) {
        resultsDiv.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        if (item.type === 'video') {
            const template = document.getElementById('search-result-template');
            if (!template) {
                console.error("Template 'search-result-template' no encontrada.");
                return;
            }
            const clone = document.importNode(template.content, true);

            const videoElement = clone.querySelector('.search-result-item');
            const thumbnailImg = clone.querySelector('.result-thumbnail');
            const durationSpan = clone.querySelector('.duration');
            const titleH3 = clone.querySelector('.result-title');
            const addButton = clone.querySelector('.add-to-playlist');

            if (thumbnailImg) {
                thumbnailImg.src = item.thumbnail || 'https://placehold.co/120x90/000000/FFFFFF?text=No+Thumb';
                thumbnailImg.alt = item.title || 'Video Thumbnail';
            }
            if (durationSpan) {
                durationSpan.textContent = formatTime(item.duration);
            }
            if (titleH3) {
                titleH3.textContent = item.title || 'Título Desconocido';
            }

            if (addButton) {
                // El botón de añadir a playlist está deshabilitado sin Firebase para guardar playlists
                addButton.disabled = true;
                // addButton.addEventListener('click', (e) => { e.stopPropagation(); /* ... */ });
            }

            videoElement.addEventListener('click', (e) => {
                if (e.target.closest('.add-to-playlist')) {
                    return;
                }
                const videoId = item.url.split('v=')[1] || item.url.split('/').pop();
                setCurrentPlayingVideo({
                    videoId: videoId,
                    title: item.title,
                    duration: item.duration,
                    thumbnail: item.thumbnail,
                    playlistId: null,
                    flattenedIndex: -1
                });
                loadVideo(videoId, 0);
            });
            fragment.appendChild(clone);
        }
    });
    resultsDiv.appendChild(fragment);
}


// Módulo: Popups y Menús Contextuales (simplificados, ya no para Firebase)
// Estas funciones ya no manejan la lógica de Firebase de añadir/mover.
// Se mantendrán como stubs o podrían eliminarse si no se usan más.

function closeAllContextMenus() {
    document.querySelectorAll('.delete-menu-content').forEach(menu => {
        menu.style.display = 'none';
    });
}

function closePlaylistSelectionPopups() {
    // Ya no hay un popup de selección de playlist con esta implementación simplificada
    // document.querySelectorAll('.playlist-selection-popup-menu').forEach(popup => {
    //     popup.remove();
    // });
}

function showConfirmDialog(message, onConfirm) {
    showFloatingMessage(message, 'warning', 0);

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


function updateVisualPlayingIndicators(playingVideoId) {
    document.querySelectorAll('.playlist-video-item.playing').forEach(item => {
        item.classList.remove('playing');
        const icon = item.querySelector('.playing-icon');
        if (icon) icon.classList.add('hidden');
    });

    if (playingVideoId) {
        const playingVideoElement = document.querySelector(`.playlist-video-item[data-video-id="${playingVideoId}"]`);
        if (playingVideoElement) {
            playingVideoElement.classList.add('playing');
            const icon = playingVideoElement.querySelector('.playing-icon');
            if (icon) icon.classList.remove('hidden');
            playingVideoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}


// Módulo: Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Los inputs de búsqueda y el botón de añadir URL están habilitados por defecto en HTML
    // y solo el botón de añadir URL está deshabilitado en JS con un mensaje aclaratorio.
    añadirUrlButton.disabled = true; // Deshabilitar añadir URL localmente

    // Carga la API de YouTube Iframe.
    // window.onYouTubeIframeAPIReady se llamará automáticamente cuando cargue.
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api"; // CORRECCIÓN: Usar HTTPS para evitar Mixed Content
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Event listeners para botones del reproductor
    botonPlay.addEventListener('click', playPauseVideo);
    botonNext.addEventListener('click', playNextVideo);
    botonPrev.addEventListener('click', playPrevVideo);

    // Event listener para la barra de progreso
    progressBar.addEventListener('click', seekTo);
    let isDragging = false;
    if (progressHandle) { // Asegúrate de que existe antes de añadir listener
        progressHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            document.body.classList.add('no-select');
        });
    }
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const progressBarRect = progressBar.getBoundingClientRect();
            let newX = e.clientX - progressBarRect.left;
            if (newX < 0) newX = 0;
            if (newX > progressBarRect.width) newX = progressBarRect.width;
            
            const progress = (newX / progressBarRect.width);
            const duration = currentPlayingInfo.player ? currentPlayingInfo.player.getDuration() : 0; // Evitar error si no hay player
            const seekTime = progress * duration;

            if (progressFill) progressFill.style.width = `${progress * 100}%`;
            if (progressHandle) progressHandle.style.left = `${progress * 100}%`;
            if (currentTimeDisplay) currentTimeDisplay.textContent = formatTime(seekTime);
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
            const duration = currentPlayingInfo.player ? currentPlayingInfo.player.getDuration() : 0;
            const seekTime = progress * duration;
            
            if (currentPlayingInfo.player) currentPlayingInfo.player.seekTo(seekTime, true);
        }
    });

    // Event listener para el slider de volumen
    volumeSlider.addEventListener('input', setVolume);

    if (muteButton) muteButton.addEventListener('click', () => {
        const player = getCurrentPlayer();
        if (!player) return;
        if (player.isMuted()) {
            player.unMute();
            muteButton.classList.remove('active');
            volumeSlider.value = player.getVolume();
        } else {
            player.mute();
            muteButton.classList.add('active');
            volumeSlider.value = 0;
        }
    });

    if (shuffleButton) shuffleButton.addEventListener('click', () => {
        shuffleButton.classList.toggle('active');
        if (shuffleButton.classList.contains('active')) {
            showFloatingMessage('Reproducción aleatoria activada.', 'info');
            if (loopButton) loopButton.classList.remove('active');
        } else {
            showFloatingMessage('Reproducción aleatoria desactivada.', 'info');
        }
    });

    if (loopButton) loopButton.addEventListener('click', () => {
        loopButton.classList.toggle('active');
        if (loopButton.classList.contains('active')) {
            showFloatingMessage('Bucle activado.', 'info');
            if (shuffleButton) shuffleButton.classList.remove('active');
        } else {
            showFloatingMessage('Bucle desactivado.', 'info');
        }
    });

    if (skipIntroButton) skipIntroButton.addEventListener('click', () => {
        const player = getCurrentPlayer();
        if (!player || !currentPlayingInfo.videoId) {
            showFloatingMessage('No hay video reproduciéndose para saltar la intro.', 'warning');
            return;
        }
        const videoId = currentPlayingInfo.videoId;
        const segments = segmentosCache[videoId];
        const introSegment = segments ? segments.find(s => s.category === 'intro') : null;

        if (introSegment) {
            player.seekTo(introSegment.segment[1], true);
            showFloatingMessage('Intro saltada.', 'info');
        } else {
            showFloatingMessage('No se encontró una intro para este video.', 'warning');
        }
    });


    // Event listener para el input de búsqueda principal (en el header)
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentSearchQuery = searchInput.value.trim();
            if (currentSearchQuery) {
                searchPipedVideos(currentSearchQuery);
            } else {
                showFloatingMessage("Por favor, introduce un término de búsqueda.", "warning");
            }
        }
    });

    // Event listener para el input de añadir URL de playlist (en la sidebar)
    // Su funcionalidad de añadir a "Mi Biblioteca" local está deshabilitada sin Firebase
    searchInput2.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            showFloatingMessage("La función de añadir por URL está deshabilitada. Por favor, usa la búsqueda o inicia sesión con Google para tus playlists.", "info", 5000);
        }
    });
    if (añadirUrlButton) {
        añadirUrlButton.addEventListener('click', () => {
            showFloatingMessage("La función de añadir por URL está deshabilitada. Por favor, usa la búsqueda o inicia sesión con Google para tus playlists.", "info", 5000);
        });
    }

    // Event listener para scroll infinito en resultados de búsqueda
    resultsContainer.addEventListener('scroll', () => {
        const loadMoreSpinner = document.getElementById('loadMoreSpinner');
        if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 100 && !isLoadingMore && nextPageContext) {
            console.log("Cargando más resultados...");
            if (loadMoreSpinner) loadMoreSpinner.classList.remove('hidden');
            searchPipedVideos(currentSearchQuery, true);
        } else {
            if (loadMoreSpinner) loadMoreSpinner.classList.add('hidden');
        }
    });

    // --- Google Identity Services Initialization ---
    // Inicializar GIS para el botón de inicio de sesión
    if (googleSignInButton) {
        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleAuthResponse, // Llama a nuestra función de respuesta después de la autenticación
            auto_prompt: false, // Controla el popup de auto-login
            ux_mode: 'popup' // Para abrir el flujo en un popup
        });
        // Renderiza el botón de Google Sign-In
        window.google.accounts.id.renderButton(
            googleSignInButton,
            { type: "standard", size: "large", text: "signin_with", shape: "rectangular", theme: "outline", logo_alignment: "left" }
        );
    }

    // Inicializar el cliente de token para obtener el access_token para gapi.client
    initTokenClient();

    // Listener para el botón de cerrar sesión
    if (googleSignOutButton) {
        googleSignOutButton.addEventListener('click', handleGoogleSignOut);
    }
});

// Cerrar menús contextuales y popups al hacer clic fuera
document.addEventListener('click', (event) => {
    if (!event.target.closest('.delete-menu')) {
        closeAllContextMenus();
    }
}, true);
