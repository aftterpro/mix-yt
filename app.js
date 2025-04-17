// Módulo: Configuración y Variables Globales
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let playlistVideos = [];// Videos cargados desde la URL
let manualVideos = [];// Videos añadidos desde la búsquedalet currentPlayer = 1;
let monitorInterval;// Declarar fuera para controlar el intervalo
let playersInitialized = false;// Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let currentIndex = 0;
let isTransitioning = false; // Flag para estado de transición

// Mensaje flotante (Ubicado debajo de playlistContainer y optimizado)
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
// Ejemplo de uso:
mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!");

// Módulo: Carga del API de YouTube (Optimizado)
function loadYouTubeAPI() {
    if (youtubeAPIReady) return;
    youtubeAPIReady = true;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api'; // Simplificado
    script.async = true;
    window.onYouTubeIframeAPIReady = () => { // Asignar directamente
        console.log("API de YouTube cargada.");
        initializePlayers();
    };
    document.head.appendChild(script); // Añadir al head
}
//Asegurar que onYouTubeIframeAPIReady llama a initializePlayers
function onYouTubeIframeAPIReady() {
    console.log("API de YouTube cargada.");
    initializePlayers();
}
// Agregaremos una función que garantice que ambos reproductores estén listos antes de ejecutar cualquier acción.
function initializePlayers() {
    if (player1 && player2) return; // Evitar la reinicialización si ya existen

    player1 = new YT.Player('player1', {
        height: '100%',
        width: '100%',
        events: {
            'onReady': onPlayerReady, // Referencia directa a la función
            'onStateChange': onPlayerStateChange,
             'onError': onPlayerError
        }
    });
    player2 = new YT.Player('player2', {
        height: '100%',
        width: '100%',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}
function onPlayerError(event) { //Errores con Api
    console.error("Error del reproductor:", event);
    // Manejar diferentes códigos de error
    switch (event.data) {
        case 2: // Petición de video inválida (ID incorrecto)
            console.error("Error: ID de video no válido.");
            mostrarMensajeFlotante("Error: ID de video no válido.");
            break;
        case 5: // Error al reproducir el video solicitado
            console.error("Error: No se puede reproducir el video. (Posible problema de derechos de autor).");
            mostrarMensajeFlotante("Este video no está disponible. No se puede reproducir el video. (Posible problema de derechos de autor)");
            playNextVideo(); // Saltar al siguiente video
            break;
        case 100: // Video no encontrado
            console.error("Error: Video no encontrado.");
            mostrarMensajeFlotante("Error: Video no encontrado.");
            break;
        case 101: // El propietario del video no permite la reproducción incrustada
        case 150:
            console.error("Error: El propietario del video no permite la reproducción incrustada.");
            mostrarMensajeFlotante("Este video no se puede reproducir. El propietario del video no permite la reproducción incrustada");
            playNextVideo();//Saltar al siguiente video
            break;
        default:
            console.error("Error desconocido del reproductor:", event.data);
            mostrarMensajeFlotante("Ocurrió un error al reproducir el video.");
            break;
    }
}
//Verifica que monitorPlayers se llama correctamente cada 10 segundos:
function onPlayerReady(event) {
    if (player1 && player2) {
        playersInitialized = true;
        document.getElementById('botonPlay').disabled = false;
    }
    // Inicia el monitor con intervalo reducido para saltos precisos
    if (!monitorInterval) {
        // *** CAMBIO AQUÍ: Intervalo más corto ***
        monitorInterval = setInterval(monitorPlayers, 300); // Chequear cada 300ms (0.5 segundo)
        console.log('Monitor iniciado con ID:', monitorInterval, '(intervalo: 1000ms)');
    }
}
//Verificar si el usuario modifica la duración del video
function onPlayerStateChange(event) {
    // console.log('Player State Change:', event.data, 'Player:', event.target === player1 ? '1' : '2'); // Log para debug
    if (event.data === YT.PlayerState.ENDED) {
         lastSeekEndTime = -1; // Considera si necesitas limpiar lastSeekEndTime aquí también
        console.log('Video finalizado.');
    if (event.data === YT.PlayerState.PLAYING) {   // Si el video comienza a reproducirse, verificar segmentos inmediatamente
          console.log("Estado PLAYING detectado. Verificando segmentos iniciales...");
          checkAndSkipSegment(event.target);// Llamar a la función de chequeo pasando la instancia del reproductor que disparó el evento
      }
    } else if (event.data === YT.PlayerState.PAUSED) {
        console.log('Video en pausa.');
    }
}
// Módulo: Interacción con piped.nosebs.ru (Búsqueda)
const performSearch = async (query) => {
    // Obtener referencia al div de resultados DENTRO de la función
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return; // Salir si no se encuentra el div

    console.log(`Iniciando búsqueda para: ${query}`);
    resultsDiv.innerHTML = '<p>Buscando...</p>';     // Mostrar "Buscando..." antes del fetch

    try {
         // La URL relativa ya apunta a tu función Netlify
        const response = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            resultsDiv.innerHTML = `<p>Error en la búsqueda: ${response.status}</p>`; // Mostrar error
            mostrarMensajeFlotante(`Error en la búsqueda: ${response.status}`);
            return;
        }
        const data = await response.json();

        // Llamar a displaySearchResultsPiped (esta función reemplazará el "Buscando...")
        displaySearchResultsPiped(data);

    } catch (error) {
        console.error("Error fetching search results:", error);
        resultsDiv.innerHTML = '<p>Error en la conexión al buscar.</p>'; // Mostrar error
        mostrarMensajeFlotante("Error en la conexión al buscar.");
    }
};
// Nueva función para mostrar resultados de la API de Piped
const displaySearchResultsPiped = (results) => {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        console.error("Results div not found!");
        return;
    }
    resultsDiv.innerHTML = ''; // Clear previous results

    // Verificar si la respuesta tiene la propiedad 'items' y si es un array
    if (!results || !results.items || !Array.isArray(results.items) || results.items.length === 0) {
        const noResultsMessage = document.createElement('p');
        noResultsMessage.textContent = "No se encontraron resultados.";
        resultsDiv.appendChild(noResultsMessage);
        return;
    }

    // Usar results.items en lugar de results
    results.items.forEach(video => {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');

        // Contenedor para la miniatura y la duración
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');

        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail;
        thumbnail.alt = video.title;
        thumbnail.classList.add('thumbnail'); // Clase para estilos CSS
        thumbnail.loading = "lazy";
        thumbnailContainer.appendChild(thumbnail);

        // Mostrar duración dentro de la miniatura
        if (video.duration) {
            const duration = document.createElement('span');
            duration.textContent = formatDuration2(video.duration); // Formatear la duración
            duration.classList.add('duration'); // Clase para estilos CSS
            thumbnailContainer.appendChild(duration);
        }

        videoDiv.appendChild(thumbnailContainer);

        const title = document.createElement('h3');
        title.textContent = video.title;
        title.classList.add('video-title'); // Clase para estilos CSS
        videoDiv.appendChild(title);

        const addToPlaylistButton = document.createElement('button');
        addToPlaylistButton.textContent = "Añadir a la playlist";
        addToPlaylistButton.classList.add('add-to-playlist');

        addToPlaylistButton.dataset.videoId = video.videoId || video.url.split("v=")[1];
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        addToPlaylistButton.dataset.videoDuration = video.duration;

        videoDiv.appendChild(addToPlaylistButton);
        resultsDiv.appendChild(videoDiv);
    });

    // Event listeners para los botones "Añadir a la playlist"
    const addToPlaylistButtons = document.querySelectorAll('.add-to-playlist');
    addToPlaylistButtons.forEach(button => {
        button.addEventListener('click', () => {
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration),
            };
            addToPlaylist(videoData);
        });
    });
};

// Función para formatear la duración de segundos a un formato legible
function formatDuration2(duration) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
// Módulo: Manejo de la Playlist (Añadir, Eliminar, Reordenar, Actualizar DOM)
//Agregar a la playlist
const addToPlaylist = (videoData) => {
    if (!videoData || !videoData.videoId) {     // **VALIDACIÓN EXHAUSTIVA DE LOS DATOS**
        console.error("Error: Datos de video inválidos:", videoData);
        mostrarMensajeFlotante("Error al añadir el video. Datos inválidos.");
        return; // Salir de la función si los datos son inválidos
    }
    const videoObject = {
        videoId: videoData.videoId,
        title: videoData.title || "Título no disponible", // Valor por defecto si no hay título
        thumbnail: videoData.thumbnail || 'https://via.placeholder.com/100x75/0000FF/FFFFFF/?text=No+Thumbnail', // Placeholder si no hay miniatura
        duration: parseDuration(videoData.duration) || 0, // 0 si la duración no es válida
        manual: true,
    };
    // Verificar si el video ya está en la playlist
    const isDuplicate = playlistVideos.some(video => video.videoId === videoObject.videoId);
    if (isDuplicate) {
        mostrarMensajeFlotante("Este video ya está en la playlist.");
        return; // No agregar duplicados
    }
    playlistVideos.splice(currentIndex + 1, 0, videoObject);
    manualVideos.push(videoObject);
    mostrarMensajeFlotante(`Video añadido: ${videoObject.title}`); // Mostrar el título (o "Título no disponible")
    console.log(`Video añadido desde búsqueda: ${videoObject.title}`);
    updatePlaylistDOM();
};
// Función para eliminar un video de la playlist
function deleteVideo(videoId) {
    const videoIndex = playlistVideos.findIndex((video) => video.videoId === videoId);

    if (videoIndex !== -1) {
       mostrarMensajeFlotante(`Video: ${playlistVideos[videoIndex].title} eliminado`);
        console.log(`Eliminando video: ${playlistVideos[videoIndex].title}`);

        const isManual = playlistVideos[videoIndex].manual;  // Verificar si es un video añadido manualmente
        playlistVideos.splice(videoIndex, 1); // Eliminar de la playlist principal
        if (isManual) {    // Si es manual, también eliminarlo de manualVideos
            manualVideos = manualVideos.filter((video) => video.videoId !== videoId);
        }
        if (currentIndex >= videoIndex) {         // Ajustar el índice actual si afecta la reproducción
            currentIndex = Math.max(0, currentIndex - 1);
        }

        updatePlaylistDOM();
    } else {
        console.error('El video no fue encontrado en la lista.');
    }
}
function rearrangePlaylist(fromIndex, toIndex) { // Eliminar la función duplicada
    if (fromIndex === toIndex) return;

    const [movedVideo] = playlistVideos.splice(fromIndex, 1);
    playlistVideos.splice(toIndex, 0, movedVideo);
} 
// Actualizar DOM (CORREGIDO)
function updatePlaylistDOM() {
    const playlistContainer = document.getElementById('playlist');
    playlistContainer.innerHTML = ''; // Limpiar la lista

    playlistVideos.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.draggable = true;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';

        // Usar la miniatura real del video
        const img = document.createElement('img');
        img.src = video.thumbnail; // Usar la miniatura del video
        img.alt = video.title;
        img.className = 'drag-handle';
        imageContainer.appendChild(img);

        if (index === currentIndex) {
            item.classList.add('playing');
            const icon = document.createElement('i');
            icon.className = 'fa-sharp-duotone fa-solid fa-share playing-icon';
            imageContainer.appendChild(icon);
        }

        item.appendChild(imageContainer);
        item.innerHTML += `
            <div>
                <p style="margin: 0; font-size: 12px; font-weight: bold;">${video.title}</p>
                <p style="margin: 0; font-size: 10px; color: #555;">Duración: ${formatDuration(video.duration)}</p>
            </div>
        `;
        // Menú de eliminar (CON MANEJO DE CLICS MEJORADO)
        const deleteMenu = document.createElement('div');
        deleteMenu.className = 'delete-menu';
        deleteMenu.innerHTML = `
            <button class="delete-menu-button"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            <div class="delete-menu-content">
                <button class="delete-button-item"><i class="fa-solid fa-xmark"></i>Eliminar</button>
                <button class="move-up-button"><i class="fa-solid fa-arrow-up"></i>Reproducir Despues</button>
            </div>
        `;
        item.appendChild(deleteMenu);
        const deleteMenuButton = item.querySelector('.delete-menu-button');
        const deleteMenuContent = item.querySelector('.delete-menu-content');

        deleteMenuButton.addEventListener('click', (event) => {
             event.stopPropagation();//para que no se cierre al clickear el boton
            deleteMenuContent.style.display = deleteMenuContent.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (event) => {
            if (!item.contains(event.target)) {
                deleteMenuContent.style.display = 'none';
            }
        });
        const deleteButtonItem = item.querySelector('.delete-button-item');
        deleteButtonItem.addEventListener('click', () => {
            deleteVideo(video.videoId);
        });
        const moveUpButton = item.querySelector('.move-up-button');
        moveUpButton.addEventListener('click', () => {
            const currentIndexInPlaylist = playlistVideos.findIndex(v => v.videoId === video.videoId);
            let playingIndex = -1;
            if(playersInitialized){ //verifica que los players esten inicializados
                if(currentPlayer === 1 && player1 && player1.getVideoData() && player1.getVideoData().video_id){
                    playingIndex = playlistVideos.findIndex(v => v.videoId === player1.getVideoData().video_id);
                }
                else if(currentPlayer === 2 && player2 && player2.getVideoData() && player2.getVideoData().video_id){
                    playingIndex = playlistVideos.findIndex(v => v.videoId === player2.getVideoData().video_id);
                }
            }
            if (currentIndexInPlaylist > 0) {
                playlistVideos.splice(currentIndexInPlaylist, 1);
                if(playingIndex !== -1 && currentIndexInPlaylist > playingIndex){
                    playlistVideos.splice(playingIndex +1, 0, video);

                }

                else{
                    playlistVideos.splice(0, 0, video);
                }
                updatePlaylistDOM();
            }
        });
        playlistContainer.appendChild(item);

    });
    enableDragAndDrop();
}
// Estilos CSS (Modificados para el icono y el estilo)
const style3 = document.createElement('style');
style3.textContent = `
    /* ... (otros estilos) */
    .playlist-item {
        display: flex; /* Para alinear el contenedor de imagen y el resto del contenido */
        align-items: center;
        padding: 0.5rem;
        border-bottom: 1px solid #ddd;
        cursor: pointer;
        position: relative; /* Para posicionar el icono absolutamente */
    }

    .image-container {
        position: relative; /* Para posicionar el icono absolutamente dentro del contenedor */
        margin-right: 0.5rem;
    }

    .playing-icon {
        position: absolute;
        top: 55px; /* Ajustar posición vertical */
        left: 5px; /* Ajustar posición horizontal */
        color: #007bff;
        font-size: 1.2em;
    }

    .playlist-item.playing {
        border: 2px dashed #007bff;
        background-color: #e0f2f7;
    }
    .playlist-item.playing img{
        border: 2px solid #007bff;
    }

    /* ... (otros estilos) */
`;
document.head.appendChild(style3);
// CSS adicional para mejorar la experiencia de arrastre
const style = document.createElement('style');
style.innerHTML = `
    .playlist-item {
        user-select: none; /* Evitar la selección de texto */
    }
    .drag-handle {
        cursor: move; /* Cambiar el cursor al arrastrar */
    }
`;
document.head.appendChild(style);
// Añadimos eventos para manejar el arrastre y reorganizar los elementos de la lista de reproducción.
function enableDragAndDrop() {
    const playlistContainer = document.getElementById('playlist');
    let draggedItemIndex = null;

    playlistContainer.addEventListener('dragstart', (event) => {
        const item = event.target.closest('.playlist-item');
        if (!item) return;

        draggedItemIndex = Array.from(playlistContainer.children).indexOf(item);
        item.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/html', item.innerHTML);
    });

    playlistContainer.addEventListener('dragend', (event) => {
        const item = event.target.closest('.playlist-item');
        if (!item) return;

        item.classList.remove('dragging');
    });

    playlistContainer.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const item = event.target.closest('.playlist-item');
        if (!item || item.classList.contains('dragging')) return;

        item.classList.add('drag-over');
    });

    playlistContainer.addEventListener('dragleave', (event) => {
        const item = event.target.closest('.playlist-item');
        if (!item) return;

        item.classList.remove('drag-over');
    });

    playlistContainer.addEventListener('drop', (event) => {
        event.preventDefault();
        const droppedItem = event.target.closest('.playlist-item');
        if (!droppedItem || droppedItem.classList.contains('dragging')) return;

        const droppedItemIndex = Array.from(playlistContainer.children).indexOf(droppedItem);
        rearrangePlaylist(draggedItemIndex, droppedItemIndex);

        // Actualizar el DOM
        updatePlaylistDOM();
    });
}

// Módulo: Carga de Playlist, miniaturas desde URL, cache
//Instancias api
const pipedInstances = [
  "https://pipedapi.orangenet.cc",
  "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party",
    "https://piapi.ggtyler.dev"
  // Agrega otras instancias aquí
];
    //Selecciona instancia aleatoria
function getRandomPipedInstance() {
  const randomIndex = Math.floor(Math.random() * pipedInstances.length);
  return pipedInstances[randomIndex];
}
    //Función para Realizar Solicitudes con Reintentos
async function fetchDataWithRetry(url, maxRetries = 3, retryDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${url}, retry ${retries + 1}:`, error);
      retries++;
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Lanza el error después de todos los reintentos
      }
    }
  }
}
// Función para extraer el ID de la playlist de una URL de YouTube
function extractPlaylistId(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('list');
}
// Función para obtener información de la playlist usando la API de Piped con un proxy
async function getPlaylistInfo(playlistId) {
  const instanceUrl = getRandomPipedInstance();
  const targetUrl = `${instanceUrl}/playlists/${playlistId}`;
  const proxyUrl = 'https://api.allorigins.win/raw?url='; // URL base del proxy
  const proxiedUrl = `${proxyUrl}${encodeURIComponent(targetUrl)}`; // URL con proxy

  try {
    const data = await fetchDataWithRetry(proxiedUrl);
    // Verificar si la estructura es válida
    if (!data || !data.relatedStreams) {
      throw new Error("La estructura de la respuesta no contiene videos válidos.");
    }
   
    // EXTRAE EL NOMBRE DE LA PLAYLIST (CORREGIDO)
    const playlistName = data.name || "Playlist sin nombre"; // Accede a data.name
    displayPlaylist(data); // Llamo para cambiar nombre de playlist
    return { ...data, name: playlistName };
  } catch (error) {
    console.error(
      "Error al obtener la información de la playlist:",
      error.message
    );
    mostrarMensajeFlotante(error.message);
    return null;
  }
}
// Función para mostrar Playlist
function displayPlaylist(playlist) {
        console.log('Datos recibidos en displayPlaylist:', playlist); // Añade esta línea
    if (!playlist || !playlist.relatedStreams || !Array.isArray(playlist.relatedStreams)) {
        alert('No se encontraron videos válidos en la playlist.');
        return;
    }

    const playlistHeader = document.querySelector('.playlist-header h3');
    const playlistThumbnail = document.querySelector('.playlist-header img') || document.createElement('img'); // Crear img si no existe

    if (playlistHeader) {
        playlistHeader.textContent = playlist.name;
    } else {
        console.error("No se encontró el encabezado de la playlist.");
    }

    // Actualizar o añadir la miniatura
    playlistThumbnail.src = playlist.thumbnailUrl;
    playlistThumbnail.alt = playlist.name;
    playlistThumbnail.style.width = '50px'; // Ajusta el tamaño como necesites
    playlistThumbnail.style.height = '50px';
    playlistThumbnail.style.marginLeft = '10px'; // Espacio entre el título y la miniatura

    if (!playlistThumbnail.parentNode) {
        document.querySelector('.playlist-header').appendChild(playlistThumbnail); // Añadir si no está en el DOM
    }

    const loadedVideos = playlist.relatedStreams.map((video) => ({
        videoId: video.url.split('v=')[1],
        title: video.title,
        thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75/0000FF/FFFFFF/?text=No+Thumbnail',
        duration: video.duration,
        manual: false,
    }));
    // Concatenar los nuevos videos con los existentes
    playlistVideos = [...playlistVideos, ...loadedVideos]; // Cambiado aquí
    updatePlaylistDOM();
}
// Módulo: Reproducción y Crossfade
// Función para reproducir el siguiente video con efecto crossfade
function playNextVideo(videoId, video) {
    console.log(`playNextVideo: Intento de inicio para video anterior: ${videoId}. isTransitioning AHORA = ${isTransitioning}`); // Log entrada
    if (isTransitioning) {
        console.warn(`playNextVideo: BLOQUEADO - Transición ya en progreso. Ignorando llamada para video ${videoId}.`);
        return; // Salir si ya está en transición
    }
    if (currentIndex >= playlistVideos.length - 1) {
        console.log('playNextVideo: Fin de la lista detectado.');
        askToRepeatPlaylist();
        return; // Exit if at the end
    }

    // *** SETTING FLAG ***
    isTransitioning = true;
    const previousVideoId = videoId; // Store the ID of the video we are transitioning FROM
    console.log(`playNextVideo: *** Transición INICIADA desde ${previousVideoId || 'inicio/desconocido'}. Flag=true. ***`);

    try {
        currentIndex++;
        const nextVideoId = playlistVideos[currentIndex].videoId;
        console.log(`playNextVideo: Cargando SIGUIENTE video (${nextVideoId}), index=${currentIndex}.`);

        const currentPlayerElement = document.getElementById(`player${currentPlayer}`);
        const nextPlayer = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

        if (nextPlayer && typeof nextPlayer.loadVideoById === 'function') {
            nextPlayer.loadVideoById(nextVideoId);
        } else {
            console.error("playNextVideo: Error crítico - nextPlayer inválido.");
            isTransitioning = false; // Reset on critical error
            return;
        }

        updatePlaylistDOM();

        if (currentPlayerElement) currentPlayerElement.classList.add('fade-out');
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden');
            nextPlayerElement.classList.add('fade-in');
        }

        setTimeout(() => {
             const timeoutVideoId = previousVideoId; // Capturar el ID para el log del timeout
            console.log(`playNextVideo: TIMEOUT INICIADO para transición desde ${timeoutVideoId}.`);
            try {
                if (currentPlayerElement) {
                    currentPlayerElement.classList.add('hidden');
                    currentPlayerElement.classList.remove('fade-out');
                }
                if (nextPlayerElement) {
                    nextPlayerElement.classList.remove('fade-in');
                }

                currentPlayer = currentPlayer === 1 ? 2 : 1;
                 console.log(`playNextVideo: Timeout - currentPlayer cambiado a ${currentPlayer}.`);

                crossfadeAudio();

                if (timeoutVideoId && segmentosCache[timeoutVideoId]) {
                    console.log(`playNextVideo: Timeout - Limpiando caché SB para video ANTERIOR: ${timeoutVideoId}`);
                    delete segmentosCache[timeoutVideoId];
                }
                 if (timeoutVideoId && lastSeekVideoId === timeoutVideoId) {
                     lastSeekEndTime = -1; // Resetear seek si era del video viejo
                 }

            } catch (timeoutError) {
                console.error("Error dentro del setTimeout de playNextVideo:", timeoutError);
            } finally {
                // *** RESETTING FLAG ***
                isTransitioning = false;
                 console.log(`playNextVideo: *** Transición FINALIZADA (Timeout para ${timeoutVideoId}). Flag=false. ***`);
            }
        }, 1500);

    } catch (error) {
        console.error("Error en playNextVideo:", error);
        // *** RESETTING FLAG ON ERROR ***
        isTransitioning = false;
         console.log(`playNextVideo: *** Transición INTERRUMPIDA (Error para ${previousVideoId}). Flag=false. ***`);
    }
}

function crossfadeAudio() {
    const previousPlayer = currentPlayer === 1 ? player2 : player1;
    const nextPlayer = currentPlayer === 1 ? player1 : player2;

    let currentVolume = 100;
    let nextVolume = 0;
    const crossfadeStep = 100 / (CROSSFADE_DURATION * 5); // Más pasos para suavidad

    const crossfadeInterval = setInterval(() => {
        currentVolume = Math.max(0, currentVolume - crossfadeStep);
        nextVolume = Math.min(100, nextVolume + crossfadeStep);

        previousPlayer.setVolume(currentVolume);
        nextPlayer.setVolume(nextVolume);

        if (currentVolume === 0 && nextVolume === 100) {
            clearInterval(crossfadeInterval); // Detener cuando el crossfade termina
        }
    }, 100); // Cada 100ms
}
//Agregar gestión de repetición de playlist
function askToRepeatPlaylist() {
    const repeat = confirm('¿Desea repetir la playlist?');
    if (repeat) {
        currentIndex = 0;
        playFirstVideo();
    } else {
        stopMonitoring(); // Detener el monitoreo
       mostrarMensajeFlotante("Gracias por utilizar :) !");
        console.log("Gracias por utilizar.");
    }
}
//Iniciar el monitoreo solo al reproducir la playlist
function playFirstVideo() {
    if (!playersInitialized) {
        console.error('Los reproductores no están completamente inicializados.');
        return;
    }

    if (playlistVideos.length > 0) {
        const firstVideoId = playlistVideos[currentIndex].videoId;
        console.log('Reproduciendo el primer video:', firstVideoId);
        player1.loadVideoById(firstVideoId);
        document.getElementById('player1').classList.remove('hidden');
        document.getElementById('player2').classList.add('hidden');

        startMonitoring(); // Iniciar monitoreo al comenzar la reproducción
    }
}
// Módulo: Monitoreo de Reproductores
// Función para monitorizar los reproductores deteniendo e iniciando
function startMonitoring() {
    if (!monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 1000);
        console.log('Monitoreo iniciado (intervalo: 1000ms).');
    }
}
function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('Monitoreo detenido.');
    }
}
 // Función Reutilizable checkAndSkipSegment: Extraemos la lógica de salto para poder llamarla desde varios lugares.
  async function checkAndSkipSegment(playerInstance) {
      if (!playerInstance || typeof playerInstance.getCurrentTime !== 'function' || typeof playerInstance.seekTo !== 'function' || typeof playerInstance.getVideoData !== 'function') {
           console.warn("checkAndSkipSegment: Instancia de reproductor inválida.");
          return;
      }

      // No intentar saltar si estamos en transición
      if (isTransitioning) return;

       // Datos necesarios del reproductor activo
       let currentTime;
       let videoId;
       try {
            currentTime = playerInstance.getCurrentTime();
            const videoData = playerInstance.getVideoData();
            if (!videoData || !videoData.video_id) {
                 console.warn("checkAndSkipSegment: Datos de video no disponibles aún.");
                return;
            }
            videoId = videoData.video_id;
       } catch (error) {
            console.error("checkAndSkipSegment: Error obteniendo datos del reproductor", error);
            return;
       }
      // Reiniciar lastSeek si el video cambió
      if (lastSeekVideoId !== videoId) {
          lastSeekEndTime = -1;
          lastSeekVideoId = videoId;
      }

      // Obtener segmentos (asegúrate de que la caché esté actualizada)
      if (!segmentosCache[videoId]) {
           console.log(`checkAndSkipSegment: Obteniendo segmentos SB para ${videoId}`);
           segmentosCache[videoId] = await obtenerSegmentosSponsorBlock(videoId);
           if (segmentosCache[videoId] && segmentosCache[videoId].length > 0) {
              segmentosCache[videoId].sort((a, b) => parseFloat(a.startTime) - parseFloat(b.startTime));
           }
         console.log("Segmentos cacheados para", videoId, ":", segmentosCache[videoId]);
      }
      const segmentos = segmentosCache[videoId];

      // Lógica de salto
      if (segmentos && segmentos.length > 0) {
          for (const segmento of segmentos) {
              const startTime = parseFloat(segmento.startTime);
              const endTime = parseFloat(segmento.endTime);

              if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) continue;

              // *** IMPORTANTE: Ajuste para startTime: 0 ***
              // Si el segmento empieza en 0, considerar saltar si currentTime es < endTime
              // Si empieza después, usar la condición original.
              const isInSegment = (startTime === 0 && currentTime >= 0 && currentTime < endTime) ||
                                (startTime > 0 && currentTime >= startTime && currentTime < endTime);

              if (isInSegment) {
                  if (lastSeekEndTime !== endTime) {
                      console.log(`SPONSORBLOCK SKIP (checkAndSkip): Saltando en t=${currentTime.toFixed(1)}. Saltando a ${endTime.toFixed(1)}.`);
                      playerInstance.seekTo(endTime, true);
                      lastSeekEndTime = endTime;
                      lastSeekVideoId = videoId;
                      break; // Salir después de saltar
                  }
              }
          }
      }
  }

let segmentosCache = {}; // Objeto para almacenar los segmentos por videoId
// Variable global o al menos fuera del alcance inmediato de monitorPlayers
// para recordar el último punto al que saltamos y para qué video fue.
let lastSeekEndTime = -1;
let lastSeekVideoId = null;
async function monitorPlayers() {
    // Guardia principal: No hacer nada si estamos en transición
    if (isTransitioning) {
        // console.log("Monitor: Pausado durante transición.");
        return;
    }

    if (!playersInitialized) return;

    const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;

    // Checks básicos del reproductor
    if (!currentPlayerInstance || typeof currentPlayerInstance.getPlayerState !== 'function') return;
    const playerState = currentPlayerInstance.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING) return; // Solo actuar si está reproduciendo
    if (!currentPlayerInstance.getVideoData || !currentPlayerInstance.getVideoData().video_id) return;

    const videoId = currentPlayerInstance.getVideoData().video_id; // Obtener videoId para contexto

    try {
        // 1. Obtener datos y calcular si es tiempo de crossfade PRIMERO
        const currentTime = currentPlayerInstance.getCurrentTime();
        const playerDuration = currentPlayerInstance.getDuration();
        if (isNaN(playerDuration) || playerDuration <= 0) return;

        let effectiveDuration = playerDuration;
        let durationSource = "Player";
        const cachedData = segmentosCache[videoId];

        // Cargar segmentos si no están en caché (necesario para obtener videoDuration si existe)
        if (!cachedData) {
             console.log(`Monitor: Obteniendo segmentos SB para ${videoId} (para cálculo de duración)`);
             segmentosCache[videoId] = await obtenerSegmentosSponsorBlock(videoId);
             // Reasignar cachedData por si se obtuvieron ahora
             const newlyCachedData = segmentosCache[videoId];
             if (newlyCachedData && newlyCachedData.length > 0 && newlyCachedData[0].videoDuration) {
                const sbDuration = parseFloat(newlyCachedData[0].videoDuration);
                if (!isNaN(sbDuration) && sbDuration > 0) {
                    effectiveDuration = sbDuration;
                    durationSource = "SponsorBlock";
                }
             }
        } else if (cachedData.length > 0 && cachedData[0].videoDuration) { // Usar caché si ya existe
             const sbDuration = parseFloat(cachedData[0].videoDuration);
             if (!isNaN(sbDuration) && sbDuration > 0) {
                effectiveDuration = sbDuration;
                durationSource = "SponsorBlock";
            }
        }
        const timeRemaining = effectiveDuration - currentTime;
        const roundedTimeRemaining = Math.floor(timeRemaining);

         if (roundedTimeRemaining >= 0 && roundedTimeRemaining <= CROSSFADE_DURATION + 10) {           // Log de cuenta regresiva
              console.log(`Monitor: Player ${currentPlayer} (${videoId}). Base: ${durationSource}(${effectiveDuration.toFixed(1)}s). Tiempo para Crossfade Aprox: ${roundedTimeRemaining}s.`);
         }

        if (roundedTimeRemaining <= CROSSFADE_DURATION && roundedTimeRemaining >= 0) { //Evaluar condición de Crossfade
            console.log(`Monitor: *** Condición crossfade CUMPLIDA (Player ${currentPlayer}, ${videoId}). Restante: ${roundedTimeRemaining}s. Llamando playNextVideo... ***`);
           
            playNextVideo(videoId, playlistVideos.find(v => v.videoId === videoId));  // Llamar a playNextVideo. Esta función ahora maneja la bandera isTransitioning.
            // IMPORTANTE: Salir de monitorPlayers aquí, ya que iniciamos la transición
            // y no queremos ejecutar checkAndSkipSegment para el video actual.
            return;
        }

        // 3. Si NO es tiempo de crossfade, ENTONCES verificar saltos de segmentos internos
        // console.log(`Monitor: No es tiempo de crossfade, verificando saltos internos para ${videoId}`);
        await checkAndSkipSegment(currentPlayerInstance);


    } catch (error) {
        console.error(`Monitor: Error procesando Player ${currentPlayer} (${videoId || 'ID desconocido'}):`, error);
    }
}
// Función para obtener los segmentos llamando a NUESTRA Netlify Function
async function obtenerSegmentosSponsorBlock(videoId) {
    const apiUrl = `/api/segments/${videoId}`;
    // console.log(`Llamando a la API local: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl); // Ya no se envía el encabezado X-UserID

        if (!response.ok) {
             console.error(`Error desde la API (${apiUrl}): ${response.status} ${response.statusText}`);
             let errorBody = await response.text();
             console.error("Cuerpo del error de la API:", errorBody);
             throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
             console.warn(`La API (${apiUrl}) no devolvió un array para ${videoId}. Respuesta:`, data);
             return [];
        }
        console.log(`Segmentos recibidos de la API para ${videoId}:`, data.length);
        return data; // Devuelve los segmentos (o array vacío si fue 404 o error)

    } catch (error) {
        console.error(`Error en fetch/procesamiento para ${apiUrl}:`, error);
        return []; // Devolver array vacío en caso de error
    }
}
// Módulo: Manejo de Eventos y Botones
// Botón Mix
document.getElementById('botonNext').addEventListener('click', () => {
    playNextVideo()
     console.log("Click boton mix cambiando el video y el siguiente reproductor");
});
// Búsqueda por palabras
const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('results'); // Obtener referencia al div de resultados
const debouncedSearch = debounce(performSearch, 500); // 500ms de retraso

searchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();

    if (query.length > 0) {
        resultsDiv.innerHTML = '<p>Escribiendo...</p>'; // Mostrar feedback
        // Llamar a la búsqueda con debounce
        debouncedSearch(query);
    } else {
        // Limpiar si el input está vacío
        resultsDiv.innerHTML = '';
    }
});
// Variable para controlar si la reproducción ha comenzado
let reproduccionIniciada = false;

// Evento para el botón "Añadir URL"
añadirUrlButton.addEventListener('click', async () => {
    const url = searchInput2.value.trim();
    const playlistId = extractPlaylistId(url);

    if (!playlistId) {
        alert('URL de la playlist no válida.');
        return;
    }

    // Muestra algún indicador de carga si es necesario
    mostrarMensajeFlotante("Cargando playlist..."); // O un spinner

    const playlistInfo = await getPlaylistInfo(playlistId);

    if (playlistInfo && playlistInfo.relatedStreams) {
        const nuevosVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url.split('v=')[1],
            title: video.title,
            thumbnail: video.thumbnail || 'https://via.placeholder.com/100x75/0000FF/FFFFFF/?text=No+Thumbnail', // Usa tu placeholder
            duration: video.duration,
            manual: false, // Marcar como no manuales si vienen de URL
        }));

        let videosAñadidos = 0;
        nuevosVideos.forEach(nuevoVideo => {
            // Verificar si el video YA existe en playlistVideos por videoId
            const existe = playlistVideos.some(videoExistente => videoExistente.videoId === nuevoVideo.videoId);
            if (!existe) {
                playlistVideos.push(nuevoVideo); // Añadir solo si no existe
                videosAñadidos++;
            }
        });

        updatePlaylistDOM();
        searchInput2.value = ''; // Limpiar el input

        if (playlistVideos.length > 0) { // Solo habilita 'Play' si la lista no estaba vacía o si se añadieron videos nuevos
             botonPlay.disabled = false;
        }

        // Mensaje más informativo
        if (videosAñadidos > 0) {
             mostrarMensajeFlotante(`Se añadieron ${videosAñadidos} nuevos videos a la playlist.`);
        } else {
             mostrarMensajeFlotante("Todos los videos de la URL ya estaban en la playlist.");
        }

    } else {
        // Mensaje de error si no se pudo obtener info o no hay videos
         mostrarMensajeFlotante('No se pudo obtener información de la playlist o está vacía.');
        // alert('No se pudo obtener información de la playlist o no contiene videos válidos.'); // Puedes usar alert o mensaje flotante
    }
});

// Iniciar botton
let botonPlay = document.getElementById("botonPlay");

botonPlay.disabled = true; // Deshabilitado al inicio
botonPlay.addEventListener('click', () => {
    if (playlistVideos.length > 0 && !reproduccionIniciada) {
        reproduccionIniciada = true;
        currentIndex = 0;
        if (playersInitialized) {
            playFirstVideo();
            mostrarMensajeFlotante(`Iniciando con video: ${playlistVideos[currentIndex].title}`);
        } else {
            console.error('Los reproductores no están listos.');
        }
        botonPlay.disabled = true;//Desabilitar boton para que no se inicie otra vez
    }
});
// Carga inicial del API de YouTube (se puede retrasar con DOMContentLoaded si se desea)
loadYouTubeAPI();
//Debounce para la busqueda
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
//Funciones de formato de tiempo
function formatDuration(duration) {
    if (isNaN(duration) || duration < 0) {
        return "Desconocida";
    }
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}`;
}
function parseDuration(durationString) {
    if (typeof durationString === 'number') {
        return durationString;
    }
    if (typeof durationString !== 'string') return 0;
    const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}
