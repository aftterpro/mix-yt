// search.js
import { playlistsData, checkAndEnablePlayButton, updateCurrentPlayingIndex } from "./app.js";
import { showPlaylistSelectionPopup } from "./popups.js"; // Suponiendo que esta función se moverá a un nuevo archivo
import { mostrarMensajeFlotante, showLoadMoreSpinner, hideLoadMoreSpinner } from "./ui.js";

// Lógica de búsqueda
export const performSearch = async (query, nextPage = null) => {
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
// Lógica para mostrar resultados de búsqueda
export const displaySearchResultsPiped = (results, append = false) => {
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
// Lógica para el scroll infinito
export const handleScroll = () => {
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