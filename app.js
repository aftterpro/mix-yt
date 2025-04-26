
// Módulo: Configuración y Variables Globales
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let monitorInterval; // Declarar fuera para controlar el intervalo
let playersInitialized = false; // Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let isTransitioning = false; // Flag para estado de transición

// --- NUEVA ESTRUCTURA DE DATOS ---
let playlistsData = []; // Array principal para almacenar todas las playlists [{id, name, thumbnailUrl, videos:[], isExpanded}, ...]
let currentPlayingInfo = { // Para rastrear qué video/playlist está sonando
    playlistId: null,
    videoId: null,
    flattenedIndex: -1 // Índice en la lista aplanada para reproducción
};
// --- FIN NUEVA ESTRUCTURA ---

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


// Mensaje flotante (Optimizado)
function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'mensaje-flotante';
    // Insertar después del contenedor de playlist para que no interfiera con scroll
    const playlistContainerElement = document.getElementById('playlistContainer');
    if (playlistContainerElement) {
         playlistContainerElement.insertAdjacentElement('afterend', mensajeDiv);
    } else {
        document.body.appendChild(mensajeDiv); // Fallback
    }


    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => {
            mensajeDiv.remove();
        }, 1000); // Tiempo para que termine la animación fadeOut
    }, 6000); // Duración visible del mensaje: 6 segundos
}
// Ejemplo de uso inicial:
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
    console.log("API de YouTube cargada y lista.");
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
    // console.log(`Player ${changedPlayerNum} State Change: ${playerState}`);

     if (playerState === YT.PlayerState.PLAYING && changedPlayerNum === currentPlayer) {
         updateCurrentPlayingIndex();
         // Llamar a checkAndSkipSegment forzando el chequeo (ignora isTransitioning)
         checkAndSkipSegment(event.target, true); // <<<< AÑADIR true AQUÍ
     } else if (playerState === YT.PlayerState.ENDED) {
          console.log('Video finalizado en Player', changedPlayerNum);
        if (changedPlayerNum === currentPlayer) {
            lastSeekEndTime = -1;
            playNextVideo();
        } else {
             console.log(`Video en player inactivo ${changedPlayerNum} terminó. Ignorando.`);
        }
     } else if (playerState === YT.PlayerState.PAUSED) {
        console.log('Video en pausa en Player', changedPlayerNum);
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
            durationSpan.textContent = formatDuration2(video.duration);
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
        addToPlaylistButton.classList.add('add-to-playlist');
        addToPlaylistButton.dataset.videoId = videoId;
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        const durationSeconds = typeof video.duration === 'number' ? video.duration : parseDuration(video.duration);
        addToPlaylistButton.dataset.videoDuration = durationSeconds;
        addToPlaylistButton.addEventListener('click', () => {
            const videoData = {
                videoId: addToPlaylistButton.dataset.videoId,
                title: addToPlaylistButton.dataset.videoTitle,
                thumbnail: addToPlaylistButton.dataset.videoThumbnail,
                duration: parseInt(addToPlaylistButton.dataset.videoDuration, 10),
            };
            addToPlaylist(videoData); // Llama a la función refactorizada
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

// Función auxiliar para formatear duración (Segundos -> MM:SS)
function formatDuration2(durationInSeconds) {
    if (isNaN(durationInSeconds) || durationInSeconds <= 0) return "0:00";
    const minutes = Math.floor(durationInSeconds / 60);
    const seconds = Math.floor(durationInSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
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
async function handlePlaylistLoaded(playlistInfo) {
    console.log('Datos de playlist recibidos:', playlistInfo);
    if (!playlistInfo || !playlistInfo.relatedStreams || !Array.isArray(playlistInfo.relatedStreams)) {
        mostrarMensajeFlotante('No se encontraron videos válidos en la playlist.');
        return;
    }
    const playlistId = playlistInfo.id || playlistInfo.url?.split('list=')[1] || `playlist_${Date.now()}`;

    if (playlistsData.some(p => p.id === playlistId)) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name || playlistId}" ya está cargada.`);
        return;
    }

    const loadedVideos = playlistInfo.relatedStreams.map((video) => ({
        videoId: video.url?.split('v=')[1],
        title: video.title || "Título Desconocido",
        thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75?text=NoThumb',
        duration: parseDuration(video.duration) || 0,
    })).filter(v => v.videoId);

    if (loadedVideos.length === 0) {
        mostrarMensajeFlotante(`La playlist "${playlistInfo.name}" no contiene videos válidos.`);
        return;
    }

    const newPlaylist = {
        id: playlistId,
        name: playlistInfo.name || "Playlist Sin Nombre",
        thumbnailUrl: playlistInfo.thumbnailUrl || loadedVideos[0]?.thumbnail || 'https://via.placeholder.com/50?text=?', // Fallback
        videos: loadedVideos,
        isExpanded: true
    };

    playlistsData.push(newPlaylist);
    console.log(`Playlist '${newPlaylist.name}' añadida a playlistsData.`);
    updatePlaylistsUI();

    if (getFlattenedPlaylist().length > 0 && botonPlay.disabled) {
        botonPlay.disabled = false;
    }
    mostrarMensajeFlotante(`Playlist "${newPlaylist.name}" cargada (${loadedVideos.length} videos).`);
}

// --- Añadir video Manualmente ---
const addToPlaylist = (videoData) => {
    if (!videoData || !videoData.videoId) {
        console.error("Error: Datos de video inválidos:", videoData);
        mostrarMensajeFlotante("Error al añadir el video. Datos inválidos.");
        return;
    }
    const manualPlaylistId = 'manual';
    let manualPlaylist = playlistsData.find(p => p.id === manualPlaylistId);
    if (!manualPlaylist) {
        manualPlaylist = {
            id: manualPlaylistId,
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico',
            videos: [],
            isExpanded: true
        };
        playlistsData.push(manualPlaylist);
        console.log("Playlist 'manual' creada.");
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
        duration: parseDuration(videoData.duration) || 0,
    };

    manualPlaylist.videos.push(videoObject);
    mostrarMensajeFlotante(`Video añadido a "${manualPlaylist.name}": ${videoObject.title}`);
    console.log(`Video añadido a playlist '${manualPlaylistId}': ${videoObject.title}`);
    updatePlaylistsUI();
    if (getFlattenedPlaylist().length > 0 && botonPlay.disabled) {
        botonPlay.disabled = false;
    }
};

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

// --- Helper para crear elemento de Video en Playlist ---
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

    // Resaltar si está sonando
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

    // --- Menú ---
    const deleteMenu = document.createElement('div');
    deleteMenu.className = 'delete-menu';
    const menuButton = document.createElement('button');
    menuButton.className = 'delete-menu-button';
    menuButton.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    const menuContent = document.createElement('div');
    menuContent.className = 'delete-menu-content';
    // Definir botones del menú
    menuContent.innerHTML = `
        <button class="delete-button-item" title="Eliminar de esta playlist"><i class="fa-solid fa-xmark"></i> Eliminar</button>
        <button class="move-to-top-button" title="Mover al inicio de esta playlist"><i class="fa-solid fa-arrow-up-to-line"></i> Poner Primero</button>
        `;
    deleteMenu.appendChild(menuButton);
    deleteMenu.appendChild(menuContent);
    item.appendChild(deleteMenu);

    // Listeners del Menú
    menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const allMenus = document.querySelectorAll('#playlistContainer .delete-menu-content');
        allMenus.forEach(mc => { if (mc !== menuContent) mc.style.display = 'none'; });
        menuContent.style.display = menuContent.style.display === 'block' ? 'none' : 'block';
    });
    menuContent.querySelector('.delete-button-item').addEventListener('click', (event) => {
        event.stopPropagation();
        deleteVideo(playlistId, video.videoId);
    });
    menuContent.querySelector('.move-to-top-button').addEventListener('click', (event) => {
        event.stopPropagation();
        moveVideoWithinPlaylist(playlistId, video.videoId, 0);
    });
    // menuContent.querySelector('.move-next-button').addEventListener('click', (event) => { ... }); // Lógica más compleja

    return item;
}

// --- Función para alternar expansión/colapso ---
// app.js

// --- REEMPLAZA la función togglePlaylistExpansion existente con esta: ---
function togglePlaylistExpansion(playlistId) {
    const playlist = playlistsData.find(p => p.id === playlistId);
    if (!playlist) return;

    // Alternar el estado
    playlist.isExpanded = !playlist.isExpanded;

    const groupDiv = document.querySelector(`.playlist-group[data-playlist-id="${playlistId}"]`);
    const videosDiv = groupDiv?.querySelector('.playlist-group-videos');
    const icon = groupDiv?.querySelector('.expand-icon');

    if (groupDiv && videosDiv && icon) {
        // Actualizar clases para icono y estado general
        groupDiv.classList.toggle('expanded', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-up', playlist.isExpanded);
        icon.classList.toggle('fa-chevron-down', !playlist.isExpanded);

        // Detener transiciones pendientes en este elemento para evitar conflictos
        videosDiv.removeEventListener('transitionend', handleTransitionEnd); // Quitar listener anterior si existe

        if (playlist.isExpanded) {
            // --- EXPANDIR ---
            // 1. (CSS ya NO debería tener display: none) Asegurar que sea visible para medir
            videosDiv.style.display = 'block'; // O 'flex', 'grid' si usas eso internamente
            videosDiv.style.maxHeight = '0px'; // Asegurar que parte de 0

            // 2. Calcular altura necesaria
            const scrollHeight = videosDiv.scrollHeight;

            // 3. Aplicar altura para iniciar animación
            requestAnimationFrame(() => { // Esperar al siguiente frame
                videosDiv.style.maxHeight = scrollHeight + 'px';
            });

            // 4. Opcional: Remover max-height explícito después de la animación para altura natural
            videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });

        } else {
            // --- COLAPSAR ---
            // 1. Establecer max-height a su altura actual ANTES de animar a 0
            videosDiv.style.maxHeight = videosDiv.scrollHeight + 'px';

            // 2. Forzar reflow para que la transición se aplique desde la altura actual
            requestAnimationFrame(() => {
                 // 3. Animar a max-height 0
                 videosDiv.style.maxHeight = '0px';
            });

            // 4. Opcional: Poner display: none DESPUÉS de que termine la animación
             videosDiv.addEventListener('transitionend', handleTransitionEnd, { once: true });
        }
    } else {
        // Fallback si no se encuentran los elementos: re-renderizar todo
        console.warn("Elementos no encontrados para toggle, re-renderizando UI completa.");
        updatePlaylistsUI();
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

    mostrarMensajeFlotante(`Video "${deletedVideoTitle}" eliminado.`);
    console.log(`Eliminando video: ${deletedVideoTitle} de playlist ${playlistId}`);

    // Opcional: Eliminar playlist si queda vacía (excepto la manual)
    if (playlistsData[playlistIndex].videos.length === 0 && playlistId !== 'manual') {
         mostrarMensajeFlotante(`Playlist "${playlistsData[playlistIndex].name}" eliminada (vacía).`);
         playlistsData.splice(playlistIndex, 1);
    }

    updatePlaylistsUI(); // Actualizar UI
    updateCurrentPlayingIndex(); // Recalcular índice por si acaso
}

// --- REESCRIBIR COMPLETAMENTE enableDragAndDrop ---
function enableDragAndDrop() {
    const playlistContainer = document.getElementById('playlistContainer');
    if (!playlistContainer) return;

    let draggedItemElement = null; // Elemento DOM que se arrastra
    let draggedVideoData = null;   // Objeto { videoId, sourcePlaylistId }
    let placeholder = null;        // Elemento visual temporal

    // Crear placeholder una vez
    function createPlaceholder() {
        const ph = document.createElement('div');
        ph.className = 'playlist-item placeholder';
        ph.style.height = '40px'; // Altura aprox de un item
        ph.style.backgroundColor = 'rgba(0, 123, 255, 0.2)';
        ph.style.border = '1px dashed #007bff';
        ph.style.margin = '4px 0';
        return ph;
    }
    placeholder = createPlaceholder();

    // --- Event Listeners en los ITEMS (.playlist-item) ---
    playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
        // DRAG START: Inicia el arrastre
        item.addEventListener('dragstart', (event) => {
            const targetItem = event.target.closest('.playlist-item');
            if (!targetItem) return;

            draggedItemElement = targetItem;
            draggedVideoData = {
                videoId: targetItem.dataset.videoId,
                sourcePlaylistId: targetItem.dataset.playlistId
            };

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedVideoData.videoId); // Guardar ID

            // Añadir clase con delay
            setTimeout(() => targetItem.classList.add('dragging'), 0);
            console.log(`Drag Start: Video ${draggedVideoData.videoId} from Playlist ${draggedVideoData.sourcePlaylistId}`);
        });

        // DRAG END: Termina el arrastre (se suelte o se cancele)
        item.addEventListener('dragend', (event) => {
            if (draggedItemElement) {
                draggedItemElement.classList.remove('dragging');
            }
            if(placeholder && placeholder.parentNode) {
                 placeholder.remove(); // Limpiar placeholder
            }
             // Limpiar clases visuales de drop target
            document.querySelectorAll('.drag-over-area').forEach(el => el.classList.remove('drag-over-area'));
            draggedItemElement = null;
            draggedVideoData = null;
        });

         // DRAG OVER: Cuando se arrastra SOBRE otro item
         item.addEventListener('dragover', (event) => {
             event.preventDefault(); // Necesario
             event.dataTransfer.dropEffect = 'move';
             const targetItem = event.target.closest('.playlist-item');
             if (!targetItem || targetItem === draggedItemElement) return; // No sobre sí mismo

             // Insertar placeholder ANTES del item sobre el que estamos
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              // Decidir si insertar antes o después basado en la mitad del item
              if (offsetY < targetRect.height / 2) {
                   targetItem.parentNode.insertBefore(placeholder, targetItem);
              } else {
                   targetItem.parentNode.insertBefore(placeholder, targetItem.nextSibling);
              }
        });

        // DRAG ENTER/LEAVE (menos fiable que dragover para placeholder)
        // Se puede omitir si dragover funciona bien para el placeholder

        // DROP: Cuando se SUELTA sobre otro item
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
            const droppedVideoId = event.dataTransfer.getData('text/plain'); // Debería coincidir con draggedVideoData.videoId

             // Calcular índice destino basado en la posición donde estaba el placeholder
             const videoElements = Array.from(targetItem.parentNode.children).filter(el => el !== placeholder && !el.classList.contains('dragging'));
             // El índice será la posición del targetItem en la lista filtrada
             let targetIndex = videoElements.indexOf(targetItem);

            // Si el placeholder estaba DESPUÉS del targetItem, el índice es +1
             // (Esto es más complejo, usar la posición del placeholder es mejor)
             // O más simple: obtener el índice del targetItem real y decidir antes/después
              const targetRect = targetItem.getBoundingClientRect();
              const offsetY = event.clientY - targetRect.top;
              if (offsetY >= targetRect.height / 2) {
                   targetIndex++; // Insertar después
              }


            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) sobre item ${targetItem.dataset.videoId} (Playlist ${targetPlaylistId}, índice ${targetIndex})`);

            // Llamar a la función unificada para mover
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });

    // --- Event Listeners en los CONTENEDORES de Videos (.playlist-group-videos) ---
    playlistContainer.querySelectorAll('.playlist-group-videos').forEach(container => {

        // DRAG OVER: Arrastrando sobre el área del contenedor (para añadir al final)
        container.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move';
             // Añadir indicador visual solo si no hay items hijos (o si estamos al final?)
             if (container.children.length === 0 || event.offsetY > container.scrollHeight - 20) {
                 container.classList.add('drag-over-area');
                  // Añadir placeholder al final si no está ya ahí
                  if (!placeholder.parentNode || placeholder.nextSibling) {
                     container.appendChild(placeholder);
                  }
             } else {
                 container.classList.remove('drag-over-area');
                 // El dragover sobre un item manejará el placeholder
             }
        });

         // DRAG LEAVE: Saliendo del área del contenedor
         container.addEventListener('dragleave', (event) => {
              // Quitar indicador si salimos del área Y no entramos en un hijo
             if (!container.contains(event.relatedTarget)) {
                  container.classList.remove('drag-over-area');
                   if(placeholder.parentNode === container) placeholder.remove();
             }
         });

        // DROP: Soltando sobre el área del contenedor (generalmente para añadir al final)
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

            // Mover al final de esta playlist
             const targetPlaylist = playlistsData.find(p => p.id === targetPlaylistId);
             const targetIndex = targetPlaylist ? targetPlaylist.videos.length : 0; // Índice final

            console.log(`Drop: Video ${droppedVideoId} (from ${draggedVideoData.sourcePlaylistId}) al final de Playlist ${targetPlaylistId}`);
            moveVideo(droppedVideoId, draggedVideoData.sourcePlaylistId, targetPlaylistId, targetIndex);
        });
    });
}

// --- NUEVA Función Unificada para Mover Videos (dentro y entre playlists) ---
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

    // 4. Actualizar la UI completa
    updatePlaylistsUI();

    // 5. Recalcular el índice de reproducción aplanado
    // Es crucial llamar a esto DESPUÉS de actualizar playlistsData
    updateCurrentPlayingIndex();
}

// Módulo: Reproducción y Crossfade (Adaptado Parcialmente)

// --- Play/Next   ---
function playNextVideo() {

     console.log(`playNextVideo: Llamado. Índice aplanado actual: ${currentPlayingInfo.flattenedIndex}`);
    if (isTransitioning) {
        console.warn("playNextVideo: Transición ya en progreso.");
        return;
    }

    const flatList = getFlattenedPlaylist();
    if (flatList.length === 0) {
        console.log("playNextVideo: No hay videos para reproducir.");
        stopMonitoring();
        return;
    }

    let nextIndex = currentPlayingInfo.flattenedIndex + 1;

    // Verificar si llegamos al final
    if (nextIndex >= flatList.length) {
        console.log('playNextVideo: Fin de la lista aplanada detectado.');
        askToRepeatPlaylist();
        return;
    }

    isTransitioning = true;
    const previousFlatIndex = currentPlayingInfo.flattenedIndex; // Guardar índice anterior
    const previousVideoIdForCleanup = currentPlayingInfo.videoId; // Guardar ID anterior para limpieza SB
    console.log(`playNextVideo: *** Transición INICIADA desde índice aplanado ${previousFlatIndex}. Flag=true. ***`);

    try {
        // --- Actualizar estado ANTES de iniciar cargas ---
        currentPlayingInfo.flattenedIndex = nextIndex;
        const nextVideo = flatList[nextIndex];
        if (!nextVideo || !nextVideo.videoId) {
             console.error("playNextVideo: Siguiente video inválido en lista aplanada.", nextVideo);
             throw new Error("Siguiente video inválido."); // Lanzar error para revertir en catch
        }
        currentPlayingInfo.videoId = nextVideo.videoId;
        currentPlayingInfo.playlistId = nextVideo.sourcePlaylistId;
        const nextVideoId = nextVideo.videoId;
        // --- Fin actualización estado ---


        console.log(`playNextVideo: Cargando SIGUIENTE video (${nextVideoId}), índice aplanado=${nextIndex}.`);

        const currentPlayerElement = document.getElementById(`player${currentPlayer}`);
        const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

        if (nextPlayerInstance && typeof nextPlayerInstance.loadVideoById === 'function') {
            nextPlayerInstance.loadVideoById(nextVideoId);
            if (nextPlayerElement) nextPlayerElement.classList.remove('hidden');
        } else {
            console.error("playNextVideo: Error crítico - nextPlayerInstance inválido.");
             throw new Error("Reproductor destino inválido.");
        }

        // Actualizar UI para mostrar el nuevo item como 'playing' (incluso antes de sonar)
        updatePlaylistsUI();

        // Iniciar transición visual
        if (currentPlayerElement) currentPlayerElement.classList.add('fade-out');
        if (nextPlayerElement) nextPlayerElement.classList.add('fade-in');


        // Timeout para completar la transición
        setTimeout(() => {
            console.log(`playNextVideo: TIMEOUT INICIADO para transición desde índice aplanado ${previousFlatIndex}.`);
            try {
                if (currentPlayerElement) {
                    currentPlayerElement.classList.remove('fade-out');
                    currentPlayerElement.classList.add('hidden');
                }
                if (nextPlayerElement) {
                    nextPlayerElement.classList.remove('fade-in');
                }

                const oldPlayerNum = currentPlayer;
                currentPlayer = currentPlayer === 1 ? 2 : 1; // Cambiar player activo LÓGICO
                console.log(`playNextVideo: Timeout - currentPlayer cambiado a ${currentPlayer}.`);

                crossfadeAudio(); // Iniciar crossfade de audio AHORA

                // Limpiar caché SB del video ANTERIOR (usando ID guardado)
                if (previousVideoIdForCleanup && segmentosCache[previousVideoIdForCleanup]) {
                    console.log(`playNextVideo: Timeout - Limpiando caché SB para video ANTERIOR: ${previousVideoIdForCleanup}`);
                    delete segmentosCache[previousVideoIdForCleanup];
                }
                 // Resetear seek si era del video viejo
                 if (lastSeekVideoId === previousVideoIdForCleanup) {
                     lastSeekEndTime = -1;
                 }

            } catch (timeoutError) {
                console.error("Error dentro del setTimeout de playNextVideo:", timeoutError);
            } finally {
                isTransitioning = false; // Marcar transición como finalizada
                console.log(`playNextVideo: *** Transición FINALIZADA (Timeout para índice ${previousFlatIndex}). Flag=false. ***`);
                 // Forzar re-sincronización del índice por si acaso algo cambió durante la transición
                 updateCurrentPlayingIndex();
            }
        }, 2000); // Duración del timeout

    } catch (error) {
        console.error("Error en playNextVideo:", error);
        isTransitioning = false; // Asegurar reset del flag
        // Revertir estado al anterior en caso de error
        const previousVideo = flatList[previousFlatIndex];
         currentPlayingInfo.flattenedIndex = previousFlatIndex;
         currentPlayingInfo.videoId = previousVideo ? previousVideo.videoId : null;
         currentPlayingInfo.playlistId = previousVideo ? previousVideo.sourcePlaylistId : null;
        console.log(`playNextVideo: *** Transición INTERRUMPIDA (Error). Flag=false. Estado revertido a índice ${previousFlatIndex} ***`);
        updatePlaylistsUI(); // Reflejar estado revertido
    }
}

// --- Crossfade Audio con Preload ---
function crossfadeAudio() {
    const previousPlayer = currentPlayer === 1 ? player2 : player1;
    const nextPlayer = currentPlayer === 1 ? player1 : player2;
    if (!previousPlayer || !nextPlayer || typeof previousPlayer.setVolume !== 'function' || typeof nextPlayer.setVolume !== 'function') {
        console.error("Crossfade Audio: Reproductores inválidos.");
        return;
    }

    let currentVolume = 100;
    let nextVolume = 0;
    const crossfadeSteps = CROSSFADE_DURATION * 5; // 5 steps per second
    const volumeStep = crossfadeSteps > 0 ? 100 / crossfadeSteps : 100; // Avoid division by zero
    const intervalTime = crossfadeSteps > 0 ? 200 : 100; // 1000ms / 5 steps

    const crossfadeInterval = setInterval(() => {
        currentVolume = Math.max(0, currentVolume - volumeStep);
        nextVolume = Math.min(100, nextVolume + volumeStep);

        try { // Envolver en try/catch por si un player deja de existir
            if (previousPlayer) previousPlayer.setVolume(currentVolume);
            if (nextPlayer) nextPlayer.setVolume(nextVolume);
        } catch (e) {
             console.error("Error setting volume during crossfade:", e);
             clearInterval(crossfadeInterval);
             return;
        }


        // --- Crossfade de audio completado ---
        if (currentVolume <= 0 && nextVolume >= 100) {
            clearInterval(crossfadeInterval);
            console.log("Crossfade audio terminado.");

             // --- PRELOAD NEXT VIDEO (N+2) ---
             // Usar el índice aplanado actual para encontrar el siguiente
            const preloadFlatIndex = currentPlayingInfo.flattenedIndex + 1;
            console.log(`Crossfade: Intentando pre-cargar video en índice aplanado: ${preloadFlatIndex}`);

            const flatList = getFlattenedPlaylist(); // Obtener lista actualizada

            if (preloadFlatIndex < flatList.length) {
                const preloadVideo = flatList[preloadFlatIndex];
                if (preloadVideo && preloadVideo.videoId) {
                    const preloadVideoId = preloadVideo.videoId;
                    // El reproductor para pre-cargar es el que acaba de silenciarse ('previousPlayer')
                    const preloadPlayer = previousPlayer;
                    const preloadPlayerNum = (currentPlayer === 1) ? 2 : 1;

                    if (preloadPlayer && typeof preloadPlayer.loadVideoById === 'function') {
                        console.log(`Crossfade: Pre-cargando video ID ${preloadVideoId} (índice aplanado ${preloadFlatIndex}) en Player ${preloadPlayerNum}.`);
                        try {
                            preloadPlayer.loadVideoById(preloadVideoId);
                        } catch (e) {
                            console.error(`Error pre-cargando video ${preloadVideoId} en Player ${preloadPlayerNum}:`, e);
                        }
                    } else {
                        console.warn(`Crossfade: No se pudo pre-cargar. Reproductor destino (Player ${preloadPlayerNum}) inválido.`);
                    }
                } else {
                    console.warn(`Crossfade: No se pudo pre-cargar. Datos de video inválidos en índice aplanado ${preloadFlatIndex}.`);
                }
            } else {
                console.log(`Crossfade: No hay más videos en la lista aplanada para pre-cargar (índice ${preloadFlatIndex}).`);
            }
            // --- END PRELOAD ---
        }
    }, intervalTime);
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
        mostrarMensajeFlotante("Los reproductores aún no están listos.");
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

async function monitorPlayers() {
    if (isTransitioning || !playersInitialized) {
        // console.log("Monitor: Pausado (transición o no inicializado).");
        return;
    }

    const activePlayer = currentPlayer === 1 ? player1 : player2;
    if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') {
        // console.log("Monitor: Player activo no válido.");
        return; // Salir si el player activo no es válido
    }

    const playerState = activePlayer.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING) {
        // console.log("Monitor: Player activo no está reproduciendo.");
        return; // Solo actuar si está reproduciendo
    }

    let videoId;
    let currentTime;
    let playerDuration;
    try {
         const videoData = activePlayer.getVideoData();
         if (!videoData || !videoData.video_id) {
             // console.log("Monitor: Datos de video no disponibles aún.");
              return; // Salir si no tenemos ID
         }
         videoId = videoData.video_id;
         currentTime = activePlayer.getCurrentTime();
         playerDuration = activePlayer.getDuration();
    } catch (e) {
         console.error("Monitor: Error obteniendo datos del reproductor activo", e);
         return; // Salir si hay error obteniendo datos
    }


    if (isNaN(playerDuration) || playerDuration <= 0 || isNaN(currentTime)) {
         // console.log("Monitor: Duración o tiempo actual inválido.");
         return; // Salir si la duración o tiempo no son válidos
    }

    // --- Lógica de Crossfade ---
    try {
        let effectiveDuration = playerDuration;
        let durationSource = "Player";

        // Obtener duración de SponsorBlock si está disponible
        const cachedData = segmentosCache[videoId];
        let sbDuration = null;
        if (cachedData && cachedData.length > 0 && cachedData[0].videoDuration) {
            sbDuration = parseFloat(cachedData[0].videoDuration);
        } else if (!cachedData && segmentosCache[videoId] !== null) { // null indica que ya se intentó buscar y no había
             // console.log(`Monitor: Obteniendo segmentos SB para ${videoId} (cálculo duración)`);
             // No esperar aquí para no bloquear el monitor, la próxima vez usará caché
             obtenerSegmentosSponsorBlock(videoId).then(segments => {
                 segmentosCache[videoId] = segments || null; // Guardar segmentos o null
             });
        }

        if (sbDuration && !isNaN(sbDuration) && sbDuration > 0) {
             effectiveDuration = sbDuration;
             durationSource = "SponsorBlock";
        }


        const timeRemaining = effectiveDuration - currentTime;
        const roundedTimeRemaining = Math.floor(timeRemaining);

        // Log de cuenta regresiva (opcional, puede ser ruidoso)
        // if (roundedTimeRemaining >= 0 && roundedTimeRemaining <= CROSSFADE_DURATION + 10) {
        //     console.log(`Monitor: Player ${currentPlayer} (${videoId}). Base: ${durationSource}(${effectiveDuration.toFixed(1)}s). Tiempo Crossfade Aprox: ${roundedTimeRemaining}s.`);
        // }

        // Evaluar condición de Crossfade
        if (timeRemaining <= CROSSFADE_DURATION && timeRemaining >= -1) { // Permitir un pequeño margen negativo
            console.log(`Monitor: *** Condición crossfade CUMPLIDA (Player ${currentPlayer}, ${videoId}). Restante: ${timeRemaining.toFixed(1)}s. Llamando playNextVideo... ***`);
            playNextVideo();
            // IMPORTANTE: Salir aquí para no ejecutar skip de segmentos en el video actual
            return;
        }

    } catch (error) {
        console.error(`Monitor: Error procesando crossfade para Player ${currentPlayer} (${videoId || 'ID desconocido'}):`, error);
    }

    // --- Lógica de Salto de Segmentos (SponsorBlock) ---
    // Si NO es tiempo de crossfade, verificar saltos internos
    try {
         // console.log(`Monitor: No es tiempo de crossfade, verificando saltos internos para ${videoId}`);
         await checkAndSkipSegment(activePlayer); // Llamar a la función de chequeo
    } catch (error) {
         console.error(`Monitor: Error procesando skip de segmentos para Player ${currentPlayer} (${videoId || 'ID desconocido'}):`, error);
    }
}


// --- SponsorBlock: Chequear y Saltar Segmento ---
async function checkAndSkipSegment(playerInstance) {
    if (isTransitioning) return; // No saltar durante transición
    if (!playerInstance || typeof playerInstance.getCurrentTime !== 'function') return;

    let videoId;
    let currentTime;
    try {
        const videoData = playerInstance.getVideoData();
        if (!videoData || !videoData.video_id) return; // Salir si no hay ID
        videoId = videoData.video_id;
        currentTime = playerInstance.getCurrentTime();
    } catch (e) {
        console.error("checkAndSkipSegment: Error obteniendo datos del reproductor", e);
        return;
    }

    // Reiniciar lastSeek si el video cambió
    if (lastSeekVideoId !== videoId) {
        lastSeekEndTime = -1;
        lastSeekVideoId = videoId;
        // console.log("checkAndSkipSegment: Video cambiado a", videoId);
    }

    // Obtener segmentos (usar caché o buscar)
    let segmentos = segmentosCache[videoId];
    if (!segmentos && segmentosCache[videoId] !== null) { // Si no está en caché Y no es null (ya intentado)
         // console.log(`checkAndSkipSegment: Obteniendo segmentos SB para ${videoId}`);
         try {
            segmentos = await obtenerSegmentosSponsorBlock(videoId);
            segmentosCache[videoId] = segmentos || null; // Guardar resultado (o null si no hay)
             if (segmentos && segmentos.length > 0) {
                  // Ordenar por tiempo de inicio una sola vez al obtenerlos
                 segmentos.sort((a, b) => parseFloat(a.startTime) - parseFloat(b.startTime));
                 console.log("Segmentos cacheados y ordenados para", videoId, ":", segmentos);
             } else {
                 console.log("No se encontraron segmentos SB para", videoId);
             }
         } catch(e) {
             console.error("Error obteniendo segmentos SB:", e);
             segmentosCache[videoId] = null; // Marcar como fallido para no reintentar constantemente
             segmentos = null;
         }
    } else if (segmentosCache[videoId] === null) {
         segmentos = null; // Ya se intentó y no se encontraron/hubo error
    }


    // Lógica de salto
    if (segmentos && segmentos.length > 0) {
        for (const segmento of segmentos) {
            const startTime = parseFloat(segmento.startTime);
            const endTime = parseFloat(segmento.endTime);

            if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) continue;

            // Condición de estar dentro del segmento
            const isInSegment = (currentTime >= startTime && currentTime < endTime);

            if (isInSegment) {
                // Saltar solo si NO acabamos de saltar a ESTE punto final
                if (lastSeekEndTime !== endTime) {
                    console.log(`SPONSORBLOCK SKIP: Saltando segmento (${segmento.category}) en t=${currentTime.toFixed(1)}. Saltando a ${endTime.toFixed(1)}.`);
                    mostrarMensajeFlotante(`SponsorBlock: Saltando ${segmento.category}...`);
                    try {
                        playerInstance.seekTo(endTime, true);
                         lastSeekEndTime = endTime; // Recordar a dónde saltamos
                         lastSeekVideoId = videoId; // Recordar para qué video
                    } catch (e) {
                         console.error("Error ejecutando seekTo:", e);
                    }

                    break; // Salir del bucle for después de saltar
                } else {
                    // console.log(`SPONSORBLOCK SKIP: Ya estábamos en un seek a ${endTime}, ignorando.`);
                }
                // Si estamos en el segmento pero lastSeekEndTime === endTime,
                // significa que justo acabamos de saltar aquí, no hacer nada y dejar que siga.
            } else {
                 // Si el tiempo actual ya superó el punto al que habíamos saltado,
                 // reseteamos lastSeekEndTime para permitir futuros saltos a ese mismo punto si fuera necesario.
                 if (lastSeekEndTime === endTime && currentTime >= endTime) {
                      // console.log(`SPONSORBLOCK SKIP: Tiempo (${currentTime.toFixed(1)}) superó el último salto a ${endTime.toFixed(1)}. Reseteando lastSeekEndTime.`);
                      lastSeekEndTime = -1;
                 }
            }
        }
    }
}


// --- SponsorBlock: Obtener Segmentos ---
async function obtenerSegmentosSponsorBlock(videoId) {
     const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; 
    const apiUrl = `/api/segments/${videoId}`; // URL relativa a tu función Netlify
    console.log(`Llamando a la API local SB: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
             headers: {
                  'X-UserID': userId
             }
        });
        if (!response.ok) {
            // El cuerpo del error debería ser manejado por la función Netlify,
            // aquí solo registramos el status. La función Netlify debe devolver [] para 404.
             console.error(`Error desde la API SB (${apiUrl}): ${response.status} ${response.statusText}`);
             // Lanzar error para que sea capturado y marcado como 'null' en caché
             throw new Error(`API SB Error: ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
             console.warn(`La API SB (${apiUrl}) no devolvió un array para ${videoId}. Respuesta:`, data);
             return null; // Devolver null si la respuesta no es un array
        }
        console.log(`Segmentos recibidos de API SB para ${videoId}:`, data.length);
        // Añadir duración del video si viene en el primer segmento (algunas APIs SB lo incluyen)
        if (data.length > 0 && data[0].videoDuration) {
             console.log(`Duración del video según SB para ${videoId}: ${data[0].videoDuration}s`);
             // Se puede usar esta duración en monitorPlayers
        }
        return data; // Devolver array (puede ser vacío)

    } catch (error) {
        console.error(`Error en fetch/procesamiento SB para ${apiUrl}:`, error);
        return null; // Devolver null en caso de error de red o status no-ok
    }
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
    mostrarMensajeFlotante("Buscando información de la playlist...");
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
     "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party",
    "https://pipedapi.adminforge.de"
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
    // Usar un proxy CORS si es necesario (AllOrigins es una opción)
    // const proxyUrl = 'https://api.allorigins.win/raw?url=';
    // const proxiedUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`;
    // console.log("Obteniendo playlist desde:", proxiedUrl); // O targetUrl si no usas proxy

    try {
        // Pasar directamente targetUrl si no necesitas proxy
        const data = await fetchDataWithRetry(targetUrl);
        if (!data || !data.relatedStreams) {
            throw new Error("La respuesta de la API no contiene videos válidos.");
        }
        console.log("Playlist info obtenida:", data.name, `(${data.relatedStreams.length} streams)`);
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


// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
     // Asegurarse que la playlist manual exista al inicio (si no hay datos guardados)
     if (!playlistsData.some(p => p.id === 'manual')) {
        playlistsData.push({ id: 'manual', name: 'Mis Vídeos Añadidos', thumbnailUrl: 'https://mix-yt.netlify.app/electronic.ico', videos: [], isExpanded: true });
     }
     updatePlaylistsUI(); // Render inicial de la UI de playlists
     loadYouTubeAPI(); // Iniciar carga de la API de YouTube
});

// Cerrar menús contextuales si se hace click fuera
document.addEventListener('click', (event) => {
    // Comprobar si el click fue FUERA de cualquier botón que abre un menú
    if (!event.target.closest('.delete-menu-button')) {
        const openMenus = document.querySelectorAll('#playlistContainer .delete-menu-content');
        openMenus.forEach(menu => menu.style.display = 'none');
    }
}, true); // Usar fase de captura

console.log("app.js cargado y listo.");
