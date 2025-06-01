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
let segmentosCache = {}; // Objeto para almacenar en caché los segmentos de SponsorBlock por videoId
let ignoreSeek = false; // Para evitar bucles infinitos con SponsorBlock
const SPONSORBLOCK_API_URL = '/.netlify/functions/sponsorblock'; // Endpoint de tu Netlify Function para SponsorBlock

// Variables de Firebase (inicializadas en window.initFirebase)
let db; // Instancia de Firestore
let auth; // Instancia de Firebase Auth
let currentUser; // Objeto de usuario autenticado
let firebaseReady = false; // Flag para saber si Firebase está listo y los inputs pueden habilitarse

// NUEVO: Google API Client ID
// REEMPLAZA ESTO CON TU PROPIO CLIENT ID DE GOOGLE CLOUD
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE'; 
const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest"];
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/userinfo.profile';

// Importaciones de Firestore modular (Asegúrate de que estas líneas estén al principio de tu app.js)
import {
    collection,
    doc,
    onSnapshot,
    query,
    orderBy,
    setDoc, // para guardar documentos
    updateDoc, // para actualizar
    deleteDoc, // para eliminar
    getDoc, // para obtener un documento
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';


// === SELECTORES DE ELEMENTOS DOM ===
const searchInput = document.getElementById('searchInput'); // Input de búsqueda principal
const searchInput2 = document.getElementById('searchInput2'); // Segundo input de búsqueda (si existe)
const addButton = document.getElementById('añadirUrlButton'); // Botón para añadir playlist
const playlistsContainer = document.getElementById('playlistContainer'); // Contenedor principal de playlists

// Selectores para el reproductor y controles
const player1Div = document.getElementById('player1');
const player2Div = document.getElementById('player2');
const playButton = document.getElementById('botonPlay');
const prevButton = document.getElementById('botonPrev');
const nextButton = document.getElementById('botonNext');
const volumeSlider = document.getElementById('volumeSlider');
const currentTimeDisplay = document.getElementById('currentTimeDisplay');
const totalDurationDisplay = document.getElementById('totalDurationDisplay');
const extractUserPlaylistButton = document.getElementById('extractUserPlaylistButton'); // Botón de "Extraer tus playlists de Google"
const upNextList = document.getElementById('upNextList');

// Selectores para los templates HTML (asegúrate de que existan en index.html)
const playlistTemplate = document.getElementById('playlist-template');
const videoTemplate = document.getElementById('video-template');
const searchResultTemplate = document.getElementById('search-result-template');


// Mapeo de errores de YouTube API
const YT_ERROR_MESSAGES = {
    2: 'La solicitud contiene un valor de parámetro no válido. Por ejemplo, especifica un ID de video que no tiene 11 caracteres o que contiene caracteres no válidos, como un signo de exclamación o un asterisco.',
    5: 'La acción solicitada solo se puede realizar en un reproductor HTML5.',
    100: 'El video solicitado no se encontró. Esto ocurre cuando un video se ha eliminado (por cualquier motivo) o se ha marcado como privado.',
    101: 'El propietario del video no permite que se reproduzca en reproductores incrustados.',
    150: 'El propietario del video no permite que se reproduzca en reproductores incrustados.'
};

// === FIREBASE INICIALIZACIÓN ===
// Esta función es llamada por firebase-init.js una vez que Firebase ha sido inicializado
// y el usuario ha sido autenticado.
window.initFirebase = (firestore, firebaseAuth, user) => {
    db = firestore; // Asigna la instancia de Firestore
    auth = firebaseAuth; // Asigna la instancia de Firebase Auth
    currentUser = user; // Asigna el objeto de usuario autenticado
    console.log('🔥 Firebase inicializado en app.js para el usuario:', currentUser.uid);

    // Habilitar UI una vez que Firebase está listo
    firebaseReady = true;
    searchInput.disabled = false;
    searchInput2.disabled = false;
    addButton.disabled = false;
    extractUserPlaylistButton.disabled = false; // Habilitar el botón de Google
    console.log('UI habilitada: Inputs de búsqueda y botón de añadir playlist.');

    // Cargar las playlists del usuario una vez que Firebase y el usuario están listos
    loadAndListenToPlaylists();

    // Inicializar Google API Client
    initGoogleApiClient();
};

// ===============================
// === FUNCIONES DE FIREBASE ===
// ===============================

/**
 * Carga las playlists del usuario desde Firestore y las renderiza.
 * Se suscribe a los cambios en tiempo real.
 */
async function loadAndListenToPlaylists() {
    if (!db || !currentUser) {
        console.warn('Firestore o usuario no inicializado. No se pueden cargar las playlists.');
        return;
    }

    try {
        // Usa la función `collection` de Firestore modular
        const userPlaylistsColRef = collection(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists');
        const q = query(userPlaylistsColRef, orderBy('order', 'asc')); // Asumiendo que tienes un campo `order`

        // Suscribirse a los cambios en tiempo real
        onSnapshot(q, async (snapshot) => {
            console.log('Cambios detectados en las playlists.');
            const fetchedPlaylists = [];
            for (const doc of snapshot.docs) {
                const playlist = doc.data();
                playlist.id = doc.id; // Añadir el ID del documento
                playlist.videos = []; // Inicializar videos como vacío

                // Si es una URL de playlist, cargar sus videos si no están ya en caché o si ha pasado mucho tiempo
                if (playlist.url && playlist.isYoutubePlaylist) {
                    try {
                        const videoDetails = await fetchPlaylistVideos(playlist.url); // Ahora devuelve detalles completos
                        playlist.videos = videoDetails.map(v => ({
                            videoId: v.videoId,
                            title: v.title,
                            duration: v.duration,
                            thumbnail: v.thumbnail,
                            playlistId: playlist.id // Asignar el ID de la playlist a cada video
                        }));
                    } catch (e) {
                        console.error(`Error al cargar videos para la playlist ${playlist.name} (${playlist.id}):`, e);
                        playlist.videos = []; // Asegurar que sea un array vacío en caso de error
                        mostrarMensajeFlotante(`No se pudieron cargar videos para la playlist: ${playlist.name}`, e.message);
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
            mostrarMensajeFlotante("Error al cargar tus playlists", error.message);
            hideLoadingSpinner();
        });

    } catch (error) {
        console.error("Error al inicializar la carga de playlists:", error);
        mostrarMensajeFlotante("Error al cargar las playlists.", "error");
    }
}

/**
 * Añade una nueva playlist (ya sea por URL o una playlist de videos individuales) a Firestore.
 * @param {string} url - La URL de la playlist o video.
 */
async function addPlaylistFromUrl(url) {
    if (!firebaseReady || !db || !currentUser) {
        mostrarMensajeFlotante("La aplicación no está lista. Por favor, espera a que se cargue completamente.");
        console.error("addPlaylistFromUrl: Firebase no está listo.");
        return;
    }

    if (!url) {
        showFloatingMessage("Por favor, introduce una URL de playlist o video.", "warning");
        return;
    }

    showLoadingSpinner();
    try {
        let playlistId;
        let playlistName;
        let thumbnailUrl;
        let isYoutubePlaylist = false;
        let videosData = []; // Para playlists de videos individuales

        // Validar si es una URL de YouTube Music o YouTube
        const youtubeMusicPlaylistMatch = url.match(/music\.youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/);
        const youtubePlaylistMatch = url.match(/(?:youtube\.com\/(?:playlist\?list=|embed\/videoseries\?list=)|youtu\.be\/playlist\?list=)([a-zA-Z0-9_-]+)/);

        if (youtubeMusicPlaylistMatch || youtubePlaylistMatch) {
            playlistId = youtubeMusicPlaylistMatch ? youtubeMusicPlaylistMatch[1] : youtubePlaylistMatch[1];
            isYoutubePlaylist = true;

            // Obtener información de la playlist desde Piped para nombre y thumbnail
            const playlistInfo = await fetchPlaylistDetailsFromPiped(playlistId);
            playlistName = playlistInfo.name || `Playlist Externa (${playlistId.substring(0, 5)}...)`;
            thumbnailUrl = playlistInfo.thumbnailUrl || ''; // Usar thumbnail de la playlist

            showFloatingMessage(`Se añadió la playlist de YouTube/Piped. Los videos se cargarán al expandirla.`, 'success');
        } else {
            // Asumir que son IDs de videos o una URL que debe ser manejada como video individual
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
                    showFloatingMessage(`Video "${videoInfo.title.substring(0, 30)}..." añadido como playlist individual.`, "success");
                } else {
                    throw new Error("No se pudo obtener información del video con la URL proporcionada.");
                }
            } else {
                throw new Error("URL no válida para playlist o video.");
            }
        }

        const playlistsColRef = collection(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists');
        const newPlaylistDocRef = doc(playlistsColRef); // Firestore genera un ID de documento automático

        await setDoc(newPlaylistDocRef, {
            name: playlistName,
            url: url, // Guardar la URL original
            isYoutubePlaylist: isYoutubePlaylist,
            videosData: videosData.length > 0 ? videosData : [], // Guardar videos individuales si existen
            thumbnailUrl: thumbnailUrl,
            order: playlistsData.length, // Para mantener el orden
            createdAt: new Date().toISOString() // Usar ISO string para la fecha
        });

        searchInput2.value = ''; // Limpiar el input
    } catch (e) {
        mostrarMensajeFlotante("Error al añadir playlist/video", e.message);
        console.error("Error al añadir playlist/video:", e);
    } finally {
        hideLoadingSpinner();
    }
}

/**
 * Elimina una playlist de Firestore.
 * @param {string} playlistId - ID de la playlist a eliminar.
 */
async function deletePlaylistFromFirestore(playlistId) {
    if (!db || !currentUser) {
        mostrarMensajeFlotante("Error: Firebase no está listo.", "error");
        return;
    }

    if (confirm("¿Estás seguro de que quieres eliminar esta playlist y todos sus videos?")) {
        showLoadingSpinner();
        try {
            const playlistDocRef = doc(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists', playlistId);
            await deleteDoc(playlistDocRef);
            console.log(`Playlist ${playlistId} eliminada de Firestore.`);
            showFloatingMessage("Playlist eliminada.", "success");
            hideLoadingSpinner();
        } catch (error) {
            console.error("Error al eliminar playlist de Firestore:", error);
            showFloatingMessage("Error al eliminar la playlist.", "error");
            hideLoadingSpinner();
        }
    }
}

/**
 * Añade un video a una playlist existente en Firestore.
 * @param {string} playlistId - ID de la playlist.
 * @param {object} videoData - Datos del video a añadir.
 */
async function addVideoToPlaylistInFirestore(playlistId, videoData) {
    if (!db || !currentUser) {
        showFloatingMessage("Error: Firebase no está listo.", "error");
        return;
    }
    showLoadingSpinner();
    try {
        const playlistDocRef = doc(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists', playlistId);
        const playlistDoc = await getDoc(playlistDocRef); // Obtener el documento actual
        let currentVideos = [];

        if (playlistDoc.exists()) {
            currentVideos = playlistDoc.data().videosData || []; // Usar videosData
        }

        // Evitar duplicados (opcional, si un video no debería estar dos veces en la misma playlist)
        const isDuplicate = currentVideos.some(video => video.videoId === videoData.videoId);
        if (isDuplicate) {
            showFloatingMessage("Este video ya está en esta playlist.", "warning");
            hideLoadingSpinner();
            return;
        }

        // Actualizar el documento de la playlist
        await updateDoc(playlistDocRef, {
            videosData: [...currentVideos, videoData], // Añade el nuevo video al array existente
            thumbnailUrl: playlistDoc.data().thumbnailUrl || videoData.thumbnailUrl // Usar la primera miniatura o mantener la existente
        });

        console.log(`Video ${videoData.videoId} añadido a la playlist ${playlistId}.`);
        showFloatingMessage("Video añadido a la playlist.", "success");
        hideLoadingSpinner();
        // closePlaylistSelectionPopups(); // Cerrar el popup de selección
    } catch (error) {
        console.error("Error al añadir video a playlist en Firestore:", error);
        showFloatingMessage("Error al añadir el video a la playlist.", "error");
        hideLoadingSpinner();
    }
}

/**
 * Elimina un video de una playlist en Firestore.
 * @param {string} playlistId - ID de la playlist.
 * @param {string} videoId - ID del video a eliminar.
 */
async function removeVideoFromPlaylistInFirestore(playlistId, videoId) {
    if (!db || !currentUser) {
        showFloatingMessage("Error: Firebase no está listo.", "error");
        return;
    }
    showLoadingSpinner();
    try {
        const playlistDocRef = doc(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists', playlistId);
        const playlistDoc = await getDoc(playlistDocRef);

        if (playlistDoc.exists()) {
            let currentVideos = playlistDoc.data().videosData || []; // Usar videosData
            const updatedVideos = currentVideos.filter(video => video.videoId !== videoId);

            // Actualizar el documento con el array de videos modificado
            await updateDoc(playlistDocRef, {
                videosData: updatedVideos, // Actualizar videosData
                thumbnailUrl: updatedVideos.length > 0 ? updatedVideos[0].thumbnail : '' // Actualizar miniatura
            });
            console.log(`Video ${videoId} eliminado de la playlist ${playlistId}.`);
            showFloatingMessage("Video eliminado de la playlist.", "success");
        } else {
            console.warn(`La playlist con ID ${playlistId} no existe.`);
        }
        hideLoadingSpinner();
    } catch (error) {
        console.error("Error al eliminar video de playlist en Firestore:", error);
        showFloatingMessage("Error al eliminar el video.", "error");
        hideLoadingSpinner();
    }
}

/**
 * Mueve un video entre playlists o reordena dentro de la misma playlist.
 * @param {object} video - Objeto del video a mover.
 * @param {string} currentPlaylistId - ID de la playlist de origen.
 * @param {string} targetPlaylistId - ID de la playlist de destino.
 * @param {number} [newIndex] - Nuevo índice para el video en la playlist de destino (opcional).
 */
async function moveVideoInPlaylistInFirestore(video, currentPlaylistId, targetPlaylistId, newIndex = -1) {
    if (!db || !currentUser) {
        showFloatingMessage("Error: Firebase no está listo.", "error");
        return;
    }

    showLoadingSpinner();
    try {
        // Si el video se mueve dentro de la misma playlist (reordenamiento)
        if (currentPlaylistId === targetPlaylistId) {
            const playlistDocRef = doc(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists', currentPlaylistId);
            const playlistDoc = await getDoc(playlistDocRef);
            if (playlistDoc.exists()) {
                let videos = playlistDoc.data().videosData || [];
                const oldIndex = videos.findIndex(v => v.videoId === video.videoId);

                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const [movedVideo] = videos.splice(oldIndex, 1);
                    videos.splice(newIndex, 0, movedVideo);
                    await updateDoc(playlistDocRef, { videosData: videos });
                    showFloatingMessage("Video reordenado en la playlist.", "success");
                }
            }
        } else {
            // Mover a una playlist diferente (eliminar de origen, añadir a destino)
            await removeVideoFromPlaylistInFirestore(currentPlaylistId, video.videoId);
            await addVideoToPlaylistInFirestore(targetPlaylistId, video);
            showFloatingMessage("Video movido a otra playlist.", "success");
        }
    } catch (error) {
        mostrarMensajeFlotante("Error al mover video.", error.message);
        console.error("Error al mover video:", error);
    } finally {
        hideLoadingSpinner();
    }
}


// ===============================
// === OTRAS FUNCIONES ===
// ===============================

function mostrarMensajeFlotante(message, type = "info", duration = 3000) {
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
// Función para mostrar/ocultar el spinner de carga (desde loadingSpinner.js)
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
        height: '100%', // Usar 100% para que se ajuste al contenedor
        width: '100%',
        videoId: '', // Sin video inicial
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
        height: '100%', // Usar 100% para que se ajuste al contenedor
        width: '100%',
        videoId: '', // Sin video inicial
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
        playButton.innerHTML = '<i class="fas fa-pause"></i>';
        startMonitoringProgress();
        showFloatingMessage(`Reproduciendo: ${player.getVideoData().title || 'Video desconocido'}`);
        // Solo para el reproductor activo:
        if (player === getCurrentPlayer()) {
            updateVisualPlayingIndicators(currentPlayingInfo.videoId); // Actualiza íconos de play
            handleSponsorBlockSegments(currentPlayingInfo.videoId, player.getCurrentTime());
            // Asegurarse de que el player actual esté en el z-index correcto y visible
            playerDiv.style.zIndex = '10';
            playerDiv.classList.remove('hidden', 'fade-out');
            playerDiv.classList.add('fade-in');
        }
    } else if (player.getPlayerState() === YT.PlayerState.PAUSED) {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        stopMonitoringProgress();
    } else if (player.getPlayerState() === YT.PlayerState.ENDED) {
        console.log(`Video ended on player ${playerDiv.id}.`);
        stopMonitoringProgress();
        if (!isTransitioning && player === getCurrentPlayer()) { // Si el reproductor principal terminó y no estamos en crossfade
            console.log("Video terminado y no en transición de crossfade. Reproduciendo el siguiente.");
            playNextVideo();
        } else if (isTransitioning && player !== getCurrentPlayer()) { // Si el reproductor inactivo terminó durante un crossfade
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
    playNextVideo(); // Intenta reproducir el siguiente video
}

/**
 * Carga y reproduce un video en el reproductor apropiado.
 * @param {string} videoId El ID del video de YouTube/Piped.
 * @param {number} startTime El tiempo de inicio en segundos.
 * @param {boolean} [isCrossfade=false] Indica si es parte de una transición crossfade.
 */
function loadVideo(videoId, startTime, isCrossfade = false) {
    if (!playersInitialized || (!player1 && !player2)) {
        mostrarMensajeFlotante("Los reproductores de YouTube no están inicializados.");
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
        mostrarMensajeFlotante("El reproductor activo no está listo para cargar videos. Inténtalo de nuevo.");
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
        mostrarMensajeFlotante("No hay video cargado para reproducir/pausar.");
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
        mostrarMensajeFlotante("No hay video cargado para avanzar.");
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
        mostrarMensajeFlotante("No hay video cargado para retroceder.");
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
    }, 1000); // Actualiza cada segundo
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
    if (segmentosCache[videoId]) {
        console.log(`Segmentos SB para ${videoId} encontrados en caché.`);
        return segmentosCache[videoId];
    }
    showLoadingSpinner();
    try {
        // Pasa el User ID en el encabezado X-UserID
        const response = await fetch(`${SPONSORBLOCK_API_URL}/segments/${videoId}`, {
            headers: {
                'X-UserID': currentUser.uid // Asegúrate de que currentUser.uid esté disponible
            }
        });

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
        return []; // Devolver un array vacío en caso de error
    }
}

async function checkForSponsorBlockSegments(currentTime, player) {
    if (ignoreSeek) return; // Evitar disparar múltiples saltos o bucles

    const currentVideoId = player.getVideoData().video_id;
    if (!currentVideoId) return;

    if (!segmentosCache[currentVideoId]) {
        // Cargar segmentos si no están en caché (no bloquear la reproducción)
        fetchSponsorBlockSegments(currentVideoId);
        return; // Esperar a que se carguen los segmentos
    }

    const segments = segmentosCache[currentVideoId];
    if (!segments || segments.length === 0) return;

    for (const segment of segments) {
        if (typeof segment.segment !== 'object' || segment.segment.length !== 2) {
            console.warn('Segmento SponsorBlock con formato incorrecto:', segment);
            continue;
        }
        const [start, end] = segment.segment;

        if (currentTime >= start && currentTime < end) {
            if (segment.category === 'sponsor' || segment.category === 'intro') {
                console.log(`Saltando segmento de ${segment.category}: ${formatTime(start)} - ${formatTime(end)}`);
                ignoreSeek = true; // Activar flag para evitar rebotes
                player.seekTo(end, true); // Saltar al final del segmento
                showFloatingMessage(`Saltando sección de ${segment.category}.`, 'info', 2000);
                setTimeout(() => {
                    ignoreSeek = false; // Desactivar flag después de un corto tiempo
                }, 1000); // Dar 1 segundo para que el seek se complete y el tiempo se actualice
                return; // Solo saltar un segmento por vez
            }
        }
    }
}

function checkForOutroCrossfade(currentTime, duration, player) {
    if (isTransitioning || hasOutroCrossfadeStarted) return; // Ya estamos en transición o ya se inició por outro

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
                hasOutroCrossfadeStarted = true; // Marcar que ya se disparó por outro
                startCrossfade();
                break; // Solo necesitamos detectar un outro
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


// Módulo: Piped API Helpers
const pipedInstances = [ // Lista de instancias Piped
    "https://pipedapi.ducks.party",
    "https://pipedapi.kavin.rocks" //  Añadir más instancias para mayor robustez
];

function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}

// Función fetch con reintentos (usada por getPlaylistInfo y fetchVideoDetails)
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

// Función auxiliar para obtener detalles de un video individual
async function fetchVideoDetails(videoId) {
    const instanceUrl = getRandomPipedInstance();
    try {
        const data = await fetchDataWithRetry(`${instanceUrl}/streams/${videoId}`);
        return {
            videoId: data.videoId,
            title: data.title,
            duration: data.duration, // Duración en segundos
            thumbnail: data.thumbnailUrl,
        };
    } catch (error) {
        console.error("Error fetching video details from Piped:", error);
        throw new Error(`Error al obtener detalles del video: ${error.message}`);
    }
}

// Función auxiliar para obtener detalles de una playlist (nombre, thumbnail)
async function fetchPlaylistDetailsFromPiped(playlistId) {
    const instanceUrl = getRandomPipedInstance();
    try {
        const data = await fetchDataWithRetry(`${instanceUrl}/playlists/${playlistId}`);
        return {
            name: data.name,
            thumbnailUrl: data.thumbnailUrl,
            relatedStreams: data.relatedStreams // También devolvemos los streams para fetchPlaylistVideos
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
        // Reutilizar fetchPlaylistDetailsFromPiped para obtener los videos también
        const playlistInfo = await fetchPlaylistDetailsFromPiped(playlistId);
        if (!playlistInfo || !playlistInfo.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos para la playlist.");
        }
        console.log(`Videos obtenidos de Piped para playlist ${playlistId}: ${playlistInfo.relatedStreams.length}`);
        return playlistInfo.relatedStreams.map(item => ({
            videoId: item.url.split('v=')[1] || item.url.split('/').pop(), // Asegurar que sea el ID de video
            title: item.title,
            duration: item.duration, // Duración en segundos
            thumbnail: item.thumbnail,
        }));
    } catch (error) {
        console.error(`Error al obtener videos de la playlist ${playlistId} de Piped:`, error);
        throw error;
    }
}


function displayPlaylists() {
    playlistsContainer.innerHTML = '';
    playlistsData.forEach(playlist => {
        const playlistGroup = document.createElement('div');
        playlistGroup.classList.add('playlist-group');
        playlistGroup.dataset.playlistId = playlist.id;

        const header = document.createElement('div');
        header.classList.add('playlist-group-header');
        header.innerHTML = `
            <img src="${playlist.thumbnailUrl || 'https://placehold.co/50x50/000000/FFFFFF?text=?'}" alt="Playlist Thumbnail" class="playlist-group-thumb">
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
                    flattenedIndex: getFlattenedVideos().findIndex(v => v.videoId === targetPlaylist.videos[0].videoId && v.playlistId === id)
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
                deletePlaylistFromFirestore(idToDelete);
                closeAllContextMenus();
            });
        });

        playlistsContainer.appendChild(playlistGroup);
    });
    updateVisualPlayingIndicators(currentPlayingInfo.videoId);
}

function renderPlaylistVideos(playlistId, containerElement) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist || !playlist.videos || playlist.videos.length === 0) {
        containerElement.innerHTML = `<p class="no-videos-message">No hay videos en esta playlist.</p>`;
        containerElement.style.maxHeight = containerElement.scrollHeight + 'px';
        return;
    }

    containerElement.innerHTML = ''; // Limpiar antes de renderizar
    playlist.videos.forEach((video, index) => {
        const videoElement = document.createElement('div');
        videoElement.classList.add('playlist-item');
        videoElement.draggable = true; // Habilitar arrastre
        videoElement.dataset.videoId = video.videoId;
        videoElement.dataset.playlistId = playlist.id;
        // Calcular flattenedIndex en el momento de la creación del elemento
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
                removeVideoFromPlaylistInFirestore(videoId, targetPlaylistId);
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
async function searchPipedVideos(query, append = false) { // Añadido 'append' para manejar si se añaden o se reemplazan resultados
    if (isLoadingMore) return; // Evitar llamadas duplicadas
    isLoadingMore = true;
    showLoadingSpinner();
    
    if (!append) { // Solo limpiar si es una nueva búsqueda
        resultsDiv.innerHTML = ''; 
        nextPageContext = null; // Resetear contexto de paginación para nueva búsqueda
    }

    let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
    if (nextPageContext) {
        apiUrl += `&nextpage=${encodeURIComponent(nextPageContext)}`; // Piped API usa un string para nextPage
    }

    console.log("Fetching search results from:", apiUrl); // Log de la URL
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log("Search results received:", data); // Log de los resultados

        // `nextPage` es lo que la API de Piped devuelve para la paginación.
        // Asegúrate de que tu función Netlify lo devuelva correctamente.
        nextPageContext = data.nextPage || null; // Almacena el contexto para la próxima carga
        
        displaySearchResults(data.items, append); // Pasar 'append' a displaySearchResults
    } catch (e) {
        mostrarMensajeFlotante("Error al buscar videos", e.message);
        console.error("Error al buscar videos:", e);
        if (!append) { // Solo mostrar mensaje de error si es la búsqueda inicial
            resultsDiv.innerHTML = `<p class="error-message">Error al cargar resultados de búsqueda: ${e.message}</p>`;
        }
    } finally {
        hideLoadingSpinner();
        isLoadingMore = false;
    }
}

function displaySearchResults(items, append = false) {
    if (!items || items.length === 0) {
        if (!append) { // Solo mostrar mensaje si no hay resultados en la primera carga
            resultsDiv.innerHTML = '<p class="no-videos-message">No se encontraron resultados para tu búsqueda.</p>';
        }
        return;
    }

    if (!append) {
        resultsDiv.innerHTML = ''; // Limpiar resultados anteriores solo si no estamos añadiendo
    }

    const fragment = document.createDocumentFragment(); // Usar un fragmento para mejor rendimiento
    items.forEach(item => {
        // Filtrar solo videos (Piped también puede devolver otros tipos de ítems)
        if (item.type === 'video') {
            const template = document.getElementById('search-result-template');
            // Asegúrate de que la plantilla exista
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
            fragment.appendChild(clone);
        }
    });
    resultsDiv.appendChild(fragment); // Añadir todos los elementos de una vez
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
    // Usar el botón que disparó el evento para posicionar mejor el popup
    const targetElement = event.target.closest('.add-to-playlist') || searchInput2;
    const targetRect = targetElement.getBoundingClientRect();
    
    popup.style.top = `${targetRect.bottom + 10}px`;
    popup.style.left = `${targetRect.left}px`;
    popup.style.minWidth = `${targetRect.width}px`; // Asegurar que el popup tenga al menos el ancho del botón

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
                        const playlistsColRef = collection(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists');
                        const newPlaylistDocRef = doc(playlistsColRef);
                        await setDoc(newPlaylistDocRef, {
                            name: newPlaylistName,
                            isYoutubePlaylist: false, // Nueva playlist de videos individuales
                            videosData: [video], // Añadir el video directamente
                            thumbnailUrl: video.thumbnail, // Usar la miniatura del primer video
                            order: playlistsData.length,
                            createdAt: new Date().toISOString()
                        });
                        showFloatingMessage(`Playlist "${newPlaylistName}" creada y video añadido.`, "success");
                    } catch (e) {
                        mostrarMensajeFlotante("Error al crear nueva playlist", e.message);
                        console.error("Error al crear nueva playlist:", e);
                    } finally {
                        hideLoadingSpinner();
                    }
                }
            } else {
                const playlistId = item.dataset.playlistId;
                await addVideoToPlaylistInFirestore(playlistId, video);
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
    const targetElement = event.target.closest('.move-video-button');
    const targetRect = targetElement.getBoundingClientRect();

    popup.style.top = `${targetRect.bottom + 10}px`;
    popup.style.left = `${targetRect.left}px`;
    popup.style.minWidth = `${targetRect.width}px`;

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
                        const playlistsColRef = collection(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists');
                        const newPlaylistDocRef = doc(playlistsColRef);
                        await setDoc(newPlaylistDocRef, {
                            name: newPlaylistName,
                            isYoutubePlaylist: false,
                            videosData: [video],
                            thumbnailUrl: video.thumbnail,
                            order: playlistsData.length,
                            createdAt: new Date().toISOString()
                        });
                        showFloatingMessage(`Video movido a la nueva playlist "${newPlaylistName}".`, "success");
                        // Eliminar de la playlist actual después de añadir a la nueva
                        await removeVideoFromPlaylistInFirestore(currentPlaylistId, video.videoId);
                    } catch (e) {
                        mostrarMensajeFlotante("Error al crear nueva playlist y mover video", e.message);
                        console.error("Error al crear nueva playlist y mover video:", e);
                    } finally {
                        hideLoadingSpinner();
                    }
                }
            } else {
                const targetPlaylistId = item.dataset.playlistId;
                await moveVideoInPlaylistInFirestore(video, currentPlaylistId, targetPlaylistId);
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


// Módulo: Google API Integration
function initGoogleApiClient() {
    gapi.load('client:auth2', () => {
        gapi.client.init({
            apiKey: GOOGLE_CLIENT_ID, // No se usa directamente con auth2, pero es buena práctica incluirlo
            clientId: GOOGLE_CLIENT_ID,
            discoveryDocs: GOOGLE_DISCOVERY_DOCS,
            scope: GOOGLE_SCOPES
        }).then(() => {
            console.log('Google API client inicializado.');
            // Puedes añadir lógica aquí para verificar si el usuario ya está logueado con Google
            // y actualizar la UI si es necesario.
        }, (error) => {
            console.error('Error al inicializar Google API client:', error);
            mostrarMensajeFlotante('Error al cargar la integración con Google.', error.details || error.message);
        });
    });
}

async function handleGoogleSignIn() {
    if (!gapi.client || !gapi.auth2) {
        mostrarMensajeFlotante("Google API no está cargada. Intenta recargar la página.");
        return;
    }

    try {
        showLoadingSpinner();
        const googleUser = await gapi.auth2.getAuthInstance().signIn();
        const id_token = googleUser.getAuthResponse().id_token;

        // Autenticar con Firebase usando el token de Google
        const credential = firebase.auth.GoogleAuthProvider.credential(id_token);
        await auth.signInWithCredential(credential);
        
        showFloatingMessage('¡Sesión iniciada con Google!', 'success');
        console.log('Usuario autenticado con Google en Firebase.');

        // Ahora que el usuario está autenticado con Google, podemos extraer sus playlists
        await fetchAndSaveUserPlaylists();

    } catch (error) {
        console.error('Error al iniciar sesión con Google:', error);
        if (error.code === 'auth/popup-closed-by-user') {
            showFloatingMessage('Inicio de sesión cancelado.', 'info');
        } else {
            mostrarMensajeFlotante('Error al iniciar sesión con Google.', error.message);
        }
    } finally {
        hideLoadingSpinner();
    }
}

async function fetchAndSaveUserPlaylists() {
    showLoadingSpinner();
    try {
        if (!gapi.client.youtube) {
            await gapi.client.load('youtube', 'v3');
            console.log('YouTube Data API v3 cargada.');
        }

        let nextPageToken = null;
        let newPlaylistsCount = 0;

        do {
            const response = await gapi.client.youtube.playlists.list({
                'part': 'snippet,contentDetails',
                'mine': true,
                'maxResults': 50, // Máximo permitido por la API
                'pageToken': nextPageToken
            });

            const playlists = response.result.items;
            console.log(`Playlists de YouTube obtenidas (página):`, playlists);

            for (const playlist of playlists) {
                if (playlist.snippet && playlist.snippet.title && playlist.id) {
                    const playlistUrl = `https://www.youtube.com/playlist?list=${playlist.id}`;
                    const thumbnailUrl = playlist.snippet.thumbnails?.medium?.url || playlist.snippet.thumbnails?.default?.url || '';

                    // Comprobar si la playlist ya existe en Firestore para evitar duplicados
                    const playlistsColRef = collection(db, 'artifacts', 'yt-crossmix-app', 'users', currentUser.uid, 'playlists');
                    const q = query(playlistsColRef, where('youtubePlaylistId', '==', playlist.id));
                    const existingPlaylistQuery = await getDocs(q); // Usar getDocs para una query

                    if (existingPlaylistQuery.empty) {
                        // Si no existe, añadirla
                        const newPlaylistDocRef = doc(playlistsColRef);
                        await setDoc(newPlaylistDocRef, {
                            name: playlist.snippet.title,
                            url: playlistUrl,
                            isYoutubePlaylist: true,
                            videosData: [], // Los videos se cargarán al expandir la playlist
                            thumbnailUrl: thumbnailUrl,
                            order: playlistsData.length + newPlaylistsCount, // Mantener el orden
                            createdAt: new Date().toISOString(),
                            youtubePlaylistId: playlist.id // Guardar el ID de YouTube para futuras referencias
                        });
                        newPlaylistsCount++;
                        console.log(`Playlist "${playlist.snippet.title}" guardada en Firestore.`);
                    } else {
                        console.log(`Playlist "${playlist.snippet.title}" ya existe en Firestore, omitiendo.`);
                    }
                }
            }
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        showFloatingMessage(`Se han extraído y guardado ${newPlaylistsCount} nuevas playlists de YouTube.`, 'success');
        // loadAndListenToPlaylists() se encargará de actualizar la UI
    } catch (error) {
        console.error('Error al extraer playlists de YouTube:', error);
        mostrarMensajeFlotante('Error al extraer tus playlists de YouTube.', error.message);
    } finally {
        hideLoadingSpinner();
    }
}


// Módulo: Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Deshabilitar inputs y botón al inicio
    searchInput.disabled = true;
    searchInput2.disabled = true;
    addButton.disabled = true;
    extractUserPlaylistButton.disabled = true; // Deshabilitar el nuevo botón al inicio

    // Carga la API de YouTube Iframe.
    // window.onYouTubeIframeAPIReady se llamará automáticamente cuando cargue.
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api"; // URL correcta para la API de YouTube
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

    // Event listener para el botón de extraer playlist de usuario
    extractUserPlaylistButton.addEventListener('click', handleGoogleSignIn);


    // Event listener para scroll infinito en resultados de búsqueda
    resultsContainer.addEventListener('scroll', () => {
        if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 100 && !isLoadingMore && nextPageContext) { // Usar nextPageContext global
            console.log("Cargando más resultados...");
            searchPipedVideos(currentSearchQuery, true); // Pasar 'true' para añadir resultados
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
