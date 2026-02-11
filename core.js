// Módulo: Configuración y Variables Globales
const CONFIG = {
    origin: window.location.origin, 
    apiBase: "https://mix-yt.pages.dev/"
};
const CROSSFADE_DURATION = 15; // Duración del crossfade en segundos
let player1, player2;
let currentPlayer = 1;
let playlistVideos = [];// Videos cargados desde la URL
let manualVideos = [];// Videos añadidos desde la búsqueda
let monitorInterval;// Declarar fuera para controlar el intervalo
let playersInitialized = false;// Estado global para saber si ambos reproductores están listos
let youtubeAPIReady = false;
let currentIndex = 0;
let reproduccionIniciada = false;
// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Frontend en:", CONFIG.origin);
    console.log("🔗 Conectando a Backend:", CONFIG.apiBase);
    
    loadYouTubeAPI();
    setupEventListeners();
    setupCrossfader();
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        });
    });
});

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
    },10000);// 10 segundos
}
mostrarMensajeFlotante("¡Recomendamos instalar extencion : \n Amplificador de volumen - refuerzo de sonido \n SponsorBlock, para una mejor experiencia :)" );
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
function initializePlayers() {
    if (player1 && player2) return;

    const playerConfig = {
        height: '250',
        width: '350',
        playerVars: {
            'origin': window.location.origin, // Añadir esta línea
            'enablejsapi': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    };

    player1 = new YT.Player('player1', playerConfig);
    player2 = new YT.Player('player2', playerConfig);
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
    } else if (event.data === YT.PlayerState.PLAYING) {
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
//Actualizar DOM  (CORREGIDO)
function updatePlaylistDOM() {
    const playlistContainer = document.getElementById('playlist');
    playlistContainer.innerHTML = '';

    playlistVideos.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.draggable = true;

        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';

        // ✅ MOSTRAR THUMBNAIL REAL
        const img = document.createElement('img');
        img.src = video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
        img.alt = video.title;
        img.className = 'drag-handle';
        
        // ✅ FALLBACK SI FALLA LA IMAGEN
        img.onerror = () => {
            img.src = 'https://i.ytimg.com/vi/' + video.videoId + '/default.jpg';
            img.onerror = () => {
                img.src = 'https://static.vecteezy.com/system/resources/previews/016/771/877/non_2x/student-dj-party-icon-outline-person-club-vector.jpg';
            };
        };
        
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

        // Menú de eliminar
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
            event.stopPropagation();
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
            
            if (playersInitialized) {
                if (currentPlayer === 1 && player1 && player1.getVideoData() && player1.getVideoData().video_id) {
                    playingIndex = playlistVideos.findIndex(v => v.videoId === player1.getVideoData().video_id);
                } else if (currentPlayer === 2 && player2 && player2.getVideoData() && player2.getVideoData().video_id) {
                    playingIndex = playlistVideos.findIndex(v => v.videoId === player2.getVideoData().video_id);
                }
            }
            
            if (currentIndexInPlaylist > 0) {
                playlistVideos.splice(currentIndexInPlaylist, 1);
                
                if (playingIndex !== -1 && currentIndexInPlaylist > playingIndex) {
                    playlistVideos.splice(playingIndex + 1, 0, video);
                } else {
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
        monitorInterval = setInterval(monitorPlayers, 1000); 
        console.log('Monitoreo iniciado (1s).');
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
