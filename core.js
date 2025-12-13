console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const CROSSFADE_DURATION = 10;
window.player1 = null;
window.player2 = null;
window.currentPlayer = 1;
window.reproduccionIniciada = false;
window.currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

let player1, player2;
let currentPlayer = 1;
let monitorInterval;
let playersInitialized = false;
let youtubeAPIReady = false;
let isTransitioning = false;
let isAudioFading = false;
let hasOutroCrossfadeStarted = false;
let crossfadeInterval = null;
let crossfadeInProgress = false;
let reproduccionIniciada = false;
let nextVideoScheduled = false;
let lastCrossfadeTime = 0;
const CROSSFADE_DEBOUNCE = 500;
const CROSSFADE_TRIGGER_TIME = 10;

let playlistsData = [];
let currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

let isLoadingMore = false;
let nextPageContext = null;
let currentSearchQuery = '';

let segmentosCache = {};
let lastSeekEndTime = -1;
let lastSeekVideoId = null;

const PIPED_SPONSOR_BLOCK_URL = 'https://api.piped.private.coffee/sponsors/';

const unifiedState = {
    initialized: false,
    currentView: 'home',
    debugMode: false,
    authReady: false,
    playersReady: false
};

const PERSISTENCE_CONFIG = {
    STORAGE_KEYS: {
        PLAYLISTS_CORE: 'ytcm_playlists_persistent',
        QUEUE: 'ytcm_queue_persistent',
        PLAYING_STATE: 'ytcm_playing_state'
    },
    PLAYLISTS_DURATION: 7 * 24 * 60 * 60 * 1000,
    QUEUE_DURATION: 7 * 24 * 60 * 60 * 1000
};

// =============================================
// SISTEMA UNIFICADO - CORE
// =============================================

function saveAllData() {
    try {
        if (typeof savePlaylistsDataPersistent === 'function') {
            const playlistsToSave = playlistsData.filter(p => p.source !== 'youtube_library');
            savePlaylistsDataPersistent(playlistsToSave);
        }
        if (typeof saveQueuePersistent === 'function') {
            saveQueuePersistent();
        }
        console.log('💾 Datos guardados automáticamente');
    } catch (error) {
        console.error('❌ Error en guardado automático:', error);
    }
}

function saveQueuePersistent() {
    try {
        const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
        if (!queuePlaylist) return false;
        
        const queueToSave = {
            videos: queuePlaylist.videos || [],
            currentPlayingInfo: currentPlayingInfo,
            timestamp: Date.now(),
            expires_at: Date.now() + PERSISTENCE_CONFIG.QUEUE_DURATION
        };
        
        localStorage.setItem(PERSISTENCE_CONFIG.STORAGE_KEYS.QUEUE, JSON.stringify(queueToSave));
        console.log(`💾 Cola guardada: ${queuePlaylist.videos?.length || 0} videos`);
        return true;
    } catch (error) {
        console.error('❌ Error guardando cola:', error);
        return false;
    }
}

function loadQueuePersistent() {
    try {
        const storedData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.QUEUE);
        if (!storedData) return null;
        
        const parsed = JSON.parse(storedData);
        const now = Date.now();
        
        if (now > parsed.expires_at) {
            console.log('📅 Cola expirada, eliminando...');
            localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.QUEUE);
            return null;
        }
        
        console.log(`📋 Cola cargada: ${parsed.videos?.length || 0} videos`);
        return parsed;
    } catch (error) {
        console.error('❌ Error cargando cola:', error);
        localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.QUEUE);
        return null;
    }
}

function savePlaylistsDataPersistent(playlists) {
    try {
        if (!Array.isArray(playlists)) {
            console.warn('⚠️ savePlaylistsDataPersistent: playlists no es un array');
            return false;
        }
        
        const playlistsToSave = {
            data: playlists,
            timestamp: Date.now(),
            expires_at: Date.now() + PERSISTENCE_CONFIG.PLAYLISTS_DURATION
        };
        
        localStorage.setItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS_CORE, JSON.stringify(playlistsToSave));
        console.log(`💾 ${playlists.length} playlists core guardadas con expiración de 7 días`);
        
        return true;
    } catch (error) {
        console.error('❌ Error guardando playlists persistentes:', error);
        return false;
    }
}

function loadPlaylistsDataPersistent() {
    try {
        const storedData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS_CORE);
        if (!storedData) {
            console.log('📋 No hay playlists persistentes guardadas');
            return null;
        }
        
        const parsed = JSON.parse(storedData);
        const now = Date.now();
        
        if (now > parsed.expires_at) {
            console.log('📅 Playlists persistentes han expirado, eliminando...');
            localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS_CORE);
            return null;
        }
        
        const daysRemaining = Math.ceil((parsed.expires_at - now) / (24 * 60 * 60 * 1000));
        console.log(`📋 Playlists core cargadas desde almacenamiento (${daysRemaining} días restantes)`);
        
        return Array.isArray(parsed.data) ? parsed.data : null;
        
    } catch (error) {
        console.error('❌ Error cargando playlists persistentes:', error);
        localStorage.removeItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS_CORE);
        return null;
    }
}

class UnifiedCore {
    constructor(config) {
        this.state = unifiedState;
        this.views = ['home', 'search', 'library', 'playing'];
        this.currentView = 'home';
        this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
        this.playlistsData = playlistsData;
        
        // Inicializar
        this.init();
        this.setupAutomaticSaving();
        this.setupPlayerContainerHandlers();

        // Exportar funciones globales vinculadas a esta instancia (Corrigiendo el error de sintaxis)
        window.forceMiniPlayerVisibility = this.forceMiniPlayerVisibility.bind(this);
        window.setupSearchButtonListeners = this.setupSearchButtonListeners.bind(this);
        window.checkAndShowMiniPlayer = this.checkAndShowMiniPlayer.bind(this);
    }

    setupAutomaticSaving() {
        this.saveInterval = setInterval(() => {
            if (this.state.initialized) {
                saveAllData();
            }
        }, 60000);
        
        window.addEventListener('beforeunload', () => {
            if (this.saveInterval) clearInterval(this.saveInterval);
            saveAllData();
        });
        
        console.log('💾 Guardado automático configurado (cada 60s)');
    }

    async init() {
        console.log('🔧 Inicializando Sistema Unificado...');
        
        this.enableUnifiedElements(); 
        this.updateStatusIndicator('Cargando motor de audio...', 'loading');
            
        if (this.debugMode) {
            this.enableDebugMode();
        }
        
        this.setupEventListeners();
        this.loadInitialData();
        this.initializePlaylistManager();

        await this.initializeComponents();
        
        // ✅ Inicialización diferida de UI movida aquí (Corrección del error de sintaxis)
        setTimeout(() => {
            this.setupSearchButtonListeners();
            this.setupMiniPlayerObserver();
            this.checkAndShowMiniPlayer();
        }, 1500);

        this.state.initialized = true;
        this.updateStatusIndicator('Sistema Listo', 'success');
        
        if (window.pendingYouTubePlaylists) {
            console.log("🔄 Procesando playlists de YouTube pendientes");
            this.processYouTubePlaylists(window.pendingYouTubePlaylists);
            window.pendingYouTubePlaylists = null;
        }

        window.addEventListener('resize', () => {
            if (window.unifiedCore) {
                if (window.unifiedCore.currentView === 'fullPlayer') {
                    window.unifiedCore.updatePlayerPosition('videoWrapper');
                } else if (window.reproduccionIniciada) {
                    window.unifiedCore.updatePlayerPosition('miniPlayerFloat');
                }
            }
        });

        // Listeners adicionales
        document.addEventListener('viewChanged', (e) => {
            console.log('🔄 Vista cambió:', e.detail);
            setTimeout(() => this.checkAndShowMiniPlayer(), 300);
        });

        document.addEventListener('playbackStarted', () => {
            console.log('▶️ Reproducción iniciada');
            setTimeout(() => this.checkAndShowMiniPlayer(), 500);
        });

        console.log('✅ Sistema Unificado Inicializado');
    }

    processYouTubePlaylists(playlists) {
        console.log(`📁 processYouTubePlaylists llamada con ${playlists?.length || 0} playlists`);
        
        if (!playlists || playlists.length === 0) {
            console.warn("❌ No se recibieron playlists válidas");
            return;
        }

        if (!window.playlistManager) {
            console.warn("⚠️ playlistManager no está disponible, programando para más tarde");
            window.pendingYouTubePlaylists = playlists;
            return;
        }

        try {
            window.playlistManager.addYouTubeLibraryPlaylists(playlists);
            console.log(`✅ ${playlists.length} playlists de YouTube procesadas exitosamente`);
        } catch (error) {
            console.error('❌ Error procesando playlists de YouTube:', error);
            this.showMessage('Error procesando playlists de YouTube', 'error');
        }
    }

    clearYouTubeLibrary() {
        console.log('🧹 Limpiando biblioteca de YouTube');
        
        if (window.playlistManager && window.playlistManager.clearYouTubeLibraryPlaylists) {
            window.playlistManager.clearYouTubeLibraryPlaylists();
        }
        
        this.updatePlaylistsUI();
        this.showMessage('Biblioteca de YouTube limpiada', 'success');
    }

    async loadTrendingContent() {
        try {
            console.log('🔥 Cargando contenido trending...');
            const trending = await window.youtubeJSClient.getTrending();
            
            const trendingTab = document.getElementById('playlistsTab');
            if (trendingTab && trending.items?.length > 0) {
                trendingTab.innerHTML = `
                    <div class="trending-section">
                        <h3>🔥 Trending en YouTube</h3>
                        <div class="trending-grid">
                            ${trending.items.slice(0, 12).map(video => `
                                <div class="trending-card" onclick="window.unifiedCore.addVideoToQueue({
                                    videoId: '${video.videoId}',
                                    title: '${video.title.replace(/'/g, "\\'")}',
                                    thumbnail: '${video.thumbnail}',
                                    duration: ${video.duration},
                                    uploaderName: '${video.uploaderName}'
                                })">
                                    <img src="${video.thumbnail}" alt="${video.title}">
                                    <div class="trending-info">
                                        <h4>${video.title.substring(0, 60)}...</h4>
                                        <p>${video.uploaderName}</p>
                                        <span>${this.formatDuration(video.duration)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            this.showMessage('Contenido trending cargado', 'success');
        } catch (error) {
            console.error('❌ Error cargando trending:', error);
        }
    }

    async initializeComponents() {
        if (!window.ytCrossMixAPIs?.ready) {
            console.log('⏳ Esperando a que las APIs estén listas...');
            await new Promise((resolve) => {
                const checkAPIs = () => {
                    if (window.ytCrossMixAPIs?.ready) {
                        resolve();
                    } else {
                        setTimeout(checkAPIs, 100);
                    }
                };
                checkAPIs();
                setTimeout(resolve, 10000);
            });
        }
        
        await this.initializeYouTubeAPI();
        this.initializeAuth();
        this.initializeUI();
    }

    async initializeYouTubeAPI() {
        console.log('🎵 Configurando reproductores de YouTube...');
        if (window.YT && window.YT.Player) {
            this.initializePlayers();
            return;
        }
        return new Promise((resolve) => {
            const originalCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (originalCallback) originalCallback();
                this.initializePlayers();
                resolve();
            };
        });
    }

    initializePlayers() {
        if (player1 && player2) return;
        console.log('🎮 Inicializando reproductores...');
        const playerConfig = {
            height: '100%',
            width: '100%',
            playerVars: { 'playsinline': 1 },
            events: {
                'onReady': (event) => this.onPlayerReady(event),
                'onStateChange': (event) => this.onPlayerStateChange(event),
                'onError': (event) => this.onPlayerError(event)
            }
        };
        player1 = new YT.Player('player1', playerConfig);
        player2 = new YT.Player('player2', playerConfig);
    }

    onPlayerReady(event) {
        console.log('✅ Reproductor listo');
        if (player1 && player2) {
            playersInitialized = true;
            this.state.playersReady = true;
            window.player1 = player1;
            window.player2 = player2;
            window.currentPlayer = currentPlayer;
            this.updatePlayersStatus('Reproductores listos');
            this.enablePlayButton();
        }
    }

    onPlayerStateChange(event) {
        const player = event.target;
        const state = event.data;
        
        if (state === YT.PlayerState.ENDED) {
            console.log('📻 Video terminado, reproduciendo siguiente...');
            this.playNextVideo();
        } else if (state === YT.PlayerState.PLAYING) {
            hasOutroCrossfadeStarted = false;
            
            const videoData = player.getVideoData();
            if (videoData?.video_id) {
                const flatList = this.getFlattenedPlaylist();
                const index = flatList.findIndex(v => v.videoId === videoData.video_id);
                
                if (index !== -1) {
                    window.currentPlayingInfo.flattenedIndex = index;
                    window.currentPlayingInfo.videoId = videoData.video_id;
                    this.state.currentPlayingInfo = window.currentPlayingInfo;
                    console.log(`✅ Índice sincronizado: ${index} (${videoData.video_id})`);
                }
            }
            
            this.updateCurrentPlayingIndex();
            this.updateNowPlaying();
            
            if (window.playlistManager) {
                this.updatePersistentQueue(); 
                if (window.playlistManager.syncQueueIndicator) {
                    window.playlistManager.syncQueueIndicator();
                }
                if (window.playlistManager.refreshActiveQueueTab) {
                    window.playlistManager.refreshActiveQueueTab();
                }
            }
            setTimeout(() => saveAllData(), 1000);
        }
    }

    refreshActiveQueueTab() {
        const activeTab = document.querySelector('.queue-tab.active');
        if (!activeTab) return;

        const tabName = activeTab.dataset.tab;
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        const flatList = this.core?.getFlattenedPlaylist() || [];
        const currentVideo = currentIndex >= 0 ? flatList[currentIndex] : null;
        
        if (!currentVideo || currentIndex < 0) return;
        
        if (tabName === 'lyrics') {
            setTimeout(() => this.loadLyrics(), 500);
        } else if (tabName === 'related') {
            setTimeout(() => this.loadRelatedVideos(), 500);
        }
    }

    onPlayerError(event) {
        console.error('❌ Error en reproductor:', event.data);
        this.showMessage(`Error en reproductor: ${event.data}`, 'error');
    }

    initializeAuth() {
        console.log("🔧 Configurando eventos de autenticación...");
        if (window.authEventsConfigured) return;
        window.authEventsConfigured = true;
        
        const playlistHandler = (event) => {
            const { playlists, source } = event.detail;
            if (!playlists || playlists.length === 0) return;
            
            if (!this.state.initialized || !window.playlistManager) {
                window.pendingYouTubePlaylists = playlists;
                return;
            }
            this.processYouTubePlaylists(playlists);
        };
        
        document.addEventListener('youtubePlaylistsReady', playlistHandler);
        document.addEventListener('userLoggedOut', () => {
            if (window.playlistManager?.clearYouTubeLibraryPlaylists) {
                window.playlistManager.clearYouTubeLibraryPlaylists();
            }
            setTimeout(() => this.updatePlaylistsUI(), 500);
        });
    }

    initializeUI() {
        if (!playlistsData.some(p => p.id === 'queue')) {
            playlistsData.push({
                id: 'queue',
                name: 'Cola de Reproducción',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true,
                isQueue: true
            });
        }
        if (!playlistsData.some(p => p.id === 'manual')) {
            playlistsData.push({
                id: 'manual',
                name: 'Mis Vídeos Añadidos',
                thumbnailUrl: './electronic.ico',
                videos: [],
                isExpanded: true
            });
        }
        this.updateOverviewStats();
    }

    async initializePlaylistManager() {
        console.log("🔧 Inicializando playlist manager...");
        const waitForPlaylistManager = new Promise((resolve, reject) => {
            if (typeof initializePlaylistManager === 'function') {
                resolve();
                return;
            }
            const timeout = setTimeout(() => reject(new Error('Timeout esperando initializePlaylistManager')), 5000);
            const interval = setInterval(() => {
                if (typeof initializePlaylistManager === 'function') {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    resolve();
                }
            }, 100);
        });
        
        try {
            await waitForPlaylistManager;
            initializePlaylistManager(this);
            if (window.playlistManager) {
                console.log("✅ Playlist manager inicializado correctamente");
                return true;
            }
            throw new Error('PlaylistManager no se creó correctamente');
        } catch (error) {
            console.error("❌ No se pudo inicializar playlist manager:", error);
            this.showMessage("Funcionalidad de playlists limitada", 'warning');
            return false;
        }
    }

    updatePlayerPosition(targetContainerId) {
        const playersLayer = document.getElementById('persistent-player-layer');
        const targetContainer = document.getElementById(targetContainerId);
        
        if (!playersLayer) {
            const layer = document.createElement('div');
            layer.id = 'persistent-player-layer';
            layer.style.cssText = `
                position: fixed;
                z-index: 1000;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                background: #000;
                overflow: hidden;
                pointer-events: none;
            `;
            document.body.appendChild(layer);
            const p1 = document.getElementById('player1');
            const p2 = document.getElementById('player2');
            if (p1) layer.appendChild(p1);
            if (p2) layer.appendChild(p2);
            return this.updatePlayerPosition(targetContainerId);
        }

        if (!targetContainer || targetContainer.classList.contains('hidden')) {
            playersLayer.style.opacity = '0';
            playersLayer.style.pointerEvents = 'none';
            return;
        }

        const rect = targetContainer.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        playersLayer.style.top = `${rect.top}px`;
        playersLayer.style.left = `${rect.left}px`;
        playersLayer.style.width = `${rect.width}px`;
        playersLayer.style.height = `${rect.height}px`;
        playersLayer.style.opacity = '1';
        
        if (targetContainerId === 'videoWrapper') {
             playersLayer.style.pointerEvents = 'auto';
             playersLayer.style.borderRadius = '0';
        } else {
             playersLayer.style.pointerEvents = 'auto';
             playersLayer.style.borderRadius = '12px';
             playersLayer.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
        }
    }

    updatePlaylistsUI() {
        if (window.playlistManager && window.playlistManager.updatePlaylistsUI) {
            window.playlistManager.updatePlaylistsUI();
            requestAnimationFrame(() => {
                this.updateOverviewStats();
            });
        }
    }

    setupEventListeners() {
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });
        this.setupControlButtons();
        this.setupSearch();
        this.setupQueue();
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.delete-menu')) {
                this.closeAllContextMenus();
            }
        }, true);
    }

    setupControlButtons() {
        const playBtn = document.getElementById('botonPlay');
        const nextBtn = document.getElementById('botonNext');
        const prevBtn = document.getElementById('prevButton');

        if (playBtn) {
            const newPlayBtn = playBtn.cloneNode(true);
            playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
            newPlayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handlePlayPause();
            });
        }
        if (nextBtn) {
            const newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            newNextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleNext();
            });
        }
        if (prevBtn) {
            const newPrevBtn = prevBtn.cloneNode(true);
            prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
            newPrevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handlePrevious();
            });
        }
    }

    setupSearch() {
        const searchInputs = [
            document.getElementById('searchInput'),
            document.getElementById('sidebarSearchInput'),
            document.getElementById('mobileSearchInput')
        ].filter(Boolean);

        const debouncedSearch = this.debounce((query) => {
            this.performSearch(query);
        }, 500);

        searchInputs.forEach(input => {
            input.addEventListener('input', (event) => {
                const query = event.target.value.trim();
                if (query.length > 2) {
                    debouncedSearch(query);
                    if (this.currentView !== 'search') {
                        this.switchView('search'); // Fixed variable name
                    }
                } else {
                    this.clearSearchResults();
                }
            });
        });
    }

    setupQueue() {
        const queueBtn = document.getElementById('queueButton');
        if (queueBtn) {
            queueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showQueuePopup();
            });
        }
    }

    setupPlayerContainerHandlers() {
        console.log('🎬 Configurando handlers de barra inferior');
        const bottomPlayer = document.querySelector('.bottom-player');
        if (bottomPlayer) {
            const newBottomPlayer = bottomPlayer.cloneNode(true);
            bottomPlayer.parentNode.replaceChild(newBottomPlayer, bottomPlayer);
            newBottomPlayer.style.cursor = 'pointer';
            
            newBottomPlayer.addEventListener('click', (e) => {
                if (e.target.closest('button') || 
                    e.target.closest('.volume-slider') || 
                    e.target.closest('.player-controls') ||
                    e.target.closest('.control-button')) {
                    return;
                }
                const hasVideo = this.state?.currentPlayingInfo?.videoId || window.currentPlayingInfo?.videoId;
                if (hasVideo) {
                    console.log('🎬 Click en barra -> Full Player');
                    this.switchView('fullPlayer');
                }
            });
            this.setupControlButtons();
            this.forceBottomPlayerVisible();
        }
    }

    showFullPlayer() {
        console.log('🎬 Mostrando reproductor completo');
        this.switchView('fullPlayer');
        this.movePlayer('full');
        this.hideMiniPlayer();
        this.updatePersistentQueue();
    }

    forceMiniPlayerVisibility() {
        console.log('🎬 Forzando visibilidad de mini player...');
        const miniPlayer = document.getElementById('miniPlayerFloat');
        if (!miniPlayer) return false;
        
        const hasActiveVideo = window.reproduccionIniciada || 
                              window.currentPlayingInfo?.flattenedIndex >= 0;
        
        if (!hasActiveVideo) {
            miniPlayer.classList.add('hidden');
            return false;
        }
        
        miniPlayer.classList.remove('hidden');
        miniPlayer.style.cssText = `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: fixed !important;
            bottom: 110px !important;
            right: 20px !important;
            width: 320px !important;
            height: 180px !important;
            z-index: 999998 !important;
            background: #000 !important;
            border-radius: 12px !important;
            overflow: hidden !important;
            box-shadow: 0 10px 40px rgba(0,0,0,0.8), 0 0 1px rgba(255,107,53,0.5) !important;
            pointer-events: auto !important;
        `;
        
        const containers = [
            miniPlayer.querySelector('.mini-player-video'),
            document.getElementById('miniPlayer1Container'),
            document.getElementById('miniPlayer2Container')
        ].filter(Boolean);
        
        containers.forEach(container => {
            container.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 100% !important;
                height: 100% !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                background: #000 !important;
            `;
        });
        
        const activePlayerNum = window.currentPlayer || 1;
        const activePlayer = document.getElementById(`player${activePlayerNum}`);
        const inactivePlayer = document.getElementById(`player${activePlayerNum === 1 ? 2 : 1}`);
        
        if (activePlayer) {
            activePlayer.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
            `;
            activePlayer.classList.remove('hidden', 'fade-out');
        }
        if (inactivePlayer) {
            inactivePlayer.style.display = 'none';
            inactivePlayer.classList.add('hidden');
        }
        console.log('✅ Mini player forzado a visible');
        return true;
    }

    setupSearchButtonListeners() {
        console.log('🔘 Configurando listeners de botones de búsqueda...');
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;
        
        searchResults.addEventListener('click', async (e) => {
            const nextBtn = e.target.closest('.search-result-add-next-btn');
            if (nextBtn) {
                e.preventDefault();
                e.stopPropagation();
                
                const videoId = nextBtn.dataset.videoId;
                if (!videoId || videoId === 'undefined') {
                    window.unifiedCore?.showMessage('Error: Video inválido', 'error');
                    return;
                }
                
                const videoData = {
                    videoId: videoId,
                    title: nextBtn.dataset.title,
                    thumbnail: nextBtn.dataset.thumbnail,
                    duration: parseInt(nextBtn.dataset.duration) || 0,
                    uploaderName: nextBtn.dataset.author,
                    author: nextBtn.dataset.author
                };
                
                nextBtn.disabled = true;
                nextBtn.style.opacity = '0.5';
                
                try {
                    if (window.unifiedCore?.addVideoToQueueAfterCurrent) {
                        await window.unifiedCore.addVideoToQueueAfterCurrent(videoData);
                    } else if (window.playlistManager?.addVideoToQueueAfterCurrent) {
                        await window.playlistManager.addVideoToQueueAfterCurrent(videoData);
                    }
                    
                    nextBtn.innerHTML = '<i class="fas fa-check"></i> Añadido';
                    setTimeout(() => {
                        nextBtn.innerHTML = '<i class="fas fa-forward"></i> Añadir Siguiente';
                        nextBtn.disabled = false;
                        nextBtn.style.opacity = '1';
                    }, 2000);
                } catch (error) {
                    nextBtn.disabled = false;
                    nextBtn.style.opacity = '1';
                    window.unifiedCore?.showMessage('Error añadiendo video', 'error');
                }
            }
        });
    }

    setupMiniPlayerObserver() {
        const miniPlayer = document.getElementById('miniPlayerFloat');
        if (!miniPlayer) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    if (miniPlayer.classList.contains('hidden')) {
                        const hasActiveVideo = window.reproduccionIniciada && 
                                             window.unifiedCore?.currentView !== 'fullPlayer';
                        if (hasActiveVideo) {
                            this.forceMiniPlayerVisibility();
                        }
                    }
                }
            });
        });
        
        observer.observe(miniPlayer, {
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    checkAndShowMiniPlayer() {
        const hasActiveVideo = window.reproduccionIniciada;
        const isInFullPlayer = window.unifiedCore?.currentView === 'fullPlayer';
        
        if (hasActiveVideo && !isInFullPlayer) {
            this.forceMiniPlayerVisibility();
        }
    }

    movePlayer(target) {
        const activePlayerId = currentPlayer === 1 ? 'player1' : 'player2';
        const activePlayerElement = document.getElementById(activePlayerId);

        if (!activePlayerElement) return;

        let targetContainer;
        if (target === 'full') {
            targetContainer = document.getElementById('fullVideoContainer');
        } else if (target === 'mini') {
            targetContainer = document.getElementById('miniPlayerContainer');
        }

        if (targetContainer) {
            targetContainer.appendChild(activePlayerElement);
            activePlayerElement.style.width = '100%';
            activePlayerElement.style.height = '100%';
            activePlayerElement.style.position = 'absolute';
            activePlayerElement.style.top = '0';
            activePlayerElement.style.left = '0';
        }
    }

    showMiniPlayer() {
        const miniPlayer = document.getElementById('miniPlayerContainer');
        if (miniPlayer) miniPlayer.classList.remove('hidden');
    }

    hideMiniPlayer() {
        const miniPlayer = document.getElementById('miniPlayerContainer');
        if (miniPlayer) miniPlayer.classList.add('hidden');
    }

    updatePersistentQueue() {
        console.log('🔄 Actualizando cola persistente...');
        const queueContentList = document.getElementById('queueContentList');
        if (!queueContentList) return;

        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            queueContentList.innerHTML = '<p class="queue-placeholder">La cola está vacía. Añade canciones para empezar.</p>';
            this.updateQueueCount(0);
            return;
        }

        const currentIndex = this.state?.currentPlayingInfo?.flattenedIndex ?? 
                            window.currentPlayingInfo?.flattenedIndex ?? -1;

        const fragment = document.createDocumentFragment();
        let validCount = 0;

        flatList.forEach((video, index) => {
            if (!video || !video.videoId) return;
            const isPlaying = currentIndex === index;
            const queueItem = document.createElement('div');
            queueItem.className = `queue-item${isPlaying ? ' playing' : ''}`;
            queueItem.dataset.videoId = video.videoId;
            queueItem.dataset.flatIndex = index;
            queueItem.draggable = true;
            queueItem.onclick = () => this.playVideoAtIndex(index);
            
            queueItem.innerHTML = `
                <div class="queue-item-number">
                    ${isPlaying ? '<i class="fas fa-play-circle queue-item-playing"></i>' : (index + 1)}
                </div>
                <img src="${video.thumbnail || './electronic.ico'}" alt="${this.escapeHTML(video.title || 'Sin título')}" class="queue-item-thumbnail" onerror="this.src='./electronic.ico';">
                <div class="queue-item-info">
                    <div class="queue-item-title">${this.escapeHTML(video.title || 'Sin título')}</div>
                    <div class="queue-item-meta">
                        <span class="queue-item-duration">${this.formatDuration(video.duration || 0)}</span>
                        ${video.uploaderName ? `<span class="queue-item-author">${this.escapeHTML(video.uploaderName)}</span>` : ''}
                    </div>
                </div>
                <button class="queue-item-remove" data-video-id="${video.videoId}" title="Eliminar de la cola"><i class="fas fa-times"></i></button>
            `;
            
            const removeBtn = queueItem.querySelector('.queue-item-remove');
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.playlistManager) {
                    window.playlistManager.removeVideoFromQueue(video.videoId);
                }
            };
            fragment.appendChild(queueItem);
            validCount++;
        });

        queueContentList.innerHTML = '';
        queueContentList.appendChild(fragment);
        this.updateQueueCount(validCount);
        
        setTimeout(() => {
            if (window.queueDragDrop) window.queueDragDrop.attachDragListeners();
        }, 100);
        
        if (currentIndex >= 0) {
            requestAnimationFrame(() => {
                const playingItem = queueContentList.querySelector('.queue-item.playing');
                if (playingItem) playingItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    updateQueueCount(count) {
        const queueCountBadge = document.getElementById('queueCount');
        if (queueCountBadge) queueCountBadge.textContent = count;
    }

    switchView(viewName) {
        const validViews = ['home', 'search', 'library', 'fullPlayer'];
        if (!validViews.includes(viewName)) return;

        document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.view === viewName) item.classList.add('active');
        });

        document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) targetView.classList.add('active');
        
        this.currentView = viewName;

        const hasActiveVideo = window.reproduccionIniciada;
        const miniPlayerFloat = document.getElementById('miniPlayerFloat');
        const fullView = document.getElementById('fullPlayerView');
        let videoWrapper = fullView.querySelector('.video-wrapper');
        if(videoWrapper && !videoWrapper.id) videoWrapper.id = 'videoWrapper';

        if (viewName === 'fullPlayer') {
            if (miniPlayerFloat) miniPlayerFloat.classList.add('hidden');
            requestAnimationFrame(() => this.updatePlayerPosition('videoWrapper'));
        } else {
            if (hasActiveVideo) {
                if (miniPlayerFloat) {
                    miniPlayerFloat.classList.remove('hidden');
                    miniPlayerFloat.style.display = 'block';
                }
                requestAnimationFrame(() => this.updatePlayerPosition('miniPlayerFloat'));
            } else {
                if (miniPlayerFloat) miniPlayerFloat.classList.add('hidden');
                const layer = document.getElementById('persistent-player-layer');
                if (layer) layer.style.opacity = '0';
            }
        }
    }

    movePlayersToFullView() {
        const fullPlayerView = document.getElementById('fullPlayerView');
        if (!fullPlayerView) return;
        const videoWrapper = fullPlayerView.querySelector('.video-wrapper');
        if (!videoWrapper) return;
        
        const player1El = document.getElementById('player1');
        const player2El = document.getElementById('player2');
        if (!player1El || !player2El) return;
        
        if (!videoWrapper.contains(player1El)) videoWrapper.appendChild(player1El);
        if (!videoWrapper.contains(player2El)) videoWrapper.appendChild(player2El);
        
        [player1El, player2El].forEach(player => {
            if (player) {
                player.style.cssText = `
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    display: block !important;
                    visibility: visible !important;
                `;
            }
        });
    }

    forceBottomPlayerVisible() {
        const bottomPlayer = document.querySelector('.bottom-player');
        if (!bottomPlayer) return;
        
        bottomPlayer.style.removeProperty('display');
        bottomPlayer.style.removeProperty('visibility');
        bottomPlayer.style.removeProperty('opacity');
        bottomPlayer.style.cssText = `
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 300 !important;
            pointer-events: auto !important;
        `;
        bottomPlayer.classList.remove('hidden', 'hide', 'invisible');
    }

    refreshLibraryView() {
        this.updatePlaylistsUI();
    }

    focusSearchInput() {
        const searchInput = document.getElementById('sidebarSearchInput') || 
                          document.getElementById('searchInput');
        if (searchInput) setTimeout(() => searchInput.focus(), 100);
    }

    showMiniPlayerFloat() {
        const hasActiveVideo = this.state?.currentPlayingInfo?.flattenedIndex >= 0 || 
                              window.currentPlayingInfo?.flattenedIndex >= 0 ||
                              window.reproduccionIniciada;
        
        if (!hasActiveVideo) return;
        
        let miniPlayer = document.getElementById('miniPlayerFloat');
        if (!miniPlayer) return;
        
        miniPlayer.classList.remove('hidden');
        requestAnimationFrame(() => {
            miniPlayer.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                position: fixed !important;
                bottom: 110px !important;
                right: 20px !important;
                width: 320px !important;
                height: 180px !important;
                z-index: 999998 !important;
                background: #000 !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.8) !important;
                pointer-events: auto !important;
            `;
            requestAnimationFrame(() => this.movePlayersToMini());
        });
    }

    movePlayersToMini() {
        const player1 = document.getElementById('player1');
        const player2 = document.getElementById('player2');
        const miniFloat = document.getElementById('miniPlayerFloat');
        const miniContainer1 = document.getElementById('miniPlayer1Container');
        const miniContainer2 = document.getElementById('miniPlayer2Container');
        
        if (!miniFloat || !miniContainer1 || !miniContainer2 || !player1 || !player2) return;
        
        miniFloat.classList.remove('hidden');
        miniFloat.style.display = 'block';
        
        if (!miniContainer1.contains(player1)) miniContainer1.appendChild(player1);
        if (!miniContainer2.contains(player2)) miniContainer2.appendChild(player2);
        
        const activePlayerNum = window.currentPlayer;
        [player1, player2].forEach((player, index) => {
            const isPlayer1 = index === 0;
            const isActive = (activePlayerNum === 1 && isPlayer1) || (activePlayerNum === 2 && !isPlayer1);
            player.className = 'video-player'; 
            player.classList.remove('hidden', 'fade-out', 'crossfade-exit');
            
            if (isActive) {
                player.style.cssText = `
                    width: 100% !important;
                    height: 100% !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    z-index: 10 !important;
                    background: #000 !important;
                    pointer-events: auto !important;
                `;
            } else {
                player.style.cssText = `
                    display: none !important;
                    opacity: 0 !important;
                    z-index: 0 !important;
                `;
            }
        });
    }

    movePlayerToFullView() {
        const fullPlayerView = document.getElementById('fullPlayerView');
        if (!fullPlayerView) return;
        const videoWrapper = fullPlayerView.querySelector('.video-wrapper');
        if (!videoWrapper) return;
        
        const player1El = document.getElementById('player1');
        const player2El = document.getElementById('player2');
        if (!player1El || !player2El) return;
        
        if (!videoWrapper.contains(player1El)) videoWrapper.appendChild(player1El);
        if (!videoWrapper.contains(player2El)) videoWrapper.appendChild(player2El);
        
        [player1El, player2El].forEach(player => {
            if (player) {
                player.style.position = 'absolute';
                player.style.top = '0';
                player.style.left = '0';
                player.style.width = '100%';
                player.style.height = '100%';
            }
        });
    }

    refreshPlayingView() {
        this.updateNowPlaying();
        if (window.playlistManager?.updateQueuePopup) {
            window.playlistManager.updateQueuePopup();
        }
    }

    handlePlayPause() {
        if (!playersInitialized || !window.player1 || !window.player2) {
            this.showMessage("Los reproductores no están listos", 'error');
            return;
        }

        const flatList = this.getFlattenedPlaylist();
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;

        if (!window.reproduccionIniciada || currentIndex === -1 || currentIndex === undefined) {
            if (flatList.length === 0) {
                this.showMessage("La cola está vacía. Añade canciones primero.", 'warning');
                return;
            }
            this.playVideoAtIndex(0);
            return;
        }

        const activePlayer = window.currentPlayer === 1 ? window.player1 : window.player2;
        try {
            const playerState = activePlayer.getPlayerState();
            if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                this.updatePlayButton('play');
                this.stopMonitoring();
            } else {
                activePlayer.playVideo();
                this.updatePlayButton('pause');
                this.startMonitoring();
            }
        } catch (error) {
            console.error('❌ Error en handlePlayPause:', error);
            this.showMessage('Error controlando reproducción', 'error');
        }
    }

    handleNext() {
        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage("No hay videos en la cola", 'warning');
            return;
        }

        const currentInfo = window.currentPlayingInfo || { flattenedIndex: -1 };
        let currentIndex = currentInfo.flattenedIndex ?? -1;

        if (currentIndex === -1) {
            this.playVideoAtIndex(0);
            return;
        }

        let nextIndex = currentIndex + 1;
        if (nextIndex >= flatList.length) {
            this.showMessage("Fin de la lista de reproducción", 'info');
            return;
        }

        if (monitorInterval) clearInterval(monitorInterval);
        hasOutroCrossfadeStarted = true; 
        nextVideoScheduled = true;
        this.playNextVideo();
    }

    handlePrevious() {
        console.log('⏮️ Función anterior no implementada aún');
    }

    playFirstVideo() {
        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage("No hay videos para reproducir", 'warning');
            return;
        }

        const firstVideo = flatList[0];
        currentPlayingInfo = {
            flattenedIndex: 0,
            videoId: firstVideo.videoId,
            playlistId: firstVideo.sourcePlaylistId
        };

        try {
            if (player2) player2.stopVideo();
            player1.loadVideoById(firstVideo.videoId);
            player1.setVolume(100);
            document.getElementById('player1')?.classList.remove('hidden', 'fade-out', 'fade-in');
            document.getElementById('player2')?.classList.add('hidden');
            currentPlayer = 1;
            reproduccionIniciada = true;
            this.updatePlayButton('pause');
            this.startMonitoring();
            this.updateNowPlaying();
            this.updatePlaylistsUI();
        } catch (error) {
            this.showMessage("Error al iniciar reproducción", 'error');
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

    async playNextVideo() {
        const now = Date.now();
        if (now - lastCrossfadeTime < 1000) return;
        lastCrossfadeTime = now;
        
        if (isTransitioning || crossfadeInProgress) {
            this.showMessage('Transición en progreso, espera...', 'info');
            return;
        }

        if (!playersInitialized) return;

        isTransitioning = true;
        const currentFlatIndex = currentPlayingInfo.flattenedIndex;
        const flatList = this.getFlattenedPlaylist();

        if (flatList.length === 0) {
            isTransitioning = false;
            this.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            isTransitioning = false;
            this.handleEndOfPlaylist();
            return;
        }

        const nextVideo = flatList[nextIndex];
        if (!nextVideo?.videoId) {
            isTransitioning = false;
            setTimeout(() => this.playNextVideo(), 500);
            return;
        }
        
        currentPlayingInfo = {
            flattenedIndex: nextIndex,
            videoId: nextVideo.videoId,
            playlistId: nextVideo.sourcePlaylistId
        };
        this.updateNowPlaying();

        const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;
        const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

        let loadError = null;

        try {
            if (nextPlayerElement) {
                nextPlayerElement.classList.remove('hidden', 'fade-out');
                nextPlayerElement.style.display = 'block';
                nextPlayerElement.style.opacity = '0';
            }

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 8000);
                try {
                    nextPlayerInstance.loadVideoById({
                        videoId: nextVideo.videoId,
                        startSeconds: 0
                    });
                    nextPlayerInstance.setVolume(0);
                    setTimeout(() => {
                        clearTimeout(timeout);
                        resolve();
                    }, 500);
                } catch (e) {
                    clearTimeout(timeout);
                    reject(e);
                }
            });

            currentPlayer = currentPlayer === 1 ? 2 : 1;
            this.startCrossfade(currentPlayerInstance, nextPlayerInstance);
            
            setTimeout(() => {
                if (window.playlistManager) {
                    window.playlistManager.updateQueuePopup();
                    window.playlistManager.syncQueueIndicator();
                    window.playlistManager.refreshActiveQueueTab();
                }
            }, 200);

        } catch (error) {
            loadError = error;
            console.error("❌ Error en playNextVideo:", error);
            
            if (error.message.includes('Timeout')) {
                if (window.playlistManager) {
                    window.playlistManager.removeVideoFromQueue(nextVideo.videoId);
                }
                isTransitioning = false;
                hasOutroCrossfadeStarted = false;
                nextVideoScheduled = false;
                if (!monitorInterval) this.startMonitoring();
                setTimeout(() => this.playNextVideo(), 500);
            } else {
                isTransitioning = false;
                hasOutroCrossfadeStarted = false;
                nextVideoScheduled = false;
                if (!monitorInterval) this.startMonitoring();
            }
        } finally {
            if (!loadError || !loadError.message.includes('Timeout')) {
                setTimeout(() => { isTransitioning = false; }, 1000);
            }
        }
    }

    startCrossfade(prevPlayer, nextPlayer) {
        if (crossfadeInProgress) return;

        const CROSSFADE_DURATION_MS = CROSSFADE_DURATION * 1000;
        crossfadeInProgress = true;

        const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
        const nextElement = document.getElementById(`player${currentPlayer}`);

        if (nextElement) {
            nextElement.style.transition = 'none';
            nextElement.classList.remove('hidden', 'fade-out');
            nextElement.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 0;
                z-index: 3;
                pointer-events: auto;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                transition: opacity ${CROSSFADE_DURATION}s linear !important;
            `;
        }

        if (prevElement) {
            prevElement.style.transition = 'none';
            prevElement.classList.remove('hidden', 'fade-in');
            prevElement.style.cssText = `
                display: block !important;
                visibility: visible !important;
                opacity: 1;
                z-index: 2;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                transition: opacity ${CROSSFADE_DURATION}s linear !important;
            `;
        }

        const steps = 100;
        const stepTime = CROSSFADE_DURATION_MS / steps;
        let step = 0;

        try {
            nextPlayer.playVideo();
            nextPlayer.setVolume(0);
        } catch (e) {}

        crossfadeInterval = setInterval(() => {
            step++;
            const progress = step / steps;
            const audioProgress = Math.pow(progress, 0.8);

            const prevVolume = Math.max(0, Math.round(100 * (1 - audioProgress)));
            const nextVolume = Math.min(100, Math.round(100 * audioProgress));

            try {
                prevPlayer.setVolume(prevVolume);
                nextPlayer.setVolume(nextVolume);
            } catch (e) {}

            if (prevElement) prevElement.style.opacity = (1 - progress).toFixed(2);
            if (nextElement) nextElement.style.opacity = progress.toFixed(2);

            if (step >= steps) {
                clearInterval(crossfadeInterval);
                crossfadeInterval = null;
                crossfadeInProgress = false;

                setTimeout(() => {
                    try {
                        prevPlayer.stopVideo();
                        if (prevElement) {
                            prevElement.classList.add('hidden');
                            prevElement.style.cssText = `display: none !important; opacity: 0; z-index: 1;`;
                        }
                        if (nextElement) {
                            nextElement.classList.remove('hidden');
                            nextElement.style.cssText = `display: block !important; visibility: visible !important; opacity: 1; z-index: 2; position: absolute; top: 0; left: 0; width: 100%; height: 100%;`;
                        }
                        hasOutroCrossfadeStarted = false;
                        nextVideoScheduled = false;
                        isTransitioning = false;
                        if (!monitorInterval && window.unifiedCore) window.unifiedCore.startMonitoring();
                    } catch (e) {}
                }, 100);
            }
        }, stepTime);
    }

    async performSearch(query, continuation = null) {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults) return;

        if (!continuation) {
            currentSearchQuery = query;
            nextPageContext = null;
            searchResults.innerHTML = '<div class="search-loading">🔍 Buscando música...</div>';
            
            if (this.scrollObserver) {
                this.scrollObserver.disconnect();
                this.scrollObserver = null;
            }
        }

        isLoadingMore = true;

        try {
            const data = await window.youtubeJSClient.search(query, continuation);
            this.displaySearchResults(data, !!continuation);
        } catch (error) {
            console.error("❌ Error en búsqueda:", error);
            if (!continuation) {
                searchResults.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error en búsqueda: ${error.message}</p>
                    </div>
                `;
            } else {
                this.showMessage('Error cargando más resultados', 'error');
            }
        } finally {
            isLoadingMore = false;
        }
    }

    parseDurationToSeconds(durationStr) {
        if (!durationStr) return 0;
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) return (parts[0] * 60) + parts[1];
        if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        return 0;
    }

    async addVideoToQueue(videoData) {
        if (!window.playlistManager) {
            this.showMessage('Error: Gestor de playlists no disponible', 'error');
            return;
        }
        return await window.playlistManager.addVideoToQueue(videoData);
    }

    async addVideoToQueueAfterCurrent(videoData) {
        if (!window.playlistManager) {
            this.showMessage('Error: Gestor de playlists no disponible', 'error');
            return;
        }
        return await window.playlistManager.addVideoToQueueAfterCurrent(videoData);
    }

    removeVideoFromQueue(videoId) {
        if (!window.playlistManager) return false;
        return window.playlistManager.removeVideoFromQueue(videoId);
    }

    showQueuePopup() {
        if (window.playlistManager) window.playlistManager.showQueuePopup();
    }

    updateQueuePopup() {
        if (window.playlistManager) window.playlistManager.updateQueuePopup();
    }

    displaySearchResults(data) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = ''; 

        if (!data.items || data.items.length === 0) {
            resultsContainer.innerHTML = '<div class="search-placeholder"><i class="fas fa-search"></i><p>No se encontraron videos.</p></div>';
            return;
        }

        data.items.forEach(video => {
            const segundos = this.parseDurationToSeconds(video.duration); 
            const trackDiv = document.createElement('div');
            trackDiv.className = 'track-item card-track search-result-card'; 
            trackDiv.dataset.videoId = video.videoId;
            trackDiv.dataset.durationText = video.duration; 
            trackDiv.dataset.durationSeconds = segundos;

            trackDiv.innerHTML = `
                <div class="search-result-thumbnail">
                    <img src="${video.thumbnail}" alt="${this.escapeHTML(video.title)}" loading="lazy" onerror="this.src='./electronic.ico';">
                    <span class="search-result-duration">${video.duration || '0:00'}</span>
                </div>
                <div class="search-result-info">
                    <h3 class="search-result-title">${this.escapeHTML(video.title)}</h3>
                    <p class="search-result-author">${this.escapeHTML(video.artist || video.uploaderName || 'Desconocido')}</p>
                </div>
                <button class="add-to-queue-btn" 
                        title="Añadir a la cola" 
                        data-video-id="${video.videoId}"
                        data-title="${this.escapeHTML(video.title)}"
                        data-thumbnail="${video.thumbnail}"
                        data-duration="${segundos}"
                        data-author="${this.escapeHTML(video.artist || video.uploaderName || 'Desconocido')}">
                    <i class="fas fa-plus"></i>
                </button>
            `;
            
            const addButton = trackDiv.querySelector('.add-to-queue-btn');
            if (addButton) {
                addButton.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const videoId = addButton.dataset.videoId;
                    if (!videoId || videoId === 'undefined') return;
                    
                    const videoData = {
                        videoId: videoId,
                        title: addButton.dataset.title,
                        thumbnail: addButton.dataset.thumbnail,
                        duration: parseInt(addButton.dataset.duration) || 0,
                        uploaderName: addButton.dataset.author,
                        artist: addButton.dataset.author,
                        author: addButton.dataset.author
                    };
                    
                    const originalHTML = addButton.innerHTML;
                    addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    addButton.disabled = true;
                    
                    try {
                        await this.addVideoToQueue(videoData);
                        addButton.innerHTML = '<i class="fas fa-check"></i>';
                        addButton.style.background = '#4caf50';
                        setTimeout(() => {
                            addButton.innerHTML = originalHTML;
                            addButton.disabled = false;
                            addButton.style.background = '';
                        }, 2000);
                    } catch (error) {
                        addButton.innerHTML = '<i class="fas fa-times"></i>';
                        addButton.style.background = '#f44336';
                        setTimeout(() => {
                            addButton.innerHTML = originalHTML;
                            addButton.disabled = false;
                            addButton.style.background = '';
                        }, 2000);
                    }
                });
            }
            
            trackDiv.addEventListener('click', (e) => {
                if (e.target.closest('.add-to-queue-btn')) return;
                const videoId = trackDiv.dataset.videoId;
                // Reproducir directamente si es necesario
            });

            resultsContainer.appendChild(trackDiv);
        });
    }

    createSearchResultCard(video, videoId) {
        if (!videoId || videoId === 'undefined') return document.createElement('div');
        const card = document.createElement('div');
        card.className = 'search-result-card';
        card.dataset.videoId = videoId;

        const title = video.title || 'Título Desconocido';
        const artist = video.artist || video.uploaderName || 'Autor Desconocido';
        const duration = video.duration ? this.formatDuration(video.duration) : '';
        const thumbnail = video.thumbnail || './electronic.ico';

        card.innerHTML = `
            <div class="search-result-thumbnail">
                <img src="${thumbnail}" alt="${this.escapeHTML(title)}" loading="lazy" onerror="this.src='./electronic.ico';">
                ${duration ? `<span class="search-result-duration">${duration}</span>` : ''}
            </div>
            <div class="search-result-info">
                <h3 class="search-result-title" title="${this.escapeHTML(title)}">${this.escapeHTML(title)}</h3>
                <p class="search-result-author">${this.escapeHTML(artist)}</p>
                <div class="search-result-actions">
                    <button class="search-result-add-next-btn" 
                            data-video-id="${videoId}" 
                            data-title="${this.escapeHTML(title)}" 
                            data-thumbnail="${thumbnail}"
                            data-duration="${video.duration || 0}"
                            data-author="${this.escapeHTML(artist)}">
                        <i class="fas fa-forward"></i>
                        Añadir Siguiente
                    </button>
                </div>
            </div>
        `;
        return card;
    }

    clearSearchResults() {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                    <p><small>Sistema Unificado Activo</small></p>
                </div>
            `;
        }
        currentSearchQuery = '';
        nextPageContext = null;
    }

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getFlattenedPlaylist() {
        const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
        if (!queuePlaylist?.videos) return [];
        
        return queuePlaylist.videos.filter(video => {
            if (!video.videoId || video.videoId === 'undefined') return false;
            const title = (video.title || '').toLowerCase();
            const isDeleted = title.includes('deleted video') || title.includes('private video');
            if (isDeleted && window.playlistManager) {
                window.playlistManager.removeVideoFromQueue(video.videoId);
                return false;
            }
            return true;
        }).map(video => {
            let duration = 0;
            if (video.duration) {
                duration = typeof video.duration === 'number' ? video.duration : this.parseDuration(video.duration);
            }
            return { ...video, duration };
        });
    }

    async getBatchVideoDurations(videoIds) {
        if (!videoIds || videoIds.length === 0) return {};
        const durations = {};
        try {
            for (let i = 0; i < videoIds.length; i += 50) {
                const batch = videoIds.slice(i, i + 50);
                const response = await gapi.client.youtube.videos.list({
                    part: ['contentDetails'],
                    id: batch.join(',')
                });
                if (response.result.items) {
                    response.result.items.forEach(video => {
                        if (video.contentDetails?.duration) {
                            durations[video.id] = this.parseDuration(video.contentDetails.duration);
                        }
                    });
                }
            }
            return durations;
        } catch (error) {
            return {};
        }
    }

    formatDuration(duration) {
        if (isNaN(duration) || duration < 0) return "0:00";
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    parseDuration(durationInput) {
        if (typeof durationInput === 'number' && !isNaN(durationInput)) return Math.floor(Math.abs(durationInput));
        if (typeof durationInput !== 'string') return 0;
        
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }
        
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2) return timeParts[0] * 60 + timeParts[1];
        if (timeParts.length === 3) return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        
        return parseInt(durationInput, 10) || 0;
    }

    startMonitoring() {
        if (monitorInterval) return;
        monitorInterval = setInterval(() => {
            monitorPlayers();
            const activePlayer = (currentPlayer === 1) ? player1 : player2;
            if (activePlayer && reproduccionIniciada) checkAndSkipSegment(activePlayer);
        }, 300);
    }

    stopMonitoring() {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
    }

    updateCurrentPlayingIndex() {
        if (crossfadeInProgress || isTransitioning) return;
        try {
            let playingVideoId = null;
            if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) playingVideoId = player1.getVideoData()?.video_id;
            else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) playingVideoId = player2.getVideoData()?.video_id;
            
            if (playingVideoId && currentPlayingInfo.videoId && currentPlayingInfo.videoId !== playingVideoId) return;
        } catch (e) {}
    }

    updateNowPlaying() {
        const flatList = this.getFlattenedPlaylist();
        const currentVideo = flatList[currentPlayingInfo.flattenedIndex];
        
        if (currentVideo) {
            let artistInfo = currentVideo.artist || currentVideo.uploaderName || currentVideo.author || 'YouTube';
            const elements = {
                nowPlayingTitle: document.getElementById('nowPlayingTitle'),
                nowPlayingArtist: document.getElementById('nowPlayingArtist'),
                playerTitle: document.getElementById('playerTitle'),
                playerArtist: document.getElementById('playerArtist'),
                playerThumbnail: document.getElementById('playerThumbnail')
            };

            if (elements.nowPlayingTitle) elements.nowPlayingTitle.textContent = currentVideo.title;
            if (elements.nowPlayingArtist) elements.nowPlayingArtist.textContent = artistInfo;
            if (elements.playerTitle) elements.playerTitle.textContent = currentVideo.title;
            if (elements.playerArtist) elements.playerArtist.textContent = artistInfo;
            if (elements.playerThumbnail) elements.playerThumbnail.src = currentVideo.thumbnail;
            
            if (window.playlistManager && typeof window.playlistManager.refreshActiveQueueTab === 'function') {
                window.playlistManager.refreshActiveQueueTab();
            }
        }
    }

    updatePlayButton(state) {
        const icon = state === 'play' ? 'fa-play' : 'fa-pause';
        [document.getElementById('botonPlay'), document.getElementById('miniPlayBtn')].filter(Boolean).forEach(btn => {
            const iconElement = btn.querySelector('i');
            if (iconElement) iconElement.className = `fas ${icon}`;
        });
    }

    enablePlayButton() {
        const shouldEnable = this.getFlattenedPlaylist().length > 0 && playersInitialized;
        ['botonPlay', 'botonNext', 'prevButton', 'miniPlayBtn', 'miniNextBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !shouldEnable;
        });
    }

    updateOverviewStats() {
        const totalPlaylists = playlistsData.length;
        const totalVideos = playlistsData.reduce((sum, p) => sum + p.videos.length, 0);
        const overviewGrid = document.getElementById('overviewGrid');
        if (overviewGrid) {
            const playlistStat = overviewGrid.querySelector('.overview-stat');
            if (playlistStat) playlistStat.textContent = `${totalPlaylists} playlists cargadas`;
            const videoStat = overviewGrid.querySelector('.overview-stat:nth-child(2)');
            if (videoStat) videoStat.textContent = `${totalVideos} videos en total`;
        }
    }

    updateStatusIndicator(message, type = 'info') {
        const indicator = document.getElementById('unifiedStatusIndicator');
        if (!indicator) return;
        indicator.textContent = message;
        indicator.className = `unified-status-indicator show ${type}`;
        if (type === 'success' || type === 'error') {
            setTimeout(() => indicator.classList.remove('show'), 3000);
        }
    }

    updatePlayersStatus(status) {
        const statusElement = document.getElementById('unifiedPlayersStatus');
        if (statusElement) statusElement.textContent = `Reproductores: ${status}`;
    }

    handleEmptyPlaylist() {
        this.stopMonitoring();
        reproduccionIniciada = false;
        this.updatePlayButton('play');
        this.enablePlayButton();
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        this.updatePlaylistsUI();
    }

    handleEndOfPlaylist() {
        if (confirm('¿Deseas repetir la lista desde el principio?')) {
            currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
            this.playFirstVideo();
        } else {
            this.stopMonitoring();
            this.showMessage("Lista completada", 'success');
            try {
                if (player1) player1.stopVideo();
                if (player2) player2.stopVideo();
            } catch (e) {}
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

    playVideoAtIndex(index) {
        const flatList = this.getFlattenedPlaylist();
        if (index < 0 || index >= flatList.length) return;

        const video = flatList[index];
        currentPlayingInfo = {
            flattenedIndex: index,
            videoId: video.videoId,
            playlistId: video.sourcePlaylistId
        };
        window.currentPlayingInfo = currentPlayingInfo;
        window.reproduccionIniciada = true;

        try {
            const activePlayer = currentPlayer === 1 ? player1 : player2;
            activePlayer.loadVideoById(video.videoId);
            reproduccionIniciada = true;
            this.updatePlayButton('pause');
            this.startMonitoring();
            this.updateNowPlaying();
            this.updatePlaylistsUI();
            
            if (this.currentView !== 'fullPlayer') {
                setTimeout(() => this.showMiniPlayerFloat(), 500);
            }
            setTimeout(() => this.refreshActiveQueueTab(), 1000);
        } catch (error) {
            this.showMessage("Error al reproducir video", 'error');
            reproduccionIniciada = false;
            window.reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

    showMessage(message, type = 'info', duration = 4000) {
        console.log(`💬 ${type.toUpperCase()}: ${message}`);
        const container = document.getElementById('floatingMessageContainer') || document.querySelector('.floating-messages');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `floating-message ${type}`;
        messageEl.textContent = message;
        container.appendChild(messageEl);

        setTimeout(() => {
            messageEl.classList.add('fade-out');
            setTimeout(() => messageEl.remove(), 500);
        }, duration);
    }

    closeAllContextMenus() {
        document.querySelectorAll('.delete-menu-content, .playlist-selection-popup-menu').forEach(menu => {
            menu.style.display = 'none';
            menu.remove();
        });
    }

    enableUnifiedElements() {
        document.querySelectorAll('[data-requires-unified]').forEach(el => el.classList.add('unified-ready'));
        document.body.classList.remove('unified-loading');
    }

    enableDebugMode() {
        document.getElementById('unifiedDebugToggle')?.style.setProperty('display', 'block');
        document.getElementById('unifiedControls')?.style.setProperty('display', 'flex');
    }

    loadInitialData() {
        if (playlistsData.length === 0) {
            try {
                const savedPlaylists = localStorage.getItem('ytcm_playlists');
                if (savedPlaylists) {
                    const parsed = JSON.parse(savedPlaylists);
                    if (Array.isArray(parsed)) playlistsData = parsed;
                }
            } catch (e) {}
        }
    }

    saveData() {
        try {
            const playlistsToSave = playlistsData.filter(p => p.source !== 'youtube_library');
            localStorage.setItem('ytcm_playlists', JSON.stringify(playlistsToSave));
        } catch (e) {}
    }
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES
// =============================================

async function obtenerSegmentosSponsorBlock(videoId) {
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) return null;

    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; 
    const apiUrl = `https://yt-mix.netlify.app/.netlify/functions/sponsorblock?videoId=${videoId}`; 
    
    segmentosCache[videoId] = 'fetching';

    try {
        const response = await fetch(apiUrl, { headers: { 'X-UserID': userId } });
        if (!response.ok) throw new Error(`API SB Error: ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data)) return [];

        const validSegments = data.filter(segment => {
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') return false;
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);
            if (isNaN(start) || isNaN(end) || end < start) return false;
            return true;
        });

        segmentosCache[videoId] = validSegments; 
        return validSegments; 
    } catch (error) {
        segmentosCache[videoId] = null;
        return null; 
    }
}

function checkAndSkipSegment(player) {
    try {
        const currentTime = player.getCurrentTime();
        const videoId = player.getVideoData()?.video_id;

        if (!videoId || isNaN(currentTime) || currentTime < 0) return;

        const now = Date.now();
        if (lastSeekVideoId === videoId && lastSeekEndTime > 0 && Math.abs(currentTime - lastSeekEndTime) < 5) return;

        if (!segmentosCache[videoId]) {
            obtenerSegmentosSponsorBlock(videoId);
            return;
        }

        if (segmentosCache[videoId] === 'fetching') return;

        const segments = segmentosCache[videoId];
        if (!Array.isArray(segments) || segments.length === 0) return;

        const segmentToSkip = segments.find(segment => {
            if (!segment || typeof segment !== 'object') return false;
            let start, end;
            
            if (segment.segment && Array.isArray(segment.segment)) {
                start = segment.segment[0];
                end = segment.segment[1];
            } else if (segment.startTime !== undefined && segment.endTime !== undefined) {
                start = segment.startTime;
                end = segment.endTime;
            } else {
                return false;
            }
            
            if (segment.category === 'music_offtopic') {
                const duration = end - start;
                if (duration < 4) return false;
                return currentTime >= start && currentTime < (end - 0.5);
            }
            return false;
        });

        if (segmentToSkip) {
            let skipToTime;
            if (segmentToSkip.segment && Array.isArray(segmentToSkip.segment)) {
                skipToTime = segmentToSkip.segment[1];
            } else if (segmentToSkip.endTime !== undefined) {
                skipToTime = segmentToSkip.endTime;
            }
            
            if (!skipToTime || typeof skipToTime !== 'number' || isNaN(skipToTime)) return;
            if (skipToTime <= currentTime) return;
            
            const segmentDuration = skipToTime - currentTime;
            lastSeekVideoId = videoId;
            lastSeekEndTime = skipToTime;
            
            try {
                player.seekTo(skipToTime, true);
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(`⏭️ Intro/outro saltado (${segmentDuration.toFixed(0)}s)`, 'info', 2000);
                }
            } catch (seekError) {
                lastSeekVideoId = null;
                lastSeekEndTime = -1;
            }
        }
    } catch (error) {}
}

function monitorPlayers() {
    if (!playersInitialized || !reproduccionIniciada) return;

    try {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (!activePlayer?.getPlayerState) return;

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        if (playerState !== YT.PlayerState.PLAYING) return;
        if (isNaN(currentTime) || currentTime < 0 || videoDuration <= 0) return;
        if (!videoId) return;

        let totalSponsorBlockDuration = 0;
        if (segmentosCache[videoId] && Array.isArray(segmentosCache[videoId])) {
            totalSponsorBlockDuration = segmentosCache[videoId]
                .filter(s => s.category === 'music_offtopic')
                .reduce((sum, s) => {
                    const start = s.segment?.[0] ?? s.startTime;
                    const end = s.segment?.[1] ?? s.endTime;
                    return sum + (end - start);
                }, 0);
        }

        const API_BUFFER = 1; 
        const SAFETY_MARGIN = 0.5; 
        const totalAdjustment = CROSSFADE_DURATION + API_BUFFER + SAFETY_MARGIN;
        const triggerTime = videoDuration - (totalAdjustment + totalSponsorBlockDuration);
        
        if (currentTime > 0) checkAndSkipSegment(activePlayer);

        if (currentTime >= triggerTime && 
            !hasOutroCrossfadeStarted && 
            !isTransitioning && 
            !crossfadeInProgress &&
            !nextVideoScheduled) { 
            
            hasOutroCrossfadeStarted = true;
            nextVideoScheduled = true;
            
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }
        
            if (window.applyCrossfadeVisualEffect) window.applyCrossfadeVisualEffect();
            
            document.dispatchEvent(new CustomEvent('crossfadeTriggered', {
                detail: { currentTime, triggerTime, videoDuration }
            }));
            
            if (window.unifiedCore?.playNextVideo) {
                setTimeout(() => window.unifiedCore.playNextVideo(), 100);
            }
        }
    } catch (error) {}
}

function calculateCrossfadeTriggerTime(videoDuration, videoId) {
    const API_BUFFER = 1;
    const SAFETY_MARGIN = 0.5;
    let totalSponsorBlockDuration = 0;
    
    if (videoId && segmentosCache[videoId] && Array.isArray(segmentosCache[videoId])) {
        totalSponsorBlockDuration = segmentosCache[videoId]
            .filter(s => s.category === 'music_offtopic')
            .reduce((sum, s) => {
                const start = s.segment?.[0] ?? s.startTime;
                const end = s.segment?.[1] ?? s.endTime;
                return sum + (end - start);
            }, 0);
    }
    const effectiveVideoDuration = videoDuration - totalSponsorBlockDuration;
    const totalAdjustment = CROSSFADE_DURATION + API_BUFFER + SAFETY_MARGIN;
    return effectiveVideoDuration - totalAdjustment;
}

window.reloadSponsorBlockSegments = function(videoId) {
    if (!videoId) {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        videoId = activePlayer?.getVideoData()?.video_id;
    }
    if (!videoId) return;
    delete segmentosCache[videoId];
    obtenerSegmentosSponsorBlock(videoId);
};

window.savePlaylistsDataPersistent = savePlaylistsDataPersistent;
window.loadPlaylistsDataPersistent = loadPlaylistsDataPersistent;
window.loadQueuePersistent = loadQueuePersistent;
window.saveQueuePersistent = saveQueuePersistent;

window.debugUnified = function() {
    console.log('🐛 Estado del Sistema Unificado:', {
        unifiedState,
        playlistsData,
        currentPlayingInfo,
        playersInitialized,
        reproduccionIniciada,
        crossfadeInProgress,
        segmentosCache
    });
};

window.resetUnified = function() {
    if (confirm('¿Resetear completamente el sistema?')) {
        localStorage.removeItem('ytcm_playlists');
        localStorage.removeItem('ytcm_debug');
        localStorage.removeItem('google_token');
        segmentosCache = {}; 
        location.reload();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 DOM cargado, iniciando Sistema Unificado...');
    window.unifiedCore = new UnifiedCore();
    window.unifiedStateManager = window.unifiedCore;
    
    setInterval(() => {
        if (window.unifiedCore?.state?.initialized) window.unifiedCore.saveData();
    }, 30000); 
    
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        localStorage.setItem('ytcm_debug', 'true');
        setTimeout(() => window.unifiedCore?.enableDebugMode(), 1000);
    }
    
    // Extender UnifiedCore para añadir video después
    if (window.UnifiedCore && window.UnifiedCore.prototype) {
        window.UnifiedCore.prototype.addVideoToQueueAfterCurrent = async function(videoData) {
            if (!videoData || !videoData.videoId) {
                this.showMessage('Error: Video inválido', 'error');
                return;
            }

            let queuePlaylist = playlistsData.find(p => p.id === 'queue');
            if (!queuePlaylist) {
                queuePlaylist = {
                    id: 'queue',
                    name: 'Cola de Reproducción',
                    thumbnailUrl: './electronic.ico',
                    videos: [],
                    isExpanded: true,
                    isQueue: true
                };
                playlistsData.unshift(queuePlaylist);
            }

            const isDuplicate = queuePlaylist.videos.some(v => v.videoId === videoData.videoId);
            if (isDuplicate) {
                this.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
                return;
            }

            let duration = videoData.duration || 0;
            if (!duration && videoData.videoId && window.isAuthorized) {
                try {
                    const durations = await this.getBatchVideoDurations([videoData.videoId]);
                    duration = durations[videoData.videoId] || 0;
                } catch (error) {}
            }

            const videoObject = {
                videoId: videoData.videoId,
                title: videoData.title || "Título no disponible",
                thumbnail: videoData.thumbnail || './electronic.ico',
                duration: duration,
                uploaderName: videoData.uploaderName || videoData.author || 'Desconocido',
                author: videoData.author || videoData.uploaderName || 'Desconocido',
                sourcePlaylistId: 'queue'
            };

            const currentIndex = currentPlayingInfo.flattenedIndex;
            if (currentIndex >= 0 && currentIndex < queuePlaylist.videos.length) {
                queuePlaylist.videos.splice(currentIndex + 1, 0, videoObject);
                this.showMessage(`Añadido después de la canción actual: ${videoObject.title}`, 'success');
            } else {
                queuePlaylist.videos.push(videoObject);
                this.showMessage(`Añadido a cola: ${videoObject.title}`, 'success');
            }
            
            this.updatePlaylistsUI();
            this.enablePlayButton();
            setTimeout(() => saveAllData(), 500);
        };
    }
});

window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        if (window.unifiedCore) {
            window.unifiedCore.updatePlaylistsUI();
            window.unifiedCore.updateNowPlaying();
        }
        setTimeout(() => {
            if (window.updateAuthUI) window.updateAuthUI();
        }, 100);
    }, 300);
});

window.addEventListener('beforeunload', () => {
    if (window.unifiedCore?.state?.initialized) {
        window.unifiedCore.saveData();
        window.unifiedCore.stopMonitoring();
    }
    if (crossfadeInterval) clearInterval(crossfadeInterval);
    if (monitorInterval) clearInterval(monitorInterval);
});

window.UnifiedCore = UnifiedCore;
