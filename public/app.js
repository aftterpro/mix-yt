// Módulo: Configuración y Variables Globales
const CONFIG = {
    origin: window.location.origin, 
    apiBase: "/search"
};
const CROSSFADE_DURATION = 15; 
let player1, player2;
let currentPlayer = 1;

window.playlistVideos = []; // Antes era: let playlistVideos = [];
let playlistVideos = window.playlistVideos; // Referencia local para compatibilidad

let manualVideos = [];
let monitorInterval;
let playersInitialized = false;
let youtubeAPIReady = false;
let currentIndex = 0;
let reproduccionIniciada = false;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Frontend en:", CONFIG.origin);
    console.log("🔗 Conectando a Backend:", CONFIG.apiBase);
    
    // EXPORTAR FUNCIONES GLOBALES (Para que auth.js pueda usarlas)
    window.updatePlaylistDOM = updatePlaylistDOM;
    window.playNextVideo = playNextVideo;
    window.currentIndex = currentIndex; // Por si acaso
    
    loadYouTubeAPI();
    setupEventListeners();
    setupCrossfader();
    
    // LÓGICA DE PESTAÑAS
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = `tab-${btn.dataset.tab}`;
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
        });
    });
});

// Mensaje flotante
function mostrarMensajeFlotante(mensaje) {
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'mensaje-flotante';
    const playlistContainer = document.getElementById('playlistContainer'); 
    
    // Si no encuentra el contenedor (por ejemplo, si estamos en otra pestaña), usar body
    if (playlistContainer) {
        playlistContainer.insertAdjacentElement('afterend', mensajeDiv);
    } else {
        mensajeDiv.style.position = 'fixed';
        mensajeDiv.style.bottom = '20px';
        mensajeDiv.style.left = '50%';
        mensajeDiv.style.transform = 'translateX(-50%)';
        mensajeDiv.style.zIndex = '1000';
        document.body.appendChild(mensajeDiv);
    }

    setTimeout(() => {
        mensajeDiv.classList.add('fadeOut');
        setTimeout(() => mensajeDiv.remove(), 1000);
    }, 4000); // Reducido a 4 seg para no molestar
}
window.mostrarMensajeFlotante = mostrarMensajeFlotante; // Exportar
mostrarMensajeFlotante("¡Recomendamos instalar extencion : \n Amplificador de volumen - refuerzo de sonido \n SponsorBlock, para una mejor experiencia :)" );
mostrarMensajeFlotante("¡Recomendamos primero agregar una playlist!");

// Módulo: Carga del API de YouTube  
function loadYouTubeAPI() {
    if (youtubeAPIReady) return;
    youtubeAPIReady = true;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    window.onYouTubeIframeAPIReady = () => {
        console.log("API de YouTube cargada.");
        initializePlayers();
    };
    document.head.appendChild(script);
}

function initializePlayers() {
    if (player1 && player2) return;

    const playerConfig = {
        height: '100%',
        width: '100%',
        playerVars: {
            'origin': window.location.origin,  
            'enablejsapi': 1,
            'controls': 1,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    };

    player1 = new YT.Player('player1', playerConfig);
    player2 = new YT.Player('player2', playerConfig);
    
    // Exponer players globalmente para SponsorBlock
    window.player1 = player1;
    window.player2 = player2;
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
   // console.log(`Reproductor listo: player${currentPlayer}`);
     //
    if (player1 && player2) {
        playersInitialized = true;
       // console.log("Ambos reproductores están inicializados.");
    }
}
//Verificar si el usuario modifica la duración del video
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
        console.log('Video finalizado.');
        // Lógica existente de fin...
    } else if (event.data === YT.PlayerState.PLAYING) {
        console.log('Video en reproducción.');
        
        // === NUEVO: DISPARAR CARGA DE LETRAS Y RELACIONADOS ===
        const player = event.target; // El reproductor que disparó el evento
        const videoData = player.getVideoData();
        
        // Pequeño delay para asegurar que tenemos datos
        setTimeout(() => {
            if (window.lyricsManager) window.lyricsManager.loadLyricsForCurrentVideo(videoData);
            if (window.relatedManager) window.relatedManager.loadRelatedForVideo(videoData);
        }, 500);
        console.log('Video en reproducción.');
    } else if (event.data === YT.PlayerState.PAUSED) {
        console.log('Video en pausa.');
    }
}
// Nueva función para mostrar resultados de la API de Piped Y YT V3
const displaySearchResultsPiped = (results) => {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ''; // Limpiar contenedor

    if (!results || results.length === 0) {
        resultsDiv.innerHTML = '<p>No se encontraron resultados.</p>';
        mostrarMensajeFlotante("No se encontraron resultados.");
        return;
    }
    
    console.log(`🎨 Renderizando ${results.length} videos en el DOM`);
    
    const fragment = document.createDocumentFragment();

    results.forEach((video, index) => {
        // ✅ VALIDAR estructura del video
        if (!video || !video.videoId) {
            console.warn(`Video ${index} sin videoId:`, video);
            return;
        }

        const videoElement = document.createElement('div');
        videoElement.className = 'result';
        videoElement.dataset.videoId = video.videoId;

        const img = document.createElement('img');
        img.src = video.thumbnail || 'https://static.vecteezy.com/system/resources/previews/016/771/877/non_2x/student-dj-party-icon-outline-person-club-vector.jpg';
        img.alt = video.title || 'Sin título';
        img.onerror = () => {
            img.src = 'https://static.vecteezy.com/system/resources/previews/016/771/877/non_2x/student-dj-party-icon-outline-person-club-vector.jpg';
        };

        const infoDiv = document.createElement('div');
        infoDiv.style.flex = '1';

        const title = document.createElement('h3');
        title.textContent = video.title || 'Sin título';
        title.style.margin = '0 0 5px 0';
        title.style.fontSize = '14px';

        const artist = document.createElement('p');
        artist.textContent = video.artist || video.uploaderName || 'Artista desconocido';
        artist.style.margin = '0';
        artist.style.fontSize = '12px';
        artist.style.color = '#666';

        const duration = document.createElement('p');
        duration.className = 'result-duration';
        duration.textContent = `⏱️ ${video.duration || '0:00'}`;
        duration.style.margin = '5px 0 0 0';
        duration.style.fontSize = '11px';
        duration.style.color = '#999';

        infoDiv.appendChild(title);
        infoDiv.appendChild(artist);
        infoDiv.appendChild(duration);

        const button = document.createElement('button');
        button.className = 'add-to-playlist';
        button.dataset.videoId = video.videoId;
        button.dataset.videoTitle = video.title || 'Sin título';
        button.dataset.videoDuration = parseDuration(video.duration || '0:00');
        button.dataset.videoThumbnail = video.thumbnail || '';

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-plus';
        button.appendChild(icon);

        // Event listener directo
        button.addEventListener('click', () => {
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration) || 0,
            };
            console.log('➕ Añadiendo video:', videoData);
            addToPlaylist(videoData);
        });

        videoElement.appendChild(img);
        videoElement.appendChild(infoDiv);
        videoElement.appendChild(button);
        fragment.appendChild(videoElement);
    });

    resultsDiv.appendChild(fragment);
    console.log('✅ DOM actualizado con resultados');
};
// Módulo: Búsqueda

const performSearch = async (query) => {
  const resultsContainer = document.getElementById('results'); 
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<div class="loading">Buscando en servidor remoto...</div>';
    
    if (!window.youtubeJSClient) { 
        resultsContainer.innerHTML = '<div class="error">Error: Cliente no inicializado.</div>';
        return;
    }

    try {
        const data = await window.youtubeJSClient.search(query);
        
        if (!data.items || data.items.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No se encontraron resultados</div>';
            return;
        }

        displaySearchResultsPiped(data.items);
    } catch (error) {
        console.error("Error:", error);
        resultsContainer.innerHTML = `<div class="error">Error de conexión: ${error.message}</div>`;
    }
};
// Módulo: Manejo de la Playlist (Añadir, Eliminar, Reordenar, Actualizar DOM)
//Agregar a la playlist
const addToPlaylist = (videoData) => {
    // **VALIDACIÓN EXHAUSTIVA DE LOS DATOS**
    if (!videoData || !videoData.videoId) {
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

        // Verificar si es un video añadido manualmente
        const isManual = playlistVideos[videoIndex].manual;

        // Eliminar de la playlist principal
        playlistVideos.splice(videoIndex, 1);

        // Si es manual, también eliminarlo de manualVideos
        if (isManual) {
            manualVideos = manualVideos.filter((video) => video.videoId !== videoId);
        }
        // Ajustar el índice actual si afecta la reproducción
        if (currentIndex >= videoIndex) {
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
//Actualizar DOM   
function updatePlaylistDOM() {
    const playlistContainer = document.getElementById('playlist');
    if (!playlistContainer) return;
    
    playlistContainer.innerHTML = '';

    window.playlistVideos.forEach((video, index) => { // Usar window.playlistVideos
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.draggable = true;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';

        const img = document.createElement('img');
        img.src = video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
        img.alt = video.title;
        img.className = 'drag-handle';
        
        img.onerror = () => {
            img.src = 'https://via.placeholder.com/100x75?text=No+Img';
        };
        
        imageContainer.appendChild(img);

        // Icono de reproducción
        if (index === currentIndex) {
            item.classList.add('playing');
            const icon = document.createElement('i');
            icon.className = 'fas fa-play playing-icon'; // Corregido clase icono
            icon.style.cssText = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-shadow: 0 0 5px black;";
            imageContainer.appendChild(icon);
        }

        item.appendChild(imageContainer);
        
        // Info del video
        const infoDiv = document.createElement('div');
        infoDiv.style.flex = "1";
        infoDiv.innerHTML = `
            <p style="margin: 0; font-size: 12px; font-weight: bold;">${video.title}</p>
            <p style="margin: 0; font-size: 10px; color: #555;">Duración: ${formatDuration(video.duration)}</p>
        `;
        item.appendChild(infoDiv);

        // Menú borrar
        const deleteMenu = document.createElement('div');
        deleteMenu.innerHTML = `<button class="delete-button" onclick="deleteVideo('${video.videoId}')"><i class="fas fa-trash"></i></button>`;
        item.appendChild(deleteMenu);

        // Click para reproducir
        item.addEventListener('click', (e) => {
            if (!e.target.closest('button')) { // Evitar click si se pulsa borrar
                currentIndex = index;
                const player = currentPlayer === 1 ? player1 : player2;
                playVideo(video.videoId, player);
                updatePlaylistDOM();
            }
        });

        playlistContainer.appendChild(item);
    });
    
    enableDragAndDrop();
    
    // Actualizar estado del botón iniciar
    const iniciarBtn = document.getElementById('iniciarButton');
    if (iniciarBtn) {
        iniciarBtn.disabled = window.playlistVideos.length === 0;
    }
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
// Función para extraer el ID de la playlist de una URL de YouTube
function extractPlaylistId(url) {
    try {
        if (!url.includes('http') && url.length > 10) return url.trim();
        const urlObj = new URL(url);
        if (urlObj.searchParams.has('list')) return urlObj.searchParams.get('list');
        return null;
    } catch (e) {
        return url.length > 10 ? url.trim() : null;
    }
}
// Obtener información de la playlist
async function getPlaylistInfo(playlistId) {
    try {
        const url = `${CONFIG.apiBase}?id=${playlistId}`; 
        console.log("Solicitando playlist remota:", url);
        
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`Error API: ${response.status}`);
        
        const data = await response.json();

        return {
            items: data.items || [],
            name: data.metadata?.title || "Playlist Importada", // Recuperamos el título
            relatedStreams: null // Compatibilidad si la usabas antes
        };

    } catch (error) {
        console.error("❌ Error playlist:", error);
        alert("Error al cargar la lista. Verifica que el servidor yt-mix esté activo.");
        return null; // Devuelve null en error para que la validación falle correctamente
    }
}
//Función para obtener miniaturas 
async function obtenerMiniaturas(videoIds) {
  const apiKey = obtenerClaveAPI(); // Obtiene la clave de API actual
  //  Divide el arreglo de IDs en grupos de 50 (límite de la API)
  const gruposDeIds = chunkArray(videoIds, 50);

  const miniaturas = {};

  for (const grupoDeIds of gruposDeIds) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${grupoDeIds.join(',')}&key=${apiKey}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.items) {
        data.items.forEach(video => {
          const videoId = video.id;
          const thumbnails = video.snippet.thumbnails;

          miniaturas[videoId] = thumbnails;
        });
      }
    } catch (error) {
      console.error('Error al obtener miniaturas:', error);
    }
  }

  return miniaturas;
}

// Función auxiliar para dividir un arreglo en grupos
function chunkArray(array, size) {
  const chunkedArray = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArray.push(array.slice(i, i + size));
  }
  return chunkedArray;
}
// Utiliza las miniaturas almacenadas en caché
async function mostrarMiniaturas(videoIds) {
  // Obtén las miniaturas almacenadas en caché
  const miniaturasCache = JSON.parse(localStorage.getItem('miniaturas')) || {};

  // Obtén las IDs de los videos que no están en caché
  const idsSinCache = videoIds.filter(id => !miniaturasCache[id]);

  // Si hay IDs sin caché, obtén las miniaturas de la API
  if (idsSinCache.length > 0) {
    const nuevasMiniaturas = await obtenerMiniaturas(idsSinCache);
    // Actualiza el caché con las nuevas miniaturas
    Object.assign(miniaturasCache, nuevasMiniaturas);
  }

  // Muestra las miniaturas
  videoIds.forEach(videoId => {
    const thumbnails = miniaturasCache[videoId];
    if (thumbnails) {
      // Muestra las miniaturas del video
      console.log(`Miniaturas para ${videoId}:`, thumbnails);
      // ... (código para mostrar las miniaturas en tu aplicación)
    } else {
      console.error(`No se encontraron miniaturas para ${videoId}`);
    }
  });
}

//  Mostrar playlist
function displayPlaylist(playlist) {
    if (!playlist || !playlist.items || !Array.isArray(playlist.items)) {
        console.error('Error: La playlist no contiene videos válidos.');
        alert('No se encontraron videos válidos en la playlist.');
        return;
    }
    
    const playlistHeader = document.getElementById('playlist-panel').querySelector('h2');
    if (playlistHeader && playlist.metadata?.title) {
        playlistHeader.textContent = playlist.metadata.title;
    }

    // ✅ MAPEAR CON THUMBNAILS REALES
    const loadedVideos = playlist.items.map((video) => {
        if (!video.videoId) {
            console.warn('Video sin videoId:', video);
            return null;
        }

        // ✅ USAR THUMBNAIL REAL DEL API
        const thumbnail = video.thumbnail || 
                         `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

        return {
            videoId: video.videoId,
            title: video.title || 'Sin título',
            thumbnail: thumbnail, // ✅ THUMBNAIL REAL
            duration: parseDuration(video.duration) || 0,
            manual: false,
        };
    }).filter(v => v !== null);

    playlistVideos = [...loadedVideos, ...manualVideos];
    console.log(`✅ Playlist cargada con ${loadedVideos.length} videos`);
    
    if (loadedVideos.length > 0) {
        mostrarMensajeFlotante(`Playlist añadida: ${loadedVideos.length} videos`);
    }
    
    updatePlaylistDOM();
}

// Módulo: Reproducción y Crossfade
// Función para reproducir un video
function playVideo(videoId, player) {
    player.loadVideoById(videoId);
}
// Función para reproducir el siguiente video con efecto crossfade
function playNextVideo() {
    if (currentIndex < playlistVideos.length - 1) {
        currentIndex++;
        
        // ✅ RESET DEL FLAG AL CAMBIAR DE VIDEO
        window.crossfadeTriggered = false;
        
        const currentPlayerElement = document.getElementById(`player${currentPlayer}`);
        const nextPlayer = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
        const nextVideoId = playlistVideos[currentIndex].videoId;
        
        console.log(`▶️ Reproduciendo siguiente video: ${playlistVideos[currentIndex].title}`);
        
        nextPlayer.loadVideoById(nextVideoId);
        
        // ✅ Precargar segmentos de SponsorBlock
        if (window.sponsorBlockManager && nextVideoId) {
            window.sponsorBlockManager.cargarSegmentos(nextVideoId).then(segments => {
                if (segments.length > 0) {
                    console.log(`✅ ${segments.length} segmentos SponsorBlock precargados para próximo video`);
                }
            }).catch(() => {});
        }

        updatePlaylistDOM();

        // Efectos visuales
        currentPlayerElement.classList.add('fade-out');
        nextPlayerElement.classList.remove('hidden');
        nextPlayerElement.classList.add('fade-in');

        setTimeout(() => {
            currentPlayerElement.classList.add('hidden');
            currentPlayerElement.classList.remove('fade-out');
            nextPlayerElement.classList.remove('fade-in');

            currentPlayer = currentPlayer === 1 ? 2 : 1;

            crossfadeAudio();
        }, 1500);
    } else {
        console.log('Fin de la lista de reproducción.');
        askToRepeatPlaylist();
    }
}

function crossfadeAudio() {
    const previousPlayer = currentPlayer === 1 ? player2 : player1;
    const nextPlayer = currentPlayer === 1 ? player1 : player2;

    let progress = 0; // De 0 a 1
    const durationMs = CROSSFADE_DURATION * 1000;
    const intervalMs = 100;
    const steps = durationMs / intervalMs;
    const increment = 1 / steps;

    const crossfadeInterval = setInterval(() => {
        progress += increment;

        // Curva Logarítmica/Potencia Constante
        // El volumen se calcula como el cuadrado del progreso para una transición suave
        const outVolume = Math.cos(progress * 0.5 * Math.PI) * 100;
        const inVolume = Math.sin(progress * 0.5 * Math.PI) * 100;

        if (previousPlayer && typeof previousPlayer.setVolume === 'function') {
            previousPlayer.setVolume(Math.max(0, outVolume));
        }
        if (nextPlayer && typeof nextPlayer.setVolume === 'function') {
            nextPlayer.setVolume(Math.min(100, inVolume));
        }

        if (progress >= 1) {
            clearInterval(crossfadeInterval);
            if (previousPlayer && typeof previousPlayer.pauseVideo === 'function') {
                previousPlayer.pauseVideo();
            }
        }
    }, intervalMs);
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
function startMonitoring() {
    if (!monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 500); 
        console.log('Monitoreo iniciado (0.5s).');
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
    // ✅ VERIFICAR que YT existe
    if (typeof YT === 'undefined' || !YT.PlayerState) {
        return;
    }
    
    // ✅ VERIFICAR que los players existen
    if (!player1 || !player2) {
        return;
    }
    
    if (!playersInitialized) {
        return;
    }

    const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;

    // ✅ VERIFICAR que el método existe
    if (!currentPlayerInstance || typeof currentPlayerInstance.getPlayerState !== 'function') {
        return;
    }
    
    const playerState = currentPlayerInstance.getPlayerState();
    
    // ✅ SOLO MONITOREAR SI ESTÁ REPRODUCIENDO O EN BUFFERING
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
        return;
    }
    
    // ✅ SponsorBlock: Revisar saltos normales (solo si está reproduciendo)
    if (playerState === YT.PlayerState.PLAYING && window.sponsorBlockManager) {
        try {
            window.sponsorBlockManager.checkAndSkip(currentPlayerInstance);
        } catch (e) {
            console.warn('Error en SponsorBlock:', e);
        }
    }
    
    try {
        const currentTime = currentPlayerInstance.getCurrentTime();
        const duration = currentPlayerInstance.getDuration();
        const videoData = currentPlayerInstance.getVideoData(); 
        const videoId = videoData ? videoData.video_id : null;

        // ✅ VALIDAR DURACIÓN
        if (isNaN(duration) || duration <= 0 || isNaN(currentTime)) {
            return;
        }

        let triggerTime;

        // ✅ CALCULAR TRIGGER TIME CON SPONSORBLOCK
        if (window.sponsorBlockManager && videoId) {
            triggerTime = window.sponsorBlockManager.calculateCrossfadeTriggerTime(
                duration, 
                videoId, 
                CROSSFADE_DURATION
            );
        } else {
            // Fallback: sin SponsorBlock
            triggerTime = duration - CROSSFADE_DURATION;
        }

        // ✅ DEBUG: Mostrar info cada 5 segundos
        if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime) !== window.lastLogTime) {
            window.lastLogTime = Math.floor(currentTime);
            console.log(`⏱️ Player${currentPlayer} | Tiempo: ${currentTime.toFixed(1)}/${duration.toFixed(1)} | Trigger: ${triggerTime.toFixed(1)}`);
        }

        // ✅ DISPARAR CROSSFADE CUANDO SE ALCANCE EL TRIGGER TIME
        if (currentTime >= triggerTime && !window.crossfadeTriggered) {
            window.crossfadeTriggered = true;
            
            console.log(`🔀 ¡CROSSFADE ACTIVADO! (Tiempo: ${currentTime.toFixed(1)}s | Trigger: ${triggerTime.toFixed(1)}s)`);
            
            playNextVideo();
            
            // ✅ RESET FLAG DESPUÉS DE 2 SEGUNDOS
            setTimeout(() => {
                window.crossfadeTriggered = false;
            }, 2000);
        }
        
    } catch (error) {
        console.error(`Error al monitorear Player${currentPlayer}:`, error);
    }
}
// Módulo: Manejo de Eventos y Botones
function setupEventListeners() {
    // Botón Mix
    const mixBtn = document.getElementById('mixButton');
    if (mixBtn) {
        mixBtn.addEventListener('click', () => playNextVideo());
    }

    // Búsqueda por palabras
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            const query = event.target.value.trim();
            if (query.length > 0) {
                debouncedSearch(query);
            } else {
                const results = document.getElementById('results');
                if (results) results.innerHTML = '';
            }
        });
    }

    // Evento para el botón "Añadir URL"
    const añadirUrlBtn = document.getElementById('añadirUrlButton');
    const searchInput2 = document.getElementById('searchInput2');
    if (añadirUrlBtn && searchInput2) {
        añadirUrlBtn.addEventListener('click', async () => {
            const url = searchInput2.value.trim();
            const playlistId = extractPlaylistId(url);

            if (!playlistId) {
                alert('URL de la playlist no válida.');
                return;
            }

                const playlistInfo = await getPlaylistInfo(playlistId);
               if (playlistInfo && (playlistInfo.items || playlistInfo.relatedStreams)) {
                displayPlaylist(playlistInfo);
                searchInput2.value = '';
                    const iniciarBtn = document.getElementById('iniciarButton');
                    if (iniciarBtn) {
                iniciarBtn.disabled = false; // Esto permite que el usuario le de clic tras cargar la playlist
                iniciarBtn.style.opacity = "1"; // Opcional: para que se vea activo visualmente
                }
                    mostrarMensajeFlotante("Playlist añadida.");
            } else {
                alert('No se pudo obtener información de la playlist.');
            }
        });
    }

    // Iniciar botón
  const iniciarBtn = document.getElementById('iniciarButton');
    if (iniciarBtn) {
        iniciarBtn.disabled = true; 
        iniciarBtn.addEventListener('click', () => {
            // Usamos la variable para evitar múltiples inicios
            if (playlistVideos.length > 0 && !reproduccionIniciada) {
                reproduccionIniciada = true;
                currentIndex = 0;
                if (playersInitialized) {
                    playFirstVideo();
                    mostrarMensajeFlotante(`Iniciando con video: ${playlistVideos[currentIndex].title}`);
                }
                iniciarBtn.disabled = true;
            }
        });
    }
}

function setupCrossfader() {
    console.log("Crossfader configurado a:", CROSSFADE_DURATION, "segundos");
}

// Carga inicial del API de YouTube (se puede retrasar con DOMContentLoaded si se desea)
loadYouTubeAPI();

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.disabled = true;
        searchInput.placeholder = "Iniciando sistema...";
    }
    if (window.youtubeJSClient) {
        await window.youtubeJSClient.init();
        console.log('✅ YouTube Client inicializado');
        
        // 3. Habilitar búsqueda ahora que es seguro
        if(searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = "Search";
        }
    }
});
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
const debouncedSearch = debounce(performSearch, 300); // 300ms de retraso
// Estilos CSS (con la nueva ubicación del mensaje)
const style2 = document.createElement('style');
style2.textContent = `
    /* ... (tus otros estilos) */
    .mensaje-flotante {
        margin-top: 25px; /* Espacio entre la playlist y el mensaje */
        background-color: rgba(32, 96, 187, 0.7);
        color: white;
        padding: 10px 30px;
        border: 2px dashed white;
        border-radius: 5px;
        text-align: center; /* Centrar el texto */
        opacity: 1;
        transition: opacity 1s ease-in-out;
    }
    .mensaje-flotante.fadeOut {
        opacity: 0;
    }
    /* ... (otros estilos) */
`;
document.head.appendChild(style2);
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
    
    // ✅ Manejar formato MM:SS o HH:MM:SS
    if (durationString.includes(':')) {
        const parts = durationString.split(':').map(Number);
        if (parts.length === 2) {
            // MM:SS
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
    }
    
    // Formato ISO 8601 (PT1M30S)
    const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}
// =============================================
// GESTOR DE LETRAS (LyricsManager) - VERSIÓN LIMPIA
// =============================================
class LyricsManager {
    constructor() {
        this.lyricsProvider = 'lrclib'; // Proveedor por defecto
        this.currentLrc = [];
        this.syncInterval = null;
    }

    /**
     * Limpia y normaliza los datos del video para mejorar la búsqueda
     */
    cleanData(video) {
        let rawArtist = video.artist || video.uploaderName || video.author || '';
        let rawTitle = video.title || '';
        let duration = 0;

        // 1. CORREGIR DURACIÓN (Evitar NaN)
        if (typeof video.duration === 'number') {
            duration = video.duration;
        } else if (typeof video.duration === 'string') {
            // Intenta usar tu función global si existe, sino parseo manual
            if (typeof window.parseDuration === 'function') {
                duration = window.parseDuration(video.duration);
            } else {
                // Fallback para "PT3M20S" o "3:20"
                const parts = video.duration.replace('PT','').replace('S','').split('M');
                if(parts.length === 2) duration = parseInt(parts[0])*60 + parseInt(parts[1]);
            }
        }
        if (isNaN(duration)) duration = 0;

        // 2. LIMPIEZA DE ARTISTA
        // Elimina: VEVO, - Topic, Official, espacios extra
        let artist = rawArtist
            .replace(/VEVO$/i, '')          // SelenaGomezVEVO -> SelenaGomez
            .replace(/([a-z])([A-Z])/g, '$1 $2') // SelenaGomez -> Selena Gomez (CamelCase a espacios)
            .replace(/\s*-\s*Topic$/i, '')  // Artista - Topic -> Artista
            .replace(/Official/i, '')
            .trim();

        // 3. LIMPIEZA DE TÍTULO
        // Elimina basura común: (Official Video), [Audio], ft. Alguien, etc.
        let title = rawTitle
            .replace(/[\(\[](official|video|audio|lyric|hd|hq|remix|4k|mv).*?[\)\]]/gi, '') // Elimina paréntesis
            .replace(/^\s*\|\s*/, '') // Elimina barras al inicio
            .trim();

        // LÓGICA "ARTISTA - CANCIÓN"
        // Muchos videos de música tienen el formato: "Artista - Canción" en el título
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            const part1 = parts[0].trim().toLowerCase();
            const part2 = parts[1].trim();
            const artistLower = artist.toLowerCase();

            // Si la primera parte del título se parece al artista del canal
            // Ejemplo: Title="Rema, Selena Gomez - Calm Down", Artist="Selena Gomez"
            if (part1.includes(artistLower) || artistLower.includes(part1) || part1.length > 3) {
                // Asumimos que la parte 1 es el artista (o colaboradores) y la parte 2 es la canción
                // Actualizamos el artista con la info del título que suele ser más precisa (ej. feats)
                artist = parts[0].trim(); 
                title = part2; 
            }
        }

        // 4. LIMPIEZA FINAL DE "FEAT" EN TÍTULO Y ARTISTA
        // Limpiamos "ft.", "feat." para dejar solo el nombre principal
        title = title.split(/\s(\(|\[)?(ft\.|feat\.|starring)/i)[0].trim();
        artist = artist.split(/\s(\(|\[)?(ft\.|feat\.|,|&)/i)[0].trim(); // Toma solo el primer artista principal

        return { 
            artist: artist, 
            title: title, 
            duration: Math.round(duration) 
        };
    }

    async loadLyricsForCurrentVideo(video) {
        const container = document.getElementById('lyricsContent');
        if (!container) return;

        this.stopSync();
        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Buscando letras...</p></div>';

        // ✅ USAR DATOS LIMPIOS
        const clean = this.cleanData(video);
        
        console.log(`🎵 Datos limpios: Artista="${clean.artist}", Titulo="${clean.title}"`);

        try {
            // Intentar proveedor principal
            const data = await this.fetchLyrics(this.lyricsProvider, clean.artist, clean.title, clean.duration);
            this.renderLyricsUI(data, clean.artist, clean.title);
        } catch (e) {
            console.warn(`Fallo ${this.lyricsProvider}, intentando fallback...`, e);
            try {
                // Fallback automático al otro proveedor
                const fallbackProvider = this.lyricsProvider === 'lrclib' ? 'lujjjh' : 'lrclib';
                const data = await this.fetchLyrics(fallbackProvider, clean.artist, clean.title, clean.duration);
                this.renderLyricsUI(data, clean.artist, clean.title);
            } catch (err2) {
                console.error("Error final letras:", err2);
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-times"></i>
                        <p>No se encontraron letras.</p>
                        <small style="color:#666; font-size: 0.8em;">Buscado: ${clean.title} - ${clean.artist}</small>
                        <br><br>
                        <button id="retryLyricsBtn" class="lyrics-provider-btn" style="background:#333;color:white;">Reintentar</button>
                    </div>`;
                
                const retryBtn = document.getElementById('retryLyricsBtn');
                if(retryBtn) retryBtn.onclick = () => this.loadLyricsForCurrentVideo(video);
            }
        }
    }

    async fetchLyrics(provider, artist, title, duration) {
        // Codificar componentes para URL
        const safeArtist = encodeURIComponent(artist);
        const safeTitle = encodeURIComponent(title);

        if (provider === 'lrclib') {
            const url = `https://lrclib.net/api/get?artist_name=${safeArtist}&track_name=${safeTitle}`;
            console.log("🔗 Fetching LRCLIB:", url);
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('LRCLIB 404/Error');
            const data = await res.json();
            return {
                syncedLyrics: data.syncedLyrics,
                plainLyrics: data.plainLyrics,
                provider: 'LRCLIB'
            };
        } else {
        const targetApi = `https://lyrics-api.lujjjh.com/?name=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        const backendHost = "https://sphenographic-johnie-supersensually.ngrok-free.dev"; 
        const proxyUrl = `${backendHost}/lyrics-proxy?url=${encodeURIComponent(targetApi)}`;
            
            console.log("🔗 Fetching Proxy:", proxyUrl);

            try {
                const res = await fetch(proxyUrl);
                
                // Si estamos en localhost sin Wrangler, esto fallará con 404
                if (res.status === 404 && window.location.hostname === 'localhost') {
                    throw new Error('El proxy local no funciona con "serve". Usa "wrangler pages dev".');
                }
                
                if (!res.ok) throw new Error('Proxy Error: ' + res.status);
                
                const text = await res.text();
                // Validación básica de respuesta
                if (!text || text.includes('Cannot GET') || text.length < 20) throw new Error('Respuesta inválida');

                return {
                    syncedLyrics: text, 
                    plainLyrics: text.replace(/\[.*?\]/g, ''),
                    provider: 'LUJJJH'
                };
            } catch (proxyError) {
                console.warn("Error proxy, intentando acceso directo (puede fallar por CORS):", proxyError);
                // Último intento: directo (algunos navegadores/extensiones lo permiten)
                const directRes = await fetch(targetApi);
                const directText = await directRes.text();
                return { syncedLyrics: directText, plainLyrics: directText.replace(/\[.*?\]/g, ''), provider: 'LUJJJH (Direct)' };
            }
        }
    }

    renderLyricsUI(data, artist, title) {
        const container = document.getElementById('lyricsContent');
        const hasSynced = data.syncedLyrics && data.syncedLyrics.includes('[');
        
        // Limpiar para asegurar que no hay duplicados
        container.innerHTML = '';

        let html = `
            <div class="lyrics-header">
                <div style="flex:1; overflow:hidden;">
                    <strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size: 1.1em;">${this.escapeHTML(title)}</strong>
                    <small style="color:#aaa;">${this.escapeHTML(artist)}</small>
                </div>
                <button id="translateBtn" class="lyrics-provider-btn" title="Traducir" style="background:transparent; border:none; color:white;"><i class="fas fa-language fa-lg"></i></button>
            </div>
            <div class="lyrics-text ${hasSynced ? 'synced' : 'plain'}" style="padding-top:10px;">
        `;

        if (hasSynced) {
            this.currentLrc = this.parseLRC(data.syncedLyrics);
            if(this.currentLrc.length > 0) {
                html += this.currentLrc.map(l => `<p data-time="${l.time}">${this.escapeHTML(l.text)}</p>`).join('');
                this.startSync();
            } else {
                html += (data.plainLyrics || data.syncedLyrics).replace(/\n/g, '<br>');
            }
        } else {
            html += (data.plainLyrics || data.syncedLyrics).replace(/\n/g, '<br>');
        }

        html += '</div>';
        container.innerHTML = html;

        const tBtn = document.getElementById('translateBtn');
        if(tBtn) tBtn.onclick = () => this.translateLyrics();
    }

    startSync() {
        this.stopSync();
        this.syncInterval = setInterval(() => {
            const player = (window.currentPlayer === 1) ? window.player1 : window.player2;
            if (!player || typeof player.getCurrentTime !== 'function') return;
            
            const time = player.getCurrentTime();
            const lines = document.querySelectorAll('.lyrics-text.synced p');
            
            let activeIndex = -1;
            for (let i = 0; i < this.currentLrc.length; i++) {
                if (time >= this.currentLrc[i].time) {
                    activeIndex = i;
                } else {
                    break;
                }
            }

            if (activeIndex !== -1 && lines[activeIndex]) {
                const currentLine = lines[activeIndex];
                if (!currentLine.classList.contains('active')) {
                    lines.forEach(l => l.classList.remove('active'));
                    currentLine.classList.add('active');
                    currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 300);
    }

    stopSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
    }

    // Traducción simple usando Google Translate API (Gratis/Limitada)
    async translateLyrics() {
        const container = document.querySelector('.lyrics-text');
        if (!container) return;
        
        const btn = document.getElementById('translateBtn');
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        
        let text = "";
        const isSynced = container.classList.contains('synced');
        
        if (isSynced) {
            text = this.currentLrc.map(l => l.text).join('\n');
        } else {
            text = container.innerText;
        }

        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(text)}`;
            const res = await fetch(url);
            const json = await res.json();
            
            const translation = json[0].map(x => x[0]).join('');
            
            if (isSynced) {
                const transLines = translation.split('\n');
                const ps = container.querySelectorAll('p');
                ps.forEach((p, i) => {
                    if (!p.querySelector('.lyrics-translation') && transLines[i]) {
                        const t = document.createElement('span');
                        t.className = 'lyrics-translation';
                        t.textContent = transLines[i];
                        t.style.cssText = "display:block; font-size:0.8em; color:#4caf50; font-style:italic;";
                        p.appendChild(t);
                    }
                });
            } else {
                if (!container.querySelector('.translated-block')) {
                    const div = document.createElement('div');
                    div.className = 'lyrics-translation translated-block';
                    div.innerHTML = `<hr style="border-color:#333; margin:20px 0;"><strong style="color:#4caf50">Traducción:</strong><br><br>${translation.replace(/\n/g, '<br>')}`;
                    container.appendChild(div);
                }
            }
            btn.innerHTML = '<i class="fas fa-check" style="color:#4caf50"></i>';
        } catch (e) {
            console.error(e);
            window.mostrarMensajeFlotante("Error al traducir");
            btn.innerHTML = originalIcon;
        } finally {
            btn.disabled = false;
        }
    }

    parseLRC(lrc) {
        if(!lrc) return [];
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
        return lrc.split('\n').map(line => {
            const m = line.match(regex);
            if (!m) return null;
            return {
                time: parseInt(m[1])*60 + parseInt(m[2]) + parseFloat('0.'+m[3]),
                text: m[4].trim()
            };
        }).filter(x => x);
    }
    
    escapeHTML(str) {
        if(!str) return '';
        return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[t]));
    }
}

// Inicializar
window.lyricsManager = new LyricsManager();
// =============================================
// GESTOR DE RELACIONADOS (RelatedManager)
// =============================================
class RelatedManager {
    constructor() {
        this.lastId = null;
    }

    async loadRelatedForVideo(video) {
        const container = document.getElementById('relatedVideosList');
        if (!container || !video.video_id) return;

        if (this.lastId === video.video_id) return; // Ya cargado
        this.lastId = video.video_id;

        container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Buscando recomendaciones...</p></div>';

        try {
            // Usamos el cliente de YouTube existente para buscar
            // Estrategia: Buscar "Artista + Titulo" para obtener mix similar
            let query = video.author ? `${video.author} ${video.title}` : video.title;
            query = query.replace(/[\(\[].*?[\)\]]/g, ''); // Limpiar query

            const results = await window.youtubeJSClient.search(query);
            
            if (!results.items || results.items.length === 0) throw new Error('No results');

            container.innerHTML = '';
            const list = document.createElement('div');
            
            results.items.filter(v => v.videoId !== video.video_id).forEach(v => {
                const item = document.createElement('div');
                item.className = 'related-video-item';
                item.innerHTML = `
                    <img src="${v.thumbnail}" alt="thumb">
                    <div class="related-info">
                        <h4>${v.title}</h4>
                        <p>${v.artist || 'Desconocido'}</p>
                    </div>
                    <button class="add-to-playlist" style="background:transparent; color:#007bff; border:none; margin-left:auto;">
                        <i class="fas fa-plus-circle fa-lg"></i>
                    </button>
                `;
                
                // Click en todo el item: Reproducir ahora (Insertar siguiente)
                item.onclick = (e) => {
                    if (e.target.closest('button')) return; // Ignorar si click en botón +
                    // Lógica para reproducir inmediato (Opcional, o añadir a cola)
                    addToPlaylist(v);
                    mostrarMensajeFlotante(`Añadido: ${v.title}`);
                };

                // Click en botón +: Añadir al final
                item.querySelector('button').onclick = () => {
                    addToPlaylist(v);
                };

                list.appendChild(item);
            });
            container.appendChild(list);

        } catch (e) {
            console.error(e);
            container.innerHTML = '<div class="empty-state"><p>No se encontraron relacionados</p></div>';
        }
    }
}

// Inicializar Managers
window.lyricsManager = new LyricsManager();
window.relatedManager = new RelatedManager();
