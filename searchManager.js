// ===== SEARCHMANAGER.JS - CORREGIDO PARA USAR PIPED API DIRECTAMENTE =====
// Versión que usa las instancias de Piped en lugar de Netlify functions

export class SearchManager {

    static initialize() {
        const searchResultsElement = document.getElementById('searchResults');
        
        if (searchResultsElement) {
            // ✅ Usar estado unificado
            const state = window.unifiedStateManager?.state;
            if (state) {
                state.search.resultsContainer = searchResultsElement;
                state.search.resultsDiv = searchResultsElement;
                
                searchResultsElement.addEventListener('scroll', SearchManager.handleScroll);
                console.log('🔍 Search Manager inicializado con estado unificado y Piped API');
            }
        } else {
            console.error("Error: Elemento 'searchResults' no encontrado en el DOM.");
        }
    }

    // ✅ CORREGIDO: Usar Piped API directamente
    static async performSearch(query, nextPage = null) {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsDiv) return;

        const searchState = state.search;

        if (!nextPage) {
            console.log(`🔍 Iniciando NUEVA búsqueda para: ${query}`);
            searchState.currentSearchQuery = query;
            searchState.nextPageContext = null;
            searchState.resultsDiv.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div>';
        } else {
            console.log(`📄 Cargando MÁS resultados para: ${searchState.currentSearchQuery}`);
            SearchManager.showLoadMoreSpinner();
        }

        searchState.isLoadingMore = true;

        // ✅ NUEVO: Usar instancias de Piped con fallback
        const CONFIG = window.CONFIG || {
            PIPED_INSTANCES: [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party",
                "https://piped-api.kavin.rocks",
                "https://api.piped.tokhmi.xyz"
            ]
        };

        let searchResults = null;
        let lastError = null;

        // ✅ NUEVO: Intentar con múltiples instancias
        for (const instance of CONFIG.PIPED_INSTANCES) {
            try {
                console.log(`📡 Intentando búsqueda en: ${instance}`);
                
                // Construir URL de búsqueda de Piped
                let searchUrl = `${instance}/search`;
                const params = new URLSearchParams({
                    q: searchState.currentSearchQuery,
                    filter: 'videos' // Solo videos, no playlists ni canales
                });
                
                // Si hay nextPage, añadirlo
                if (nextPage) {
                    params.append('nextpage', nextPage);
                }
                
                searchUrl += '?' + params.toString();
                
                console.log(`🌐 URL de búsqueda: ${searchUrl}`);
                
                const response = await fetch(searchUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'YTCrossMix/2.0'
                    },
                    // ✅ Timeout para evitar cuelgues
                    signal: AbortSignal.timeout(15000)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`✅ Búsqueda exitosa en ${instance}:`, data.items?.length || 0, 'resultados');
                
                searchResults = data;
                break; // Salir del loop si fue exitoso
                
            } catch (error) {
                console.warn(`⚠️ Fallo en ${instance}:`, error.message);
                lastError = error;
                
                // Si es timeout o network error, continuar con siguiente instancia
                if (error.name === 'TimeoutError' || error.name === 'TypeError') {
                    continue;
                }
                
                // Para otros errores, también continuar
                continue;
            }
        }

        // ✅ Procesar resultados o mostrar error
        if (searchResults) {
            SearchManager.displaySearchResults(searchResults, !!nextPage);
        } else {
            console.error("❌ Todas las instancias de Piped fallaron");
            const errorMessage = `Error de búsqueda: ${lastError?.message || 'Todas las instancias fallaron'}`;
            
            if (!nextPage) {
                searchState.resultsDiv.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${errorMessage}</p>
                        <button onclick="SearchManager.performSearch('${searchState.currentSearchQuery}')" 
                                class="retry-search-btn">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            } else {
                window.unifiedMessageManager?.show(errorMessage, 'error');
                SearchManager.hideLoadMoreSpinner();
            }
            searchState.isLoadingMore = false;
        }
    }

    // ✅ MEJORADO: Display results con mejor manejo de datos de Piped
    static displaySearchResults(results, append = false) {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsDiv) return;
        
        const searchState = state.search;
        
        if (!append) {
            searchState.resultsDiv.innerHTML = '';
        }
        
        // ✅ CORREGIDO: Manejar estructura de respuesta de Piped
        const items = results.items || results.relatedStreams || [];
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            if (!append) {
                searchState.resultsDiv.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados para "${searchState.currentSearchQuery}"</p>
                        <p><small>Intenta con otros términos de búsqueda</small></p>
                    </div>
                `;
            }
            searchState.nextPageContext = results?.nextpage || null;
            searchState.isLoadingMore = false;
            SearchManager.hideLoadMoreSpinner();
            return;
        }

        searchState.nextPageContext = results.nextpage || null;

        items.forEach(video => {
            // ✅ CORREGIDO: Extraer videoId de diferentes formatos de Piped
            let videoId = video.videoId || video.id;
            
            if (!videoId && video.url) {
                // Extraer de URL: /watch?v=VIDEO_ID o https://youtube.com/watch?v=VIDEO_ID
                const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                videoId = match ? match[1] : null;
            }
            
            if (!videoId) {
                console.warn('⚠️ Video sin ID válido:', video);
                return;
            }

            // Evitar duplicados en append
            if (append && searchState.resultsDiv.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
                return;
            }

            const videoDiv = SearchManager.createVideoResultElement(video, videoId);
            searchState.resultsDiv.appendChild(videoDiv);
        });

        if (append) {
            SearchManager.hideLoadMoreSpinner();
        }
        searchState.isLoadingMore = false;
        
        console.log(`✅ ${items.length} resultados mostrados (${append ? 'append' : 'nuevo'})`);
    }

    // ✅ MEJORADO: Create video element con datos de Piped
    static createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        
        const thumbnail = document.createElement('img');
        // ✅ CORREGIDO: Manejar diferentes formatos de thumbnail de Piped
        thumbnail.src = video.thumbnail || video.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        thumbnail.alt = video.title || 'Video';
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        
        // ✅ Error handling para thumbnails
        thumbnail.onerror = function() {
            this.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
            this.onerror = function() {
                this.src = 'https://via.placeholder.com/320x180/333333/ffffff?text=Video';
            };
        };
        
        thumbnailContainer.appendChild(thumbnail);
        
        // ✅ MEJORADO: Formatear duración de Piped
        if (video.duration && video.duration > 0) {
            const durationSpan = document.createElement('span');
            durationSpan.textContent = SearchManager.formatDuration(video.duration);
            durationSpan.classList.add('duration');
            thumbnailContainer.appendChild(durationSpan);
        }
        
        videoDiv.appendChild(thumbnailContainer);

        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('video-details');
        
        const title = document.createElement('h3');
        title.textContent = video.title || 'Título no disponible';
        title.classList.add('video-title');
        detailsDiv.appendChild(title);
        
        const author = document.createElement('p');
        // ✅ CORREGIDO: Manejar diferentes nombres de autor en Piped
        author.textContent = video.uploaderName || video.channelTitle || video.author || 'Autor Desconocido';
        author.classList.add('video-author');
        detailsDiv.appendChild(author);

        const addButton = document.createElement('button');
        addButton.innerHTML = '<i class="fa-solid fa-arrow-right-to-line"></i><span class="add-text"> Reproducir Después</span>';
        addButton.classList.add('search-result-add-button');
        
        addButton.dataset.videoId = videoId;
        addButton.dataset.videoTitle = video.title || 'Título no disponible';
        addButton.dataset.videoThumbnail = thumbnail.src;
        addButton.dataset.videoDuration = SearchManager.parseDuration(video.duration);
        addButton.dataset.videoChannelTitle = video.uploaderName || video.channelTitle || 'Desconocido';
        
        addButton.addEventListener('click', (event) => {
            const videoData = {
                videoId: addButton.dataset.videoId,
                title: addButton.dataset.videoTitle,
                thumbnail: addButton.dataset.videoThumbnail,
                duration: parseInt(addButton.dataset.videoDuration, 10),
                channelTitle: addButton.dataset.videoChannelTitle
            };
            SearchManager.handleSearchResultAddClick(event, videoData);
        });
      
        detailsDiv.appendChild(addButton);
        videoDiv.appendChild(detailsDiv);
        
        return videoDiv;
    }

    // ✅ MEJORADO: Handle add click con mejor feedback
    static handleSearchResultAddClick(event, videoData) {
        event.preventDefault();
        event.stopPropagation();

        console.log("➕ Añadiendo video desde búsqueda:", videoData.title);
        
        // ✅ Validar datos del video
        if (!videoData.videoId || !videoData.title) {
            console.error('❌ Datos de video inválidos:', videoData);
            window.unifiedMessageManager?.show('Error: Datos de video inválidos', 'error');
            return;
        }
        
        // ✅ Usar PlaylistManager
        if (window.PlaylistManager?.addVideoToManualPlaylist) {
            try {
                const result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
                
                if (result) {
                    // Feedback visual en el botón
                    const button = event.currentTarget;
                    const originalContent = button.innerHTML;
                    const originalBg = button.style.background;
                    
                    button.innerHTML = '<i class="fas fa-check"></i> Añadido';
                    button.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
                    button.disabled = true;
                    
                    setTimeout(() => {
                        button.innerHTML = originalContent;
                        button.style.background = originalBg;
                        button.disabled = false;
                    }, 2500);

                    // ✅ Mensaje de éxito
                    window.unifiedMessageManager?.show(`♪ "${videoData.title}" añadido a la cola`, 'success', 2000);
                    
                    // ✅ FIX CRÍTICO: NO cambiar de vista, mantener resultados de búsqueda
                    console.log('🔍 Manteniendo vista de búsqueda activa');
                    
                } else {
                    // Ya existe en la cola
                    window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning', 2000);
                }
                
            } catch (error) {
                console.error('❌ Error añadiendo video:', error);
                window.unifiedMessageManager?.show('Error añadiendo video a la cola', 'error');
            }
        } else {
            console.error('❌ PlaylistManager no disponible');
            window.unifiedMessageManager?.show('Sistema de playlists no disponible', 'error');
        }
    }

    // ✅ NUEVO: Función auxiliar para construir URL de búsqueda
    static buildSearchUrl(instance, query, nextPage = null) {
        try {
            const url = new URL(`${instance}/search`);
            url.searchParams.set('q', query);
            url.searchParams.set('filter', 'videos');
            
            if (nextPage) {
                url.searchParams.set('nextpage', nextPage);
            }
            
            return url.toString();
        } catch (error) {
            console.error('❌ Error construyendo URL:', error);
            return null;
        }
    }

    // ✅ NUEVO: Validar respuesta de Piped
    static validatePipedResponse(data) {
        // Verificar estructura básica
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Respuesta no es un objeto válido' };
        }
        
        // Verificar que tenga items/relatedStreams
        const items = data.items || data.relatedStreams || [];
        if (!Array.isArray(items)) {
            return { valid: false, error: 'Items no es un array válido' };
        }
        
        // Verificar que los items tengan estructura mínima
        const validItems = items.filter(item => {
            return item && (item.videoId || item.id || item.url) && item.title;
        });
        
        if (validItems.length === 0 && items.length > 0) {
            return { valid: false, error: 'Ningún item tiene estructura válida' };
        }
        
        return { 
            valid: true, 
            items: validItems,
            nextpage: data.nextpage,
            totalResults: validItems.length
        };
    }

    // ✅ MEJORADO: Handle scroll con mejor detección
    static handleScroll() {
        const state = window.unifiedStateManager?.state;
        if (!state?.search) return;
        
        const searchState = state.search;
        
        if (searchState.isLoadingMore || !searchState.nextPageContext || !searchState.currentSearchQuery) {
            return;
        }
        
        const container = searchState.resultsContainer;
        if (!container) return;
        
        const scrollThreshold = 200; // Reducido para carga más temprana
        const scrollPosition = container.scrollTop + container.clientHeight;
        const totalHeight = container.scrollHeight;
        const bottomReached = scrollPosition >= totalHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log("📄 Scroll cerca del final, cargando más resultados...");
            SearchManager.performSearch(searchState.currentSearchQuery, searchState.nextPageContext);
        }
    }

    static showLoadMoreSpinner() {
        const state = window.unifiedStateManager?.state;
        if (!state?.search?.resultsContainer) return;

        // ✅ Crear spinner más elegante
        const existingSpinner = document.getElementById('search-more-spinner');
        if (existingSpinner) return;

        const spinner = document.createElement('div');
        spinner.id = 'search-more-spinner';
        spinner.className = 'search-load-more-spinner';
        spinner.innerHTML = `
            <div class="spinner-content">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Cargando más resultados...</span>
            </div>
        `;
        
        spinner.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            color: var(--text-muted);
            font-size: 14px;
            gap: 8px;
        `;
        
        state.search.resultsContainer.appendChild(spinner);
    }

    static hideLoadMoreSpinner() {
        const spinner = document.getElementById('search-more-spinner');
        if (spinner) {
            spinner.remove();
        }
    }

    // ✅ MEJORADO: Format duration con mejor manejo
    static formatDuration(duration) {
        if (!duration) return '0:00';
        
        if (typeof duration === 'string') {
            // Manejar formato "MM:SS" o "HH:MM:SS"
            if (duration.includes(':')) {
                return duration;
            }
            // Convertir string a número
            duration = parseInt(duration, 10);
        }
        
        if (typeof duration === 'number' && duration > 0) {
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = Math.floor(duration % 60);
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
        
        return '0:00';
    }

    static parseDuration(duration) {
        if (!duration) return 0;
        
        if (typeof duration === 'number') {
            return Math.floor(duration);
        }
        
        if (typeof duration === 'string') {
            // Formato "MM:SS" o "HH:MM:SS"
            if (duration.includes(':')) {
                const parts = duration.split(':').map(p => parseInt(p, 10));
                if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                } else if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
            
            // Formato numérico como string
            const numDuration = parseInt(duration, 10);
            if (!isNaN(numDuration)) {
                return numDuration;
            }
        }
        
        return 0;
    }

    // ✅ NUEVO: Función de testing para desarrollo
    static async testPipedInstances() {
        console.log('🧪 Testing Piped instances...');
        
        const CONFIG = window.CONFIG || {
            PIPED_INSTANCES: [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party",
                "https://piped-api.kavin.rocks",
                "https://api.piped.tokhmi.xyz"
            ]
        };
        
        const testQuery = 'test music';
        const results = [];
        
        for (const instance of CONFIG.PIPED_INSTANCES) {
            try {
                console.log(`🔍 Testing: ${instance}`);
                const startTime = Date.now();
                
                const response = await fetch(`${instance}/search?q=${encodeURIComponent(testQuery)}&filter=videos`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000)
                });
                
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                
                if (response.ok) {
                    const data = await response.json();
                    const itemCount = (data.items || data.relatedStreams || []).length;
                    
                    results.push({
                        instance,
                        status: 'OK',
                        responseTime: `${responseTime}ms`,
                        itemCount,
                        success: true
                    });
                    
                    console.log(`✅ ${instance}: OK (${responseTime}ms, ${itemCount} items)`);
                } else {
                    results.push({
                        instance,
                        status: `HTTP ${response.status}`,
                        responseTime: `${responseTime}ms`,
                        success: false
                    });
                    
                    console.log(`❌ ${instance}: HTTP ${response.status}`);
                }
                
            } catch (error) {
                results.push({
                    instance,
                    status: error.message,
                    success: false
                });
                
                console.log(`❌ ${instance}: ${error.message}`);
            }
        }
        
        console.table(results);
        
        const workingInstances = results.filter(r => r.success);
        console.log(`📊 Resultado: ${workingInstances.length}/${results.length} instancias funcionando`);
        
        if (workingInstances.length === 0) {
            window.unifiedMessageManager?.show('❌ Ninguna instancia de Piped está funcionando', 'error', 5000);
        } else {
            window.unifiedMessageManager?.show(`✅ ${workingInstances.length} instancias de Piped funcionando`, 'success');
        }
        
        return results;
    }

    // ✅ NUEVO: Obtener instancia más rápida
    static async getBestPipedInstance() {
        const CONFIG = window.CONFIG || {
            PIPED_INSTANCES: [
                "https://api.piped.private.coffee",
                "https://pipedapi.ducks.party"
            ]
        };
        
        const promises = CONFIG.PIPED_INSTANCES.map(async (instance) => {
            try {
                const startTime = Date.now();
                const response = await fetch(`${instance}/trending`, {
                    method: 'HEAD', // Solo verificar conectividad
                    signal: AbortSignal.timeout(5000)
                });
                
                if (response.ok) {
                    const responseTime = Date.now() - startTime;
                    return { instance, responseTime, success: true };
                } else {
                    return { instance, success: false };
                }
            } catch (error) {
                return { instance, success: false, error: error.message };
            }
        });
        
        const results = await Promise.allSettled(promises);
        const successful = results
            .filter(result => result.status === 'fulfilled' && result.value.success)
            .map(result => result.value)
            .sort((a, b) => a.responseTime - b.responseTime);
        
        if (successful.length > 0) {
            console.log(`🚀 Mejor instancia: ${successful[0].instance} (${successful[0].responseTime}ms)`);
            return successful[0].instance;
        }
        
        console.warn('⚠️ No hay instancias de Piped disponibles');
        return null;
    }
}

// ✅ REFERENCIAS GLOBALES Y DEBUG
if (typeof window !== 'undefined') {
    window.SearchManager = SearchManager;
    
    // Debug helpers específicos para búsqueda
    window.SearchDebug = {
        testInstances: () => SearchManager.testPipedInstances(),
        getBestInstance: () => SearchManager.getBestPipedInstance(),
        performSearch: (query) => SearchManager.performSearch(query),
        getState: () => window.unifiedStateManager?.state?.search,
        clearResults: () => {
            const resultsDiv = document.getElementById('searchResults');
            if (resultsDiv) {
                resultsDiv.innerHTML = '<div class="search-placeholder"><i class="fas fa-search"></i><p>Resultados limpiados</p></div>';
            }
        }
    };
}

console.log('✅ SearchManager cargado - VERSIÓN PIPED API DIRECTA');
console.log('🔧 Instancias Piped configuradas para búsqueda directa');
console.log('📡 Testing disponible: window.SearchDebug.testInstances()');
