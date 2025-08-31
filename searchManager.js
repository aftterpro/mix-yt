// ===== SEARCHMANAGER.JS - CORREGIDO PARA USAR PIPED API DIRECTAMENTE =====
// ===== SEARCHMANAGER.JS - CORREGIDO E INTEGRADO =====
// Versión que delega al core unificado y mantiene funciones específicas

export class SearchManager {

    // ✅ DELEGACIÓN PRINCIPAL AL CORE UNIFICADO
    static async performSearch(query, nextPage = null) {
        if (window.unifiedCore?.searchManager?.performSearch) {
            return window.unifiedCore.searchManager.performSearch(query, nextPage);
        } else {
            console.warn('⚠️ Core unificado no disponible, usando búsqueda directa');
            return SearchManager.fallbackPerformSearch(query, nextPage);
        }
    }

    static initialize() {
        if (window.unifiedCore?.searchManager?.initialize) {
            return window.unifiedCore.searchManager.initialize();
        } else {
            console.warn('⚠️ Core unificado no disponible, inicializando búsqueda básica');
            return SearchManager.fallbackInitialize();
        }
    }

    // ✅ FALLBACK DIRECTO PARA BÚSQUEDA (del backup mejorado)
    static async fallbackPerformSearch(query, nextPage = null) {
        const searchResultsElement = document.getElementById('searchResults');
        if (!searchResultsElement) {
            console.error('❌ Elemento searchResults no encontrado');
            return;
        }

        if (!nextPage) {
            console.log(`🔍 Búsqueda fallback para: ${query}`);
            searchResultsElement.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando...</p></div>';
        } else {
            SearchManager.showLoadMoreSpinner();
        }

        // ✅ Del backup: Usar múltiples instancias con retry
        const PIPED_INSTANCES = window.CONFIG?.PIPED_INSTANCES || [
            "https://api.piped.private.coffee",
            "https://pipedapi.ducks.party",
            "https://piped-api.kavin.rocks"
        ];

        let searchResults = null;
        let lastError = null;

        for (const instance of PIPED_INSTANCES) {
            try {
                console.log(`📡 Fallback: Intentando ${instance}`);
                
                const searchUrl = SearchManager.buildSearchUrl(instance, query, nextPage);
                const response = await SearchManager.fetchWithTimeout(searchUrl, 15000);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`✅ Búsqueda fallback exitosa: ${data.items?.length || 0} resultados`);
                
                searchResults = data;
                break;
                
            } catch (error) {
                console.warn(`⚠️ Fallback fallo en ${instance}:`, error.message);
                lastError = error;
                continue;
            }
        }

        if (searchResults) {
            SearchManager.displaySearchResults(searchResults, !!nextPage);
        } else {
            SearchManager.handleSearchError(lastError, !!nextPage, query);
        }
    }

    static fallbackInitialize() {
        const searchResultsElement = document.getElementById('searchResults');
        
        if (searchResultsElement) {
            searchResultsElement.addEventListener('scroll', SearchManager.handleScroll);
            console.log('🔍 Search Manager fallback inicializado');
        } else {
            console.error("❌ Elemento 'searchResults' no encontrado");
        }
    }

    // ✅ FUNCIONES ESPECÍFICAS (mantener independientes)
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

    static async fetchWithTimeout(url, timeout = 15000) {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'YTCrossMix/2.0'
            },
            signal: AbortSignal.timeout(timeout)
        });
    }

    // ✅ Del backup: Display results mejorado
    static displaySearchResults(results, append = false) {
        const searchResultsElement = document.getElementById('searchResults');
        if (!searchResultsElement) return;
        
        if (!append) {
            searchResultsElement.innerHTML = '';
        }
        
        const items = results.items || results.relatedStreams || [];
        
        if (!items || items.length === 0) {
            if (!append) {
                searchResultsElement.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados</p>
                        <p><small>Intenta con otros términos</small></p>
                    </div>
                `;
            }
            SearchManager.hideLoadMoreSpinner();
            return;
        }

        // Guardar contexto para paginación
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('search.nextPageContext', results.nextpage || null);
            window.unifiedStateManager.set('search.currentSearchQuery', window.unifiedStateManager.get('search.currentSearchQuery') || '');
        }

        items.forEach(video => {
            const videoId = SearchManager.extractVideoId(video);
            if (!videoId) return;

            // Evitar duplicados en append
            if (append && searchResultsElement.querySelector(`.video-result[data-video-id="${videoId}"]`)) {
                return;
            }

            const videoDiv = SearchManager.createVideoResultElement(video, videoId);
            searchResultsElement.appendChild(videoDiv);
        });

        if (append) {
            SearchManager.hideLoadMoreSpinner();
        }
        
        console.log(`✅ ${items.length} resultados mostrados (${append ? 'append' : 'nuevo'})`);
    }

    // ✅ Del backup: Create video element mejorado
    static createVideoResultElement(video, videoId) {
        const videoDiv = document.createElement('div');
        videoDiv.classList.add('video-result');
        videoDiv.dataset.videoId = videoId;

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.classList.add('thumbnail-container');
        
        const thumbnail = document.createElement('img');
        thumbnail.src = video.thumbnail || video.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        thumbnail.alt = video.title || 'Video';
        thumbnail.classList.add('thumbnail');
        thumbnail.loading = "lazy";
        
        // ✅ Error handling robusto
        thumbnail.onerror = function() {
            this.src = `https://img.youtube.com/vi/${videoId}/default.jpg`;
            this.onerror = function() {
                this.src = 'https://via.placeholder.com/320x180/333333/ffffff?text=Video';
            };
        };
        
        thumbnailContainer.appendChild(thumbnail);
        
        // ✅ Mostrar duración si está disponible
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
        author.textContent = video.uploaderName || video.channelTitle || video.author || 'Autor Desconocido';
        author.classList.add('video-author');
        detailsDiv.appendChild(author);

        // ✅ Del backup: Botón mejorado con datos completos
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

    // ✅ Del backup: Handle add con lógica inteligente y feedback visual
    static handleSearchResultAddClick(event, videoData) {
        event.preventDefault();
        event.stopPropagation();

        console.log("➕ Añadiendo video desde búsqueda:", videoData.title);
        
        // ✅ Validar datos
        if (!videoData.videoId || !videoData.title) {
            console.error('❌ Datos de video inválidos:', videoData);
            window.unifiedMessageManager?.show('Error: Datos de video inválidos', 'error');
            return;
        }
        
        // ✅ Del backup: Lógica inteligente de añadir
        try {
            let result = null;
            
            // Intentar usar core unificado primero
            if (window.unifiedCore?.playlistManager?.addVideoToManualPlaylist) {
                result = window.unifiedCore.playlistManager.addVideoToManualPlaylist(videoData);
            } 
            // Fallback a PlaylistManager tradicional
            else if (window.PlaylistManager?.addVideoToManualPlaylist) {
                result = window.PlaylistManager.addVideoToManualPlaylist(videoData);
            }
            
            if (result) {
                // ✅ Del backup: Feedback visual en botón
                SearchManager.provideFeedback(event.currentTarget, videoData.title);
                
                window.unifiedMessageManager?.show(`♪ "${videoData.title}" añadido a la cola`, 'success', 2000);
                
                // NO cambiar de vista - mantener resultados de búsqueda
                console.log('🔍 Manteniendo vista de búsqueda activa');
                
            } else {
                window.unifiedMessageManager?.show(`"${videoData.title}" ya está en la cola`, 'warning', 2000);
            }
            
        } catch (error) {
            console.error('❌ Error añadiendo video:', error);
            window.unifiedMessageManager?.show('Error añadiendo video a la cola', 'error');
        }
    }

    // ✅ Del backup: Feedback visual mejorado
    static provideFeedback(button, title) {
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
    }

    // ✅ UTILIDADES ESPECÍFICAS
    static extractVideoId(video) {
        let videoId = video.videoId || video.id;
        
        if (!videoId && video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            videoId = match ? match[1] : null;
        }
        
        return videoId;
    }

    static formatDuration(duration) {
        if (!duration) return '0:00';
        
        if (typeof duration === 'string' && duration.includes(':')) {
            return duration;
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
            if (duration.includes(':')) {
                const parts = duration.split(':').map(p => parseInt(p, 10));
                if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                } else if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
            
            const numDuration = parseInt(duration, 10);
            if (!isNaN(numDuration)) {
                return numDuration;
            }
        }
        
        return 0;
    }

    // ✅ GESTIÓN DE SCROLL Y PAGINACIÓN
    static handleScroll() {
        // Delegar al core si está disponible
        if (window.unifiedCore?.searchManager?.handleScroll) {
            return window.unifiedCore.searchManager.handleScroll();
        }
        
        // Fallback básico
        const state = window.unifiedStateManager?.state?.search;
        if (!state || state.isLoadingMore || !state.nextPageContext || !state.currentSearchQuery) {
            return;
        }
        
        const container = document.getElementById('searchResults');
        if (!container) return;
        
        const scrollThreshold = 200;
        const scrollPosition = container.scrollTop + container.clientHeight;
        const totalHeight = container.scrollHeight;
        const bottomReached = scrollPosition >= totalHeight - scrollThreshold;
        
        if (bottomReached) {
            console.log("📄 Scroll cerca del final (fallback)");
            SearchManager.performSearch(state.currentSearchQuery, state.nextPageContext);
        }
    }

    static showLoadMoreSpinner() {
        const container = document.getElementById('searchResults');
        if (!container) return;

        const existingSpinner = document.getElementById('search-more-spinner');
        if (existingSpinner) return;

        const spinner = document.createElement('div');
        spinner.id = 'search-more-spinner';
        spinner.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; padding: 20px; gap: 8px; color: #aaa;">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Cargando más resultados...</span>
            </div>
        `;
        
        container.appendChild(spinner);
    }

    static hideLoadMoreSpinner() {
        const spinner = document.getElementById('search-more-spinner');
        if (spinner) {
            spinner.remove();
        }
    }

    static handleSearchError(error, isLoadMore, query) {
        console.error("❌ Error en búsqueda:", error);
        
        const errorMessage = `Error de búsqueda: ${error?.message || 'Instancias no disponibles'}`;
        
        if (!isLoadMore) {
            const resultsDiv = document.getElementById('searchResults');
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${errorMessage}</p>
                        <button onclick="SearchManager.performSearch('${query || ''}')" 
                                class="retry-search-btn">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            }
        } else {
            window.unifiedMessageManager?.show(errorMessage, 'error');
            SearchManager.hideLoadMoreSpinner();
        }
    }

    // ✅ FUNCIONES DE TESTING Y DEBUG
    static async testPipedInstances() {
        console.log('🧪 Testing Piped instances...');
        
        const PIPED_INSTANCES = window.CONFIG?.PIPED_INSTANCES || [
            "https://api.piped.private.coffee",
            "https://pipedapi.ducks.party",
            "https://piped-api.kavin.rocks"
        ];
        
        const testQuery = 'test music';
        const results = [];
        
        for (const instance of PIPED_INSTANCES) {
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

    static async getBestPipedInstance() {
        const PIPED_INSTANCES = window.CONFIG?.PIPED_INSTANCES || [
            "https://api.piped.private.coffee",
            "https://pipedapi.ducks.party"
        ];
        
        const promises = PIPED_INSTANCES.map(async (instance) => {
            try {
                const startTime = Date.now();
                const response = await fetch(`${instance}/trending`, {
                    method: 'HEAD',
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

    // ✅ UTILIDADES DE ESTADO
    static getSearchState() {
        return window.unifiedStateManager?.state?.search || {
            currentSearchQuery: '',
            nextPageContext: null,
            isLoadingMore: false,
            resultsContainer: null,
            resultsDiv: null
        };
    }

    static clearResults() {
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                    <p><small>Escribe en la barra de búsqueda para empezar</small></p>
                </div>
            `;
        }
        
        // Reset state
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('search.currentSearchQuery', '');
            window.unifiedStateManager.set('search.nextPageContext', null);
            window.unifiedStateManager.set('search.isLoadingMore', false);
        }
    }

    // ✅ MIGRACIÓN Y COMPATIBILIDAD
    static checkCoreAvailability() {
        return {
            coreAvailable: !!window.unifiedCore,
            coreInitialized: window.unifiedCore?.initialized || false,
            searchManagerAvailable: !!window.unifiedCore?.searchManager,
            fallbackRequired: !window.unifiedCore?.initialized
        };
    }

    static getDebugInfo() {
        const coreCheck = SearchManager.checkCoreAvailability();
        const searchState = SearchManager.getSearchState();
        
        return {
            timestamp: Date.now(),
            core: coreCheck,
            state: searchState,
            resultsElement: !!document.getElementById('searchResults'),
            config: {
                pipedInstances: window.CONFIG?.PIPED_INSTANCES?.length || 0
            }
        };
    }
}

// ✅ SETUP AUTOMÁTICO
document.addEventListener('DOMContentLoaded', () => {
    // Verificar disponibilidad del core
    const coreCheck = setInterval(() => {
        if (window.unifiedCore?.initialized) {
            console.log('✅ SearchManager: Core unificado disponible');
            clearInterval(coreCheck);
            
            // El core ya maneja la inicialización
            console.log('🔍 SearchManager delegando inicialización al core');
        }
    }, 100);
    
    // Timeout para inicialización fallback
    setTimeout(() => {
        clearInterval(coreCheck);
        if (!window.unifiedCore?.initialized) {
            console.warn('⚠️ SearchManager: Timeout esperando core, usando inicialización fallback');
            SearchManager.fallbackInitialize();
        }
    }, 10000);
});

// ✅ REFERENCIAS GLOBALES Y DEBUG
if (typeof window !== 'undefined') {
    window.SearchManager = SearchManager;
    
    // Debug helpers específicos para búsqueda
    window.SearchDebug = {
        testInstances: () => SearchManager.testPipedInstances(),
        getBestInstance: () => SearchManager.getBestPipedInstance(),
        performSearch: (query) => SearchManager.performSearch(query),
        getState: () => SearchManager.getSearchState(),
        getDebugInfo: () => SearchManager.getDebugInfo(),
        clearResults: () => SearchManager.clearResults(),
        checkCore: () => SearchManager.checkCoreAvailability(),
        testFallback: () => {
            // Temporary disable core for testing
            const originalCore = window.unifiedCore;
            window.unifiedCore = null;
            SearchManager.performSearch('test music');
            setTimeout(() => {
                window.unifiedCore = originalCore;
            }, 5000);
        }
    };
}

console.log('✅ SearchManager cargado - VERSIÓN INTEGRADA CON CORE UNIFICADO');
console.log('🔧 SearchDebug disponible: window.SearchDebug.testInstances()');
console.log('📡 Instancias Piped configuradas para búsqueda directa con fallback');
