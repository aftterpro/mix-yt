console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const CONFIG = {
    CROSSFADE_DURATION: 10,
    MONITOR_INTERVAL: 500,
    DEBOUNCE_DELAY: 1500,
    PRELOAD_THRESHOLD: 15
};
let lastLogTime = -1;
window.currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

let player1, player2;
let currentPlayer = 1;
let monitorInterval = null;
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

// Variables para búsqueda y scroll infinito
let isLoadingMore = false;
let nextPageContext = null;
let currentSearchQuery = '';
let searchScrollObserver = null;

let lastSeekEndTime = -1;
let lastSeekVideoId = null;

// ==========================================
// VARIABLES GLOBALES Y CACHÉ OPTIMIZADA
// ==========================================
window.player1 = null;
window.player2 = null;
window.currentPlayer = 1;
window.reproduccionIniciada = false;
window.monitorInterval = null; 
// Variable de estado para el preload
let isNextVideoPreloaded = false;

let segmentosCache = {};
const PIPED__BLOCK_URL = 'https://api.piped.private.coffee/s/';

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
 const container = document.getElementById('searchResults');
// =============================================
// SISTEMA UNIFICADO - CORE
// =============================================

function saveAllData() {
    try {
   
        let dataToSave = [];
        
        if (window.playlistManager && window.playlistManager.playlistsData) {
            dataToSave = window.playlistManager.playlistsData;
        } else if (window.unifiedCore && window.unifiedCore.playlistsData) {
            dataToSave = window.unifiedCore.playlistsData;
        }

        if (typeof savePlaylistsDataPersistent === 'function') {
            const playlistsToSave = dataToSave.filter(p => p.source !== 'youtube_library');
            savePlaylistsDataPersistent(playlistsToSave);
        }
        console.log(`💾 Datos guardados automáticamente (${dataToSave.length} playlists)`);
    } catch (error) {
        console.error('❌ Error en guardado automático:', error);
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
        console.log('🚀 Inicializando UnifiedCore...');
        
        // =============================================
        // ESTADO INTERNO
        // =============================================
        this.state = {
            initialized: false,
            currentView: 'home',
            debugMode: false,
            authReady: false,
            playersReady: false,
            shuffleEnabled: false,
            repeatEnabled: false,
            reproduccionIniciada: false,
            isTransitioning: false,
            hasOutroCrossfadeStarted: false,
            nextVideoScheduled: false,
            isNextVideoPreloaded: false,
            currentPlayingInfo: {
                flattenedIndex: -1,
                videoId: null,
                playlistId: null
            }
        };
        
        // =============================================
        // VISTAS DISPONIBLES
        // =============================================
        this.views = ['home', 'search', 'library', 'playing', 'fullPlayer'];
        this.currentView = 'home';
        
        // =============================================
        // DEBUG MODE
        // =============================================
        this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
        
        // =============================================
        // DATA DE PLAYLISTS
        // =============================================
        this.playlistsData = [];
        window.playlistsData = this.playlistsData; // Compatibilidad
        
        // =============================================
        // REPRODUCTORES (NO EN WINDOW)
        // =============================================
        this.players = {
            player1: null,
            player2: null,
            current: 1
        };
        
        // =============================================
        // MONITORING
        // =============================================
        this.monitorInterval = null;
        
        // =============================================
        // PLAYBACK LOCK (SEMÁFORO)
        // =============================================
        this.playbackLock = {
            active: false,
            lastCall: 0,
            cooldown: 1500
        };
        
        // =============================================
        // CACHÉ DE PLAYLIST APLANADA
        // =============================================
        this._flattenedCache = {
            data: null,
            hash: null,
            timestamp: 0,
            ttl: 5000 // 5 segundos
        };
        
        // =============================================
        // MANAGERS Y HELPERS
        // =============================================
        
        // UI Manager
        this.ui = window.uiManager;
        
        // ✅ SEARCH MANAGER (Delega búsqueda a youtube-client.js)
        this.searchManager = {
            currentQuery: '',
            nextPageToken: null,
            isLoadingMore: false,
            scrollObserver: null,
            
            // Delegar a youtube-client.js
            performSearch: async (query, continuation = null) => {
                return this.performSearch(query, continuation);
            },
            
            setupInfiniteScroll: (container) => {
                return this.setupInfiniteScroll(container);
            }
        };
        
        // Scroll Observer
        this.scrollObserver = null;
        this.miniPlayerObserver = null;
        
        // =============================================
        // TIMERS Y TIMEOUTS
        // =============================================
        this.saveInterval = null;
        this.resizeTimeout = null;
        this._saveTimeout = null;
        
        // =============================================
        // EVENT HANDLERS (BINDEADOS)
        // =============================================
        this.boundResizeHandler = this.handleResize.bind(this);
        this.boundBeforeUnload = this.handleBeforeUnload.bind(this);
        
        // ✅ REMOVER LISTENERS EXISTENTES (evitar duplicados)
        window.removeEventListener('resize', this.boundResizeHandler);
        window.removeEventListener('beforeunload', this.boundBeforeUnload);
        
        // ✅ AÑADIR LISTENERS LIMPIOS
        window.addEventListener('resize', this.boundResizeHandler);
        window.addEventListener('beforeunload', this.boundBeforeUnload);
        
        // =============================================
        // CONFIGURACIÓN
        // =============================================
        this.config = {
            crossfadeDuration: config?.crossfadeDuration || 10,
            monitorInterval: config?.monitorInterval || 500,
            preloadThreshold: config?.preloadThreshold || 15,
            ...config
        };
        
        // Exponer configuración globalmente
        window.CROSSFADE_DURATION = this.config.crossfadeDuration;
        
        // =============================================
        // COMPATIBILIDAD TEMPORAL (DEPRECATED)
        // =============================================
        this.exposeGlobally();
        
        // =============================================
        // INICIALIZACIÓN
        // =============================================
        this.init();
        this.setupAutomaticSaving();
        this.setupPlayerContainerHandlers();
    }
 exposeGlobally() {
        // ✅ UN SOLO OBJETO GLOBAL
        window.App = {
            core: this,
            
            // Funciones públicas
            switchView: (view) => this.switchView(view),
            playNextVideo: () => this.playNextVideo(),
            addVideoToQueue: (video) => this.addVideoToQueue(video),
            
            // Getters
            get currentPlayer() {
                return this.players.current;
            },
            get isPlaying() {
                return this.state.reproduccionIniciada;
            },
            get currentView() {
                return this.currentView;
            }
        };
        
        // ✅ COMPATIBILIDAD TEMPORAL (marcar como deprecated)
        window.unifiedCore = this;
        window.currentPlayer = this.players.current;
        window.reproduccionIniciada = this.state.reproduccionIniciada;
        window.currentPlayingInfo = this.state.currentPlayingInfo;
        
        // ✅ ADVERTENCIA EN CONSOLA (solo una vez)
        if (!window._deprecationWarningShown) {
            console.warn(
                '%c⚠️ DEPRECATED',
                'color: orange; font-weight: bold;',
                'window.unifiedCore, window.currentPlayer están deprecated. Usa window.App en su lugar.'
            );
            window._deprecationWarningShown = true;
        }
    }
handleResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
        // ✅ CORRECCIÓN: Solo actuar si el reproductor está visible
        if (!window.reproduccionIniciada) return;
        
        if (window.unifiedCore) {
            if (window.unifiedCore.currentView === 'fullPlayer') {
                window.unifiedCore.updatePlayerPosition('videoWrapper');
            } else if (window.reproduccionIniciada) {
                // ✅ NO hacer nada - el mini player se maneja automáticamente con CSS
                console.log('🔄 Resize detectado (mini player)');
            }
        }
    }, 300);
}
    handleBeforeUnload() {
        console.log('🚪 Cerrando aplicación, limpiando recursos...');
        
        // 1. Guardar datos
        if (this.state?.initialized) {
            try {
                this.saveData();
            } catch (e) {
                console.warn('⚠️ Error en saveData:', e);
            }
        }
        
        // 2. Desconectar observers
        if (this.searchScrollObserver) {
            try {
                this.searchScrollObserver.disconnect();
                this.searchScrollObserver = null;
            } catch (e) {}
        }
        
        if (this.miniPlayerObserver) {
            try {
                this.miniPlayerObserver.disconnect();
                this.miniPlayerObserver = null;
            } catch (e) {}
        }
        
        // 3. Limpiar intervals
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
        
        if (crossfadeInterval) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;
        }
        
        if (window.monitorInterval) {
            clearInterval(window.monitorInterval);
            window.monitorInterval = null;
        }
        
        // 4. Detener sincronización de letras
        if (window.playlistManager?.lyricsSyncInterval) {
            clearInterval(window.playlistManager.lyricsSyncInterval);
            window.playlistManager.lyricsSyncInterval = null;
        }
        
        // 5. Detener reproductores
        try {
            if (window.player1?.stopVideo) window.player1.stopVideo();
            if (window.player2?.stopVideo) window.player2.stopVideo();
        } catch (e) {}
        
        // 6. Remover event listeners
        window.removeEventListener('resize', this.boundResizeHandler);
        window.removeEventListener('beforeunload', this.boundBeforeUnload);
        
        console.log('✅ Recursos limpiados correctamente');
    }
    setupAutomaticSaving() {
        this.saveInterval = setInterval(() => {
            if (this.state.initialized) {
                saveAllData();
            }
        }, 60000);
        
        console.log('💾 Guardado automático configurado (cada 60s)');
    }
async init() {
    console.log('🚀 Inicializando Sistema Unificado (Modo Optimizado)...');
    
    // 1. INMEDIATO: Habilitar elementos visuales y eventos
    this.enableUnifiedElements(); 
    this.setupEventListeners();
    
    // 2. CARGA DE DATOS: Recuperar playlists y cola del almacenamiento
    this.loadInitialData();
    
    // 3. INICIALIZAR UI VISUALMENTE (¡Antes de conectar APIs!)
    this.initializeUI(); 
    
    // 4. Intentar inicializar gestor de playlists
    await this.initializePlaylistManager();
    
    // 5. SEGUNDO PLANO: Conectar con YouTube y APIs
    this.updateStatusIndicator('Conectando servicios...', 'loading');
    this.setupControlButtons();
    this.setupProgressBar(); 
    try {
        // ✅ CORRECCIÓN: ESPERAR a que las APIs se inicialicen
        await this.initializeComponents();
        
        console.log('✅ APIs conectadas correctamente');
        this.updateStatusIndicator('Sistema Listo', 'success');
        this.state.initialized = true;
        
        // Procesar cosas pendientes
        if (window.pendingYouTubePlaylists) {
            this.processYouTubePlaylists(window.pendingYouTubePlaylists);
            window.pendingYouTubePlaylists = null;
        }
        
    } catch (error) {
        console.error('❌ Error inicializando componentes:', error);
        this.updateStatusIndicator('Error en sistema', 'error');
    }

    // 6. CONFIGURACIÓN FINAL (después de todo lo demás)
    requestAnimationFrame(() => {
        setTimeout(() => {
            this.setupSearchButtonListeners();
            this.setupMiniPlayerObserver();
            this.checkAndShowMiniPlayer();
            this.updatePlaylistsUI();
        }, 100);
    });

    // Listeners de redimensionamiento
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
        setTimeout(() => this.checkAndShowMiniPlayer(), 300);
        if (e.detail === 'fullPlayer') {
             requestAnimationFrame(() => this.movePlayerToFullView());
        }
    });

    document.addEventListener('playbackStarted', () => {
        setTimeout(() => this.checkAndShowMiniPlayer(), 500);
    });

    console.log('⚡ Sistema inicializado correctamente');
}
/**
 * Resetear todas las banderas de crossfade
 */
resetCrossfadeFlags() {
    console.log('🔄 Reseteando banderas de crossfade');
        this.state.hasOutroCrossfadeStarted = false;
        this.state.nextVideoScheduled = false;
        this.state.isTransitioning = false;
        this.state.isNextVideoPreloaded = false;
    
    if (this.pendingCrossfade) {
        this.pendingCrossfade.active = false;
        this.pendingCrossfade = null;  
      }
} 
/**
 * Manejar error de reproducción con recuperación
 */
handlePlaybackError(error, context = 'unknown') {
    console.error(`❌ Error de reproducción (${context}):`, error);
    
    this.resetCrossfadeFlags();
    
    if (reproduccionIniciada && !monitorInterval) {
        playNextVideo();
    }
    
    this.showMessage(`Error de reproducción: ${error.message || 'desconocido'}`, 'error');
    
    return false;
}
cleanupView(viewName) {
    console.log(`🧹 Limpiando recursos: ${viewName}`);
    
    if (viewName !== 'search') {
        // Limpiar sentinel
        const sentinel = document.getElementById('search-sentinel');
        if (sentinel) sentinel.remove();
        
        // Desconectar observador de forma segura
        if (this.searchScrollObserver) {
            try {
                this.searchScrollObserver.disconnect();
            } catch (e) {
                console.warn('⚠️ Error en cleanup:', e);
            } finally {
                this.searchScrollObserver = null;
            }
        }
    }
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
        // 1. Esperar a que las APIs de Google/YouTube estén listas (si no lo están ya)
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
                // Timeout de seguridad de 10 segundos
                setTimeout(resolve, 10000);
            });
        }
        
        // 2. Inicializar los reproductores de YouTube (Iframe API)
        await this.initializeYouTubeAPI();
        
        // 3. Configurar autenticación
        this.initializeAuth();
        
        // ❌ BORRADO: this.initializeUI(); 
        // Ya no lo llamamos aquí porque lo movimos al inicio de init() 
        // para que la carga visual sea instantánea.
        
        return true;
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
    const playerConfig = {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: { 
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1
        },
        events: {
            onReady: (e) => this.onPlayerReady(e),
            onStateChange: (e) => this.onPlayerStateChange(e),
            onError: (e) => this.onPlayerError(e)
        }
    };
    
    // ✅ Guardar en instancia, no en window
    this.players.player1 = new YT.Player('player1', playerConfig);
    this.players.player2 = new YT.Player('player2', playerConfig);
    
    // ✅ Solo para compatibilidad (temporal)
    window.player1 = this.players.player1;
    window.player2 = this.players.player2;
}
    onPlayerReady(event) {
    console.log('✅ Reproductor listo');
    
    const playerId = event.target.getIframe().id;
    const playerDiv = document.getElementById(playerId);
    
    if (playerDiv) {
        // ✅ Forzar visibilidad inmediata
        playerDiv.style.display = 'block';
        playerDiv.style.visibility = 'visible';
        playerDiv.style.opacity = '1';
        playerDiv.classList.remove('hidden');
        
        // ✅ Asegurar que el iframe dentro también esté visible
        const iframe = playerDiv.querySelector('iframe');
        if (iframe) {
            iframe.style.cssText = `
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                display: block !important;
                visibility: visible !important;
            `;
        }
    }
    
    // Verificar si ambos players están listos
    if (window.player1 && window.player2) {
        window.playersInitialized = true;
        this.state.playersReady = true;
        window.currentPlayer = window.currentPlayer || 1;
        this.updatePlayersStatus('Reproductores listos');
        this.enablePlayButton();
        
        console.log('✅ Ambos reproductores listos y visibles');
    }
}

onPlayerStateChange(event) {
    try {
        // ✅ VALIDAR QUE EL PLAYER ESTÉ EN EL DOM
        const iframe = event.target.getIframe();
        if (!iframe || !document.body.contains(iframe)) {
            console.warn('⚠️ Player no está en el DOM, ignorando evento');
            return;
        }
        
        const playerElement = iframe.closest('.video-player');
        const playerNum = playerElement?.id === 'player1' ? 1 : 2;
        const state = event.data;
        
        console.log(`🎬 Player${playerNum} cambió a estado: ${this.getStateName(state)}`);
        
        if (state === YT.PlayerState.PLAYING) {
            // Solo iniciar monitor si es el player activo
            if (playerNum === window.currentPlayer && !monitorInterval && window.reproduccionIniciada) {
                console.log('✅ Reiniciando monitor desde onPlayerStateChange');
                monitorInterval = setInterval(monitorPlayers, 500);
            }
        }
        
        if (state === YT.PlayerState.PAUSED) {
            console.log(`⏸️ Player${playerNum} pausado`);
        }
        
        if (state === YT.PlayerState.BUFFERING) {
            console.log(`⏳ Player${playerNum} buffering...`);
        }
        
    } catch (error) {
        console.error('❌ Error en onPlayerStateChange:', error);
    }
}

// Función helper para nombres de estados
getStateName(state) {
    const states = {
        '-1': 'UNSTARTED',
        '0': 'ENDED',
        '1': 'PLAYING',
        '2': 'PAUSED',
        '3': 'BUFFERING',
        '5': 'CUED'
    };
    return states[state] || 'UNKNOWN';
}
addToQueue(videoObject) {
        // Asegurar estructura del objeto
        const queueItem = {
            videoId: videoObject.videoId || videoObject.id, // Compatibilidad
            title: videoObject.title,
            artist: videoObject.artist || videoObject.uploaderName || 'Desconocido',
            thumbnail: videoObject.thumbnail || videoObject.thumbnailUrl,
            duration: videoObject.duration,
            source: 'queue' // Marcamos que viene manual
        };

        // Buscar la playlist 'queue'
        const queuePlaylist = this.playlistsData.find(p => p.id === 'queue');
        
        if (queuePlaylist) {
            queuePlaylist.videos.push(queueItem);
            
            // Actualizar UI
            this.ui.showMessage(`Añadido a cola: ${queueItem.title}`, 'success');
            this.ui.updateQueueCount(queuePlaylist.videos.length);
            
            // Si tienes el PlaylistManager, decirle que actualice su vista también
            if (window.playlistManager) {
                window.playlistManager.updateQueueUI(); 
            }
        } else {
            console.error('❌ No se encontró la playlist de cola (queue)');
            // Crear si no existe (fallback)
            this.playlistsData.push({
                id: 'queue',
                name: 'Cola de Reproducción',
                videos: [queueItem]
            });
            this.ui.showMessage(`Cola creada y video añadido`, 'success');
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
    if (!this.playlistsData.some(p => p.id === 'queue')) {
        this.playlistsData.unshift({
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        });
    } else {
        const q = this.playlistsData.find(p => p.id === 'queue');
        if (q) {
            console.log('🧹 Limpiando cola de reproducción al iniciar...');
            q.videos = [];
        }
    }

    // Asegurar playlist manual
    if (!this.playlistsData.some(p => p.id === 'manual')) {
        this.playlistsData.push({
            id: 'manual',
            name: 'Mis Vídeos Añadidos',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true
        });
    }

    this.updateOverviewStats();
    this.updateQueueCount(0); 
    
    if (this.updatePersistentQueue) {
        this.updatePersistentQueue();
    }
}

 async initializePlaylistManager() {
    console.log("🔧 Inicializando playlist manager...");
    
    // ✅ CORRECCIÓN: Esperar activamente en lugar de timeout
    const waitForPlaylistManager = new Promise((resolve, reject) => {
        // Si ya existe, resolver inmediatamente
        if (typeof initializePlaylistManager === 'function') {
            resolve();
            return;
        }
        
        // Si no, esperar hasta 5 segundos
        const timeout = setTimeout(() => {
            reject(new Error('Timeout esperando initializePlaylistManager'));
        }, 5000);
        
        const interval = setInterval(() => {
            if (typeof initializePlaylistManager === 'function') {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
            }
        }, 100);
    });
    
    try {
        // ✅ ESPERAR a que la función esté disponible
        await waitForPlaylistManager;
        
        // Inicializar
        initializePlaylistManager(this);
        
        // Verificar que se creó correctamente
        if (window.playlistManager) {
            console.log("✅ Playlist manager inicializado correctamente");
            return true;
        } else {
            throw new Error('PlaylistManager no se creó correctamente');
        }
        
    } catch (error) {
        console.error("❌ No se pudo inicializar playlist manager:", error);
        this.showMessage("Funcionalidad de playlists limitada", 'warning');
        return false;
    }
}
updatePlayerPosition(targetContainerId) {
    console.log(`🎬 Moviendo reproductores a: ${targetContainerId}`);
    
    const activePlayerId = window.currentPlayer === 1 ? 'player1' : 'player2';
    const inactivePlayerId = window.currentPlayer === 1 ? 'player2' : 'player1';
    
    const activePlayer = document.getElementById(activePlayerId);
    const inactivePlayer = document.getElementById(inactivePlayerId);
    const targetContainer = document.getElementById(targetContainerId);
    
    if (!activePlayer || !targetContainer) {
        console.error('❌ No se encontraron elementos necesarios');
        return;
    }
    
    // Mover solo el reproductor activo
    if (activePlayer.parentNode !== targetContainer) {
        targetContainer.appendChild(activePlayer);
    }
    
    // Asegurar visibilidad del activo
    activePlayer.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 10 !important;
        background: #000 !important;
    `;
    
    // Ocultar el inactivo
    if (inactivePlayer) {
        inactivePlayer.style.cssText = `
            display: none !important;
            opacity: 0 !important;
            z-index: 0 !important;
        `;
    }
    
    console.log(`✅ Reproductor movido a ${targetContainerId}`);
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
    console.log('🎮 Configurando controles de reproducción...');
    
    // ===== PLAY/PAUSE =====
    const playButtons = ['botonPlay', 'miniPlayBtn'];
    playButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            // ✅ LIMPIAR: Clonar nodo para eliminar TODOS los listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // ✅ Añadir listener limpio
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('▶️ Click en Play/Pause');
                this.handlePlayPause();
            });
            
            console.log(`✅ Botón ${btnId} configurado`);
        }
    });
    
    // ===== NEXT =====
    const nextButtons = ['botonNext', 'miniNextBtn'];
    nextButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('⏭️ Click en Next');
                
                // ✅ DETENER MONITOR ANTES DE CAMBIAR
                if (monitorInterval) {
                    clearInterval(monitorInterval);
                    monitorInterval = null;
                    console.log('🛑 Monitor detenido por botón Next');
                }
                
                // ✅ SOLO LLAMAR A playNextVideo
                this.playNextVideo();
            });
            
            console.log(`✅ Botón ${btnId} configurado`);
        }
    });
    
    // ===== PREVIOUS =====
    const prevButtons = ['prevButton', 'miniPrevBtn'];
    prevButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('⏮️ Click en Previous');
                
                // ✅ DETENER MONITOR ANTES DE CAMBIAR
                if (monitorInterval) {
                    clearInterval(monitorInterval);
                    monitorInterval = null;
                    console.log('🛑 Monitor detenido por botón Previous');
                }
                
                this.handlePrevious();
            });
            
            // ✅ Deshabilitar si no hay videos
            const flatList = this.getFlattenedPlaylist();
            newBtn.disabled = flatList.length === 0;
            
            console.log(`✅ Botón ${btnId} configurado`);
        }
    });
    
    // ===== SHUFFLE =====
    const shuffleBtn = document.getElementById('shuffleBtn');
    if (shuffleBtn) {
        shuffleBtn.disabled = false;
        const newShuffleBtn = shuffleBtn.cloneNode(true);
        shuffleBtn.parentNode.replaceChild(newShuffleBtn, shuffleBtn);
        
        newShuffleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔀 Click en Shuffle');
            this.toggleShuffle();
        });
        
        console.log('✅ Botón Shuffle configurado');
    }
    
    // ===== REPEAT =====
    const repeatBtn = document.getElementById('repeatBtn');
    if (repeatBtn) {
        repeatBtn.disabled = false;
        const newRepeatBtn = repeatBtn.cloneNode(true);
        repeatBtn.parentNode.replaceChild(newRepeatBtn, repeatBtn);
        
        newRepeatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔁 Click en Repeat');
            this.toggleRepeat();
        });
        
        console.log('✅ Botón Repeat configurado');
    }
    
    console.log('✅ Controles configurados correctamente');
}
  setupSearch() {
    console.log('🔍 Configurando búsqueda...');
    
    const searchInputs = [
        document.getElementById('searchInput'),
        document.getElementById('sidebarSearchInput'),
        document.getElementById('mobileSearchInput')
    ].filter(Boolean);

    if (searchInputs.length === 0) {
        console.warn('⚠️ No se encontraron inputs de búsqueda');
        return;
    }

    const debouncedSearch = this.debounce((query) => {
        console.log(`🔎 Debounced search ejecutado: "${query}"`);
        
        // ✅ CORRECCIÓN: Cambiar a vista de búsqueda primero
        if (this.currentView !== 'search') {
            this.switchView('search');
        }
        
        // ✅ Esperar un tick para que el DOM se actualice
        setTimeout(() => {
            this.performSearch(query);
        }, 100);
    }, 800);

    searchInputs.forEach(input => {
        console.log(`✅ Configurando listener en: ${input.id}`);
        
        input.addEventListener('input', (event) => {
            const query = event.target.value.trim();
            
            if (query.length > 2) {
                console.log(`🔎 Input detectado: "${query}"`);
                debouncedSearch(query);
            } else if (query.length === 0) {
                // Limpiar resultados si se borra la búsqueda
                this.clearSearchResults();
            }
        });
        
        // ✅ AÑADIR: Listener para Enter
        input.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                const query = event.target.value.trim();
                if (query.length > 0) {
                    console.log(`⏎ Enter presionado: "${query}"`);
                    
                    if (this.currentView !== 'search') {
                        this.switchView('search');
                    }
                    
                    setTimeout(() => {
                        this.performSearch(query);
                    }, 100);
                }
            }
        });
    });
    
    console.log('✅ Búsqueda configurada correctamente');
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
        if (bottomPlayer.dataset.clickListenerAttached) return;
        
        // ✅ CORRECCIÓN: NO permitir click en la barra para abrir fullPlayer
        // Solo el botón mini-player-expand debe abrir el fullPlayer
        
        bottomPlayer.dataset.clickListenerAttached = "true";
        this.setupControlButtons();
        this.forceBottomPlayerVisible();
    }
}

  // Fuerza la visibilidad si algo falla
forceMiniPlayerVisibility() {
    this.ui.forceMiniPlayerVisibility();
}

setupSearchButtonListeners() {
    console.log('🔘 Configurando listeners de botones de búsqueda...');
    
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    // ✅ LIMPIAR LISTENER ANTERIOR con cloneNode
    const newSearchResults = searchResults.cloneNode(true);
    searchResults.parentNode.replaceChild(newSearchResults, searchResults);
    const freshSearchResults = document.getElementById('searchResults');
    
    // ✅ EVENT DELEGATION (más eficiente)
    freshSearchResults.addEventListener('click', async (e) => {
        const nextBtn = e.target.closest('.search-result-add-next-btn');
        if (!nextBtn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const videoId = nextBtn.dataset.videoId;
        if (!videoId || videoId === 'undefined') {
            this.showMessage('Error: Video inválido', 'error');
            return;
        }
        
        const videoData = {
            videoId: videoId,
            title: nextBtn.dataset.title,
            thumbnail: nextBtn.dataset.thumbnail,
            duration: parseInt(nextBtn.dataset.duration) || 0,
            uploaderName: nextBtn.dataset.artist,
            author: nextBtn.dataset.artist,
            artist: nextBtn.dataset.artist
        };
        
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
        
        try {
            // ✅ CORREGIDO: Usar el método correcto
            await this.addVideoToQueueAfterCurrent(videoData);
            
            nextBtn.innerHTML = '<i class="fas fa-check"></i> Añadido';
            nextBtn.style.background = '#4caf50';
            
            // ✅ SINCRONIZAR COLA INMEDIATAMENTE
            if (window.playlistManager) {
                window.playlistManager.updateQueueUI();
            }
            if (this.updatePersistentQueue) {
                this.updatePersistentQueue();
            }
            
            setTimeout(() => {
                nextBtn.innerHTML = '<i class="fas fa-forward"></i>';
                nextBtn.style.background = '';
                nextBtn.disabled = false;
                nextBtn.style.opacity = '1';
            }, 2000);
        } catch (error) {
            console.error('❌ Error:', error);
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            this.showMessage('Error añadiendo video', 'error');
        }
    });
    
    // ✅ BOTÓN "AÑADIR A COLA"
    freshSearchResults.addEventListener('click', async (e) => {
        const addBtn = e.target.closest('.add-to-queue-btn');
        if (!addBtn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const videoId = addBtn.dataset.videoId;
        if (!videoId || videoId === 'undefined') {
            this.showMessage('Error: Video inválido', 'error');
            return;
        }
        
        // Obtener datos del video desde el DOM
        const card = addBtn.closest('.search-result-card');
        const videoData = {
            videoId: videoId,
            title: card.querySelector('.search-result-title')?.textContent || 'Sin título',
            thumbnail: card.querySelector('.search-result-thumbnail img')?.src || './electronic.ico',
            duration: parseInt(card.querySelector('.search-result-duration')?.textContent) || 0,
            uploaderName: card.querySelector('.search-result-author')?.textContent || 'Desconocido',
            author: card.querySelector('.search-result-author')?.textContent || 'Desconocido',
            artist: card.querySelector('.search-result-author')?.textContent || 'Desconocido'
        };
        
        addBtn.disabled = true;
        const icon = addBtn.querySelector('i');
        icon.className = 'fas fa-spinner fa-spin';
        
        try {
            await this.addVideoToQueue(videoData);
            
            icon.className = 'fas fa-check';
            addBtn.style.background = '#4caf50';
            
            // ✅ SINCRONIZAR COLA
            if (window.playlistManager) {
                window.playlistManager.updateQueueUI();
            }
            if (this.updatePersistentQueue) {
                this.updatePersistentQueue();
            }
            
            setTimeout(() => {
                icon.className = 'fas fa-plus';
                addBtn.style.background = '';
                addBtn.disabled = false;
            }, 1500);
        } catch (error) {
            console.error('❌ Error:', error);
            icon.className = 'fas fa-times';
            addBtn.style.background = '#f44336';
            
            setTimeout(() => {
                icon.className = 'fas fa-plus';
                addBtn.style.background = '';
                addBtn.disabled = false;
            }, 1500);
        }
    });
    
    console.log('✅ Listeners configurados con event delegation');
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
            targetContainer = document.getElementById('fullVideoContainer') || document.getElementById('videoWrapper');
        } else if (target === 'mini') {
            targetContainer = document.getElementById('miniPlayerContainer');
        }

        if (targetContainer) {
            targetContainer.appendChild(activePlayerElement);
            // Asegurar que el contenedor tenga posición relativa para que el absoluto funcione
            if (getComputedStyle(targetContainer).position === 'static') {
                 targetContainer.style.position = 'relative';
            }
            activePlayerElement.style.width = '100%';
            activePlayerElement.style.height = '400px';
            activePlayerElement.style.position = 'absolute';
            activePlayerElement.style.top = '0';
            activePlayerElement.style.left = '0';
            activePlayerElement.style.zIndex = '10'; // Asegurar que esté encima
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

    updateQueueCount(count) {
        const queueCountBadge = document.getElementById('queueCount');
        if (queueCountBadge) queueCountBadge.textContent = count;
    }
switchView(viewName) {
    const previousView = this.currentView;
    
    
    if (previousView && previousView !== viewName) {
        this.cleanupView(previousView);
    }
    
    this.currentView = viewName;
    this.ui.switchView(viewName);
    
    // ✅ DISPARAR EVENTO
    document.dispatchEvent(new CustomEvent('viewChanged', { 
        detail: { from: previousView, to: viewName } 
    }));
    
    console.log(`🔄 Vista cambiada: ${previousView} → ${viewName}`);
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
movePlayersToFullView() {
    console.log('🎬 Expandiendo a vista completa...');
    
    const persistentLayer = document.getElementById('persistent-player-layer');
    if (!persistentLayer) {
        console.error('❌ persistent-player-layer no encontrado');
        return;
    }
    
    const fullPlayerView = document.getElementById('fullPlayerView');
    const videoWrapper = fullPlayerView?.querySelector('.video-wrapper') || document.getElementById('videoWrapper');
    
    if (!videoWrapper) {
        console.error('❌ videoWrapper no encontrado');
        return;
    }
    
    // ✅ CRÍTICO: Bajar z-index para que la cola quede encima
    persistentLayer.style.zIndex = '55'; // MENOR que la cola (z-index: 100)
    
    // ✅ ANIMAR LA CAPA hacia el contenedor grande
    const wrapperRect = videoWrapper.getBoundingClientRect();
    
    persistentLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    persistentLayer.style.top = `${wrapperRect.top}px`;
    persistentLayer.style.left = `${wrapperRect.left}px`;
    persistentLayer.style.width = `${wrapperRect.width}px`;
    persistentLayer.style.height = `${wrapperRect.height}px`;
    persistentLayer.style.borderRadius = '0px';
    persistentLayer.style.opacity = '1';
    persistentLayer.style.pointerEvents = 'none'; // ✅ Desactivar clicks en la capa
    
    document.body.classList.remove('mini-player-active');
    
    console.log('✅ Player expandido con z-index:', persistentLayer.style.zIndex);
}
    
    movePlayerToFullView() {
        this.movePlayersToFullView(); // Usar la versión corregida arriba
    }
handlePlayPause() {
    console.log('🎮 handlePlayPause ejecutado');
    
    const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
    
    if (!activePlayer) {
        console.error('❌ Player no disponible');
        return;
    }
    
    try {
        const state = activePlayer.getPlayerState();
        
        // ✅ PRIMERA REPRODUCCIÓN
        if (!window.reproduccionIniciada) {
            console.log('🚀 Iniciando reproducción');
            
            const flatList = this.getFlattenedPlaylist();
            
            if (flatList.length === 0) {
                console.warn('📭 Cola vacía');
                this.showMessage('Agrega videos a la cola', 'info');
                return;
            }
            
            window.reproduccionIniciada = true;
            
            window.currentPlayingInfo = {
                flattenedIndex: -1,
                videoId: null,
                playlistId: null
            };
            
            // ✅ ACTUALIZAR BOTÓN ANTES de reproducir
            this.updatePlayButton('pause');
            
            this.playNextVideo();
            
            return;
        }
        
        // ✅ ALTERNAR PLAY/PAUSE
        if (state === YT.PlayerState.PLAYING) {
            console.log('⏸️ Pausando');
            activePlayer.pauseVideo();
            
            // Detener monitor
            if (window.monitorInterval) {
                clearInterval(window.monitorInterval);
                window.monitorInterval = null;
                console.log('🛑 Monitor detenido');
            }
            
            this.updatePlayButton('play');
            
        } else {
            console.log('▶️ Reanudando');
            activePlayer.playVideo();
            
            // Reiniciar monitor
            if (!window.monitorInterval) {
                window.monitorInterval = setInterval(monitorPlayers, 500);
                console.log('✅ Monitor reiniciado');
            }
            
            this.updatePlayButton('pause');
        }
        
    } catch (error) {
        console.error('❌ Error en handlePlayPause:', error);
        this.showMessage('Error al controlar reproducción', 'error');
    }
}

 handlePrevious() {
    console.log('⏮️ handlePrevious ejecutado');
    
    const flatList = this.getFlattenedPlaylist();
    
    if (flatList.length === 0) {
        console.warn('📭 No hay videos en la cola');
        return;
    }
    
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? 0;
    
    if (currentIndex <= 0) {
        console.log('🔄 Ya en el primer video');
        
        // Reiniciar el video actual
        const activePlayer = (window.currentPlayer === 1) ? player1 : player2;
        if (activePlayer) {
            activePlayer.seekTo(0);
        }
        
        return;
    }
    
    // ✅ RETROCEDER AL VIDEO ANTERIOR
    console.log(`⏮️ Retrocediendo de índice ${currentIndex} a ${currentIndex - 2}`);
    
    // Ajustar índice para que playNextVideo reproduzca el anterior
    window.currentPlayingInfo.flattenedIndex = currentIndex - 2;
    
    // ✅ ASEGURAR QUE EL MONITOR ESTÉ ACTIVO
    if (!monitorInterval && window.reproduccionIniciada) {
        monitorInterval = setInterval(monitorPlayers, 500);
        console.log('✅ Monitor reiniciado para Previous');
    }
    
    // Reproducir video anterior
    this.playNextVideo();
}
toggleShuffle() {
    this.state.shuffleEnabled = !this.state.shuffleEnabled;
    
    const btn = document.getElementById('shuffleBtn');
    if (btn) {
        btn.classList.toggle('active', this.state.shuffleEnabled);
        btn.style.color = this.state.shuffleEnabled ? 'var(--primary-color)' : '';
    }
    
    this.showMessage(
        this.state.shuffleEnabled ? '🔀 Aleatorio activado' : 'Aleatorio desactivado',
        'info'
    );
    
    console.log(`🔀 Shuffle: ${this.state.shuffleEnabled}`);
}

toggleRepeat() {
    this.state.repeatEnabled = !this.state.repeatEnabled;
    
    const btn = document.getElementById('repeatBtn');
    if (btn) {
        btn.classList.toggle('active', this.state.repeatEnabled);
        btn.style.color = this.state.repeatEnabled ? 'var(--primary-color)' : '';
    }
    
    this.showMessage(
        this.state.repeatEnabled ? '🔁 Repetir activado' : 'Repetir desactivado',
        'info'
    );
    
    console.log(`🔁 Repeat: ${this.state.repeatEnabled}`);
}
    setupProgressBar() {
    console.log('📊 Configurando barra de progreso...');
    
    const progressBar = document.querySelector('.progress-bar');
    if (!progressBar) {
        console.warn('⚠️ Barra de progreso no encontrada');
        return;
    }
    
    // Limpiar listener anterior
    const newProgressBar = progressBar.cloneNode(true);
    progressBar.parentNode.replaceChild(newProgressBar, progressBar);
    
    newProgressBar.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (!window.reproduccionIniciada) {
            console.log('⚠️ No hay reproducción activa');
            return;
        }
        
        const activePlayer = window.currentPlayer === 1 ? window.player1 : window.player2;
        if (!activePlayer || typeof activePlayer.getDuration !== 'function') {
            console.warn('⚠️ Player no disponible');
            return;
        }
        
        try {
            const duration = activePlayer.getDuration();
            if (!duration || duration === 0) return;
            
            const rect = newProgressBar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            const seekTime = duration * percentage;
            
            console.log(`⏩ Buscando: ${this.formatDuration(seekTime)}`);
            
            activePlayer.seekTo(seekTime, true);
            this.showMessage(`Buscando: ${this.formatDuration(seekTime)}`, 'info');
            
        } catch (error) {
            console.error('❌ Error en seek:', error);
        }
    });
    
    // Mostrar handle al hover
    newProgressBar.addEventListener('mouseenter', () => {
        newProgressBar.classList.add('hover');
    });
    
    newProgressBar.addEventListener('mouseleave', () => {
        newProgressBar.classList.remove('hover');
    });
    
    console.log('✅ Barra de progreso configurada');
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
        
        // ✅ VALIDAR COOLDOWN
        if (now - this.playbackLock.lastCall < this.playbackLock.cooldown) {
            console.log('⏸️ playNextVideo bloqueado (cooldown)');
            return;
        }
        
        // ✅ VALIDAR SEMÁFORO
        if (this.playbackLock.active) {
            console.log('⏸️ playNextVideo bloqueado (ya en curso)');
            return;
        }
        
        // ✅ ACTIVAR BLOQUEO
        this.playbackLock.active = true;
        this.playbackLock.lastCall = now;
        
        // ✅ Deshabilitar botón Next en UI
        const nextBtn = document.getElementById('botonNext');
        if (nextBtn) nextBtn.disabled = true;
        
        console.log('🎬 playNextVideo iniciado');
        
        try {
            // Detener monitor
            this.stopMonitoring();
            
            // Resetear banderas
            this.resetCrossfadeFlags();
            
            // Validar players
            if (!this.players.player1 || !this.players.player2) {
                throw new Error('Players no inicializados');
            }

            const currentFlatIndex = this.state.currentPlayingInfo?.flattenedIndex ?? -1;
            const flatList = this.getFlattenedPlaylist();

            if (flatList.length === 0) {
                throw new Error('Cola vacía');
            }

            // Calcular siguiente
            let nextIndex = currentFlatIndex + 1;
            
            if (nextIndex >= flatList.length) {
                if (this.state?.repeatEnabled) {
                    nextIndex = 0;
                } else {
                    this.handleEndOfPlaylist();
                    return;
                }
            }

            const nextVideo = flatList[nextIndex];
            if (!nextVideo?.videoId) {
                throw new Error('Video inválido');
            }

            console.log(`🎵 Siguiente: "${nextVideo.title}" (índice ${nextIndex})`);
            
            // Actualizar info global
            this.state.currentPlayingInfo = {
                flattenedIndex: nextIndex,
                videoId: nextVideo.videoId,
                playlistId: nextVideo.sourcePlaylistId
            };
            
            // Actualizar UI
            this.updateNowPlaying();
            
            // Determinar players
            const prevPlayerNum = this.players.current;
            const nextPlayerNum = this.players.current === 1 ? 2 : 1;
            
            const prevPlayerInstance = this.players[`player${prevPlayerNum}`];
            const nextPlayerInstance = this.players[`player${nextPlayerNum}`];
            
            const prevElement = document.getElementById(`player${prevPlayerNum}`);
            const nextElement = document.getElementById(`player${nextPlayerNum}`);

            // Cargar video
            nextPlayerInstance.cueVideoById({
                videoId: nextVideo.videoId,
                startSeconds: 0
            });
            
            // Esperar CUED
            await this.waitForPlayerState(nextPlayerInstance, YT.PlayerState.CUED, 3000);
            
            // Preparar elementos visuales
            if (nextElement && prevElement) {
                nextElement.style.cssText = `
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 0 !important;
                    z-index: 3 !important;
                    background: #000 !important;
                `;
                
                prevElement.style.cssText = `
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    z-index: 2 !important;
                    background: #000 !important;
                `;
                
                void nextElement.offsetHeight; // Force reflow
            }
            
            // Reproducir
            nextPlayerInstance.playVideo();
            
            // Esperar PLAYING
            await this.waitForPlayingState(nextPlayerInstance, 8000);
            
            // Crossfade visual
            if (nextElement && prevElement) {
                const duration = window.CROSSFADE_DURATION || 10;
                const transition = `opacity ${duration}s ease`;
                
                nextElement.style.transition = transition;
                prevElement.style.transition = transition;
                
                void nextElement.offsetHeight;
                
                requestAnimationFrame(() => {
                    nextElement.style.opacity = '1';
                    nextElement.style.zIndex = '10';
                    
                    prevElement.style.opacity = '0';
                    prevElement.style.zIndex = '1';
                });
            }
            
            // Crossfade audio
            await this.performAudioCrossfade(prevPlayerInstance, nextPlayerInstance);
            
            // Limpieza post-fade
            setTimeout(() => {
                try {
                    if (prevPlayerInstance?.stopVideo) {
                        prevPlayerInstance.stopVideo();
                        prevPlayerInstance.setVolume(0);
                    }
                    
                    if (nextPlayerInstance?.setVolume) {
                        nextPlayerInstance.setVolume(100);
                    }
                    
                    if (prevElement) {
                        prevElement.style.display = 'none';
                        prevElement.style.transition = '';
                    }
                    if (nextElement) {
                        nextElement.style.transition = '';
                    }
                } catch (e) {
                    console.warn('⚠️ Error en limpieza:', e);
                }
            }, (window.CROSSFADE_DURATION || 10) * 1000 + 500);
            
            // Cambiar player activo
            this.players.current = nextPlayerNum;
            
            // Actualizar botón
            this.updatePlayButton('pause');
            
            // Reiniciar monitor
            setTimeout(() => {
                this.startMonitoring();
            }, 1500);
            
            console.log(`✅ Crossfade completado a player${nextPlayerNum}`);

        } catch (error) {
            console.error("❌ Error en playNextVideo:", error);
            this.showMessage('Error al cambiar de pista', 'error');
            this.updatePlayButton('play');
            
        } finally {
            // ✅ LIBERAR BLOQUEO SIEMPRE
            this.playbackLock.active = false;
            
            // ✅ Rehabilitar botón Next
            const nextBtn = document.getElementById('botonNext');
            if (nextBtn) nextBtn.disabled = false;
        }
    }
async waitForPlayerState(playerInstance, targetState, maxWait = 3000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const checkState = () => {
            const elapsed = Date.now() - startTime;
            
            try {
                const state = playerInstance.getPlayerState();
                
                if (state === targetState) {
                    console.log('✅ Player alcanzó estado objetivo');
                    resolve();
                    return;
                }
                
                if (elapsed < maxWait) {
                    setTimeout(checkState, 100);
                } else {
                    console.warn('⏰ Timeout esperando estado del player');
                    resolve();
                }
            } catch (e) {
                setTimeout(checkState, 100);
            }
        };
        
        checkState();
    });
}

async waitForPlayingState(playerInstance, maxWait = 5000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let attempts = 0;
        let hasResolved = false; // ✅ Prevenir resolución múltiple
        
        const checkState = () => {
            if (hasResolved) return; // ✅ Ya resuelto, no hacer nada
            
            const elapsed = Date.now() - startTime;
            attempts++;
            
            try {
                const state = playerInstance.getPlayerState();
                
                console.log(`🔍 Intento ${attempts}: Estado ${this.getStateName(state)}`);
                
                // ✅ ÉXITO: El player está reproduciendo
                if (state === YT.PlayerState.PLAYING) {
                    console.log('✅ Player comenzó a reproducir');
                    hasResolved = true;
                    resolve(true);
                    return;
                }
                
                // ✅ CONTINUAR SI ESTÁ BUFFERING (normal)
                if (state === YT.PlayerState.BUFFERING) {
                    if (elapsed < maxWait) {
                        setTimeout(checkState, 200);
                    } else {
                        console.warn('⏰ Timeout buffering - Forzando continuación');
                        hasResolved = true;
                        resolve(true);
                    }
                    return;
                }
                
                // ✅ SI ESTÁ CUED, INTENTAR FORZAR PLAY
                if (state === YT.PlayerState.CUED && attempts > 5) {
                    console.log('🔄 Player en CUED, intentando forzar reproducción...');
                    try {
                        playerInstance.playVideo();
                    } catch (e) {
                        console.warn('⚠️ Error forzando play:', e);
                    }
                }
                
                // ✅ REINTENTAR SI ESTÁ EN OTROS ESTADOS
                if (elapsed < maxWait) {
                    setTimeout(checkState, 200);
                } else {
                    console.warn('⏰ Timeout - Continuando de todas formas');
                    hasResolved = true;
                    resolve(true);
                }
            } catch (e) {
                if (elapsed < maxWait) {
                    setTimeout(checkState, 200);
                } else {
                    console.error('❌ Error esperando estado PLAYING:', e);
                    hasResolved = true;
                    resolve(true);
                }
            }
        };
        
        checkState();
    });
}
async performAudioCrossfade(prevPlayer, nextPlayer) {
    return new Promise((resolve, reject) => {
        // ✅ VALIDACIONES INICIALES
        if (!prevPlayer && !nextPlayer) {
            console.warn('⚠️ No hay players para crossfade');
            resolve();
            return;
        }
        
        const fadeSteps = 20;
        const crossfadeDuration = window.CROSSFADE_DURATION || 10;
        const fadeInterval = (crossfadeDuration * 1000) / fadeSteps;
        let step = 0;
        let audioFade = null;
        
        // ✅ VALIDAR QUE AMBOS PLAYERS TIENEN setVolume
        const prevHasVolume = prevPlayer && typeof prevPlayer.setVolume === 'function';
        const nextHasVolume = nextPlayer && typeof nextPlayer.setVolume === 'function';
        
        if (!prevHasVolume && !nextHasVolume) {
            console.warn('⚠️ Ningún player tiene método setVolume');
            resolve();
            return;
        }
        
        console.log(`🎚️ Iniciando crossfade de audio (${crossfadeDuration}s, ${fadeSteps} pasos)`);
        
        try {
            audioFade = setInterval(() => {
                step++;
                const progress = step / fadeSteps;
                
                const prevVolume = Math.round(100 * (1 - progress));
                const nextVolume = Math.round(100 * progress);
                
                // ✅ AJUSTAR VOLÚMENES CON VALIDACIÓN
                try {
                    if (prevHasVolume && prevVolume >= 0) {
                        prevPlayer.setVolume(prevVolume);
                    }
                } catch (e) {
                    console.warn('⚠️ Error ajustando volumen prevPlayer:', e);
                }
                
                try {
                    if (nextHasVolume && nextVolume >= 0) {
                        nextPlayer.setVolume(nextVolume);
                    }
                } catch (e) {
                    console.warn('⚠️ Error ajustando volumen nextPlayer:', e);
                }
                
                // Log cada 5 pasos
                if (step % 5 === 0) {
                    console.log(`🎚️ Crossfade: Prev ${prevVolume}% | Next ${nextVolume}%`);
                }
                
                // ✅ FINALIZAR
                if (step >= fadeSteps) {
                    clearInterval(audioFade);
                    
                    // ✅ ASEGURAR VOLÚMENES FINALES
                    try {
                        if (prevHasVolume) prevPlayer.setVolume(0);
                        if (nextHasVolume) nextPlayer.setVolume(100);
                    } catch (e) {
                        console.warn('⚠️ Error en volúmenes finales:', e);
                    }
                    
                    console.log('✅ Crossfade de audio completado');
                    resolve();
                }
            }, fadeInterval);
            
            // ✅ TIMEOUT DE SEGURIDAD
            setTimeout(() => {
                if (audioFade) {
                    clearInterval(audioFade);
                    console.warn('⏰ Crossfade timeout, forzando finalización');
                    
                    try {
                        if (prevHasVolume) prevPlayer.setVolume(0);
                        if (nextHasVolume) nextPlayer.setVolume(100);
                    } catch (e) {}
                    
                    resolve();
                }
            }, (crossfadeDuration * 1000) + 2000);
            
        } catch (error) {
            console.error('❌ Error en performAudioCrossfade:', error);
            if (audioFade) clearInterval(audioFade);
            resolve(); // ✅ Resolver en vez de rechazar
        }
    });
}
    // ==========================================
    // FUNCIONES DE BÚSQUEDA Y SCROLL INFINITO
    // ==========================================
async performSearch(query, continuation = null) {
        if (!query || typeof query !== 'string' || query.trim() === '') {
            console.error('❌ Query inválido');
            return;
        }
        
        const trimmedQuery = query.trim();
        this.searchManager.currentQuery = trimmedQuery;
        
        const container = document.getElementById('searchResults');
        if (!container) {
            console.error('❌ searchResults no encontrado');
            return;
        }
        
        // ✅ CAMBIAR A VISTA DE BÚSQUEDA SI NO ESTAMOS AHÍ
        if (this.currentView !== 'search') {
            this.switchView('search');
        }
        
        // Limpiar si es nueva búsqueda
        if (!continuation) {
            this.searchManager.nextPageToken = null;
            this.searchManager.isLoadingMore = false;
            
            container.innerHTML = `
                <div class="search-loading">
                    <i class="fas fa-spinner fa-spin"></i> 
                    Buscando...
                </div>
            `;
            
            // Desconectar observer anterior
            if (this.searchManager.scrollObserver) {
                try {
                    this.searchManager.scrollObserver.disconnect();
                } catch (e) {
                    console.warn('⚠️ Error desconectando observer:', e);
                }
                this.searchManager.scrollObserver = null;
            }
        } else {
            // Remover indicador de carga si existe
            const loadingIndicator = document.getElementById('infinite-scroll-loader');
            if (loadingIndicator) loadingIndicator.remove();
        }

        try {
            // ✅ USAR YOUTUBE-CLIENT.JS PARA LA BÚSQUEDA
            if (!window.youtubeJSClient) {
                throw new Error('YouTube Client no disponible');
            }
            
            const results = await window.youtubeJSClient.search(trimmedQuery, continuation);
            
            if (!continuation) {
                container.innerHTML = '';
            }

            if (!results || !results.items || results.items.length === 0) {
                if (!continuation) {
                    container.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-search"></i>
                            <p>No se encontraron resultados para "${trimmedQuery}"</p>
                        </div>
                    `;
                } else {
                    this.showEndOfResultsMessage(container);
                }
                
                this.searchManager.isLoadingMore = false;
                return;
            }

            console.log(`🎨 Renderizando ${results.items.length} resultados`);
            
            // ✅ RENDERIZAR CON FRAGMENT (mejor rendimiento)
            const fragment = document.createDocumentFragment();
            
            results.items.forEach(video => {
                const card = this.ui.createSearchResultCard(video);
                if (card) fragment.appendChild(card);
            });
            
            container.appendChild(fragment);
            
            // ✅ VALIDAR CONTINUATION TOKEN
            const nextToken = results.continuation;
            const isValidToken = nextToken && 
                                typeof nextToken === 'string' && 
                                nextToken !== 'null' && 
                                nextToken !== 'undefined' && 
                                nextToken.trim() !== '';
            
            this.searchManager.nextPageToken = isValidToken ? nextToken : null;
            
            console.log('📊 Paginación:', {
                hasMore: !!this.searchManager.nextPageToken,
                token: this.searchManager.nextPageToken ? 
                       this.searchManager.nextPageToken.substring(0, 20) + '...' : 'null'
            });
            
            this.searchManager.isLoadingMore = false;
            
            // ✅ CONFIGURAR SCROLL INFINITO SI HAY MÁS RESULTADOS
            if (this.searchManager.nextPageToken) {
                requestAnimationFrame(() => {
                    this.setupInfiniteScroll(container);
                });
            } else {
                console.log('✅ No hay más resultados');
                this.showEndOfResultsMessage(container);
            }
            
            // ✅ CONFIGURAR LISTENERS DE BOTONES
            setTimeout(() => {
                this.setupSearchButtonListeners();
            }, 100);

        } catch (error) {
            console.error('❌ Error en performSearch:', error);
            
            this.searchManager.isLoadingMore = false;
            
            if (!continuation) {
                container.innerHTML = `
                    <div class="search-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error: ${error.message || 'Desconocido'}</p>
                        <button onclick="window.unifiedCore.performSearch('${trimmedQuery.replace(/'/g, "\\'")}')">
                            <i class="fas fa-redo"></i> Reintentar
                        </button>
                    </div>
                `;
            } else {
                this.showMessage('Error cargando más resultados', 'error');
            }
        }
    }
    
setupInfiniteScroll(container) {
        console.log('📜 Configurando scroll infinito');
        
        // Limpiar observer anterior
        if (this.searchManager.scrollObserver) {
            try {
                this.searchManager.scrollObserver.disconnect();
            } catch (e) {
                console.warn('⚠️ Error desconectando observer:', e);
            }
            this.searchManager.scrollObserver = null;
        }
        
        // Validar si hay más contenido
        if (!this.searchManager.nextPageToken) {
            const oldSentinel = document.getElementById('search-sentinel');
            if (oldSentinel) oldSentinel.remove();
            this.showEndOfResultsMessage(container);
            return;
        }
        
        // Preparar sentinel
        const oldSentinel = document.getElementById('search-sentinel');
        if (oldSentinel) oldSentinel.remove();
        
        const sentinel = document.createElement('div');
        sentinel.id = 'search-sentinel';
        sentinel.style.cssText = `
            width: 100%;
            height: 50px;
            margin-bottom: 20px;
            background: transparent;
            pointer-events: none;
        `;
        
        container.appendChild(sentinel);
        
        // Configurar IntersectionObserver
        this.searchManager.scrollObserver = new IntersectionObserver(
            async (entries) => {
                const entry = entries[0];
                
                if (!entry.isIntersecting) return;
                if (this.searchManager.isLoadingMore) return;
                if (!this.searchManager.nextPageToken) return;
                
                console.log('📜 Sentinel detectado - Cargando página siguiente...');
                
                this.searchManager.isLoadingMore = true;
                this.showLoadingIndicator(container);
                
                try {
                    await this.performSearch(
                        this.searchManager.currentQuery,
                        this.searchManager.nextPageToken
                    );
                } catch (error) {
                    console.error('❌ Error en scroll infinito:', error);
                    this.searchManager.isLoadingMore = false;
                } finally {
                    this.removeLoadingIndicator();
                }
            },
            {
                root: null,
                rootMargin: '400px',
                threshold: 0.1
            }
        );
        
        this.searchManager.scrollObserver.observe(sentinel);
    }
    
// =============================================
// HELPERS PARA SCROLL INFINITO
// =============================================

findScrollContainer(element) {
    // Intentar encontrar el contenedor scrolleable
    const candidates = [
        document.querySelector('.search-results-wrapper'),
        document.querySelector('#searchView'),
        document.querySelector('.content-view.active'),
        element.parentElement,
        document.documentElement
    ];
    
    for (const candidate of candidates) {
        if (!candidate) continue;
        
        const style = window.getComputedStyle(candidate);
        const isScrollable = style.overflowY === 'auto' || 
                           style.overflowY === 'scroll' ||
                           candidate === document.documentElement;
        
        if (isScrollable) {
            return candidate;
        }
    }
    
    // Fallback al wrapper o viewport
    return document.querySelector('.search-results-wrapper') || null;
}

showLoadingIndicator(container) {
    // Remover indicador anterior si existe
    this.removeLoadingIndicator();
    
    const indicator = document.createElement('div');
    indicator.id = 'infinite-scroll-loader';
    indicator.className = 'search-loading-more';
    indicator.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        width: 100%;
    `;
    indicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; color: var(--yt-text-secondary);">
            <i class="fas fa-spinner fa-spin" style="font-size: 20px;"></i>
            <span>Cargando más resultados...</span>
        </div>
    `;
    
    container.appendChild(indicator);
}

removeLoadingIndicator() {
    const indicator = document.getElementById('infinite-scroll-loader');
    if (indicator) indicator.remove();
}

showEndOfResultsMessage(container) {
    // Solo mostrar si no existe ya
    if (document.getElementById('end-of-results')) return;
    
    const message = document.createElement('div');
    message.id = 'end-of-results';
    message.style.cssText = `
        text-align: center;
        padding: 40px 20px;
        color: var(--yt-text-tertiary);
        font-size: 14px;
    `;
    message.innerHTML = `
        <i class="fas fa-check-circle" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.5;"></i>
        <p>Has llegado al final de los resultados</p>
    `;
    
    container.appendChild(message);
}
async addVideoToQueue(videoData, fromPlaylist = false) {
    console.log('🎵 addVideoToQueue:', videoData);
    
    // ✅ VALIDACIÓN ESTRICTA DEL VIDEO ID
    if (!videoData || 
        !videoData.videoId || 
        videoData.videoId === 'undefined' || 
        typeof videoData.videoId !== 'string' ||
        videoData.videoId.trim() === '') {
        console.error('❌ videoId inválido:', videoData);
        this.showMessage('Error: Video inválido', 'error');
        return false;
    }

    // ✅ VALIDAR TÍTULO
    if (!videoData.title || videoData.title.trim() === '') {
        console.warn('⚠️ Video sin título, usando fallback');
        videoData.title = 'Video sin título';
    }

    // ✅ OBTENER COLA
    let queue = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);

    if (!queue) {
        console.log('✨ Creando cola...');
        queue = {
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        };
        this.playlistsData.unshift(queue);
    }
    
    // ✅ VALIDAR QUE queue.videos ES UN ARRAY
    if (!Array.isArray(queue.videos)) {
        console.error('❌ queue.videos no es un array:', queue.videos);
        queue.videos = [];
    }

    // ✅ NORMALIZAR VIDEO (SIN LLAMAR A cleanArtistName)
    let artistName = videoData.uploaderName || videoData.artist || 'Desconocido';
    
    // Limpiar " - Topic" inline
    artistName = artistName.replace(/\s*-\s*Topic$/i, '').trim();
    if (!artistName || artistName.toLowerCase() === 'youtube') {
        artistName = 'Desconocido';
    }

    const videoToAdd = {
        videoId: videoData.videoId.trim(),
        title: videoData.title.trim(),
        thumbnail: videoData.thumbnail || videoData.thumbnailUrl || './electronic.ico',
        duration: parseInt(videoData.duration) || 0,
        uploaderName: artistName,
        artist: artistName,
        sourcePlaylistId: 'queue'
    };

    // ✅ VERIFICAR DUPLICADOS
    const isDuplicate = queue.videos.some(v => v && v.videoId === videoToAdd.videoId);
    if (isDuplicate) {
        this.showMessage(`"${videoToAdd.title}" ya está en cola`, 'warning');
        return false;
    }

    // ✅ AÑADIR (al final si es desde playlist, inteligente si es manual)
    if (fromPlaylist) {
        queue.videos.push(videoToAdd);
    } else {
        const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
        if (currentIndex === -1 || currentIndex >= queue.videos.length - 1) {
            queue.videos.push(videoToAdd);
        } else {
            queue.videos.splice(currentIndex + 1, 0, videoToAdd);
        }
    }

    // ✅ ACTUALIZAR UI
    if (this.updateQueueUI) {
        this.updateQueueUI();
    }
    
    this.showMessage(`Añadido: ${videoToAdd.title}`, 'success');
    
    if (typeof this.enablePlayButton === 'function') {
        this.enablePlayButton();
    }
    
    // Invalidar caché
    if (typeof this.invalidateFlattenedCache === 'function') {
        this.invalidateFlattenedCache();
    }

    // ✅ GUARDAR
    setTimeout(() => {
        if (typeof window.saveAllData === 'function') {
            window.saveAllData();
        }
    }, 100);
    
    return true;
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
        invalidateFlattenedCache();
        return window.playlistManager.removeVideoFromQueue(videoId);
    }

    showQueuePopup() {
        if (window.playlistManager) window.playlistManager.showQueuePopup();
    }

    updateQueuePopup() {
        if (window.playlistManager) window.playlistManager.updateQueuePopup();
    }

   createSearchResultCard(video) {
        // ✅ CORRECCIÓN: Extraer el ID directamente del objeto video
        const videoId = video.videoId || video.id;
        
        if (!videoId || videoId === 'undefined') {
            console.warn('⚠️ Video ignorado por falta de ID:', video);
            return null; // Devolver null para no crear elementos vacíos
        }

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
                    <button class="add-to-queue-btn" 
                            onclick="window.unifiedCore.addVideoToQueue({
                                videoId: '${videoId}',
                                title: '${this.escapeHTML(title.replace(/'/g, "\\'"))}',
                                thumbnail: '${thumbnail}',
                                duration: ${video.duration || 0},
                                uploaderName: '${this.escapeHTML(artist.replace(/'/g, "\\'"))}'
                            })">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Agregar evento de click a la tarjeta completa para reproducir
        card.addEventListener('click', (e) => {
            // Evitar que se dispare si se hizo click en los botones
            if (e.target.closest('button')) return;
            
            console.log(`▶️ Click en tarjeta: ${title}`);
            // Añadir a cola y reproducir
            this.playVideoFromSearch({
                id: videoId,
                title: title,
                thumbnail: thumbnail,
                channel: artist,
                duration: video.duration
            });
        });

        return card;
    }
 // Limpiar resultados
clearSearchResults() {
    this.ui.clearSearchResults();
}

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

 getFlattenedPlaylist() {
        // ✅ VALIDAR PLAYLISTSDATA
        if (!this.playlistsData || !Array.isArray(this.playlistsData)) {
            console.warn('⚠️ playlistsData no válido');
            return [];
        }
        
        // ✅ GENERAR HASH DE LA ESTRUCTURA ACTUAL
        const currentHash = this._generatePlaylistHash();
        const now = Date.now();
        
        // ✅ VERIFICAR SI EL CACHÉ ES VÁLIDO
        const cacheValid = 
            this._flattenedCache.data &&
            this._flattenedCache.hash === currentHash &&
            (now - this._flattenedCache.timestamp) < this._flattenedCache.ttl;
        
        if (cacheValid) {
            return this._flattenedCache.data;
        }

        // ✅ OBTENER COLA
        const queue = this.playlistsData.find(p => p && (p.id === 'queue' || p.isQueue));
        
        if (!queue || !Array.isArray(queue.videos)) {
            console.warn('⚠️ Cola no encontrada o inválida');
            return [];
        }

        // ✅ MAPEAR VIDEOS CON VALIDACIÓN
        const validVideos = queue.videos
            .filter(video => video && video.videoId && video.title) // Filtrar inválidos
            .map((video, index) => {
                // Limpiar artista
                let artist = video.uploaderName || video.author || video.artist || '';
                artist = artist.replace(/\s*-\s*Topic$/i, '').trim();

                if (!artist || artist.toLowerCase() === 'youtube') {
                    if (video.title && video.title.includes(' - ')) {
                        artist = video.title.split(' - ')[0].trim();
                    } else {
                        artist = 'Artista Desconocido';
                    }
                }

                return {
                    videoId: video.videoId,
                    title: video.title,
                    artist: artist,
                    uploaderName: artist,
                    thumbnail: video.thumbnail || video.thumbnailUrl || './electronic.ico',
                    duration: this.parseDuration(video.duration),
                    index: index,
                    sourcePlaylistId: 'queue'
                };
            });

        // ✅ GUARDAR EN CACHÉ
        this._flattenedCache = {
            data: validVideos,
            hash: currentHash,
            timestamp: now,
            ttl: 5000
        };
        
        return validVideos;
    }
    
    // ✅ GENERAR HASH SIMPLE DE LA ESTRUCTURA
    _generatePlaylistHash() {
        try {
            const queue = this.playlistsData.find(p => p && (p.id === 'queue' || p.isQueue));
            if (!queue || !queue.videos) return 'empty';
            
            // Hash simple basado en IDs y cantidad
            const ids = queue.videos
                .filter(v => v && v.videoId)
                .map(v => v.videoId)
                .join(',');
            
            return `${queue.videos.length}_${ids.length}`;
        } catch (e) {
            return 'error';
        }
    }
    
    // ✅ INVALIDAR CACHÉ MANUALMENTE
    invalidateFlattenedCache() {
        this._flattenedCache = {
            data: null,
            hash: null,
            timestamp: 0,
            ttl: 5000
        };
        console.log('🗑️ Caché de playlist invalidado');
    }
}

invalidateFlattenedCache() {
    this._flattenedCache = null;
    this._flattenedCacheKey = null;
    console.log('🗑️ Caché de playlist aplanada invalidada');
}
parseDuration(durationInput) {
    // Validación inicial
    if (!durationInput) return 0;
    
    // Si ya es un número válido, devolverlo
    if (typeof durationInput === 'number' && !isNaN(durationInput) && durationInput >= 0) {
        return Math.floor(Math.abs(durationInput));
    }
    
    // Si no es string, intentar convertir
    if (typeof durationInput !== 'string') {
        const num = Number(durationInput);
        return isNaN(num) ? 0 : Math.floor(Math.abs(num));
    }
    
    const duration = durationInput.trim();
    
    // Formato ISO 8601 (PT1H2M3S)
    const isoMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (isoMatch) {
        const hours = parseInt(isoMatch[1] || '0', 10);
        const minutes = parseInt(isoMatch[2] || '0', 10);
        const seconds = parseFloat(isoMatch[3] || '0');
        return Math.floor(hours * 3600 + minutes * 60 + seconds);
    }
    
    // Formato HH:MM:SS o MM:SS
    const timeParts = duration.split(':').map(part => parseInt(part, 10));
    
    if (timeParts.some(isNaN)) {
        console.warn('⚠️ Duración con formato inválido:', durationInput);
        return 0;
    }
    
    if (timeParts.length === 2) {
        // MM:SS
        return timeParts[0] * 60 + timeParts[1];
    }
    
    if (timeParts.length === 3) {
        // HH:MM:SS
        return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }
    
    // Último intento: parsear como número directo
    const parsed = parseInt(duration, 10);
    return isNaN(parsed) ? 0 : Math.floor(Math.abs(parsed));
}

updatePersistentQueue() {
    console.log('🔄 Actualizando cola persistente...');
    
    const queueContentList = document.getElementById('queueContentList');
    if (!queueContentList) {
        console.warn('⚠️ queueContentList no encontrado');
        return;
    }

    const flatList = this.getFlattenedPlaylist();
    
    // ===== COLA VACÍA =====
    if (flatList.length === 0) {
        queueContentList.innerHTML = '<p class="queue-placeholder">La cola está vacía.</p>';
        this.updateQueueCount(0);
        return;
    }

    const currentIndex = this.state?.currentPlayingInfo?.flattenedIndex ?? -1;
    
    // ===== USAR DOCUMENTFRAGMENT PARA RENDIMIENTO =====
    const fragment = document.createDocumentFragment();

    flatList.forEach((video, index) => {
    if (!video || !video.videoId) return;
    
    const isPlaying = currentIndex === index;
    const queueItem = document.createElement('div');
    queueItem.className = `queue-item${isPlaying ? ' playing' : ''}`;
    
    // CORRECCIÓN: Formateo de duración garantizado
    let durationDisplay = '--:--';
    const rawDuration = video.duration;
    
    if (rawDuration) {
        // Si es un número (segundos), convertir a MM:SS
        if (typeof rawDuration === 'number' && rawDuration > 0) {
            const mins = Math.floor(rawDuration / 60);
            const secs = Math.floor(rawDuration % 60);
            durationDisplay = `${mins}:${secs.toString().padStart(2, '0')}`;
        } 
        // Si ya viene como string formateado desde la búsqueda
        else if (typeof rawDuration === 'string' && rawDuration.includes(':')) {
            durationDisplay = rawDuration;
        }
    }

    queueItem.innerHTML = `
        <div class="queue-item-number">
            ${isPlaying ? '<i class="fas fa-play-circle"></i>' : (index + 1)}
        </div>
        <div class="queue-item-thumbnail-wrapper">
            <img src="${video.thumbnail || './electronic.ico'}" 
                 alt="${this.escapeHTML(video.title)}" 
                 onerror="this.src='./electronic.ico';">
            <span class="queue-item-duration">${durationDisplay}</span>
        </div>
        `;
        fragment.appendChild(queueItem);
    });

    // ===== LIMPIAR Y RENDERIZAR =====
    queueContentList.innerHTML = '';
    queueContentList.appendChild(fragment);
    
    this.updateQueueCount(flatList.length);
    
    // ===== EVENT DELEGATION (ya configurado) =====
    if (!queueContentList.dataset.listenersAttached) {
        queueContentList.dataset.listenersAttached = 'true';
        
        // Click en items (código existente)
        queueContentList.addEventListener('click', (e) => {
            if (e.target.closest('.queue-item-remove')) {
                return;
            }
            
            const item = e.target.closest('.queue-item');
            if (!item) return;
            
            const index = parseInt(item.dataset.flatIndex);
            if (!isNaN(index) && index >= 0) {
                console.log(`▶️ Reproduciendo desde cola: índice ${index}`);
                
                window.currentPlayingInfo.flattenedIndex = index - 1;
                
                if (!window.reproduccionIniciada) {
                    window.reproduccionIniciada = true;
                    if (typeof monitorPlayers === 'function' && !window.monitorInterval) {
                        window.monitorInterval = setInterval(monitorPlayers, 500);
                    }
                }
                
                this.playNextVideo();
            }
        });
        
        // Botones de eliminar
        queueContentList.addEventListener('click', (e) => {
            const btn = e.target.closest('.queue-item-remove');
            if (!btn) return;
            
            e.stopPropagation();
            e.preventDefault();
            
            const videoId = btn.dataset.videoId;
            console.log(`🗑️ Eliminando: ${videoId}`);
            
            if (!videoId || videoId === 'undefined') {
                console.error('❌ videoId inválido');
                return;
            }
            
            btn.disabled = true;
            btn.style.opacity = '0.5';
            
            if (window.playlistManager) {
                const success = window.playlistManager.removeVideoFromQueue(videoId);
                
                if (!success) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            }
        });
    }
    
    // ===== SCROLL AL ITEM ACTUAL =====
    if (currentIndex >= 0) {
        setTimeout(() => {
            const playingItem = queueContentList.querySelector('.queue-item.playing');
            if (playingItem) {
                playingItem.scrollIntoView({ 
                    block: 'center', 
                    behavior: 'smooth' 
                });
            }
        }, 100);
    }
    
    console.log(`✅ Cola actualizada: ${flatList.length} items`);
}
    // Cuando se hace click en un resultado de búsqueda
 playVideoFromSearch(video) {
    console.log(`▶️ Reproduciendo desde búsqueda: ${video.title}`);
    
    // Agregar a la cola
    const flatList = window.unifiedCore?.getFlattenedPlaylist() || [];
    
    // Agregar video a la cola si no existe
    if (!flatList.find(v => v.videoId === video.id)) {
        window.unifiedCore.addToQueue({
            videoId: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            channel: video.channel
        });
    }
    
    // Encontrar índice del video
    const updatedList = window.unifiedCore.getFlattenedPlaylist();
    const videoIndex = updatedList.findIndex(v => v.videoId === video.id);
    
    if (videoIndex !== -1) {
        // Actualizar índice actual para que playNextVideo reproduzca este
        window.currentPlayingInfo.flattenedIndex = videoIndex - 1;
        
        // Iniciar reproducción
        if (!window.reproduccionIniciada) {
            window.reproduccionIniciada = true;
            if (!monitorInterval) {
                monitorInterval = setInterval(monitorPlayers, 500);
            }
        }
        
        // Reproducir
        window.unifiedCore.playNextVideo();
        
        // Actualizar UI
        if (window.ShowMiniPlayer) {
            window.ShowMiniPlayer();
        }
    }
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

// Actualiza Título, Artista y Carátula
updateNowPlaying() {
    // 1. Obtener la info actual (Lógica de negocio se queda en Core)
    const info = window.currentPlayingInfo;
    if (!info || info.flattenedIndex === -1) return;

    const flatList = this.getFlattenedPlaylist();
    const videoData = flatList[info.flattenedIndex];

    if (videoData) {
        // 2. Pasar los datos limpios a la UI para que los pinte
        this.ui.updateNowPlaying({
            title: videoData.title,
            artist: videoData.uploaderName || videoData.artist,
            thumbnail: videoData.thumbnail
        });
        
        // Actualizar título de la pestaña del navegador
        document.title = `▶ ${videoData.title} - YT CrossMix`;
    }
}

   // Cambia el icono de Play/Pause
updatePlayButton(state) {
    this.ui.updatePlayButton(state);
}
// Habilita los botones (cuando carga la playlist)
enablePlayButton() {
    this.ui.enablePlayButton(true);
}

  // Actualizar contadores de estadísticas en Home
updateOverviewStats() {
    // Calcular datos (Core)
    const playlistsCount = this.playlistsData.length;
    const videosCount = this.playlistsData.reduce((acc, p) => acc + (p.videos ? p.videos.length : 0), 0);
    
    // Pintar datos (UI)
    this.ui.updateOverviewStats(playlistsCount, videosCount);
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

    handleEndOfPlaylist() {
        if (confirm('¿Deseas repetir la lista desde el principio?')) {
            currentPlayingInfo = { playlistId: null, videoId: null, flattenedIndex: -1 };
            this.playFirstVideo();
        } else {
           
            this.showMessage("Lista completada", 'success');
            try {
                if (player1) player1.stopVideo();
                if (player2) player2.stopVideo();
            } catch (e) {}
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }
// Mostrar mensajes flotantes (Toast)
showMessage(message, type = 'info') {
    this.ui.showMessage(message, type);
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
    console.log('📂 Cargando datos iniciales...');
    
    // ✅ ORDEN DE PRIORIDAD CLARO
    let dataLoaded = false;
    
    // 1. Prioridad: Persistencia moderna
    if (typeof loadPlaylistsDataPersistent === 'function') {
        const persistentData = loadPlaylistsDataPersistent();
        if (persistentData && Array.isArray(persistentData) && persistentData.length > 0) {
            console.log(`✅ Cargados ${persistentData.length} playlists desde persistencia moderna`);
            this.playlistsData = persistentData;
            dataLoaded = true;
        }
    }

    // 2. Fallback: localStorage legacy (solo si falla lo anterior)
    if (!dataLoaded && this.playlistsData.length === 0) {
        try {
            const savedPlaylists = localStorage.getItem('ytcm_playlists');
            if (savedPlaylists) {
                const parsed = JSON.parse(savedPlaylists);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log(`✅ Cargados ${parsed.length} playlists desde localStorage legacy`);
                    this.playlistsData = parsed;
                    dataLoaded = true;
                    
                    // ✅ MIGRAR A FORMATO NUEVO
                    if (typeof savePlaylistsDataPersistent === 'function') {
                        savePlaylistsDataPersistent(parsed);
                        localStorage.removeItem('ytcm_playlists');
                        console.log('✅ Datos migrados a persistencia moderna');
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Error cargando localStorage legacy:', e);
        }
    }
    
    // 3. Si no hay datos, inicializar vacío
    if (!dataLoaded) {
        console.log('📭 No hay datos guardados, iniciando con cola vacía');
        this.playlistsData = [];
    }
    
    // 4. Asegurar que existe la cola
    this.ensureQueueExists();
}

ensureQueueExists() {
    const hasQueue = this.playlistsData.some(p => p.id === 'queue' || p.isQueue);
    
    if (!hasQueue) {
        console.log('✨ Creando cola de reproducción');
        this.playlistsData.unshift({
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        });
    }
}
    saveData() {
        saveAllData();
    }

startMonitoring() {
        // Limpiar monitor anterior
        this.stopMonitoring();
        
        console.log('▶️ Iniciando monitor de reproductores');
        
        this.monitorInterval = setInterval(() => {
            this.monitorPlayers();
        }, 500);
    }
    
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            console.log('⏸️ Monitor de reproductores detenido');
        }
    }
    
    monitorPlayers() {
        // Validaciones
        if (!this.players.player1 || !this.players.player2) return;
        if (!this.state.reproduccionIniciada || this.state.isTransitioning) return;

        try {
            const activePlayer = this.players[`player${this.players.current}`];
            if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') return;

            const playerState = activePlayer.getPlayerState();
            
            // Video terminó
            if (playerState === YT.PlayerState.ENDED) {
                console.log('🎬 Video terminado');
                this.stopMonitoring();
                this.resetCrossfadeFlags();
                this.playNextVideo();
                return;
            }

            if (playerState !== YT.PlayerState.PLAYING) return;

            const currentTime = activePlayer.getCurrentTime();
            const videoDuration = activePlayer.getDuration();
            const videoId = activePlayer.getVideoData()?.video_id;

            if (!videoDuration || videoDuration <= 0 || !videoId) return;

            // Actualizar UI
            if (this.ui) {
                this.ui.updateProgressBar(currentTime, videoDuration);
            }

            // SponsorBlock
            if (window.sponsorBlockManager) {
                const skipped = window.sponsorBlockManager.checkAndSkip(activePlayer);
                if (skipped) return;
            }

            // Calcular trigger de crossfade
            let triggerTime = videoDuration - (window.CROSSFADE_DURATION || 10) - 0.5;
            
            if (window.sponsorBlockManager) {
                triggerTime = window.sponsorBlockManager.calculateCrossfadeTriggerTime(
                    videoDuration,
                    videoId,
                    window.CROSSFADE_DURATION || 10
                );
            }

            // Disparar crossfade
            if (currentTime >= triggerTime && !this.state.hasOutroCrossfadeStarted) {
                console.log(`🎨 Disparando crossfade en ${currentTime.toFixed(2)}s`);
                
                this.state.hasOutroCrossfadeStarted = true;
                this.stopMonitoring();
                this.playNextVideo();
            }
            
        } catch (error) {
            console.error('❌ Error en monitorPlayers:', error);
        }
    }
    
   
    
    destroy() {
     this.stopMonitoring();   
        
    }
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES
// =============================================

// ✅ EXPORTAR GLOBALMENTE
window.monitorPlayers = monitorPlayers;
window.savePlaylistsDataPersistent = savePlaylistsDataPersistent;
window.loadPlaylistsDataPersistent = loadPlaylistsDataPersistent;
window.debugUnified = function() {
    console.log('🐛 Estado del Sistema Unificado:', {
        unifiedState,
        playlistsData,
        currentPlayingInfo,
        playersInitialized,
        reproduccionIniciada       
       
    });
};

window.resetUnified = function() {
    if (confirm('¿Resetear completamente el sistema?')) {
        localStorage.removeItem('ytcm_playlists');
        localStorage.removeItem('ytcm_debug');
        localStorage.removeItem('google_token'); 
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

//  FUNCIÓN HELPER PARA DEBUGGING
window.debugVideoVisibility = function() {
    console.log('🔍 DEBUG VIDEO VISIBILITY:');
    
    const checks = {
        player1Exists: !!window.player1,
        player2Exists: !!window.player2,
        currentPlayer: window.currentPlayer,
        reproduccionIniciada: window.reproduccionIniciada
    };
    
    ['player1', 'player2'].forEach(id => {
        const div = document.getElementById(id);
        if (div) {
            const iframe = div.querySelector('iframe');
            checks[id] = {
                display: div.style.display,
                visibility: div.style.visibility,
                opacity: div.style.opacity,
                zIndex: div.style.zIndex,
                hasIframe: !!iframe,
                iframeSrc: iframe?.src,
                computedDisplay: getComputedStyle(div).display,
                rect: div.getBoundingClientRect()
            };
        }
    });
    
    console.table(checks);
    return checks;
};

// FUNCIÓN HELPER PARA FORZAR VISIBILIDAD
window.forceVideoVisible = function() {
    const activeId = window.currentPlayer === 1 ? 'player1' : 'player2';
    const div = document.getElementById(activeId);
    
    if (!div) {
        console.error('❌ Div no encontrado:', activeId);
        return;
    }
    
    div.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 10 !important;
        background: #000 !important;
    `;
    div.classList.remove('hidden', 'fade-out');
    
    const iframe = div.querySelector('iframe');
    if (iframe) {
        iframe.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            visibility: visible !important;
        `;
    }
    
    console.log('✅ Visibilidad forzada para:', activeId);
    window.debugVideoVisibility();
};
window.addEventListener('beforeunload', () => {
    console.log('🚪 Cerrando aplicación, limpiando recursos...');
    
    // 1. Guardar datos y detener monitoring
    if (window.unifiedCore?.state?.initialized) {
        try {
            window.unifiedCore.saveData();
           
        } catch (e) {
            console.warn('⚠️ Error en saveData:', e);
        }
    }
     if (window.unifiedCore) {
        window.unifiedCore.destroy();
    }
    // 2. Desconectar observers
    if (window.unifiedCore) {
        if (window.unifiedCore.searchScrollObserver) {
            try {
                window.unifiedCore.searchScrollObserver.disconnect();
                window.unifiedCore.searchScrollObserver = null;
            } catch (e) {
                console.warn('⚠️ Error desconectando search observer:', e);
            }
        }
        
        if (window.unifiedCore.miniPlayerObserver) {
            try {
                window.unifiedCore.miniPlayerObserver.disconnect();
                window.unifiedCore.miniPlayerObserver = null;
            } catch (e) {
                console.warn('⚠️ Error desconectando mini player observer:', e);
            }
        }
        
        if (window.unifiedCore.saveInterval) {
            clearInterval(window.unifiedCore.saveInterval);
            window.unifiedCore.saveInterval = null;
        }
    }
    
    // 3. Limpiar intervals de crossfade
    if (crossfadeInterval) {
        clearInterval(crossfadeInterval);
        crossfadeInterval = null;
    }
    
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    

    if (window.playlistManager?.lyricsSyncInterval) {
        clearInterval(window.playlistManager.lyricsSyncInterval);
        window.playlistManager.lyricsSyncInterval = null;
        console.log('🛑 Sincronización de letras detenida');
    }
    
    // 5. Detener reproductores
    try {
        if (player1 && typeof player1.stopVideo === 'function') {
            player1.stopVideo();
        }
        if (player2 && typeof player2.stopVideo === 'function') {
            player2.stopVideo();
        }
    } catch (e) {
        console.warn('⚠️ Error deteniendo players:', e);
    }
    
    console.log('✅ Recursos limpiados correctamente');
});

window.UnifiedCore = UnifiedCore;

