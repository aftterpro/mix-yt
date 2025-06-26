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

let playlistsData = []; // Array principal para almacenar todas las playlists [{id, name, thumbnailUrl, videos:[], isExpanded}, ...}]
let currentPlayingInfo = { // Para rastrear qué video/playlist está sonando
    playlistId: null,
    videoId: null,
    flattenedIndex: -1 // Índice en la lista aplanada para reproducción
};

// Variables para Búsqueda y Scroll Infinito
let isLoadingMore = false; // Flag para evitar cargas múltiples simultáneas
let nextPageContext = null; // Para guardar información de la siguiente página (si la API la provee)
let currentSearchQuery = ''; // Guarda la última consulta realizada
const searchResultsSection = document.getElementById('searchResultsSection'); // Main container for search results
const resultsContainer = document.getElementById('resultsContainer'); // Scrollable container
const resultsDiv = document.getElementById('results'); // Grid container for search items

// Variables para SponsorBlock y Seek
let segmentosCache = {}; // Objeto para cachear los segmentos de SponsorBlock por videoId
const SPONSORBLOCK_USER_ID = 'YOUR_SPONSORBLOCK_USER_ID'; // <--- !!! IMPORTANTE: REEMPLAZA CON TU USER ID DE SPONSORBLOCK !!!

// URLs de las instancias de la API de Piped. Puedes añadir o quitar según necesites.
const pipedInstances = [
    "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party"
    // "https://piapi.ggtyler.dev" carga lenta imagenes
];

function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}

// Módulo: Utilidades UI/UX
function showLoadingSpinner() {
    document.getElementById('loadingSpinner').classList.remove('hidden');
}

function hideLoadingSpinner() {
    document.getElementById('loadingSpinner').classList.add('hidden');
}

function showErrorMessage(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
    setTimeout(() => {
        errorContainer.classList.add('hidden');
    }, 5000); // Hide after 5 seconds
}

function showFloatingMessage(message) {
    const container = document.getElementById('floatingMessageContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'floating-message';
    messageDiv.textContent = message;
    container.appendChild(messageDiv);

    // Fade out and remove the message after a delay
    setTimeout(() => {
        messageDiv.classList.add('fade-out');
        messageDiv.addEventListener('transitionend', () => {
            messageDiv.remove();
        });
    }, 3000); // Message stays for 3 seconds before fading
}

// Módulo: Funciones de Reproductores y YouTube API
function onYouTubeIframeAPIReady() {
    youtubeAPIReady = true;
    console.log('YouTube Iframe API is ready.');
    initializePlayers();
}

function initializePlayers() {
    if (!youtubeAPIReady || playersInitialized) return;

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        videoId: '', // Will be set dynamically
        playerVars: {
            'autoplay': 0,
            'controls': 1,
            'rel': 0, // No related videos
            'fs': 1, // Fullscreen button
            'modestbranding': 1, // Minimal YouTube branding
            'loop': 0, // Loop is handled manually
            'disablekb': 1, // Disable keyboard controls
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
        videoId: '', // Will be set dynamically
        playerVars: {
            'autoplay': 0,
            'controls': 1,
            'rel': 0,
            'fs': 1,
            'modestbranding': 1,
            'loop': 0,
            'disablekb': 1,
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

let playersReadyCount = 0;
function onPlayerReady(event) {
    playersReadyCount++;
    console.log(`Player ${event.target.getIframe().id} is ready.`);
    if (playersReadyCount === 2) {
        console.log('Both players are ready.');
        hideLoadingSpinner(); // Hide spinner once players are ready
        // Optionally load the first video if a playlist is already present
        if (playlistsData.length > 0 && playlistsData[0].videos.length > 0) {
            playVideo(playlistsData[0].id, playlistsData[0].videos[0].id, 0);
        }
    }
}

function onPlayerStateChange(event) {
    const player = event.target;
    const playerElement = player.getIframe();
    const playerId = playerElement.id;
    // console.log(`Player ${playerId} state changed to: ${event.data}`);

    // Track when the main player finishes playing (event.data === 0)
    if (event.data === YT.PlayerState.ENDED) {
        console.log(`Player ${playerId} finished playing.`);
        // Only trigger next video if this is the currently active player and not during a transition
        if (!isTransitioning && playerId === `player${currentPlayer}`) {
            playNextVideo();
        }
    }
}

function onPlayerError(event) {
    console.error(`Player ${event.target.getIframe().id} encountered an error:`, event.data);
    showErrorMessage(`Error en el reproductor: ${event.data}. Intentando reproducir siguiente video.`);
    // Attempt to play the next video on error
    playNextVideo();
}

// Módulo: Lógica de Reproducción
async function playVideo(playlistId, videoId, flattenedIndex, startTime = 0) {
    showLoadingSpinner();
    if (!player1 || !player2 || !youtubeAPIReady) {
        console.warn('Players not ready yet. Retrying in 1 second...');
        setTimeout(() => playVideo(playlistId, videoId, flattenedIndex, startTime), 1000);
        return;
    }

    const videoToPlay = playlistsData.flatMap(p => p.videos).find(v => v.id === videoId);
    if (!videoToPlay) {
        console.error(`Video with ID ${videoId} not found.`);
        hideLoadingSpinner();
        return;
    }

    const activePlayer = (currentPlayer === 1) ? player1 : player2;
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1;

    currentPlayingInfo = { playlistId, videoId, flattenedIndex };
    highlightCurrentPlayingVideo();
    updateNextInQueueDisplay(); // Update next in queue display

    try {
        await activePlayer.loadVideoById(videoId, startTime);
        activePlayer.playVideo();
        console.log(`Playing video ${videoId} on player${currentPlayer}.`);

        // Fetch SponsorBlock segments for the new video
        const segments = await fetchSponsorBlockSegments(videoId);
        segmentosCache[videoId] = segments; // Cache the segments
        console.log(`SB segments for ${videoId}:`, segments);

        startPlaybackMonitor(activePlayer, videoId);
        hideLoadingSpinner();
    } catch (error) {
        console.error(`Error loading video ${videoId}:`, error);
        showErrorMessage(`No se pudo cargar el video: ${videoToPlay.title}.`);
        hideLoadingSpinner();
        playNextVideo(); // Try playing the next video
    }
}

async function playNextVideo() {
    console.log('Attempting to play next video...');
    const allVideos = playlistsData.flatMap(p => p.videos);
    const currentIndex = allVideos.findIndex(v => v.id === currentPlayingInfo.videoId);

    if (currentIndex === -1) {
        console.warn('Current video not found in flattened list. Stopping playback.');
        stopPlaybackMonitor();
        return;
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex < allVideos.length) {
        const nextVideo = allVideos[nextIndex];
        const nextPlaylistId = playlistsData.find(p => p.videos.some(v => v.id === nextVideo.id)).id;
        console(`Next video found: ${nextVideo.title}. Initiating crossfade.`);
        await triggerCrossfade(nextPlaylistId, nextVideo.id, nextIndex);
    } else {
        console.log('End of playlist queue. Stopping playback.');
        stopPlaybackMonitor();
        showFloatingMessage('¡Fin de la cola de reproducción!');
        // Optionally, clear currentPlayingInfo or reset UI
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
        highlightCurrentPlayingVideo(); // Remove highlight
        updateNextInQueueDisplay();
    }
}

async function triggerCrossfade(nextPlaylistId, nextVideoId, nextFlattenedIndex) {
    if (isTransitioning || isAudioFading) {
        console.log('Transition already in progress. Skipping.');
        return;
    }
    isTransitioning = true;
    isAudioFading = true; // Set audio fading flag

    stopPlaybackMonitor(); // Stop monitoring the current video

    const activePlayer = (currentPlayer === 1) ? player1 : player2;
    const inactivePlayer = (currentPlayer === 1) ? player2 : player1;

    const nextVideoTitle = playlistsData.flatMap(p => p.videos).find(v => v.id === nextVideoId).title;
    showFloatingMessage(`Siguiente: ${nextVideoTitle}`);

    // Set up the inactive player for the next video
    inactivePlayer.loadVideoById(nextVideoId);
    inactivePlayer.playVideo();
    inactivePlayer.setVolume(0); // Start the new video muted

    // Apply visual crossfade
    aplicarTransicionVisual(`player${currentPlayer === 1 ? 2 : 1}`, `player${currentPlayer}`);

    // Audio crossfade
    const fadeInterval = 100; // ms
    const fadeSteps = (CROSSFADE_DURATION * 1000) / fadeInterval; // Total steps for crossfade
    const volumeStep = 100 / fadeSteps;

    let currentVolume = 100;
    let fadeAudioInterval = setInterval(() => {
        if (currentVolume <= 0) {
            clearInterval(fadeAudioInterval);
            activePlayer.pauseVideo();
            activePlayer.seekTo(0, false);
            activePlayer.stopVideo(); // Ensure the old video completely stops
            activePlayer.setVolume(100); // Reset volume for next use

            // Switch current player
            currentPlayer = (currentPlayer === 1) ? 2 : 1;
            currentPlayingInfo = { playlistId: nextPlaylistId, videoId: nextVideoId, flattenedIndex: nextFlattenedIndex };
            highlightCurrentPlayingVideo();
            updateNextInQueueDisplay();

            isAudioFading = false;
            isTransitioning = false;
            startPlaybackMonitor(inactivePlayer, nextVideoId); // Start monitoring the new active player

            console.log(`Crossfade complete. Now playing on player${currentPlayer}.`);
            return;
        }

        currentVolume -= volumeStep;
        if (currentVolume < 0) currentVolume = 0; // Prevent negative volume

        activePlayer.setVolume(currentVolume);
        inactivePlayer.setVolume(100 - currentVolume);

    }, fadeInterval);
}

// Módulo: Monitorización de Reproducción (SponsorBlock)
function startPlaybackMonitor(player, videoId) {
    // Clear any existing interval
    if (monitorInterval) {
        clearInterval(monitorInterval);
    }

    monitorInterval = setInterval(async () => {
        if (!player || !player.getCurrentTime) {
            // Player might be uninitialized or errored out
            clearInterval(monitorInterval);
            return;
        }

        const currentTime = player.getCurrentTime();
        const segments = segmentosCache[videoId];

        if (!segments || segments.length === 0) {
            // console.log(`No SponsorBlock segments for ${videoId}.`);
            return;
        }

        for (const segment of segments) {
            const segmentStart = segment.segment[0];
            const segmentEnd = segment.segment[1];

            // Check if current time is within a segment
            if (currentTime >= segmentStart && currentTime < segmentEnd) {
                console.log(`Skipping ${segment.category} segment from ${segmentStart} to ${segmentEnd}.`);
                player.seekTo(segmentEnd, true); // Seek to the end of the segment
                return; // Only skip one segment at a time
            }

            // Check for outro segment to trigger crossfade early
            if (segment.category === 'outro' && !hasOutroCrossfadeStarted &&
                currentTime >= segmentStart - CROSSFADE_DURATION && currentTime < segmentStart) {
                console.log(`Outro segment detected, triggering crossfade in ${segmentStart - currentTime} seconds.`);
                hasOutroCrossfadeStarted = true; // Set flag to prevent multiple triggers
                // Instead of direct crossfade here, let the normal playback proceed,
                // and once the main video is near its end (considering outro),
                // the `onPlayerStateChange` (YT.PlayerState.ENDED) or a separate timer
                // should manage the `playNextVideo` which then calls `triggerCrossfade`.
                // For a more precise "outro-driven crossfade", you'd need to adjust
                // the `playNextVideo` logic to be aware of the outro time and
                // call `triggerCrossfade` when `currentTime` reaches `segmentStart - CROSSFADE_DURATION`.
                // For now, `onPlayerStateChange` is enough to trigger next video.
            }
        }
    }, 500); // Check every 500ms
}

function stopPlaybackMonitor() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('Playback monitor stopped.');
    }
    hasOutroCrossfadeStarted = false; // Reset for next video
}

// Módulo: Manejo de Playlists (CRUD & UI)
async function fetchPlaylistData(playlistId) {
    showLoadingSpinner();
    const instanceUrl = getRandomPipedInstance();
    const proxyUrl = `/.netlify/functions/playlist?id=${encodeURIComponent(playlistId)}`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        hideLoadingSpinner();
        return data;
    } catch (error) {
        console.error('Error fetching playlist:', error);
        showErrorMessage('Error al cargar la playlist. Asegúrate que la ID/URL sea correcta y pública.');
        hideLoadingSpinner();
        return null;
    }
}

async function addPlaylist() {
    const playlistIdInput = document.getElementById('playlistIdInput');
    let input = playlistIdInput.value.trim();
    if (!input) {
        showFloatingMessage('Por favor, introduce una ID o URL de playlist.');
        return;
    }

    let playlistId = extractPlaylistId(input);
    if (!playlistId) {
        showFloatingMessage('ID de playlist inválida. Introduce una ID o URL válida de YouTube.');
        return;
    }

    if (playlistsData.some(p => p.id === playlistId)) {
        showFloatingMessage('Esta playlist ya ha sido añadida.');
        playlistIdInput.value = '';
        return;
    }

    const playlistData = await fetchPlaylistData(playlistId);
    if (playlistData) {
        // Map videos to a simpler structure if needed, or use directly
        const videos = playlistData.relatedStreams.map(video => ({
            id: video.url.split('v=')[1].split('&')[0], // Extract video ID from URL
            title: video.title,
            duration: video.duration, // Duration in seconds
            thumbnail: video.thumbnail,
            author: video.uploaderName // Assuming uploaderName is available
        }));

        const newPlaylist = {
            id: playlistData.id,
            name: playlistData.name,
            thumbnailUrl: playlistData.thumbnailUrl,
            videos: videos,
            isExpanded: false
        };
        playlistsData.push(newPlaylist);
        renderPlaylists();
        playlistIdInput.value = '';
        showFloatingMessage(`Playlist "${newPlaylist.name}" añadida.`);

        // If this is the first playlist and players are ready, start playing the first video
        if (playlistsData.length === 1 && newPlaylist.videos.length > 0 && playersReadyCount === 2) {
            playVideo(newPlaylist.id, newPlaylist.videos[0].id, 0);
        }
    }
}

function extractPlaylistId(input) {
    // Regex for various YouTube playlist URL formats
    const playlistIdMatch = input.match(/[?&]list=([^&]+)/);
    if (playlistIdMatch && playlistIdMatch[1]) {
        return playlistIdMatch[1];
    }
    // If it's just an ID
    if (input.length === 34 && /^[a-zA-Z0-9_-]+$/.test(input)) { // Typical playlist ID length and characters
        return input;
    }
    return null;
}

function renderPlaylists() {
    const playlistsContainer = document.getElementById('playlistsContainer');
    playlistsContainer.innerHTML = ''; // Clear existing playlists

    if (playlistsData.length === 0) {
        playlistsContainer.innerHTML = '<p class="no-playlists-message">Aún no hay playlists añadidas.</p>';
        return;
    }

    const playlistTemplate = document.getElementById('playlist-template');
    const playlistVideoTemplate = document.getElementById('playlist-video-template');

    playlistsData.forEach((playlist, playlistIndex) => {
        const playlistClone = document.importNode(playlistTemplate.content, true);
        const playlistItem = playlistClone.querySelector('.playlist-item');

        playlistItem.dataset.playlistId = playlist.id;
        playlistClone.querySelector('.playlist-thumbnail').src = playlist.thumbnailUrl;
        playlistClone.querySelector('.playlist-title').textContent = playlist.name;

        const expandButton = playlistClone.querySelector('.expand-playlist-button');
        const deletePlaylistButton = playlistClone.querySelector('.delete-playlist-button');
        const playlistVideosContainer = playlistClone.querySelector('.playlist-videos');

        // Set initial expanded state
        if (playlist.isExpanded) {
            playlistVideosContainer.style.display = 'block';
            expandButton.querySelector('i').classList.replace('fa-chevron-down', 'fa-chevron-up');
        } else {
            playlistVideosContainer.style.display = 'none';
            expandButton.querySelector('i').classList.replace('fa-chevron-up', 'fa-chevron-down');
        }

        expandButton.onclick = (event) => {
            event.stopPropagation(); // Prevent triggering playlist item click
            playlist.isExpanded = !playlist.isExpanded;
            renderPlaylists(); // Re-render to reflect expanded state
        };

        deletePlaylistButton.onclick = (event) => {
            event.stopPropagation();
            deletePlaylist(playlist.id);
        };

        // Render videos within the playlist
        playlist.videos.forEach((video, videoIndex) => {
            const videoClone = document.importNode(playlistVideoTemplate.content, true);
            const videoItem = videoClone.querySelector('.playlist-video-item');
            videoItem.dataset.videoId = video.id;
            videoItem.dataset.playlistId = playlist.id; // Store playlist ID on video item for easier lookup

            videoClone.querySelector('.video-thumbnail').src = video.thumbnail;
            videoClone.querySelector('.video-title').textContent = video.title;
            videoClone.querySelector('.duration').textContent = formatDuration(video.duration);

            const deleteVideoButton = videoClone.querySelector('.delete-video-button');
            const moveUpButton = videoClone.querySelector('.move-up-button');
            const moveDownButton = videoClone.querySelector('.move-down-button');
            const addToOtherPlaylistButton = videoClone.querySelector('.add-to-other-playlist-button');
            const videoInfoAndThumbnail = videoClone.querySelector('.video-info-and-thumbnail'); // The clickable area

            videoInfoAndThumbnail.onclick = () => {
                const flattenedIndex = playlistsData.flatMap(p => p.videos).findIndex(v => v.id === video.id);
                playVideo(playlist.id, video.id, flattenedIndex);
            };

            deleteVideoButton.onclick = (event) => {
                event.stopPropagation();
                deleteVideoFromPlaylist(playlist.id, video.id);
            };

            moveUpButton.onclick = (event) => {
                event.stopPropagation();
                moveVideoInPlaylist(playlist.id, video.id, -1);
            };

            moveDownButton.onclick = (event) => {
                event.stopPropagation();
                moveVideoInPlaylist(playlist.id, video.id, 1);
            };

            addToOtherPlaylistButton.onclick = (event) => {
                event.stopPropagation();
                showPlaylistSelectionPopup(video.id);
            };

            playlistVideosContainer.appendChild(videoClone);
        });

        playlistsContainer.appendChild(playlistClone);
    });

    highlightCurrentPlayingVideo(); // Ensure the currently playing video is highlighted after re-render
}

function deletePlaylist(playlistId) {
    playlistsData = playlistsData.filter(p => p.id !== playlistId);
    renderPlaylists();
    showFloatingMessage('Playlist eliminada.');
    // If the currently playing video was from this playlist, stop playback
    if (currentPlayingInfo.playlistId === playlistId) {
        // Potentially stop player or play next available video
        // For simplicity, just reset current playing info for now
        currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
        stopPlaybackMonitor();
        // You might want to also actively stop player1/player2 here
    }
    updateNextInQueueDisplay();
}

function deleteVideoFromPlaylist(playlistId, videoId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (playlist) {
        playlist.videos = playlist.videos.filter(v => v.id !== videoId);
        if (playlist.videos.length === 0) {
            // If playlist becomes empty, remove it
            deletePlaylist(playlistId);
        } else {
            renderPlaylists();
        }
        showFloatingMessage('Video eliminado de la playlist.');
        // If the deleted video was the current one, play the next one
        if (currentPlayingInfo.playlistId === playlistId && currentPlayingInfo.videoId === videoId) {
            playNextVideo(); // Will attempt to play the next video
        }
        updateNextInQueueDisplay();
    }
}

function moveVideoInPlaylist(playlistId, videoId, direction) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    const videoIndex = playlist.videos.findIndex(v => v.id === videoId);
    if (videoIndex === -1) return;

    const newIndex = videoIndex + direction;

    if (newIndex >= 0 && newIndex < playlist.videos.length) {
        const [movedVideo] = playlist.videos.splice(videoIndex, 1);
        playlist.videos.splice(newIndex, 0, movedVideo);
        renderPlaylists();
        showFloatingMessage('Video movido.');
    }
    updateNextInQueueDisplay();
}

function showPlaylistSelectionPopup(videoIdToMove) {
    // This function will need to create and display a popup
    // that lists all current playlists (except the one the video is already in)
    // and allows the user to select one to add the video to.
    // For now, let's just log a message.
    showFloatingMessage(`Funcionalidad "Añadir a otra playlist" para ${videoIdToMove} no implementada.`);
    // You would dynamically create HTML for a popup here.
}


// Módulo: Búsqueda de Videos
async function searchYouTube(query, nextPageToken = null) {
    if (isLoadingMore) return; // Prevent multiple simultaneous loads
    isLoadingMore = true;
    showLoadingSpinner();
    searchResultsSection.classList.remove('hidden'); // Show search results section

    const instanceUrl = getRandomPipedInstance();
    let proxyUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
    if (nextPageToken) {
        proxyUrl += `&nextpage=${encodeURIComponent(nextPageToken)}`;
    }

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        console.log('Search API response:', data);

        // Update current search query and next page token
        currentSearchQuery = query;
        nextPageContext = data.nextPageContext || null; // Piped API might use nextPageContext

        // Clear previous results if it's a new search (not loading more)
        if (!nextPageToken) {
            resultsDiv.innerHTML = '';
        }

        renderSearchResults(data.items);
    } catch (error) {
        console.error('Error searching YouTube:', error);
        showErrorMessage('Error al realizar la búsqueda. Inténtalo de nuevo más tarde.');
    } finally {
        isLoadingMore = false;
        hideLoadingSpinner();
    }
}

function renderSearchResults(items) {
    const searchResultTemplate = document.getElementById('search-result-template');

    items.forEach(item => {
        // Filter to only show videos
        if (item.type === 'video') {
            const videoId = item.url.split('v=')[1].split('&')[0]; // Extract video ID
            const videoDuration = item.duration; // Piped API usually returns duration in seconds
            const videoThumbnail = item.thumbnail;
            const videoTitle = item.title;

            const resultClone = document.importNode(searchResultTemplate.content, true);
            const searchResultItem = resultClone.querySelector('.search-result-item');

            searchResultItem.dataset.videoId = videoId;
            searchResultItem.dataset.title = videoTitle;
            searchResultItem.dataset.duration = videoDuration;
            searchResultItem.dataset.thumbnail = videoThumbnail;

            searchResultItem.querySelector('.result-thumbnail').src = videoThumbnail;
            searchResultItem.querySelector('.result-title').textContent = videoTitle;
            searchResultItem.querySelector('.duration').textContent = formatDuration(videoDuration);

            // Make the entire search result item clickable to add to a playlist
            searchResultItem.addEventListener('click', () => {
                promptForPlaylistAndAddVideo(videoId, videoTitle, videoDuration, videoThumbnail);
            });

            resultsDiv.appendChild(resultClone);
        }
    });
}

function promptForPlaylistAndAddVideo(videoId, videoTitle, videoDuration, videoThumbnail) {
    if (playlistsData.length === 0) {
        showFloatingMessage('Crea una playlist primero para añadir videos.');
        return;
    }

    // This is a simplified prompt. In a real app, you'd show a modal/popup
    // with a list of playlists to choose from.
    // For now, let's just add it to the first playlist by default, or ask the user for an index.
    const playlistNames = playlistsData.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    let chosenIndex = prompt(`Añadir "${videoTitle}" a qué playlist?\n\n${playlistNames}\n\nIntroduce el número:`);

    if (chosenIndex === null) return; // User cancelled

    chosenIndex = parseInt(chosenIndex) - 1; // Convert to 0-based index

    if (chosenIndex >= 0 && chosenIndex < playlistsData.length) {
        const targetPlaylist = playlistsData[chosenIndex];
        addVideoToExistingPlaylist(targetPlaylist.id, videoId, videoTitle, videoDuration, videoThumbnail);
    } else {
        showFloatingMessage('Número de playlist inválido.');
    }
}

function addVideoToExistingPlaylist(playlistId, videoId, videoTitle, videoDuration, videoThumbnail) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) {
        showErrorMessage('Playlist no encontrada para añadir el video.');
        return;
    }

    // Check if video already exists in the playlist
    if (playlist.videos.some(v => v.id === videoId)) {
        showFloatingMessage('Este video ya está en esta playlist.');
        return;
    }

    const newVideo = {
        id: videoId,
        title: videoTitle,
        duration: videoDuration,
        thumbnail: videoThumbnail
        // You might add author/uploader here if available from search results
    };

    playlist.videos.push(newVideo);
    renderPlaylists(); // Re-render to update the playlist display
    showFloatingMessage(`"${videoTitle}" añadido a "${playlist.name}".`);
}


// Módulo: Funciones de Utilidad
function formatDuration(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
        return 'N/A'; // Or any other placeholder for invalid duration
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function highlightCurrentPlayingVideo() {
    // Remove highlight from all videos first
    document.querySelectorAll('.playlist-video-item').forEach(item => {
        item.classList.remove('current-playing');
    });
    // Add highlight to the current video
    if (currentPlayingInfo.videoId) {
        const currentVideoElement = document.querySelector(`.playlist-video-item[data-video-id="${currentPlayingInfo.videoId}"]`);
        if (currentVideoElement) {
            currentVideoElement.classList.add('current-playing');
            // Ensure the playlist containing the current video is expanded
            const parentPlaylist = currentVideoElement.closest('.playlist-item');
            if (parentPlaylist) {
                const playlistId = parentPlaylist.dataset.playlistId;
                const playlist = playlistsData.find(p => p.id === playlistId);
                if (playlist && !playlist.isExpanded) {
                    playlist.isExpanded = true;
                    renderPlaylists(); // Re-render to expand it
                }
                // Optional: Scroll the video into view
                currentVideoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
}

function updateNextInQueueDisplay() {
    const nextInQueueContainer = document.getElementById('nextInQueueContainer');
    const nextInQueueMessage = document.getElementById('nextInQueueMessage');
    nextInQueueContainer.innerHTML = ''; // Clear previous content
    nextInQueueContainer.appendChild(nextInQueueMessage); // Re-add the message

    const allVideos = playlistsData.flatMap(p => p.videos);
    const currentIndex = allVideos.findIndex(v => v.id === currentPlayingInfo.videoId);

    if (currentIndex !== -1 && currentIndex + 1 < allVideos.length) {
        const nextVideo = allVideos[currentIndex + 1];

        const nextVideoItem = document.createElement('div');
        nextVideoItem.className = 'next-video-item';
        nextVideoItem.innerHTML = `
            <div class="thumbnail-container">
                <img src="${nextVideo.thumbnail}" alt="Next video thumbnail" class="next-thumbnail">
            </div>
            <h4 class="next-title">${nextVideo.title}</h4>
        `;
        nextInQueueContainer.appendChild(nextVideoItem);
        nextInQueueMessage.classList.add('hidden'); // Hide "No next video" message
    } else {
        nextInQueueMessage.classList.remove('hidden'); // Show "No next video" message
    }
}

// Módulo: Transición Visual
/**
 * Aplica una transición visual de crossfade entre dos elementos de reproductor.
 * El player saliente se desvanece y desenfoca, y el player entrante aparece y se enfoca.
 *
 * @param {string} playerEntranteId - El ID del elemento del reproductor que debe aparecer (e.g., 'player1', 'player2').
 * @param {string} playerSalienteId - El ID del elemento del reproductor que debe desvanecerse (e.g., 'player1', 'player2').
 */
function aplicarTransicionVisual(playerEntranteId, playerSalienteId) {
    const playerEntrante = document.getElementById(playerEntranteId);
    const playerSaliente = document.getElementById(playerSalienteId);

    if (!playerEntrante || !playerSaliente) return;

    // Resetea clases por si estaban mal de una transición anterior
    playerEntrante.classList.remove('fade-out', 'hidden');
    playerSaliente.classList.remove('fade-in');

    // Asegura que el player entrante esté encima durante la transición
    playerEntrante.style.zIndex = '2';
    playerSaliente.style.zIndex = '1';

    // Aplica clases de transición
    playerEntrante.classList.add('fade-in');
    playerSaliente.classList.add('fade-out');
 
    // Después de la duración del crossfade, ocultar el player saliente y resetear sus clases
    // También se puede hacer un timeout para resetear el z-index del player entrante a un valor normal
    setTimeout(() => {
        playerSaliente.classList.add('hidden');
        playerSaliente.classList.remove('fade-out', 'fade-in'); // Limpia todas las clases de fade
        playerSaliente.style.zIndex = '-1'; // Asegura que esté detrás y no interactúe

        playerEntrante.classList.remove('fade-in'); // Limpia la clase de fade-in
        playerEntrante.style.zIndex = '1'; // Restablece z-index a un valor normal

    }, CROSSFADE_DURATION * 1000); // Multiplicar por 1000 para convertir segundos a milisegundos
}

// Módulo: Event Listeners y Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Load YouTube Iframe API script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Event listener for adding playlist
    document.getElementById('addPlaylistButton').addEventListener('click', addPlaylist);
    document.getElementById('playlistIdInput').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            addPlaylist();
        }
    });

    // Event listener for search
    document.getElementById('searchButton').addEventListener('click', () => {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            searchYouTube(query);
        } else {
            showFloatingMessage('Introduce algo para buscar.');
        }
    });

    document.getElementById('searchInput').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const query = document.getElementById('searchInput').value.trim();
            if (query) {
                searchYouTube(query);
            } else {
                showFloatingMessage('Introduce algo para buscar.');
            }
        }
    });

    // Infinite scroll for search results
    resultsContainer.addEventListener('scroll', () => {
        if (resultsContainer.scrollTop + resultsContainer.clientHeight >= resultsContainer.scrollHeight - 50 &&
            !isLoadingMore && nextPageContext && currentSearchQuery) {
            console.log('Fetching more search results...');
            // Piped API uses `nextPageContext` which contains `nextPage` and `continuation`
            // You might need to adjust this based on the exact structure of `data.nextPageContext` from your proxy.
            // Assuming `nextPageContext` directly contains a token or an object from which a token can be derived.
            // If it's `data.nextPageContext.continuation`, use that. If it's a simple string, use it.
            const nextPageToken = nextPageContext ? (nextPageContext.continuation || nextPageContext.nextPage) : null;
            if (nextPageToken) {
                searchYouTube(currentSearchQuery, nextPageToken);
            } else {
                console.log('No more pages to load.');
            }
        }
    });

    // Close contextual menus (the 3 dots menu) if the click target is not inside a .delete-menu
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.delete-menu')) {
            closeAllContextMenus();
        }
        // Close the generic playlist selection popups if the click target is not inside a .playlist-selection-popup-menu
        // Ensure this new class is used for both Add and Move popups (which it is in the new code)
        if (!event.target.closest('.playlist-selection-popup-menu')) {
            closePlaylistSelectionPopups(); // <-- NEW CALL HERE
        }
    }, true); // Keep using the capture phase for better reliability

    // Initial render of playlists (if any are pre-loaded or from localStorage)
    // For now, we'll assume playlistsData is empty initially and populated via addPlaylist.
    // If you plan to save/load playlists from localStorage, this is where you'd load them.
    // loadPlaylistsFromLocalStorage(); // Example if you have this function
    renderPlaylists(); // Initial render to show "no playlists" message

    // Hide initial loading spinner, will be shown again when players initialize
    hideLoadingSpinner();
});


function closeAllContextMenus() {
    document.querySelectorAll('.delete-menu-content').forEach(menu => {
        menu.style.display = 'none';
    });
}

function closePlaylistSelectionPopups() {
    // This function assumes you'll create a popup with the class 'playlist-selection-popup-menu'
    document.querySelectorAll('.playlist-selection-popup-menu').forEach(popup => {
        popup.remove(); // Or set display: none;
    });
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
