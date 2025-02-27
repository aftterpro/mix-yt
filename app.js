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
    7},10000);// 10 segundos
}
// Ejemplo de uso:
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
//Asegurar que onYouTubeIframeAPIReady llama a initializePlayers
function onYouTubeIframeAPIReady() {
    console.log("API de YouTube cargada.");
    initializePlayers();
}
// Agregaremos una función que garantice que ambos reproductores estén listos antes de ejecutar cualquier acción.
// asegurarte de que todo el flujo se configura correctamente
function initializePlayers() {
    if (player1 && player2) return; // Evitar la reinicialización si ya existen

    player1 = new YT.Player('player1', {
        height: '250',
        width: '150',
        events: {
            'onReady': onPlayerReady, // Referencia directa a la función
            'onStateChange': onPlayerStateChange,
             'onError': onPlayerError
        }
    });
    player2 = new YT.Player('player2', {
        height: '250',
        width: '150',
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
   // console.log(`Reproductor listo: player${currentPlayer}`);
     // Si ambos reproductores están listos, marca `playersInitialized` como verdadero
    if (player1 && player2) {
        playersInitialized = true;
       // console.log("Ambos reproductores están inicializados.");
    }
    // Inicia el monitor
    if (!monitorInterval) {
        monitorInterval = setInterval(monitorPlayers, 3000); //Monitor inicia con 3 segundos
        console.log('Monitor iniciado con ID:', monitorInterval);
    }
}
//Verificar si el usuario modifica la duración del video
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        console.log('Video finalizado.');
    } else if (event.data === YT.PlayerState.PLAYING) {
     actualizarMiniatura(); // Actualiza la miniatura según el video en reproducción
        console.log('Video en reproducción.');
    } else if (event.data === YT.PlayerState.PAUSED) {
        console.log('Video en pausa.');
    }
}
// Módulo: Interacción con /piped.nosebs.ru/ (Búsqueda)
const performSearch = async (query) => {
    try {
        const response = await fetch(`/.netlify/functions/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            mostrarMensajeFlotante(`Error en la búsqueda: ${response.status}`);
            return;
        }
        const data = await response.json();

        // Llama a la función correcta para mostrar los resultados de Piped
        displaySearchResultsPiped(data);

    } catch (error) {
        console.error("Error fetching search results:", error);
        mostrarMensajeFlotante("Error en la búsqueda.");
    }
};

// Nueva función para mostrar resultados de la API de Piped Y YT V3
const displaySearchResultsPiped = (results) => {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        console.error("Results div not found!");
        return;
    }
    resultsDiv.innerHTML = ''; // Clear previous results

    if (!results || !Array.isArray(results) || results.length === 0) {
        const noResultsMessage = document.createElement('p');
        noResultsMessage.textContent = "No se encontraron resultados.";
        resultsDiv.appendChild(noResultsMessage);
        return;
    }

    results.forEach(video => {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');

        // Contenedor para la miniatura y la duración
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');

        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail;
        thumbnail.alt = video.title;
        thumbnail.classList.add('thumbnail'); // Clase para estilos CSS
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
// Función para extraer el ID de la playlist de una URL de YouTube
function extractPlaylistId(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('list');
}
// Función para obtener información de la playlist usando la API de Piped con un proxy
async function getPlaylistInfo(playlistId) {
    const proxyUrl = 'https://api.allorigins.win/raw?url='; // URL base del proxy
    const targetUrl = `https://pipedapi.nosebs.ru/playlists/${playlistId}`; // Nueva URL de Piped
    const url = `${proxyUrl}${encodeURIComponent(targetUrl)}`; // Codifica la URL de destino

    console.log("URL a solicitar:", url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text(); // Obtener el texto del error

            if (response.status === 502) {
                // Manejo específico para error 502 (Bad Gateway)
                console.error("Error 502 del proxy:", errorText);
                mostrarMensajeFlotante("Error al cargar la playlist: El proxy no está disponible.");  // Mensaje amigable
                return null; // Salir con error
            } else {
                // Manejo para otros errores (diferentes de 502)
                console.error('Error al obtener los datos:', response.status, response.statusText, errorText);
                let errorMessage = `Error al obtener la información de la playlist: ${response.status} - ${response.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText); // Intenta parsear JSON si no es 502
                    errorMessage = errorJson.message || errorMessage;
                } catch (parseError) {
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }
        }

        const data = await response.json(); // Parsear JSON SOLO si response.ok es true y NO es 502
        // Verificar si la estructura es válida
        if (!data || !data.relatedStreams) {
            throw new Error('La estructura de la respuesta no contiene videos válidos.');
        }
        console.log('Información de la playlist:', data);
    // EXTRAE EL NOMBRE DE LA PLAYLIST (CORREGIDO)
    const playlistName = data.name || "Playlist sin nombre"; // Accede a data.name
    console.log('Llamando a displayPlaylist con datos:', data); // Añade esta línea
    displayPlaylist(data) // Llamo para cambiar nombre de playlist
    return { ...data, name: playlistName };
} catch (error) {
        console.error('Error al obtener la información de la playlist:', error.message);
        mostrarMensajeFlotante(error.message);
        return null;
    }
    
}
// Función para mostrar Playlist
function displayPlaylist(playlist) {
        console.log('Datos recibidos en displayPlaylist:', playlist); // Añade esta línea
    if (!playlist || !playlist.relatedStreams || !Array.isArray(playlist.relatedStreams)) {
        console.error('Error: La playlist no contiene videos válidos.');
        alert('No se encontraron videos válidos en la playlist.');
        return;
    }

    const playlistHeader = document.querySelector('.playlist-header h3');
    const playlistThumbnail = document.querySelector('.playlist-header img') || document.createElement('img'); // Crear img si no existe

    if (playlistHeader) {
        console.log('Actualizando título a:', playlist.name); // Añade esta línea
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
    console.log('Playlist cargada:', playlistVideos);
    updatePlaylistDOM();
}
// Variables para el estado del reproductor
const contenedorPlayer = document.getElementById("contenedor-player");
const botonExpandir = document.getElementById("botonExpandir");

function esperarReproductoresListos() {
    if (!player1 || !player2) {
        console.warn("⏳ Esperando que los reproductores se inicialicen...");
        setTimeout(esperarReproductoresListos, 500);
        return;
    }

    console.log("✅ Reproductores inicializados correctamente.");

    if (botonExpandir) {
        botonExpandir.addEventListener("click", () => {
            contenedorPlayer.classList.toggle("expandido");
            botonExpandir.innerHTML = contenedorPlayer.classList.contains("expandido") ?
                '<i class="fas fa-compress-alt"></i>' :
                '<i class="fas fa-expand-alt"></i>';
        });
    } else {
        console.error("⚠️ Error: No se encontró el botón #boton-expandir en el DOM.");
    }
}

// Módulo: Reproducción y Crossfade
// Función para reproducir el siguiente video con efecto crossfade
function playNextVideo(videoId, video) {
    if (currentIndex < playlistVideos.length - 1) {
        currentIndex++;
    const videoIndex = playlistVideos.findIndex((video) => video.videoId === videoId);

        const currentPlayerElement = document.getElementById(`player${currentPlayer}`);
        const nextPlayer = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
        const nextVideoId = playlistVideos[currentIndex].videoId;
        console.log(`Reproduciendo siguiente video: player${currentPlayer}`);
        nextPlayer.loadVideoById(nextVideoId);
        updatePlaylistDOM(); // Actualizar el DOM para mostrar el cambio visual

        // Aplicar efecto visual
        currentPlayerElement.classList.add('fade-out');
        nextPlayerElement.classList.remove('hidden'); // Asegura que el siguiente reproductor sea visible
        nextPlayerElement.classList.add('fade-in');

        // Esperar a que termine el efecto visual antes de continuar
        setTimeout(() => {
            currentPlayerElement.classList.add('hidden'); // Oculta después del fade-out
            currentPlayerElement.classList.remove('fade-out');
            nextPlayerElement.classList.remove('fade-in');

            currentPlayer = currentPlayer === 1 ? 2 : 1; // Alternar reproductores

            // Efecto crossfade de volumen
            crossfadeAudio();
        }, 1500); // Asegura que el tiempo coincida con las transiciones CSS
    } else {
        console.log('Fin de la lista de reproducción.');
        askToRepeatPlaylist();
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
        monitorInterval = setInterval(monitorPlayers, 3000); // Monitorear cada 3 segundos (ajustar según necesidad)
        console.log('Monitoreo iniciado.');
    }
}
function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('Monitoreo detenido.');
    }
}
function monitorPlayers() {  // Función para monitorizar
    if (!playersInitialized) {
        console.warn('Los reproductores no están inicializados.');
        return;
    }

    const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;

    if (!currentPlayerInstance || currentPlayerInstance.getPlayerState() !== YT.PlayerState.PLAYING) {
      return; // Salir si el reproductor no existe o no está reproduciendo
    }
      try {
        const currentTime = currentPlayerInstance.getCurrentTime();
        const duration = currentPlayerInstance.getDuration();

        if (isNaN(duration) || duration <= 0) {
            return; // Salir si la duración no es válida
        }
        const timeRemaining = duration - currentTime;
        console.log(`Tiempo restante para Player${currentPlayer}: ${timeRemaining.toFixed(1)} segundos`);

        const roundedTimeRemaining = Math.floor(timeRemaining);
        if (roundedTimeRemaining <= CROSSFADE_DURATION && roundedTimeRemaining > 0) {
         console.log('Iniciando efecto crossfade al próximo reproductor.');
        playNextVideo();
       }
    } catch (error) {
        console.error(`Error al monitorear Player${currentPlayer}:`, error);
    }
}
// Módulo: Manejo de Eventos y Botones
// Botón Mix

document.getElementById('botonNext').addEventListener('click', () => {
    playNextVideo()
        // Cambia el video en el siguiente reproductor
});
// Búsqueda por palabras
document.getElementById('searchInput').addEventListener('input', (event) => {
    const query = event.target.value.trim();
    if (query.length > 0) {
        debouncedSearch(query);
    } else {
        document.getElementById('results').innerHTML = '';
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

    const playlistInfo = await getPlaylistInfo(playlistId);
    if (playlistInfo && playlistInfo.relatedStreams) {
        const nuevosVideos = playlistInfo.relatedStreams.map(video => ({
            videoId: video.url.split('v=')[1],
            title: video.title,
            thumbnail: video.thumbnail || 'placeholder.png',
            duration: video.duration,
            manual: true,
        }));
        playlistVideos.push(...nuevosVideos);
        updatePlaylistDOM();
        searchInput2.value = ''; // Limpiar el input
       botonPlay.disabled = false;
        mostrarMensajeFlotante("Playlist añadida.");
    } else {
        alert('No se pudo obtener información de la playlist.');
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
    const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}
