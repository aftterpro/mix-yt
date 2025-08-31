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
let crossfadeInterval = null;
let crossfadeInProgress = false;

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
