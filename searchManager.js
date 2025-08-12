//  Manejo de Búsqueda
import { SearchState, PlaylistState } from './config.js';
import { mostrarMensajeFlotante } from './ui.js';
import { PlaylistManager } from './playlistManager.js';
import { UIManager } from './ui.js';
import { Utils } from './utils.js';

export class SearchManager {

static initialize() {
    const searchResultsElement = document.getElementById('searchResults');
    
    if (searchResultsElement) {
        SearchState.resultsContainer = searchResultsElement;
        SearchState.resultsDiv = searchResultsElement;
        
        SearchState.resultsContainer.addEventListener('scroll', SearchManager.handleScroll);
    } else {
        console.error("Error: Elemento 'searchResults' no encontrado en el DOM.");
    }
}
    // Realizar búsqueda
    static async performSearch(query, nextPage = null) {
        if (!SearchState.resultsDiv) return;

        if (!nextPage) {
            console.log(`Iniciando NUEVA búsqueda para: ${query}`);
            SearchState.currentSearchQuery = query;
            SearchState.nextPageContext = null;
            SearchState.resultsDiv.innerHTML = '<p>Buscando...</p>';
        } else {
            console.log(`Cargando MÁS resultados para: ${SearchState.currentSearchQuery} (Página: ${nextPage})`);
            SearchManager.showLoadMoreSpinner();
        }

        SearchState.isLoadingMore = true;

        try {
            let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(SearchState.currentSearchQuery)}`;
            if (nextPage) {
                apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`;
            }
            const response = await fetch(apiUrl);

            if (!response.ok) {
                let errorDetails = `Error: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    errorDetails = errorBody.error || errorDetails;
                    console.error("Error Body from Netlify Function:", errorBody);
                } catch (e) {
                    try {
                        errorDetails = await response.text();
                    } catch (e2) { /* Ignorar si falla */ }
                }
                const error = new Error(errorDetails);
                error.status = response.status;
                throw error;
            }

            const data = await response.json();
            SearchManager.displaySearchResults(data, !!nextPage);

        } catch (error) {
            console.error("Error fetching search results:", error.message, error);
            const displayError = error.message || "Error desconocido al buscar.";
            if (!nextPage) {
                SearchState.resultsDiv.innerHTML = `<p>${displayError}</p>`;
            } else {
                mostrarMensajeFlotante(displayError);
                SearchManager.hideLoadMoreSpinner();
            }
            SearchState.isLoadingMore = false;
        }
    }

    // Mostrar resultados de búsqueda
    static displaySearchResults(results, append = false) {
        if (!SearchState.resultsDiv) {
            console.error("Results div not found!");
            return;
        }
        
        if (!append) {
            SearchState.resultsDiv.innerHTML = '';
        }
        
        if (!results || !results.items || !Array.isArray(results.items)) {
            if (!append && (!results || results.items?.length === 0)) {
                SearchState.resultsDiv.innerHTML = "<p>No se encontraron resultados.</p>";
            }
            SearchState.nextPageContext = results?.nextpage || null;
            SearchState.isLoadingMore = false;
            SearchManager.hideLoadMoreSpinner();
            return;
        }

        SearchState.nextPageContext = results.nextpage || null;
        console.log("Next page context:", SearchState.nextPageContext);

        results.items.forEach(video => {
            const authorName = video.uploaderName || 'Autor Desconocido';
            const videoId = video.videoId || video.url?.split('v=')[1];

            if (!videoId) {
                console.warn("Resultado omitido, no se pudo obtener videoId:", video);
                return;
            }

            // Evitar duplicados al añadir MÁS resultados
            if (append && SearchState.resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
                return;
            }

            const videoDiv = SearchManager.createVideoResultElement(video, videoId, authorName);
            SearchState.resultsDiv.appendChild(videoDiv);
        });

        if (append) {
            SearchManager.hideLoadMoreSpinner();
        }
        SearchState.isLoadingMore = false;
    }

    // Crear elemento de resultado de video
    static createVideoResultElement(video, videoId, authorName) {
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
            durationSpan.textContent = Utils.formatDuration(video.duration);
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

        // Botón Añadir
        const addToPlaylistButton = document.createElement('button');
addToPlaylistButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i><span class="add-text"> Reproducir Después</span>';        addToPlaylistButton.classList.add('add-to-playlist', 'search-result-add-button');
        
        // Guardar datos del video en el botón
        addToPlaylistButton.dataset.videoId = videoId;
        addToPlaylistButton.dataset.videoTitle = video.title;
        addToPlaylistButton.dataset.videoThumbnail = video.thumbnail;
        const durationSeconds = typeof video.duration === 'number' ? video.duration : Utils.parseDuration(video.duration);
        addToPlaylistButton.dataset.videoDuration = durationSeconds;
        
        addToPlaylistButton.addEventListener('click', (event) => {
            const button = event.currentTarget;
            const videoData = {
                videoId: button.dataset.videoId,
                title: button.dataset.videoTitle,
                thumbnail: button.dataset.videoThumbnail,
                duration: parseInt(button.dataset.videoDuration, 10),
            };
            SearchManager.handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addToPlaylistButton);
        videoDiv.appendChild(detailsDiv);
        
        return videoDiv;
    }

    // Manejar click en botón añadir de resultado de búsqueda
static handleSearchResultAddClick(event, videoData) {
    event.preventDefault();
    event.stopPropagation();

    console.log("Añadiendo video para 'Reproducir Después':", videoData.title);
    
    // Usar la nueva función del UIManager
    UIManager.handlePlayNextActionFromSearch(videoData.videoId, videoData);
    
    // Feedback visual
    const button = event.currentTarget;
    const originalContent = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Añadido';
    button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
    
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.style.background = '';
    }, 2000);
}
    // Manejo de scroll infinito
    static handleScroll() {
        if (SearchState.isLoadingMore || !SearchState.nextPageContext || !SearchState.currentSearchQuery) {
            return;
        }
        
        const scrollThreshold = 300;
        const bottomReached = SearchState.resultsContainer.scrollTop + SearchState.resultsContainer.clientHeight >= 
                              SearchState.resultsContainer.scrollHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log("Scroll cerca del final, intentando cargar más...");
            SearchManager.performSearch(SearchState.currentSearchQuery, SearchState.nextPageContext);
        }
    }

    // Mostrar spinner de "cargar más"
    static showLoadMoreSpinner() {
        let spinner = document.getElementById('loadMoreSpinner');
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.id = 'loadMoreSpinner';
            spinner.className = 'loading-spinner-small';
            SearchState.resultsContainer.appendChild(spinner);
        }
        spinner.style.display = 'flex';
    }

    // Ocultar spinner de "cargar más"
    static hideLoadMoreSpinner() {
        const spinner = document.getElementById('loadMoreSpinner');
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

    // Crear búsqueda con debounce
    static createDebouncedSearch(delay = 500) {
        return Utils.debounce((query) => {
            SearchManager.performSearch(query);
        }, delay);
    }
}




