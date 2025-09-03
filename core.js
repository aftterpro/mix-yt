// ===== CORE.JS - VERSIÓN CORREGIDA CON FUNCIONALIDAD COMPLETA =====

// ===== CONFIGURACIÓN GLOBAL CORREGIDA =====
const CONFIG = {
    CROSSFADE_DURATION: 15,
    MONITOR_INTERVAL: 300,
    PIPED_INSTANCES: [
        "https://api.piped.private.coffee",
        "https://pipedapi.ducks.party"
    ],
    SPONSORBLOCK_USER_ID: 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd',
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library'
};

// ===== UTILIDADES COMPARTIDAS CORREGIDAS =====
class SharedUtils {
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    static formatDuration(duration) {
        if (!duration) return '0:00';
        
        if (typeof duration === 'number') {
            const totalSeconds = Math.floor(duration);
            if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
            
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (typeof duration === 'string') {
            const ptMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
            if (ptMatch) {
                const hours = parseInt(ptMatch[1] || '0');
                const minutes = parseInt(ptMatch[2] || '0'); 
                const seconds = parseFloat(ptMatch[3] || '0');
                const totalSeconds = Math.floor(hours * 3600 + minutes * 60 + seconds);
                return SharedUtils.formatDuration(totalSeconds);
            }
            
            if (/^\d+:\d{2}(:\d{2})?$/.test(duration)) {
                return duration;
            }
        }
        
        return "0:00";
    }

    static parseDuration(durationInput) {
        if (typeof durationInput === 'number') return Math.floor(durationInput);
        if (typeof durationInput !== 'string') return 0;

        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && !isNaN(timeParts[0]) && !isNaN(timeParts[1])) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3 && timeParts.every(part => !isNaN(part))) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        const directNumber = parseInt(durationInput, 10);
        return !isNaN(directNumber) ? directNumber : 0;
    }

    static extractVideoId(video) {
        if (video.videoId) return video.videoId;
        if (video.id) return video.id;
        if (video.url) {
            const match = video.url.match(/(?:watch\?v=|\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            return match ? match[1] : null;
        }
        return null;
    }

    static extractPlaylistId(url) {
        try {
            const urlObject = new URL(url);
            return urlObject.searchParams.get('list');
        } catch (e) {
            const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
            return match ? match[1] : null;
        }
    }

    static isValidYouTubeUrl(url) {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
    }

    static async fetchWithTimeout(url, options = {}, timeout = 15000) {
        return fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'YTCrossMix/2.0',
                ...options.headers
            },
            signal: AbortSignal.timeout(timeout),
            ...options
        });
    }

    static escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ===== ESTADO UNIFICADO CORREGIDO =====
class UnifiedStateManager {
    constructor() {
        this.state = {
            app: {
                player1: null,
                player2: null,
                currentPlayer: 1,
                playersInitialized: false,
                youtubeAPIReady: false,
                reproduccionIniciada: false,
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInProgress: false,
                crossfadeInterval: null,
                monitorInterval: null
            },
            playlist: {
                playlistsData: [],
                manualQueue: [], // ✅ COLA MANUAL SEPARADA
                currentPlayingInfo: {
                    playlistId: null,
                    videoId: null,
                    flattenedIndex: -1
                }
            },
            search: {
                currentSearchQuery: '',
                nextPageContext: null,
                isLoadingMore: false,
                resultsContainer: null,
                resultsDiv: null
            },
            sponsorBlock: {
                segmentosCache: {},
                lastSeekEndTime: -1,
                lastSeekVideoId: null
            },
            auth: {
                isAuthenticated: false,
                token: null
            },
            ui: {
                currentView: 'home'
            }
        };
        
        this.listeners = new Set();
        this.debug = window.location.hostname === 'localhost';
    }

    get(path) {
        const keys = path.split('.');
        let current = this.state;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        return current;
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.state;
        
        for (const key of keys) {
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }
        
        const oldValue = current[lastKey];
        current[lastKey] = value;
        
        this.notifyChange(path, value, oldValue);
        
        if (this.debug && (path.includes('currentView') || path.includes('playlistsData') || path.includes('manualQueue') || path.includes('isAuthenticated'))) {
            console.log(`📊 Estado cambiado: ${path}`, value);
        }
    }

    notifyChange(path, newValue, oldValue) {
        const event = new CustomEvent('ytcrossmix:state:changed', {
            detail: { path, newValue, oldValue }
        });
        window.dispatchEvent(event);
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}

// ===== GESTOR DE PLAYLIST CORREGIDO COMPLETAMENTE =====
class UnifiedPlaylistManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.setupPlaylistUrlListener();
        this.initializeManualQueue();
    }

    // ✅ INICIALIZAR COLA MANUAL
    initializeManualQueue() {
        const currentQueue = this.state.get('playlist.manualQueue') || [];
        if (currentQueue.length === 0) {
            console.log('🔄 Inicializando cola manual vacía');
            this.state.set('playlist.manualQueue', []);
        }
    }

    // ✅ OBTENER COLA COMPLETA PARA REPRODUCCIÓN
    getFlattenedPlaylist() {
        const manualQueue = this.state.get('playlist.manualQueue') || [];
        console.log(`📋 Cola actual: ${manualQueue.length} videos`);
        return manualQueue.map(video => ({
            ...video,
            sourcePlaylistId: 'manual'
        }));
    }

    // ✅ AÑADIR VIDEO A LA COLA
    addVideoToManualPlaylist(videoData) {
        const currentQueue = this.state.get('playlist.manualQueue') || [];
        
        // Verificar duplicados
        if (currentQueue.some(video => video.videoId === videoData.videoId)) {
            this.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
            return null;
        }

        const videoObject = {
            videoId: videoData.videoId,
            title: videoData.title || "Título no disponible",
            thumbnail: videoData.thumbnail || `https://img.youtube.com/vi/${videoData.videoId}/default.jpg`,
            duration: videoData.duration || 0,
            channelTitle: videoData.channelTitle || 'Desconocido',
            addedAt: Date.now()
        };

        const newQueue = [...currentQueue, videoObject];
        this.state.set('playlist.manualQueue', newQueue);
        
        console.log(`✅ Video añadido a cola: ${videoObject.title} (Total: ${newQueue.length})`);
        this.checkAndEnablePlayButton();
        
        // Actualizar UI de cola
        this.updateQueueDisplay();
        
        return videoObject;
    }

    // ✅ ELIMINAR VIDEO DE LA COLA
    removeVideoFromQueue(videoId) {
        const currentQueue = this.state.get('playlist.manualQueue') || [];
        const videoIndex = currentQueue.findIndex(v => v.videoId === videoId);
        
        if (videoIndex === -1) return false;

        const newQueue = currentQueue.filter(v => v.videoId !== videoId);
        this.state.set('playlist.manualQueue', newQueue);
        
        console.log(`🗑️ Video eliminado de cola (Restantes: ${newQueue.length})`);
        
        // Si se eliminó el video actual, cambiar al siguiente
        const currentInfo = this.state.get('playlist.currentPlayingInfo');
        if (currentInfo.videoId === videoId) {
            this.handleCurrentVideoRemoved();
        }
        
        this.updateQueueDisplay();
        this.checkAndEnablePlayButton();
        
        return true;
    }

    // ✅ LIMPIAR TODA LA COLA
    clearQueue() {
        this.state.set('playlist.manualQueue', []);
        
        // Resetear reproducción
        this.state.set('playlist.currentPlayingInfo.videoId', null);
        this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
        this.state.set('app.monitorInterval', interval);
    }

    // ✅ DETENER MONITOREO
    stopMonitoring() {
        const interval = this.state.get('app.monitorInterval');
        if (interval) {
            clearInterval(interval);
            this.state.set('app.monitorInterval', null);
            console.log('⏹️ Monitoreo detenido');
        }
    }

    // ✅ MANEJAR COLA VACÍA
    handleEmptyPlaylist() {
        this.stopMonitoring();
        
        this.state.set('app.reproduccionIniciada', false);
        this.state.set('app.isTransitioning', false);
        this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
        this.state.set('playlist.currentPlayingInfo.videoId', null);
        this.state.set('playlist.currentPlayingInfo.playlistId', null);

        const playButton = document.getElementById('botonPlay');
        if (playButton) {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.disabled = true;
        }

        this.playlistManager.updateQueueDisplay();
        this.showMessage("Cola vacía - reproducción detenida", 'info');
    }

    // ✅ MANEJAR FINAL DE PLAYLIST
    handleEndOfPlaylist() {
        console.log('🔚 Final de la cola alcanzado');
        
        const repeat = confirm('¿Repetir la cola desde el principio?');
        
        if (repeat) {
            this.state.set('playlist.currentPlayingInfo.playlistId', null);
            this.state.set('playlist.currentPlayingInfo.videoId', null);
            this.state.set('playlist.currentPlayingInfo.flattenedIndex', -1);
            this.playFirstVideo();
        } else {
            this.stopMonitoring();
            this.showMessage("Reproducción finalizada", 'info');
            
            // Detener reproductores
            const state = this.state.get('app');
            try {
                if (state.player1) state.player1.stopVideo();
                if (state.player2) state.player2.stopVideo();
            } catch(e) {}
            
            this.state.set('app.reproduccionIniciada', false);
            
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
                playButton.disabled = this.playlistManager.getFlattenedPlaylist().length === 0;
            }
        }
        
        this.state.set('app.isTransitioning', false);
    }

    showMessage(message, type = 'info') {
        if (window.unifiedCore?.playlistManager?.showMessage) {
            window.unifiedCore.playlistManager.showMessage(message, type);
        } else {
            console.log(`💬 [${type.toUpperCase()}]: ${message}`);
        }
    }
}

// ===== GESTOR DE BÚSQUEDA CORREGIDO =====
class UnifiedSearchManager {
    constructor(stateManager, navigationManager) {
        this.state = stateManager;
        this.navigation = navigationManager;
        this.setupSearchListeners();
    }

    setupSearchListeners() {
        const searchInputs = ['sidebarSearchInput', 'mobileSearchInput', 'searchInput'];
        
        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        const query = input.value.trim();
                        if (query.length > 0) {
                            this.performSearch(query);
                        }
                    }
                });
                
                let searchTimeout;
                input.addEventListener('input', (event) => {
                    clearTimeout(searchTimeout);
                    const query = event.target.value.trim();
                    
                    if (query.length > 2) {
                        searchTimeout = setTimeout(() => {
                            this.performSearch(query);
                        }, 500);
                    }
                });
            }
        });
    }

    async performSearch(query) {
        console.log(`🔍 Iniciando búsqueda: ${query}`);
        
        this.navigation.switchView('search');
        
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.innerHTML = `
            <div class="search-loading" style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-color);"></i>
                <p style="margin-top: 16px; color: var(--text-secondary);">Buscando...</p>
            </div>
        `;
        
        try {
            let searchData = null;
            
            for (const instance of CONFIG.PIPED_INSTANCES) {
                try {
                    const url = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
                    const response = await SharedUtils.fetchWithTimeout(url, {}, 10000);
                    
                    if (response.ok) {
                        searchData = await response.json();
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            if (!searchData) {
                throw new Error('Todas las instancias de búsqueda fallaron');
            }
            
            this.displaySearchResults(searchData);
            
        } catch (error) {
            console.error('❌ Error en búsqueda:', error);
            this.displaySearchError(error, query);
        }
    }

    // ✅ MOSTRAR RESULTADOS EN FORMATO BALDOSAS (4 COLUMNAS)
    displaySearchResults(data) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        const items = data.items || data.relatedStreams || [];
        
        if (!items || items.length === 0) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados</p>
                </div>
            `;
            return;
        }
        
        // ✅ CREAR GRID DE BALDOSAS
        searchResults.innerHTML = '';
        searchResults.className = 'search-results-grid'; // Cambiar clase para grid
        
        items.forEach(video => {
            const videoId = SharedUtils.extractVideoId(video);
            if (!videoId) return;
            
            const videoCard = this.createVideoCard(video, videoId);
            searchResults.appendChild(videoCard);
        });
        
        console.log(`✅ ${items.length} resultados mostrados en grid`);
    }

    // ✅ CREAR TARJETA DE VIDEO (FORMATO BALDOSA)
    createVideoCard(video, videoId) {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = videoId;
        
        const thumbnailUrl = video.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const duration = SharedUtils.formatDuration(video.duration);
        const title = SharedUtils.escapeHtml(video.title || 'Título no disponible');
        const author = SharedUtils.escapeHtml(video.uploaderName || video.channelTitle || 'Desconocido');
        
        card.innerHTML = `
            <div class="video-card-thumbnail">
                <img src="${thumbnailUrl}" alt="${title}" loading="lazy">
                ${duration ? `<span class="video-card-duration">${duration}</span>` : ''}
                <div class="video-card-overlay">
                    <button class="video-card-play-btn" onclick="window.unifiedCore.addVideoToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
            <div class="video-card-info">
                <h3 class="video-card-title" title="${title}">${title}</h3>
                <p class="video-card-author" title="${author}">${author}</p>
                <button class="video-card-add-btn" onclick="window.unifiedCore.addVideoToQueue('${videoId}', '${title.replace(/'/g, "\\'")}', '${thumbnailUrl}', '${author.replace(/'/g, "\\'")}')">
                    <i class="fas fa-arrow-right-to-line"></i>
                    Añadir a Cola
                </button>
            </div>
        `;
        
        return card;
    }

    displaySearchError(error, query) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.className = 'search-results'; // Reset class
        searchResults.innerHTML = `
            <div class="search-error" style="text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #f44336; margin-bottom: 16px;"></i>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Error de búsqueda: ${error.message}</p>
                <button onclick="window.unifiedCore.searchManager.performSearch('${query}')" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reintentar
                </button>
            </div>
        `;
    }
}

// ===== REPRODUCTORES YOUTUBE CORREGIDO =====
class UnifiedYouTubeManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.apiReady = false;
        this.playersReady = false;
    }

    async initialize() {
        console.log('📺 Inicializando YouTube Manager...');
        await this.waitForYouTubeAPI();
        this.createPlayers();
    }

    waitForYouTubeAPI() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                this.apiReady = true;
                resolve();
                return;
            }

            window.onYouTubeIframeAPIReady = () => {
                this.apiReady = true;
                console.log('✅ YouTube API Ready');
                resolve();
            };

            if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                document.head.appendChild(script);
            }
        });
    }

    createPlayers() {
        if (this.playersReady) return;
        console.log('🎮 Creando reproductores...');

        const createPlayerConfig = (elementId, playerNum) => ({
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'showinfo': 0,
                'rel': 0,
                'iv_load_policy': 3
            },
            events: {
                'onReady': (event) => this.onPlayerReady(event, playerNum),
                'onStateChange': (event) => this.onPlayerStateChange(event, playerNum),
                'onError': (event) => this.onPlayerError(event, playerNum)
            }
        });

        const player1 = new YT.Player('player1', createPlayerConfig('player1', 1));
        const player2 = new YT.Player('player2', createPlayerConfig('player2', 2));

        this.state.set('app.player1', player1);
        this.state.set('app.player2', player2);
    }

    onPlayerReady(event, playerNum) {
        console.log(`✅ Player ${playerNum} listo`);
        
        const player1Ready = this.state.get('app.player1') && 
                           typeof this.state.get('app.player1').getPlayerState === 'function';
        const player2Ready = this.state.get('app.player2') && 
                           typeof this.state.get('app.player2').getPlayerState === 'function';

        if (player1Ready && player2Ready && !this.playersReady) {
            this.playersReady = true;
            this.state.set('app.playersInitialized', true);
            
            console.log('🎉 Ambos reproductores listos');
            
            // Habilitar controles
            if (window.unifiedCore?.playlistManager) {
                window.unifiedCore.playlistManager.checkAndEnablePlayButton();
            }
            
            document.dispatchEvent(new CustomEvent('playersReady', {
                detail: { player1Ready, player2Ready }
            }));
        }
    }

    onPlayerStateChange(event, playerNum) {
        const state = event.data;
        const videoData = event.target.getVideoData();
        
        document.dispatchEvent(new CustomEvent('unifiedPlayerStateChanged', {
            detail: { 
                playerNum, 
                state, 
                videoId: videoData?.video_id,
                timestamp: Date.now()
            }
        }));
    }

    onPlayerError(event, playerNum) {
        console.error(`❌ Player ${playerNum} error:`, event.data);
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(`Error en reproductor ${playerNum}`, 'error');
        }
    }

    getActivePlayer() {
        const currentPlayerNum = this.state.get('app.currentPlayer');
        return currentPlayerNum === 1 ? 
               this.state.get('app.player1') : 
               this.state.get('app.player2');
    }

    getInactivePlayer() {
        const currentPlayerNum = this.state.get('app.currentPlayer');
        return currentPlayerNum === 1 ? 
               this.state.get('app.player2') : 
               this.state.get('app.player1');
    }

    safeSetVolume(player, volume) {
        try {
            if (player && typeof player.setVolume === 'function') {
                player.setVolume(Math.max(0, Math.min(100, volume)));
            }
        } catch(e) {
            console.warn("Error configurando volumen:", e);
        }
    }

    safeStopPlayer(player) {
        try {
            if (player && typeof player.stopVideo === 'function') {
                const state = player.getPlayerState();
                if (state !== YT.PlayerState.ENDED && state !== YT.PlayerState.UNSTARTED) {
                    player.stopVideo();
                }
            }
        } catch(e) {
            console.warn("Error deteniendo reproductor:", e);
        }
    }
}

// ===== GESTOR DE NAVEGACIÓN CORREGIDO =====
class UnifiedNavigationManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('click', (event) => {
            const navItem = event.target.closest('[data-view]');
            if (navItem) {
                event.preventDefault();
                const view = navItem.dataset.view;
                this.switchView(view);
            }
        });
    }

    switchView(viewName) {
        console.log(`📄 Cambiando a vista: ${viewName}`);
        
        this.state.set('ui.currentView', viewName);
        
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
            this.updateNavigation(viewName);
            
            if (viewName === 'library') {
                setTimeout(() => this.updateLibraryView(), 100);
            } else if (viewName === 'search') {
                this.focusSearchInput();
            } else if (viewName === 'playing') {
                this.updatePlayingView();
            }
        }
    }

    updateNavigation(activeView) {
        document.querySelectorAll('[data-view]').forEach(item => {
            if (item.dataset.view === activeView) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    updateLibraryView() {
        if (window.UIManager?.updatePlaylistsUI) {
            window.UIManager.updatePlaylistsUI();
        }
    }

    focusSearchInput() {
        const searchInput = document.getElementById('sidebarSearchInput') || 
                           document.getElementById('mobileSearchInput');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    updatePlayingView() {
        const currentInfo = this.state.get('playlist.currentPlayingInfo');
        const titleEl = document.getElementById('nowPlayingTitle');
        const artistEl = document.getElementById('nowPlayingArtist');
        
        if (currentInfo.videoId && titleEl && artistEl) {
            const queue = window.unifiedCore?.playlistManager?.getFlattenedPlaylist() || [];
            const currentVideo = queue[currentInfo.flattenedIndex];
            
            if (currentVideo) {
                titleEl.textContent = currentVideo.title;
                artistEl.textContent = currentVideo.channelTitle || 'YouTube';
            }
        }
    }
}

// ===== AUTH MANAGER CORREGIDO =====
class UnifiedAuthManager {
    constructor(stateManager) {
        this.state = stateManager;
        this.CLIENT_ID = "228375063584-r5lfjvv9p3k9p09582lpfe9ugphmp7nv.apps.googleusercontent.com";
        this.SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';
        this.tokenClient = null;
        this.gapiReady = false;
        this.gisReady = false;
        this.isAuthenticated = false;
        
        setTimeout(() => this.initialize(), 500);
    }

    async initialize() {
        console.log('🔐 Inicializando AuthManager...');
        
        try {
            await this.waitForGAPI();
            
            if (window.gapi?.client) {
                await gapi.client.init({
                    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest']
                });
                this.gapiReady = true;
            }
            
            if (window.google?.accounts) {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.CLIENT_ID,
                    scope: this.SCOPES,
                    callback: (tokenResponse) => {
                        this.tokenResponseCallback(tokenResponse);
                    }
                });
                this.gisReady = true;
            }
            
            this.setupButtonListeners();
            await this.checkExistingToken();
            
        } catch (error) {
            console.error('❌ Error inicializando AuthManager:', error);
            this.createFallbackAuth();
        }
    }

    waitForGAPI() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 60;
            
            const checkGAPI = () => {
                attempts++;
                
                if (window.gapi) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    resolve();
                } else {
                    setTimeout(checkGAPI, 500);
                }
            };
            
            checkGAPI();
        });
    }

    async checkExistingToken() {
        const savedToken = localStorage.getItem('google_token');
        if (savedToken) {
            try {
                const tokenData = JSON.parse(savedToken);
                const now = Date.now();
                const tokenAge = now - tokenData.timestamp;
                
                if (tokenAge < 3600000 && window.gapi?.client) {
                    gapi.client.setToken(tokenData);
                    this.isAuthenticated = true;
                    this.updateUI(true);
                    this.state.set('auth.isAuthenticated', true);
                    this.state.set('auth.token', tokenData);
                    
                    setTimeout(() => {
                        if (this.gapiReady) {
                            this.getPlaylists();
                        }
                    }, 2000);
                } else {
                    localStorage.removeItem('google_token');
                }
            } catch (e) {
                localStorage.removeItem('google_token');
            }
        }
    }

    handleAuthClick() {
        if (!this.gapiReady || !this.gisReady) {
            window.unifiedMessageManager?.show('APIs de Google no están listas', 'warning');
            return;
        }
        
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    }

    async tokenResponseCallback(tokenResponse) {
        if (tokenResponse && tokenResponse.access_token) {
            try {
                if (window.gapi?.client) {
                    gapi.client.setToken(tokenResponse);
                }
                
                const tokenData = {
                    ...tokenResponse,
                    timestamp: Date.now()
                };
                localStorage.setItem('google_token', JSON.stringify(tokenData));
                
                this.isAuthenticated = true;
                this.updateUI(true);
                
                this.state.set('auth.isAuthenticated', true);
                this.state.set('auth.token', tokenData);
                
                await this.getPlaylists();
                
                window.unifiedMessageManager?.show("Autenticación exitosa. Cargando playlists...", 'success');
                
            } catch (error) {
                console.error("❌ Error procesando token:", error);
                window.unifiedMessageManager?.show("Error al procesar la autenticación.", 'error');
            }
        }
    }

    async getPlaylists() {
        if (!this.isAuthenticated || !this.gapiReady) return;

        window.unifiedLoadingManager?.show('youtube-playlists', {
            type: 'overlay',
            message: 'Cargando playlists de YouTube...'
        });
        
        try {
            let allPlaylists = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlists.list({
                    'part': ['snippet', 'contentDetails'],
                    'mine': true,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    allPlaylists = allPlaylists.concat(response.result.items);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            const processedPlaylists = allPlaylists.map(playlist => ({
                id: playlist.id,
                name: playlist.snippet?.title || 'Playlist Sin Nombre',
                thumbnailUrl: playlist.snippet?.thumbnails?.medium?.url || 
                             playlist.snippet?.thumbnails?.default?.url || '',
                videos: null,
                isExpanded: false,
                source: 'youtube_library',
                isLoaded: false,
                itemCount: playlist.contentDetails?.itemCount || 0,
                originalData: playlist
            }));

            this.state.set('playlist.playlistsData', processedPlaylists);

            document.dispatchEvent(new CustomEvent('playlistsFetched', { 
                detail: processedPlaylists 
            }));
                        
        } catch (err) {
            console.error("❌ Error al obtener playlists:", err);
            window.unifiedMessageManager?.show("Error al cargar las playlists.", 'error');
            
            if (err.status === 401) {
                this.performSignOut();
            }
        } finally {
            window.unifiedLoadingManager?.hide('youtube-playlists');
        }
    }

    async getPlaylistVideos(playlistId) {
        if (!this.isAuthenticated || !this.gapiReady) {
            throw new Error('No autenticado');
        }

        try {
            let allVideos = [];
            let nextPageToken = null;
            
            do {
                const response = await gapi.client.youtube.playlistItems.list({
                    'part': ['snippet', 'contentDetails'],
                    'playlistId': playlistId,
                    'maxResults': 50,
                    'pageToken': nextPageToken
                });
                
                if (response.result && response.result.items) {
                    const videos = response.result.items
                        .filter(item => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
                        .map(item => ({
                            videoId: item.snippet.resourceId.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails?.medium?.url || 
                                      item.snippet.thumbnails?.default?.url || '',
                            channelTitle: item.snippet.channelTitle,
                            duration: 0,
                            publishedAt: item.snippet.publishedAt
                        }));
                    
                    allVideos = allVideos.concat(videos);
                }
                
                nextPageToken = response.result?.nextPageToken;
            } while (nextPageToken);
            
            return allVideos;
            
        } catch (error) {
            console.error(`❌ Error obteniendo videos de playlist ${playlistId}:`, error);
            throw error;
        }
    }

    handleSignOutClick() {
        this.performSignOut();
    }

    performSignOut() {
        try {
            if (window.gapi?.client) {
                const token = gapi.client.getToken();
                
                if (token && token.access_token) {
                    google.accounts.oauth2.revoke(token.access_token);
                    gapi.client.setToken('');
                }
            }
            
            localStorage.removeItem('google_token');
            
            this.isAuthenticated = false;
            this.updateUI(false);
            
            this.state.set('auth.isAuthenticated', false);
            this.state.set('auth.token', null);
            
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
            
        } catch (error) {
            console.error('❌ Error al cerrar sesión:', error);
            localStorage.removeItem('google_token');
            this.isAuthenticated = false;
            this.updateUI(false);
            this.state.set('auth.isAuthenticated', false);
            document.dispatchEvent(new CustomEvent('userLoggedOut'));
        }
    }

    updateUI(isLoggedIn) {
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (isLoggedIn) {
            if (signInButton) signInButton.classList.add('hidden');
            if (signOutButton) signOutButton.classList.remove('hidden');
        } else {
            if (signInButton) signInButton.classList.remove('hidden');
            if (signOutButton) signOutButton.classList.add('hidden');
        }
    }

    setupButtonListeners() {
        const setupButtons = () => {
            const signInButton = document.getElementById('googleSignInButton');
            const signOutButton = document.getElementById('googleSignOutButton');
            
            if (signInButton) {
                const newSignInButton = signInButton.cloneNode(true);
                signInButton.parentNode.replaceChild(newSignInButton, signInButton);
                
                newSignInButton.addEventListener('click', () => {
                    this.handleAuthClick();
                });
            }
            
            if (signOutButton) {
                const newSignOutButton = signOutButton.cloneNode(true);
                signOutButton.parentNode.replaceChild(newSignOutButton, signOutButton);
                
                newSignOutButton.addEventListener('click', () => {
                    this.handleSignOutClick();
                });
            }
            
            this.updateUI(false);
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupButtons);
        } else {
            setupButtons();
        }
    }

    isUserAuthenticated() {
        return this.isAuthenticated && this.gapiReady;
    }
}

// ===== CLASE PRINCIPAL UNIFICADA CORREGIDA =====
class YTCrossMixUnified {
    constructor() {
        this.initialized = false;
        this.stateManager = null;
        this.youtubeManager = null;
        this.navigationManager = null;
        this.searchManager = null;
        this.playlistManager = null;
        this.authManager = null;
        this.playbackController = null;
    }

    async initialize() {
        console.log('🚀 Inicializando YT CrossMix Sistema Unificado...');
        
        try {
            this.stateManager = new UnifiedStateManager();
            window.unifiedStateManager = this.stateManager;
            
            this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
            window.unifiedYouTubeManager = this.youtubeManager;
            
            this.navigationManager = new UnifiedNavigationManager(this.stateManager);
            this.searchManager = new UnifiedSearchManager(this.stateManager, this.navigationManager);
            this.playlistManager = new UnifiedPlaylistManager(this.stateManager);
            this.authManager = new UnifiedAuthManager(this.stateManager);
            
            await this.youtubeManager.initialize();
            
            this.playbackController = new UnifiedPlaybackController(
                this.stateManager,
                this.youtubeManager,
                this.playlistManager
            );
            
            this.setupGlobalReferences();
            this.setupEventListeners();
            
            this.initialized = true;
            
            console.log('✅ YT CrossMix Sistema Unificado inicializado');
            
            this.navigationManager.switchView('home');
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: {
                    initialized: true,
                    timestamp: Date.now()
                }
            }));
            
            setTimeout(() => {
                this.showMessage('Sistema listo para usar', 'success');
            }, 1000);
            
        } catch (error) {
            console.error('💥 Error inicializando sistema unificado:', error);
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:error', {
                detail: { error: error.message, timestamp: Date.now() }
            }));
            
            throw error;
        }
    }

    setupGlobalReferences() {
        window.unifiedCore = this;
        window.SharedUtils = SharedUtils;
        window.CONFIG = CONFIG;
        
        window.unifiedNavigationManager = this.navigationManager;
        window.unifiedSearchManager = this.searchManager;
        window.unifiedPlaylistManager = this.playlistManager;
        window.unifiedAuthManager = this.authManager;
        window.unifiedPlaybackController = this.playbackController;
        
        // ✅ FUNCIONES GLOBALES PARA COMPATIBILIDAD
        window.switchView = (view) => this.navigationManager.switchView(view);
        window.performSearch = (query) => this.searchManager.performSearch(query);
        window.addVideoToQueue = (videoId, title, thumbnail, author) => this.addVideoToQueue(videoId, title, thumbnail, author);
        
        console.log('✅ Referencias globales configuradas');
    }

    setupEventListeners() {
        document.addEventListener('playlistsFetched', (event) => {
            console.log('📚 Playlists obtenidas desde Google:', event.detail?.length || 0);
            
            if (event.detail && Array.isArray(event.detail)) {
                this.addYouTubeLibraryPlaylists(event.detail);
            }
        });

        document.addEventListener('userLoggedOut', () => {
            console.log('👤 Usuario deslogueado');
            this.clearYouTubeLibraryPlaylists();
        });

        document.addEventListener('unifiedPlayerStateChanged', (event) => {
            const { playerNum, state: playerState } = event.detail;
            
            const playButtons = document.querySelectorAll('#botonPlay, #miniPlayBtn');
            playButtons.forEach(button => {
                if (playerState === 1) {
                    button.innerHTML = '<i class="fas fa-pause"></i>';
                } else if (playerState === 2 || playerState === 0) {
                    button.innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        });

        console.log('✅ Event listeners configurados');
    }

    // ✅ MÉTODO PRINCIPAL PARA AÑADIR VIDEOS A LA COLA
    addVideoToQueue(videoId, title, thumbnail, author) {
        console.log(`➕ Añadiendo a cola: ${title}`);
        
        const videoData = {
            videoId: videoId,
            title: title,
            thumbnail: thumbnail,
            channelTitle: author,
            duration: 0
        };
        
        const result = this.playlistManager.addVideoToManualPlaylist(videoData);
        if (result) {
            this.showMessage(`"${title}" añadido a la cola`, 'success');
        }
        
        return result;
    }

    addYouTubeLibraryPlaylists(youtubePlaylists) {
        if (!youtubePlaylists?.length) return;

        const currentPlaylists = this.stateManager.get('playlist.playlistsData') || [];
        const existingIds = new Set(currentPlaylists.map(p => p.id));
        
        const newPlaylists = youtubePlaylists
            .filter(playlist => 
                playlist.snippet?.title && 
                playlist.contentDetails?.itemCount > 0 &&
                !existingIds.has(playlist.id)
            )
            .map(playlist => ({
                id: playlist.id,
                name: playlist.snippet.title,
                thumbnailUrl: playlist.snippet.thumbnails?.high?.url || 
                             playlist.snippet.thumbnails?.default?.url || 
                             'https://via.placeholder.com/320x180/333333/ffffff?text=Playlist',
                videos: [],
                isExpanded: false,
                source: CONFIG.YOUTUBE_LIBRARY_SOURCE_ID,
                isLoaded: false,
                itemCount: playlist.contentDetails.itemCount,
                originalData: playlist
            }));

        if (newPlaylists.length === 0) return;

        const finalPlaylists = [...currentPlaylists, ...newPlaylists];
        this.stateManager.set('playlist.playlistsData', finalPlaylists);
        
        console.log(`✅ ${newPlaylists.length} playlists de YouTube añadidas`);
        this.showMessage(`${newPlaylists.length} playlists añadidas`, 'success');
        
        const currentView = this.stateManager.get('ui.currentView');
        if (currentView === 'library') {
            setTimeout(() => this.navigationManager.updateLibraryView(), 300);
        }
    }

    clearYouTubeLibraryPlaylists() {
        const currentPlaylists = this.stateManager.get('playlist.playlistsData') || [];
        const filteredPlaylists = currentPlaylists.filter(p => p.source !== CONFIG.YOUTUBE_LIBRARY_SOURCE_ID);
        const removedCount = currentPlaylists.length - filteredPlaylists.length;
        
        if (removedCount > 0) {
            this.stateManager.set('playlist.playlistsData', filteredPlaylists);
            
            const currentView = this.stateManager.get('ui.currentView');
            if (currentView === 'library') {
                setTimeout(() => this.navigationManager.updateLibraryView(), 300);
            }
        }
    }

    showMessage(message, type = 'info', duration = 3000) {
        return this.playlistManager.showMessage(message, type, duration);
    }

    getDebugInfo() {
        return {
            initialized: this.initialized,
            stateSnapshot: {
                queueCount: this.stateManager?.get('playlist.manualQueue')?.length || 0,
                playlistCount: this.stateManager?.get('playlist.playlistsData')?.length || 0,
                currentView: this.stateManager?.get('ui.currentView'),
                isPlaying: this.stateManager?.get('app.reproduccionIniciada'),
                currentPlayer: this.stateManager?.get('app.currentPlayer'),
                currentVideoId: this.stateManager?.get('playlist.currentPlayingInfo.videoId')
            },
            managersReady: {
                stateManager: !!this.stateManager,
                youtubeManager: !!this.youtubeManager,
                navigationManager: !!this.navigationManager,
                searchManager: !!this.searchManager,
                playlistManager: !!this.playlistManager,
                authManager: !!this.authManager,
                playbackController: !!this.playbackController
            },
            timestamp: Date.now()
        };
    }

    performHealthCheck() {
        return {
            initialized: this.initialized,
            youtubeAPIReady: !!(window.YT && window.YT.Player),
            playersReady: this.youtubeManager?.playersReady || false,
            queueCount: this.stateManager?.get('playlist.manualQueue')?.length || 0,
            authManagerAvailable: !!this.authManager,
            requiredElementsPresent: {
                player1: !!document.getElementById('player1'),
                player2: !!document.getElementById('player2'),
                searchResults: !!document.getElementById('searchResults'),
                playlistsGrid: !!document.getElementById('playlistsGrid')
            },
            timestamp: Date.now()
        };
    }
}

// ===== INITIALIZATION =====
window.ytCrossMixUnified = new YTCrossMixUnified();
window.unifiedCore = window.ytCrossMixUnified;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ytCrossMixUnified.initialize().catch(error => {
            console.error('Error durante inicialización:', error);
        });
    });
} else {
    window.ytCrossMixUnified.initialize().catch(error => {
        console.error('Error durante inicialización:', error);
    });
}

// Global YouTube API ready callback
window.onYouTubeIframeAPIReady = function() {
    console.log('📺 YouTube Iframe API Ready (Global Callback)');
    if (window.unifiedYouTubeManager) {
        window.unifiedYouTubeManager.apiReady = true;
        if (!window.unifiedYouTubeManager.playersReady) {
            window.unifiedYouTubeManager.createPlayers();
        }
    }
};

// ===== LEGACY COMPATIBILITY =====
window.getFlattenedPlaylist = function() {
    if (window.unifiedCore && window.unifiedCore.playlistManager) {
        return window.unifiedCore.playlistManager.getFlattenedPlaylist();
    }
    return [];
};

window.updatePlaylistsUI = function() {
    if (window.UIManager && window.UIManager.updatePlaylistsUI) {
        window.UIManager.updatePlaylistsUI();
    }
};

console.log('✅ Core Unificado CORREGIDO cargado');
console.log('🔧 Funciones principales: addVideoToQueue, performSearch, switchView');
console.log('📋 Cola manual implementada correctamente');
        
