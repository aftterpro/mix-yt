console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const playerConfig = {
    playerVars: { 
        'playsinline': 1,
        'origin': window.location.origin, 
        'enablejsapi': 1 
    },
    host: 'https://www.youtube.com'
};
const CROSSFADE_DURATION = 10;

window.player1 = null;
window.player2 = null;
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
window.currentPlayer = 1;
window.reproduccionIniciada = false;
let currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

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
    this.state = {
        ...unifiedState,
        shuffleEnabled: false,    
        repeatEnabled: false       
    };
    this.views = ['home', 'search', 'library', 'playing'];
    this.currentView = 'home';
    this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
    
    // CORRECCIÓN: Usar referencia única
    this.playlistsData = [];
    window.playlistsData = this.playlistsData; // Exponer globalmente
    
    this.scrollObserver = null;
    this.ui = window.uiManager;
    this.init();
    this.setupAutomaticSaving();
    this.setupPlayerContainerHandlers();
    this.lastPlayNextCall = 0;
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
    hasOutroCrossfadeStarted = false;
    nextVideoScheduled = false;
    isTransitioning = false;
    crossfadeInProgress = false;
    isNextVideoPreloaded = false;
    
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
    
    // Resetear banderas
    this.resetCrossfadeFlags();
    
    // Reiniciar monitor si estaba activo
    if (reproduccionIniciada && !monitorInterval) {
        playNextVideo();
    }
    
    // Mostrar error
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
    if (player1 && player2) return;
    console.log('🎮 Inicializando reproductores...');
    const p1Container = document.getElementById('player1');
    const p2Container = document.getElementById('player2');
    
    if (!p1Container || !p2Container) {
        console.error('❌ No se encontraron los contenedores de los reproductores');
        return;
    }
    
    // ✅ CRÍTICO: Origin correcto y explícito
    const currentOrigin = window.location.origin;
    console.log('🔗 Origin configurado:', currentOrigin);

    const playerConfig = {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: { 
            'playsinline': 1,
            'origin': currentOrigin,
            'enablejsapi': 1,
            'widget_referrer': currentOrigin,
            'controls': 1,
            'rel': 0,
            'showinfo': 0,
            'fs': 1,
            'modestbranding': 1
        },
        events: {
            'onReady': (event) => this.onPlayerReady(event),
            'onStateChange': (event) => this.onPlayerStateChange(event),
            'onError': (event) => this.onPlayerError(event)
        }
    };
    
    // ✅ Aplicar estilos a los contenedores
    p1Container.style.cssText = `
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
    
    p2Container.style.cssText = `
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        z-index: 0 !important;
        background: #000 !important;
    `;
    
    // Crear reproductores
    player1 = new YT.Player('player1', playerConfig);
    player2 = new YT.Player('player2', playerConfig);
    
    console.log('✅ Reproductores creados correctamente');
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
    if (player1 && player2) {
        playersInitialized = true;
        this.state.playersReady = true;
        window.player1 = player1;
        window.player2 = player2;
        window.currentPlayer = currentPlayer;
        this.updatePlayersStatus('Reproductores listos');
        this.enablePlayButton();
        
        console.log('✅ Ambos reproductores listos y visibles');
    }
}

onPlayerStateChange(playerNum, state) {
    console.log(`🎬 Player${playerNum} cambió a estado: ${state}`);
    
    if (state === YT.PlayerState.PLAYING) {
        
        // ✅ NO iniciar monitor aquí, solo si no existe
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
    
    // ✅ ENDED se maneja dentro de monitorPlayers()
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
    // Delegamos la tarea visual al UI Manager
    this.ui.updatePlayerPosition(targetContainerId);
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

    showFullPlayer() {
        console.log('🎬 Mostrando reproductor completo');
        this.switchView('fullPlayer');
        this.movePlayer('full');
        this.hideMiniPlayer();
        this.updatePersistentQueue();
    }

  // Fuerza la visibilidad si algo falla
forceMiniPlayerVisibility() {
    this.ui.forceMiniPlayerVisibility();
}

setupSearchButtonListeners() {
    console.log('🔘 Configurando listeners de botones de búsqueda...');
    
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    // ✅ LIMPIAR LISTENER ANTERIOR
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

// Expande el reproductor a pantalla completa
movePlayersToFullView() {
    this.currentView = 'fullPlayer'; // Mantenemos el estado en Core
    this.ui.movePlayersToFullView();
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

// Muestra el mini reproductor flotante
showMiniPlayerFloat() {
    this.ui.showMiniPlayerFloat();
}
movePlayersToFullView() {
    console.log('🎬 Expandiendo a vista completa...');
    
    const persistentLayer = document.getElementById('persistent-player-layer');
    if (!persistentLayer) return;
    
    const fullPlayerView = document.getElementById('fullPlayerView');
    const videoWrapper = fullPlayerView?.querySelector('.video-wrapper') || document.getElementById('videoWrapper');
    
    if (!videoWrapper) return;
    
    // ✅ ANIMAR LA CAPA PERSISTENTE hacia el contenedor grande
    const wrapperRect = videoWrapper.getBoundingClientRect();
    
    persistentLayer.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    persistentLayer.style.top = `${wrapperRect.top}px`;
    persistentLayer.style.left = `${wrapperRect.left}px`;
    persistentLayer.style.width = `${wrapperRect.width}px`;
    persistentLayer.style.height = `${wrapperRect.height}px`;
    persistentLayer.style.borderRadius = '0px';
    persistentLayer.style.opacity = '1';
    persistentLayer.style.pointerEvents = 'auto';
    
    document.body.classList.remove('mini-player-active');
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
        this.movePlayersToFullView(); // Usar la versión corregida arriba
    }

    refreshPlayingView() {
        this.updateNowPlaying();
        if (window.playlistManager?.updateQueuePopup) {
            window.playlistManager.updateQueuePopup();
        }
    }

   handlePlayPause() {
    console.log('🎮 handlePlayPause ejecutado');
    
    const activePlayer = (window.currentPlayer === 1) ? player1 : player2;
    
    if (!activePlayer) {
        console.error('❌ Player no disponible');
        return;
    }
    
    try {
        const state = activePlayer.getPlayerState();
        
        // ✅ SI NO HAY REPRODUCCIÓN INICIADA, INICIAR
        if (!window.reproduccionIniciada) {
            console.log('🚀 Iniciando reproducción por primera vez');
            
            window.reproduccionIniciada = true;
            
            const flatList = this.getFlattenedPlaylist();
            
            if (flatList.length === 0) {
                console.warn('📭 No hay videos en la cola');
                this.showMessage('Agrega videos a la cola para reproducir', 'info');
                return;
            }
            
            // Iniciar desde el primer video
            window.currentPlayingInfo = {
                flattenedIndex: -1,
                videoId: null,
                playlistId: null
            };
            
            // ✅ INICIAR MONITOR
            if (!monitorInterval) {
                monitorInterval = setInterval(monitorPlayers, 500);
                console.log('✅ Monitor iniciado');
            }
            
            // Reproducir primer video
            this.playNextVideo();
            
            return;
        }
        
        // ✅ SI YA ESTÁ REPRODUCIENDO, ALTERNAR PLAY/PAUSE
        if (state === YT.PlayerState.PLAYING) {
            console.log('⏸️ Pausando reproducción');
            activePlayer.pauseVideo();
            
            // Detener monitor mientras está pausado
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
                console.log('🛑 Monitor detenido (pausado)');
            }
            
            // Actualizar icono del botón
            const playBtn = document.getElementById('botonPlay');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
            
        } else {
            console.log('▶️ Reanudando reproducción');
            activePlayer.playVideo();
            
            // Reiniciar monitor
            if (!monitorInterval) {
                monitorInterval = setInterval(monitorPlayers, 500);
                console.log('✅ Monitor reiniciado (play)');
            }
            
            // Actualizar icono del botón
            const playBtn = document.getElementById('botonPlay');
            if (playBtn) {
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            }
        }
        
    } catch (error) {
        console.error('❌ Error en handlePlayPause:', error);
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
    console.log('🎬 playNextVideo iniciado');
    
    // ✅ RESETEAR BANDERAS DE MONITOR
    nextVideoScheduled = false;
    hasOutroCrossfadeStarted = false;
    lastLogTime = -1;
    
    // ✅ PROTECCIÓN: Evitar llamadas múltiples
    const now = Date.now();
    if (!this.lastPlayNextCall) this.lastPlayNextCall = 0;
    
    if (now - this.lastPlayNextCall < 1000) {
        console.log('⚠️ playNextVideo ya en progreso, ignorando');
        return;
    }
    this.lastPlayNextCall = now;
    
    // ✅ PROTECCIÓN: Detener crossfade en progreso
    if (crossfadeInProgress) {
        console.warn('⚠️ Crossfade en progreso, esperando...');
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // VALIDACIONES
    if (!playersInitialized) {
        console.error('❌ Players no inicializados');
        return;
    }

    const currentFlatIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    const flatList = this.getFlattenedPlaylist();

    if (flatList.length === 0) {
        console.warn('📭 Cola vacía');
        return this.handleEmptyPlaylist();
    }

    let nextIndex = currentFlatIndex + 1;
    
    if (nextIndex >= flatList.length) {
        console.log('🏁 Fin de lista alcanzado');
        
        if (this.state?.repeatEnabled) {
            console.log('🔄 Repeat activado, reiniciando');
            nextIndex = 0;
        } else {
            return this.handleEndOfPlaylist();
        }
    }

    const nextVideo = flatList[nextIndex];
    
    if (!nextVideo || !nextVideo.videoId) {
        console.error('❌ Video siguiente inválido');
        this.showMessage('Error: Video no válido', 'error');
        return;
    }

    console.log(`🎵 Siguiente: "${nextVideo.title}" (índice ${nextIndex})`);
    
    // ✅ ACTUALIZAR INFO GLOBAL
    window.currentPlayingInfo = {
        flattenedIndex: nextIndex,
        videoId: nextVideo.videoId,
        playlistId: nextVideo.sourcePlaylistId
    };
    
    this.state.currentPlayingInfo = window.currentPlayingInfo;
    this.updateNowPlaying();
    
    if (window.playlistManager) {
        window.playlistManager.syncQueueIndicator();
        this.updatePersistentQueue();
        window.playlistManager.refreshActiveQueueTab();
    }

    // ✅ DETERMINAR PLAYERS
    const prevPlayerInstance = window.currentPlayer === 1 ? player1 : player2;
    const nextPlayerInstance = window.currentPlayer === 1 ? player2 : player1;
    const prevPlayerNum = window.currentPlayer;
    const nextPlayerNum = window.currentPlayer === 1 ? 2 : 1;

    try {
        console.log(`⏳ Cargando video ${nextVideo.videoId} en player${nextPlayerNum}`);

        // ✅ CARGAR VIDEO EN PLAYER SECUNDARIO
        nextPlayerInstance.loadVideoById({
            videoId: nextVideo.videoId,
            startSeconds: 0
        });
        
        nextPlayerInstance.setVolume(0);

        // ✅ ESPERAR A QUE EL VIDEO ESTÉ LISTO
        await new Promise(resolve => setTimeout(resolve, 800));

        // ✅ INICIAR CROSSFADE INTEGRADO
        console.log(`🎨 Iniciando crossfade de ${CROSSFADE_DURATION}s: Player${prevPlayerNum} → Player${nextPlayerNum}`);
        
        crossfadeInProgress = true;
        
        const prevElement = document.getElementById(`player${prevPlayerNum}`);
        const nextElement = document.getElementById(`player${nextPlayerNum}`);
        
        // ✅ PREPARAR NEXT PLAYER
        if (nextElement) {
            nextElement.className = 'video-player';
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
            void nextElement.offsetWidth; // Force reflow
        }
        
        if (prevElement) {
            prevElement.style.opacity = '1';
            prevElement.style.zIndex = '2';
        }
        
        // ✅ INICIAR PLAYBACK DEL NUEVO VIDEO
        try { 
            nextPlayerInstance.playVideo();
            console.log('✅ NextPlayer iniciado');
        } catch(e) {
            console.warn('⚠️ Error iniciando nextPlayer:', e);
        }
        
        // ✅ CAMBIAR PLAYER ACTUAL
        window.currentPlayer = nextPlayerNum;
        
        // ✅ CROSSFADE LOOP - 10 SEGUNDOS
        const steps = 50;
        const stepTime = (CROSSFADE_DURATION * 1000) / steps; // 10000ms / 50 = 200ms por paso
        let step = 0;
        
        console.log(`🎚️ Crossfade: ${steps} pasos de ${stepTime}ms (Duración total: ${CROSSFADE_DURATION}s)`);
        
        crossfadeInterval = setInterval(() => {
            step++;
            const progress = step / steps;
            
            // ✅ CURVAS DE MEZCLA SUAVE (seno/coseno)
            const gainNext = Math.sin(progress * (Math.PI / 2));
            const gainPrev = Math.cos(progress * (Math.PI / 2));
            
            // ✅ AUDIO - Fade cruzado
            try {
                if (prevPlayerInstance && typeof prevPlayerInstance.setVolume === 'function') {
                    prevPlayerInstance.setVolume(Math.round(100 * gainPrev));
                }
                if (nextPlayerInstance && typeof nextPlayerInstance.setVolume === 'function') {
                    nextPlayerInstance.setVolume(Math.round(100 * gainNext));
                }
            } catch (e) {
                console.warn('⚠️ Error ajustando volumen:', e);
            }
            
            // ✅ VIDEO - Sincronizado con audio
            if (nextElement) {
                nextElement.style.opacity = gainNext.toFixed(3);
            }
            if (prevElement) {
                prevElement.style.opacity = gainPrev.toFixed(3);
            }
            
            // ✅ LOG DE PROGRESO (cada 25%)
            if (step % Math.floor(steps / 4) === 0) {
                const timeElapsed = (progress * CROSSFADE_DURATION).toFixed(1);
                console.log(`🎚️ Crossfade: ${Math.round(progress * 100)}% (${timeElapsed}s / ${CROSSFADE_DURATION}s)`);
            }
            
            // ✅ FINALIZAR CROSSFADE
            if (step >= steps) {
                clearInterval(crossfadeInterval);
                crossfadeInterval = null;
                crossfadeInProgress = false;
                
                console.log(`✅ Crossfade de ${CROSSFADE_DURATION}s completado`);
                
                // ✅ LIMPIEZA FINAL
                try {
                    // Detener y resetear player anterior
                    if (prevPlayerInstance && typeof prevPlayerInstance.stopVideo === 'function') {
                        prevPlayerInstance.stopVideo();
                        prevPlayerInstance.setVolume(100);
                    }
                    
                    // Asegurar volumen del player activo al 100%
                    if (nextPlayerInstance && typeof nextPlayerInstance.setVolume === 'function') {
                        nextPlayerInstance.setVolume(100);
                    }
                    
                    // Ocultar completamente player anterior
                    if (prevElement) {
                        prevElement.className = 'video-player hidden';
                        prevElement.style.cssText = `
                            display: none !important;
                            opacity: 0 !important;
                            z-index: -1 !important;
                            visibility: hidden !important;
                        `;
                    }
                    
                    // Asegurar visibilidad total del player activo
                    if (nextElement) {
                        nextElement.className = 'video-player fade-in';
                        nextElement.style.cssText = `
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                            display: block !important;
                            visibility: visible !important;
                            opacity: 1 !important;
                            z-index: 3 !important;
                            background: #000 !important;
                        `;
                    }
                    
                } catch (e) {
                    console.warn('⚠️ Error en limpieza final:', e);
                }
                
                // ✅ RESETEAR TODAS LAS BANDERAS
                hasOutroCrossfadeStarted = false;
                nextVideoScheduled = false;
                isTransitioning = false;
                isNextVideoPreloaded = false;
                lastLogTime = -1;
                
                // ✅ ACTUALIZAR MINIPLAYER
                if (window.updateMiniPlayerVisibility) {
                    window.updateMiniPlayerVisibility();
                }
                
                // ✅ REINICIAR MONITOR DESPUÉS DEL CROSSFADE
                if (!monitorInterval && window.reproduccionIniciada) {
                    setTimeout(() => {
                        console.log('🔄 Reiniciando monitor después de crossfade');
                        monitorInterval = setInterval(monitorPlayers, 500);
                    }, 500);
                }
            }
        }, stepTime);

    } catch (error) {
        console.error("❌ Error crítico en playNextVideo:", error);
        
        // ✅ LIMPIEZA EN CASO DE ERROR
        crossfadeInProgress = false;
        if (crossfadeInterval) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;
        }
        
        // Revertir player actual
        window.currentPlayer = prevPlayerNum;
        
        // Resetear banderas
        hasOutroCrossfadeStarted = false;
        nextVideoScheduled = false;
        isTransitioning = false;
        isNextVideoPreloaded = false;
        
        this.showMessage('Error cambiando de video', 'error');
        
        // ✅ REINTENTAR DESPUÉS DE 2 SEGUNDOS
        setTimeout(() => {
            if (flatList.length > nextIndex) {
                console.log('🔄 Reintentando reproducción después de error...');
                
                // Reiniciar monitor antes de reintentar
                if (!monitorInterval && window.reproduccionIniciada) {
                    monitorInterval = setInterval(monitorPlayers, 500);
                }
                
                this.playNextVideo();
            }
        }, 2000);
    }
}
    // ==========================================
    // FUNCIONES DE BÚSQUEDA Y SCROLL INFINITO
    // ==========================================
async performSearch(searchQuery, continuation = null) {
    console.log(`🔎 performSearch llamado con: "${searchQuery}", continuation: ${continuation ? 'SÍ' : 'NO'}`);
    
    // ✅ CORRECCIÓN 1: Validar query primero
    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim() === '') {
        console.error('❌ Query inválido:', searchQuery);
        return;
    }
    
    const query = searchQuery.trim();
    
    // ✅ CORRECCIÓN 2: Buscar contenedor con múltiples intentos
    let container = document.getElementById('searchResults');
    
    if (!container) {
        console.warn('⚠️ searchResults no encontrado, reintentando...');
        
        // Intentar con selector alternativo
        container = document.querySelector('.search-results-grid') || 
                    document.querySelector('#searchView .search-results-wrapper');
        
        if (!container) {
            console.error('❌ No se encontró contenedor de resultados');
            this.showMessage('Error: Contenedor de búsqueda no disponible', 'error');
            return;
        }
    }
    
    console.log('✅ Contenedor encontrado:', container.id || container.className);

    // ✅ CORRECCIÓN 3: Estado global antes de buscar
    window.currentSearchQuery = query;
    window.isLoadingMore = false;
    
    // Si es una nueva búsqueda (no continuación)
    if (!continuation) {
        window.currentNextPageToken = null;
        
        // Limpiar resultados anteriores
        container.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    }

    try {
   
        console.log(`📡 Llamando a YouTube Client con: "${query}"`);
        const results = await window.youtubeJSClient.search(query, continuation);        
        console.log('📦 Resultados recibidos:', results);
        
        if (!results || !results.items || results.items.length === 0) {
            if (!continuation) {
                container.innerHTML = `
                    <div class="search-placeholder">
                        <i class="fas fa-search"></i>
                        <p>No se encontraron resultados para "${this.escapeHTML(query)}"</p>
                    </div>
                `;
            }
            return;
        }

        // ✅ CORRECCIÓN 5: Si es la primera búsqueda, limpiar
        if (!continuation) {
            container.innerHTML = '';
        }

        // ✅ CORRECCIÓN 6: Renderizar resultados
        console.log(`🎨 Renderizando ${results.items.length} resultados`);
        
        results.items.forEach(video => {
            const card = this.createSearchResultCard(video);
            if (card) {
                container.appendChild(card);
            }
        });

        // ✅ CORRECCIÓN 7: Guardar token para siguiente página
        window.currentNextPageToken = results.nextPageToken || null;
        
        // ✅ CORRECCIÓN 8: Configurar scroll infinito
        this.setupInfiniteScroll();
        
        console.log(`✅ ${results.items.length} resultados mostrados. NextToken: ${window.currentNextPageToken ? 'SÍ' : 'NO'}`);

    } catch (error) {
        console.error('❌ Error en performSearch:', error);
        
        if (!continuation) {
            container.innerHTML = `
                <div class="search-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al buscar: ${error.message}</p>
                    <button onclick="window.unifiedCore.performSearch('${this.escapeHTML(query)}')">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
        
        this.showMessage('Error en la búsqueda', 'error');
    }
}
            
setupInfiniteScroll(container) {
    console.log('📜 Configurando scroll infinito...');

    const sentinel = document.getElementById('scrollSentinel');
   
    
    if (!sentinel) {
        console.error('❌ Sentinel no encontrado');
        return;
    }

    if (!container) {
        console.error('❌ Contenedor searchResults no encontrado');
        return;
    }

    // LIMPIAR OBSERVADOR ANTERIOR
    if (window.scrollObserver) {
        window.scrollObserver.disconnect();
        console.log('🧹 Observador anterior desconectado');
    }

    window.scrollObserver = new IntersectionObserver(async (entries) => {
        const entry = entries[0];
        
        // CONDICIONES PARA CARGAR MÁS:
        // 1. Sentinel visible
        // 2. NO está cargando
        // 3. HAY token de siguiente página
        // 4. HAY query actual
        if (entry.isIntersecting && 
            !isLoadingMore && 
            window.currentNextPageToken && 
            window.currentSearchQuery) {
            
            console.log('📜 Cargando siguiente página...');
            
            const results = await searchYouTube(window.currentSearchQuery, window.currentNextPageToken);
            
            if (results.items && results.items.length > 0) {
                displaySearchResults(results.items);
                window.currentNextPageToken = results.nextPageToken;
                
                if (!results.nextPageToken) {
                    console.log('🏁 No hay más páginas disponibles');
                }
            } else {
                console.log('🏁 No hay más resultados');
                window.currentNextPageToken = null;
            }
        }
    }, {
        root: null,
        rootMargin: '200px', // Cargar antes de llegar al final
        threshold: 0.1
    });

    window.scrollObserver.observe(sentinel);
    console.log('✅ Observador configurado');
}

displaySearchResults(videos, container) {
    if (!container) {
        console.error('❌ Contenedor searchResults no encontrado');
        return;
    }

    // SI NO HAY VIDEOS, MOSTRAR MENSAJE
    if (!videos || videos.length === 0) {
        if (!container.querySelector('.video-card')) {
            container.innerHTML = '<p style="color: white; text-align: center; padding: 20px;">No se encontraron resultados</p>';
        }
        return;
    }

    console.log(`🎨 Renderizando ${videos.length} resultados en DOM`);

    // AGREGAR VIDEOS AL CONTENEDOR (NO REEMPLAZAR)
    videos.forEach(video => {
        if (!video || !video.id) return;

        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <img src="${video.thumbnail || 'placeholder.jpg'}" alt="${video.title || 'Video'}" loading="lazy" />
            <div class="video-info">
                <h3>${video.title || 'Sin título'}</h3>
                <p>${video.channel || 'Canal desconocido'}</p>
            </div>
        `;
        
        card.addEventListener('click', () => {
            console.log(`▶️ Video seleccionado: ${video.title}`);
            addToQueue(video);
            playVideo(video.id);
        });

        container.appendChild(card);
    });

    console.log(`✅ ${videos.length} tarjetas agregadas al DOM`);
}


    async addVideoToQueue(videoData) {
        if (!window.playlistManager) {
            this.showMessage('Error: Gestor de playlists no disponible', 'error');
            return;
        }
        invalidateFlattenedCache();
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
        invalidateFlattenedCache();
        return window.playlistManager.removeVideoFromQueue(videoId);
    }

    showQueuePopup() {
        if (window.playlistManager) window.playlistManager.showQueuePopup();
    }

    updateQueuePopup() {
        if (window.playlistManager) window.playlistManager.updateQueuePopup();
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
    // ✅ IMPLEMENTAR CACHÉ PARA MEJOR RENDIMIENTO
    const cacheKey = JSON.stringify(
        this.playlistsData.map(p => ({
            id: p.id,
            videoCount: p.videos?.length || 0
        }))
    );
    
    // Verificar si tenemos caché válida
    if (this._flattenedCache && this._flattenedCacheKey === cacheKey) {
        console.log('✅ Usando caché de playlist aplanada');
        return this._flattenedCache;
    }
    
    console.log('🔄 Regenerando playlist aplanada...');
    
    // Buscar la cola de reproducción
    let queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    
    // Si no existe, crearla
    if (!queuePlaylist) {
        console.warn('⚠️ Cola no encontrada, creándola...');
        queuePlaylist = {
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        };
        this.playlistsData.unshift(queuePlaylist);
    }
    
    // Validar que tiene array de videos
    if (!queuePlaylist.videos || !Array.isArray(queuePlaylist.videos)) {
        console.warn('⚠️ Cola sin array de videos, inicializando...');
        queuePlaylist.videos = [];
    }
    
    // Filtrar y normalizar videos válidos
    const validVideos = queuePlaylist.videos
        .filter(video => {
            // ✅ VALIDACIONES EXHAUSTIVAS
            if (!video) {
                console.warn('⚠️ Video nulo o undefined');
                return false;
            }
            
            if (!video.videoId || video.videoId === 'undefined' || video.videoId === '') {
                console.warn('⚠️ Video sin videoId válido:', video);
                return false;
            }
            
            // Validar que el videoId sea una string válida de YouTube (11 caracteres)
            if (typeof video.videoId !== 'string' || video.videoId.length !== 11) {
                console.warn('⚠️ VideoId con formato inválido:', video.videoId);
                return false;
            }
            
            // Filtrar videos eliminados o privados
            const title = (video.title || '').toLowerCase();
            const isDeleted = title.includes('deleted video') || 
                            title.includes('private video') ||
                            title.includes('[deleted]') ||
                            title.includes('[private]');
            
            if (isDeleted) {
                console.warn('⚠️ Video eliminado/privado omitido:', video.title);
                return false;
            }
            
            return true;
        })
        .map((video, index) => {
            // ✅ NORMALIZAR DURACIÓN
            let duration = 0;
            
            if (video.duration) {
                if (typeof video.duration === 'number' && video.duration > 0) {
                    // Ya está en segundos
                    duration = Math.floor(video.duration);
                } else if (typeof video.duration === 'string') {
                    // Convertir string a segundos
                    duration = this.parseDuration(video.duration);
                }
            }
            
            // ✅ NORMALIZAR ARTISTA/UPLOADER
            let artist = video.artist || 
                        video.uploaderName || 
                        video.author || 
                        video.channelName ||
                        'YouTube';
            
            // Limpiar " - Topic" de YouTube
            artist = artist.replace(/\s*-\s*Topic$/i, '').trim();
            
            // Si quedó vacío, usar fallback
            if (artist === '') {
                artist = 'Desconocido';
            }
            
            // ✅ NORMALIZAR THUMBNAIL
            let thumbnail = video.thumbnail || 
                          video.thumbnailUrl || 
                          './electronic.ico';
            
            // Validar que la URL sea válida
            if (thumbnail && !thumbnail.startsWith('http') && !thumbnail.startsWith('./')) {
                thumbnail = './electronic.ico';
            }
            
            // ✅ NORMALIZAR TÍTULO
            let title = video.title || 'Sin título';
            
            // Limpiar título de caracteres problemáticos
            title = title.trim();
            if (title === '') {
                title = 'Sin título';
            }
            
            // ✅ RETORNAR VIDEO NORMALIZADO
            return { 
                // IDs y referencias
                videoId: video.videoId,
                sourcePlaylistId: video.sourcePlaylistId || 'queue',
                
                // Información de display
                title: title,
                thumbnail: thumbnail,
                
                // Información de autor (múltiples propiedades para compatibilidad)
                artist: artist,
                uploaderName: artist,
                author: artist,
                channelName: artist,
                
                // Duración en segundos
                duration: duration,
                
                // Metadata adicional
                index: index,
                addedAt: video.addedAt || Date.now(),
                
                // Mantener datos originales si existen
                originalData: {
                    uploadDate: video.uploadDate,
                    views: video.views,
                    isLive: video.isLive || false
                }
            };
        });
    
    // ✅ GUARDAR EN CACHÉ
    this._flattenedCache = validVideos;
    this._flattenedCacheKey = cacheKey;
    
    console.log(`✅ Playlist aplanada generada: ${validVideos.length} videos válidos de ${queuePlaylist.videos.length} totales`);
    
    // ✅ VALIDACIÓN FINAL
    if (validVideos.length === 0 && queuePlaylist.videos.length > 0) {
        console.error('❌ CRÍTICO: Todos los videos fueron filtrados. Videos originales:', queuePlaylist.videos);
    }
    
    return validVideos;
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
invalidateFlattenedCache() {
    this._flattenedCache = null;
    this._flattenedCacheKey = null;
    console.log('🗑️ Caché de playlist aplanada invalidada');
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
        queueItem.dataset.videoId = video.videoId;
        queueItem.dataset.flatIndex = index;
        
        const duration = video.duration && video.duration > 0 
            ? this.formatDuration(video.duration) 
            : '--:--';
        
        queueItem.innerHTML = `
            <div class="queue-item-number">
                ${isPlaying ? '<i class="fas fa-play-circle"></i>' : (index + 1)}
            </div>
            <div class="queue-item-thumbnail-wrapper">
                <img src="${video.thumbnail || './electronic.ico'}" 
                     alt="${this.escapeHTML(video.title)}" 
                     onerror="this.src='./electronic.ico';">
                <span class="queue-item-duration">${duration}</span>
            </div>
            <div class="queue-item-info">
                <div class="queue-item-title">${this.escapeHTML(video.title || 'Sin título')}</div>
                <div class="queue-item-meta">
                    <span class="queue-item-author">${this.escapeHTML(video.uploaderName || 'Desconocido')}</span>
                </div>
            </div>
            <button class="queue-item-remove" 
                    data-video-id="${video.videoId}" 
                    title="Eliminar de la cola">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        fragment.appendChild(queueItem);
    });

    // ===== LIMPIAR Y RENDERIZAR =====
    queueContentList.innerHTML = '';
    queueContentList.appendChild(fragment);
    
    this.updateQueueCount(flatList.length);
    
    // ===== EVENT DELEGATION (OPTIMIZADO) =====
    // Remover listener anterior (si existe)
    const oldList = queueContentList.cloneNode(true);
    queueContentList.parentNode.replaceChild(oldList, queueContentList);
    
    // Obtener referencia actualizada
    const freshList = document.getElementById('queueContentList');
    
    if (freshList) {
        // ===== CLICK EN ITEMS =====
        freshList.addEventListener('click', (e) => {
            // Ignorar clicks en botones de eliminar
            if (e.target.closest('.queue-item-remove')) {
                return;
            }
            
            const item = e.target.closest('.queue-item');
            if (!item) return;
            
            const index = parseInt(item.dataset.flatIndex);
            if (!isNaN(index) && index >= 0) {
                console.log(`▶️ Reproduciendo desde cola: índice ${index}`);
               
            playNextVideo(index);
               
            }
        });
        
        // ===== BOTONES DE ELIMINAR =====
        freshList.querySelectorAll('.queue-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const videoId = btn.dataset.videoId;
                console.log(`🗑️ Eliminando: ${videoId}`);
                
                if (!videoId || videoId === 'undefined') {
                    console.error('❌ videoId inválido');
                    return;
                }
                
                // Deshabilitar botón temporalmente
                btn.disabled = true;
                btn.style.opacity = '0.5';
                
                // Llamar a función de eliminar
                if (window.playlistManager) {
                    const success = window.playlistManager.removeVideoFromQueue(videoId);
                    
                    if (!success) {
                        // Restaurar botón si falla
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    }
                } else {
                    console.error('❌ PlaylistManager no disponible');
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            });
        });
    }
    
    // ===== SCROLL AL ITEM ACTUAL =====
    if (currentIndex >= 0) {
        setTimeout(() => {
            const playingItem = freshList?.querySelector('.queue-item.playing');
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

    updateCurrentPlayingIndex() {
        if (crossfadeInProgress || isTransitioning) return;
        try {
            let playingVideoId = null;
            if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) playingVideoId = player1.getVideoData()?.video_id;
            else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) playingVideoId = player2.getVideoData()?.video_id;
            
            if (playingVideoId && currentPlayingInfo.videoId && currentPlayingInfo.videoId !== playingVideoId) return;
        } catch (e) {}
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

    handleEmptyPlaylist() {
        
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
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES
// =============================================

function preloadNextVideo() {    // Si no hay core o playlist, abortar
    if (!window.unifiedCore) return;

    const flatList = window.unifiedCore.getFlattenedPlaylist();
    // Validar que info actual existe
    if (!window.currentPlayingInfo || window.currentPlayingInfo.flattenedIndex === -1) return;

    const nextIndex = window.currentPlayingInfo.flattenedIndex + 1;

    // Solo precargar si existe un siguiente video en la lista
    if (nextIndex < flatList.length) {
        const nextVideo = flatList[nextIndex];
        // Seleccionar el reproductor que NO está sonando actualmente
        const nextPlayer = (window.currentPlayer === 1) ? window.player2 : window.player1;
        
        if (nextPlayer && typeof nextPlayer.cueVideoById === 'function') {
            console.log(`📥 Precargando siguiente pista: "${nextVideo.title}"`);
            
            // cueVideoById descarga metadatos y buffer inicial sin reproducir
            nextPlayer.cueVideoById({
                videoId: nextVideo.videoId,
                startSeconds: 0
            });
        
        }
    }
}

function monitorPlayers() {
    // ✅ VALIDACIONES INICIALES
    if (!playersInitialized || !window.reproduccionIniciada) {
        return;
    }

    // ✅ DETENER SI HAY CROSSFADE EN PROGRESO
    if (crossfadeInProgress) {
        return;
    }

    try {
        const activePlayer = (window.currentPlayer === 1) ? window.player1 : window.player2;
        
        // ✅ VALIDAR PLAYER Y MÉTODOS
        if (!activePlayer || typeof activePlayer.getPlayerState !== 'function') {
            console.warn('⚠️ Player no disponible en monitor');
            return;
        }

        const playerState = activePlayer.getPlayerState();
        
        // ✅ MANEJAR ENDED (movido aquí desde onPlayerStateChange)
        if (playerState === YT.PlayerState.ENDED) {
            console.log('🎬 Video terminado detectado en monitor');
            
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }
            
            // Resetear banderas
            hasOutroCrossfadeStarted = false;
            nextVideoScheduled = false;
            isTransitioning = false;
            isNextVideoPreloaded = false;
            
            if (window.unifiedCore?.playNextVideo) {
                setTimeout(() => {
                    window.unifiedCore.playNextVideo();
                }, 100);
            }
            return;
        }
        
        // Solo continuar si está reproduciendo
        if (playerState !== YT.PlayerState.PLAYING) {
            return;
        }

        // ✅ VALIDAR MÉTODOS ANTES DE USAR
        if (typeof activePlayer.getCurrentTime !== 'function' ||
            typeof activePlayer.getDuration !== 'function') {
            console.warn('⚠️ Métodos de player no disponibles');
            return;
        }

        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoData = activePlayer.getVideoData();
        const videoId = videoData?.video_id;

        // ✅ VALIDAR DURACIÓN
        if (!videoDuration || videoDuration <= 0) {
            return;
        }

        // ✅ LOG CADA 5 SEGUNDOS
        if (Math.floor(currentTime) % 5 === 0 && Math.floor(currentTime) !== lastLogTime) {
            lastLogTime = Math.floor(currentTime);
            const remaining = videoDuration - currentTime;
            console.log(`⏱️ Player${window.currentPlayer}: ${Math.floor(currentTime)}s / ${Math.floor(videoDuration)}s (quedan ${Math.floor(remaining)}s)`);
        }

        // SPONSORBLOCK
        if (videoId && window.sponsorBlockManager) {
            const cached = window.sponsorBlockManager.segmentosCache[videoId];
            
            if (!cached) {
                window.sponsorBlockManager.cargarSegmentos(videoId);
            } else if (cached !== 'fetching') {
                window.sponsorBlockManager.checkAndSkip(activePlayer);
            }
        }

        const timeRemaining = videoDuration - currentTime;

        // ✅ PRELOAD: 25 segundos antes
        if (timeRemaining <= 25 && timeRemaining > 24 && !isNextVideoPreloaded && !nextVideoScheduled) {
            const flatList = window.unifiedCore?.getFlattenedPlaylist() || [];
            const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
            
            if (currentIndex >= 0 && currentIndex + 1 < flatList.length) {
                console.log(`📥 PRECARGA: Siguiente video (quedan ${Math.floor(timeRemaining)}s)`);
                preloadNextVideo();
                isNextVideoPreloaded = true;
            }
        }

        // ✅ CROSSFADE TRIGGER: CROSSFADE_DURATION (10s) + 0.5s de margen
        let triggerTime = videoDuration - CROSSFADE_DURATION - 0.5;
        
        // Ajustar trigger si hay SponsorBlock
        if (videoId && window.sponsorBlockManager) {
            triggerTime = window.sponsorBlockManager.calculateCrossfadeTriggerTime(
                videoDuration,
                videoId,
                CROSSFADE_DURATION
            );
        }

        // ✅ ACTIVAR CROSSFADE cuando quedan 10.5 segundos (o según SponsorBlock)
        if (currentTime >= triggerTime && 
            !hasOutroCrossfadeStarted && 
            !isTransitioning && 
            !nextVideoScheduled) {
            
            const remainingAtTrigger = videoDuration - currentTime;
            console.log(`🎨 CROSSFADE ACTIVADO - Quedan ${remainingAtTrigger.toFixed(2)}s | Trigger: ${triggerTime.toFixed(2)}s`);
            
            // Marcar banderas
            hasOutroCrossfadeStarted = true;
            nextVideoScheduled = true;
            isTransitioning = true;
            
            // Detener monitor
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }

            // Llamar a playNextVideo (que hace el crossfade de 10s)
            if (window.unifiedCore?.playNextVideo) {
                window.unifiedCore.playNextVideo();
            }
        }
        
        // ✅ FALLBACK: Si el video está por terminar (0.5s antes)
        if (timeRemaining <= 0.5 && !nextVideoScheduled) {
            console.log("⚠️ Fallback activado - Video casi terminado sin crossfade");
            nextVideoScheduled = true;
            
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }
            
            if (window.unifiedCore?.playNextVideo) {
                window.unifiedCore.playNextVideo();
            }
        }
        
    } catch (error) { 
        console.error('❌ Error en monitorPlayers:', error);
        
        // ✅ RECUPERACIÓN DE ERROR
        if (error.message && error.message.includes('null')) {
            console.warn('⚠️ Player destruido, deteniendo monitor');
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }
        }
    }
}
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
    
    // 4. ✅ CRÍTICO: Limpiar interval de letras
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

