console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
// --- VARIABLES GLOBALES PARA SPONSORBLOCK ---
let lastSkipTime = 0;      // Evita bucles infinitos de saltos

// Traducción de categorías
const nombresCategorias = {
    'sponsor': 'Patrocinio',
    'intro': 'Intro',
    'outro': 'Créditos',
    'interaction': 'Interacción',
    'selfpromo': 'Autopromo',
    'music_offtopic': 'Intro no musical'
};
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
try {
    const saved = sessionStorage.getItem('ytcm_sponsor_cache');
    if (saved) {
        segmentosCache = JSON.parse(saved);
        console.log('📦 Cache de SponsorBlock restaurada de sesión.');
    }
} catch (e) { 
    console.warn('⚠️ No se pudo acceder a sessionStorage para SponsorBlock'); 
}
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
        // CORRECCIÓN: Usar datos de la instancia activa, NO la variable global
        let dataToSave = [];
        
        if (window.playlistManager && window.playlistManager.playlistsData) {
            // Prioridad 1: Datos del gestor de playlists
            dataToSave = window.playlistManager.playlistsData;
        } else if (window.unifiedCore && window.unifiedCore.playlistsData) {
            // Prioridad 2: Datos del núcleo
            dataToSave = window.unifiedCore.playlistsData;
        } else {
            // Fallback: Variable global (solo si nada más existe)
            dataToSave = playlistsData;
        }

        if (typeof savePlaylistsDataPersistent === 'function') {
            // Filtramos para no guardar cosas de YouTube Library que se recargan solas
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
        this.state = unifiedState;
        this.views = ['home', 'search', 'library', 'playing'];
        this.currentView = 'home';
        this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
        this.playlistsData = playlistsData;
        this.scrollObserver = null; // Inicializar observador de scroll
        this.ui = window.uiManager; // Referencia corta
        // Inicializar
        this.init();
        this.setupAutomaticSaving();
        this.setupPlayerContainerHandlers();

        // Exportar funciones globales vinculadas a esta instancia
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
    console.log('🔄 Reseteando banderas...');
    hasOutroCrossfadeStarted = false;
    nextVideoScheduled = false;
    isTransitioning = false;
    crossfadeInProgress = false;
    isNextVideoPreloaded = false;
    
    if (this.pendingCrossfade) {
        this.pendingCrossfade.active = false;
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
        this.startMonitoring();
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

onPlayerStateChange(event) {
    const player = event.target;
    const state = event.data;
    
    // 1. GESTIÓN DE SPONSORBLOCK (Intros/Segmentos)
    // Intentar saltar inmediatamente si está cargando o listo
    if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.CUED) {
        const videoData = player.getVideoData();
        if (videoData?.video_id) {
            checkAndSkipSegment(player);
        }
    }
    
    // 2. LOGICA DE REPRODUCCIÓN (PLAYING)
    if (state === YT.PlayerState.PLAYING) {
        
        // === A. SINCRONIZACIÓN GAPLESS (La magia del crossfade) ===
        // Si había una transición pendiente esperando a que este player cargara...
        if (this.pendingCrossfade && this.pendingCrossfade.active) {
            
            // Verificamos si este es el reproductor que estábamos esperando
            const isNextPlayer = (player === this.pendingCrossfade.next);

            if (isNextPlayer) {
                console.log('🚀 Buffer terminado: INICIANDO CROSSFADE DE AUDIO AHORA');
                
                // Iniciamos la mezcla de volumen solo ahora que hay audio real
                this.startCrossfade(this.pendingCrossfade.prev, this.pendingCrossfade.next);
                
                // Limpiamos la bandera para no repetir
                this.pendingCrossfade.active = false;
            }
        }

        // === B. ACTUALIZACIÓN DE ESTADO ===
        isNextVideoPreloaded = false; // <--- AGREGAR ESTO PARA RESETEAR EL CICLO
        hasOutroCrossfadeStarted = false; // Resetear bandera de salida
        
        const videoData = player.getVideoData();
        if (videoData?.video_id) {
            // Sincronizar índice en la lista plana
            const flatList = this.getFlattenedPlaylist();
            const index = flatList.findIndex(v => v.videoId === videoData.video_id);
            
            if (index !== -1) {
                window.currentPlayingInfo.flattenedIndex = index;
                window.currentPlayingInfo.videoId = videoData.video_id;
                this.state.currentPlayingInfo = window.currentPlayingInfo;
                // console.log(`✅ Índice sincronizado: ${index} (${videoData.video_id})`);
            }
            
            // Re-verificar SponsorBlock por si acaso (ej. intros muy cortas)
            setTimeout(() => checkAndSkipSegment(player), 500);
        }
        
        this.updateCurrentPlayingIndex(); // Marcar canción actual
        this.updateNowPlaying();        // Actualizar textos/títulos
        
        if (window.playlistManager) {
            this.updatePersistentQueue(); // Actualizar scroll de la cola
            
            if (window.playlistManager.syncQueueIndicator) {
                window.playlistManager.syncQueueIndicator();
            }
            if (window.playlistManager.refreshActiveQueueTab) {
                window.playlistManager.refreshActiveQueueTab();
            }
        }
        
        // Guardar estado
        setTimeout(() => saveAllData(), 1000);
    }
    
    if (state === YT.PlayerState.ENDED) {
        console.log('📻 Video terminado, solicitando siguiente...');
        this.playNextVideo();
    }
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
    const playButtons = ['botonPlay', 'miniPlayBtn'];
    
    playButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            // ✅ Clonar nodo para limpiar listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handlePlayPause();
            });
        }
    });
}

    setupSearch() {
        const searchInputs = [
            document.getElementById('searchInput'),
            document.getElementById('sidebarSearchInput'),
            document.getElementById('mobileSearchInput')
        ].filter(Boolean);

       const debouncedSearch = this.debounce((query) => {
    this.performSearch(query);
    }, 800); 

        searchInputs.forEach(input => {
            input.addEventListener('input', (event) => {
                const query = event.target.value.trim();
                if (query.length > 2) {
                    debouncedSearch(query);
                    if (this.currentView !== 'search') {
                        this.switchView('search'); 
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
    console.log('⏭️ handleNext llamado');
    
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

    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    
    hasOutroCrossfadeStarted = false;
    nextVideoScheduled = false;
    isTransitioning = false;
    
    // ✅ Reproducir siguiente video
    this.playVideoAtIndex(nextIndex);
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
    // Debounce para evitar doble salto
    const now = Date.now();
    if (now - lastCrossfadeTime < 1000) return; 
    lastCrossfadeTime = now;
    
    if (!playersInitialized) return;

    // Obtener datos actuales
    const currentFlatIndex = currentPlayingInfo.flattenedIndex;
    const flatList = this.getFlattenedPlaylist();

    if (flatList.length === 0) return this.handleEmptyPlaylist();

    let nextIndex = currentFlatIndex + 1;
    if (nextIndex >= flatList.length) return this.handleEndOfPlaylist();

    const nextVideo = flatList[nextIndex];
    
    // 1. ACTUALIZACIÓN DE ESTADO
    currentPlayingInfo = {
        flattenedIndex: nextIndex,
        videoId: nextVideo.videoId,
        playlistId: nextVideo.sourcePlaylistId
    };
    window.currentPlayingInfo = currentPlayingInfo; 
    
    this.updateNowPlaying();

    if (window.playlistManager) {
        window.playlistManager.syncQueueIndicator(); 
        this.updatePersistentQueue(); 
        window.playlistManager.refreshActiveQueueTab(); 
    }

    // 2. PREPARAR REPRODUCTORES
    const prevPlayerInstance = currentPlayer === 1 ? player1 : player2;
    const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
    
    const prevPlayerNum = currentPlayer;
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    window.currentPlayer = currentPlayer;

    try {
        console.log(`⌛ Cargando siguiente video (${nextVideo.videoId})... esperando buffer.`);

        nextPlayerInstance.loadVideoById({
            videoId: nextVideo.videoId,
            startSeconds: 0
        });
        nextPlayerInstance.setVolume(0); 

        this.pendingCrossfade = {
            active: true,
            prev: prevPlayerInstance,
            next: nextPlayerInstance,
            prevNum: prevPlayerNum,
            nextNum: currentPlayer
        };

        document.dispatchEvent(new CustomEvent('crossfadeTriggered', {
            detail: { prevPlayer: prevPlayerNum, nextPlayer: currentPlayer }
        }));

    } catch (error) {
        console.error("❌ Error en playNextVideo:", error);
        
        // ✅ CORRECCIÓN: RESETEAR TODAS LAS BANDERAS EN CASO DE ERROR
        hasOutroCrossfadeStarted = false;
        nextVideoScheduled = false;
        isTransitioning = false;
        crossfadeInProgress = false;
        isNextVideoPreloaded = false;
        
        // Limpiar pending crossfade
        if (this.pendingCrossfade) {
            this.pendingCrossfade.active = false;
        }
        
        // Restaurar estado del player
        currentPlayer = prevPlayerNum;
        window.currentPlayer = currentPlayer;
        
        // Mostrar error al usuario
        this.showMessage('Error cambiando de video', 'error');
        
        // Reintentar en 2 segundos si es posible
        setTimeout(() => {
            if (flatList.length > nextIndex) {
                console.log('🔄 Reintentando reproducción...');
                this.playNextVideo();
            }
        }, 2000);
    }
}
startCrossfade(prevPlayer, nextPlayer) {
    if (crossfadeInProgress) {
        console.warn('⚠️ Crossfade ya en progreso, ignorando');
        return;
    }
    
    crossfadeInProgress = true;
    
    // ✅ CORRECCIÓN: Obtener elementos DOM correctamente
    const prevPlayerNum = (prevPlayer === window.player1) ? 1 : 2;
    const nextPlayerNum = (nextPlayer === window.player1) ? 1 : 2;
    
    const prevElement = document.getElementById(`player${prevPlayerNum}`);
    const nextElement = document.getElementById(`player${nextPlayerNum}`);
    
    console.log(`🎨 Crossfade: Player${prevPlayerNum} → Player${nextPlayerNum}`);
    
    // ✅ CRÍTICO: Asegurar visibilidad del siguiente player ANTES de fade
    if (nextElement) {
        nextElement.style.display = 'block';
        nextElement.style.visibility = 'visible';
        nextElement.style.opacity = '0'; // Empezar invisible pero renderizado
        nextElement.classList.remove('hidden', 'fade-out');
        nextElement.classList.add('fade-in');
        
        // Forzar reflow para que el navegador aplique los estilos
        void nextElement.offsetWidth;
    }
    
    if (prevElement) {
        prevElement.classList.remove('fade-in');
        prevElement.classList.add('fade-out');
    }
    
    // Iniciar reproducción del siguiente
    try { 
        if (nextPlayer && typeof nextPlayer.playVideo === 'function') {
            nextPlayer.playVideo(); 
        }
    } catch(e) {
        console.warn('⚠️ Error iniciando nextPlayer:', e);
    }

    const steps = 50;
    const stepTime = (CROSSFADE_DURATION * 1000) / steps; 
    let step = 0;

    console.log(`🎚️ Mezclando audio... (${CROSSFADE_DURATION}s, ${steps} pasos)`);

    crossfadeInterval = setInterval(() => {
        step++;
        const progress = step / steps;
        
        const gainNext = Math.sin(progress * (Math.PI / 2));
        const gainPrev = Math.cos(progress * (Math.PI / 2));

        // ✅ Audio fade
        try {
            if (prevPlayer && typeof prevPlayer.setVolume === 'function') {
                prevPlayer.setVolume(Math.round(100 * gainPrev));
            }
            
            if (nextPlayer && typeof nextPlayer.setVolume === 'function') {
                nextPlayer.setVolume(Math.round(100 * gainNext));
            }
        } catch (e) {
            console.warn('⚠️ Error ajustando volumen:', e);
        }
        
        // ✅ Visual fade (opacity)
        if (nextElement) {
            nextElement.style.opacity = gainNext.toFixed(2);
        }
        if (prevElement) {
            prevElement.style.opacity = gainPrev.toFixed(2);
        }

        if (step >= steps) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;
            crossfadeInProgress = false;

            // Limpieza final
            try {
                if (prevPlayer && typeof prevPlayer.stopVideo === 'function') {
                    prevPlayer.stopVideo();
                    prevPlayer.setVolume(100);
                }
                if (nextPlayer && typeof nextPlayer.setVolume === 'function') {
                    nextPlayer.setVolume(100);
                }
                
                // ✅ CORRECCIÓN: Limpiar clases visuales
                if (prevElement) {
                    prevElement.classList.remove('fade-out');
                    prevElement.classList.add('hidden');
                    prevElement.style.display = 'none';
                    prevElement.style.opacity = '0';
                }
                
                if (nextElement) {
                    nextElement.classList.remove('fade-in');
                    nextElement.style.opacity = '1';
                }
                
            } catch (e) {
                console.warn('⚠️ Error en limpieza:', e);
            }

            hasOutroCrossfadeStarted = false;
            nextVideoScheduled = false;
            isTransitioning = false;
            
            console.log('✅ Crossfade completado, banderas reseteadas');
            
            document.dispatchEvent(new CustomEvent('crossfadeCompleted'));
            
            // Reiniciar monitor
            if (!monitorInterval && window.unifiedCore) {
                setTimeout(() => {
                    window.unifiedCore.startMonitoring();
                }, 500);
            }
        }
    }, stepTime);
}
    // ==========================================
    // FUNCIONES DE BÚSQUEDA Y SCROLL INFINITO
    // ==========================================
async performSearch(query, continuation = null) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    // Si es búsqueda nueva
    if (!continuation) {
        currentSearchQuery = query;
        nextPageContext = null;
        searchResults.innerHTML = '<div class="search-loading">🔍 Buscando...</div>';
        
        // ✅ CORRECCIÓN: Desconectar observador de forma segura
        if (this.searchScrollObserver) {
            try {
                this.searchScrollObserver.disconnect();
            } catch (e) {
                console.warn('⚠️ Error desconectando observer:', e);
            } finally {
                this.searchScrollObserver = null;
            }
        }
    }

    isLoadingMore = true;
    try {
        const data = await window.youtubeJSClient.search(query, continuation);
        
        nextPageContext = data.nextpage || null;
        console.log('📄 Próxima página:', nextPageContext ? 'Disponible' : 'No hay más');

        this.displaySearchResults(data, !!continuation);
        
        // ✅ CORRECCIÓN: Solo configurar si hay más páginas
        if (nextPageContext) {
            requestAnimationFrame(() => {
                this.setupInfiniteScroll(searchResults);
            });
        } else {
            // Limpiar sentinel si ya no hay más páginas
            const sentinel = document.getElementById('search-sentinel');
            if (sentinel) sentinel.remove();
        }
        } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        
        // ✅ CORRECCIÓN: Limpiar observador en caso de error
        if (this.searchScrollObserver) {
            try {
                this.searchScrollObserver.disconnect();
            } catch (e) {
                console.warn('⚠️ Error desconectando observer tras error:', e);
            } finally {
                this.searchScrollObserver = null;
            }
        }
        
        searchResults.innerHTML = `
            <div class="search-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error: ${error.message}</p>
                <button onclick="window.unifiedCore.performSearch('${query.replace(/'/g, "\\'")}')">
                    Reintentar
                </button>
            </div>
        `;
    } finally {
        isLoadingMore = false;
    }
}
            
setupInfiniteScroll(container) {
    console.log('📜 Configurando scroll infinito...');
    
    // 1. Limpiar sentinel anterior
    const oldSentinel = document.getElementById('search-sentinel');
    if (oldSentinel) oldSentinel.remove();
    
    // 2. Crear nuevo sentinel
    const sentinel = document.createElement('div');
    sentinel.id = 'search-sentinel';
    sentinel.style.cssText = 'height: 50px; width: 100%; pointer-events: none;';
    container.appendChild(sentinel);

    // 3. Desconectar observador anterior de forma segura
    if (this.searchScrollObserver) {
        try {
            this.searchScrollObserver.disconnect();
        } catch (e) {
            console.warn('⚠️ Error desconectando observer anterior:', e);
        }
    }

    // 4. Crear nuevo observador
    this.searchScrollObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        
        if (entry.isIntersecting && !isLoadingMore && nextPageContext) {
            console.log('📜 Sentinel visible, cargando más...');
            this.performSearch(currentSearchQuery, nextPageContext);
        }
    }, {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
    });

    this.searchScrollObserver.observe(sentinel);
    console.log('✅ Observador configurado correctamente');
}
    
// Renderizar resultados de búsqueda
displaySearchResults(videos, isContinuation = false) {
    this.ui.renderSearchResults(videos, isContinuation);
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
    let queuePlaylist = this.playlistsData.find(p => p.id === 'queue' || p.isQueue);
    
    if (!queuePlaylist) {
        // Crear si no existe
        queuePlaylist = {
            id: 'queue',
            name: 'Cola de Reproducción',
            thumbnailUrl: './electronic.ico',
            videos: [],
            isExpanded: true,
            isQueue: true
        };
        // Asegurar que lo añadimos a la instancia
        this.playlistsData.unshift(queuePlaylist);
        console.warn('⚠️ Playlist de cola no encontrada, creándola y añadiéndola.');
    }
    
    if (!queuePlaylist.videos || !Array.isArray(queuePlaylist.videos)) {
        return [];
    }
    
    // Filtrar y mapear
    const validVideos = queuePlaylist.videos.filter(video => {
        if (!video.videoId || video.videoId === 'undefined') return false;
        const title = (video.title || '').toLowerCase();
        const isDeleted = title.includes('deleted video') || title.includes('private video');
        return !isDeleted;
    }).map(video => {
        let duration = 0;
        if (video.duration) {
            duration = typeof video.duration === 'number' ? video.duration : this.parseDuration(video.duration);
        }
        let artist = video.artist || video.uploaderName || video.author || 'YouTube';
        
        return { ...video, duration, artist, uploaderName: artist, author: artist };
    });
    
    return validVideos;
}
updatePersistentQueue() {
    console.log('🔄 Actualizando cola persistente (Modo Optimizado)...');
    
    const queueContentList = document.getElementById('queueContentList');
    if (!queueContentList) return;

    const flatList = this.getFlattenedPlaylist();
    
    if (flatList.length === 0) {
        queueContentList.innerHTML = '<p class="queue-placeholder">La cola está vacía.</p>';
        this.updateQueueCount(0);
        return;
    }

    const currentIndex = this.state?.currentPlayingInfo?.flattenedIndex ?? -1;
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
        
        queueItem.onclick = () => this.playVideoAtIndex(index);
        
        if (isPlaying) {
            setTimeout(() => queueItem.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100);
        }
        
        fragment.appendChild(queueItem);
    });

    queueContentList.innerHTML = '';
    queueContentList.appendChild(fragment);
    this.updateQueueCount(flatList.length);
    
    // ✅ Configurar listeners de eliminación
    if (window.playlistManager && window.playlistManager.setupQueueItemListeners) {
        window.playlistManager.setupQueueItemListeners();
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
    if (index < 0 || index >= flatList.length) {
        console.warn('❌ Índice inválido:', index);
        return;
    }

    const video = flatList[index];
    console.log('🎬 Reproduciendo:', video.title);
    
    currentPlayingInfo = {
        flattenedIndex: index,
        videoId: video.videoId,
        playlistId: video.sourcePlaylistId
    };
    window.currentPlayingInfo = currentPlayingInfo;
    window.reproduccionIniciada = true;

    try {
        const activePlayer = currentPlayer === 1 ? player1 : player2;
        const activePlayerId = currentPlayer === 1 ? 'player1' : 'player2';
        const inactivePlayerId = currentPlayer === 1 ? 'player2' : 'player1';
        
        console.log(`🎮 Player activo: ${activePlayerId}, Video: ${video.videoId}`);
        
        // ✅ CRÍTICO: Asegurar visibilidad ANTES de cargar video
        const activeDiv = document.getElementById(activePlayerId);
        const inactiveDiv = document.getElementById(inactivePlayerId);
        
        if (activeDiv) {
            activeDiv.style.cssText = `
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
            activeDiv.classList.remove('hidden');
        }
        
        if (inactiveDiv) {
            inactiveDiv.style.display = 'none';
            inactiveDiv.style.opacity = '0';
            inactiveDiv.style.zIndex = '0';
            inactiveDiv.classList.add('hidden');
        }
        
        //  Cargar video
        activePlayer.loadVideoById(video.videoId);
        
        // Verificar iframe con retry y sin error si no existe aún
        const checkIframe = (attempts = 0) => {
        if (attempts > 10) return; // Max 5 segundos
    
        const iframe = activeDiv?.querySelector('iframe');
        if (iframe && iframe.src) {
        console.log(' Iframe cargado:', iframe.src);
        } else if (attempts < 10) {
        setTimeout(() => checkIframe(attempts + 1), 500);
        }
    };
    checkIframe();
        
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
        console.error('❌ Error al reproducir video:', error);
        this.showMessage("Error al reproducir video: " + error.message, 'error');
        reproduccionIniciada = false;
        window.reproduccionIniciada = false;
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
        // CORRECCIÓN: Intentar cargar primero de la key persistente moderna
        if (typeof loadPlaylistsDataPersistent === 'function') {
            const persistentData = loadPlaylistsDataPersistent();
            if (persistentData && Array.isArray(persistentData) && persistentData.length > 0) {
                console.log('📂 Datos iniciales cargados desde almacenamiento persistente');
                this.playlistsData = persistentData;
                return;
            }
        }

        // Fallback a la key antigua solo si la nueva falla
        if (this.playlistsData.length === 0) {
            try {
                const savedPlaylists = localStorage.getItem('ytcm_playlists');
                if (savedPlaylists) {
                    const parsed = JSON.parse(savedPlaylists);
                    if (Array.isArray(parsed)) this.playlistsData = parsed;
                }
            } catch (e) {}
        }
    }
    saveData() {
        saveAllData();
    }
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES
// =============================================

function preloadNextVideo() {
    // Si no hay core o playlist, abortar
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
            
            // Opcional: Cargar también sus segmentos SponsorBlock ahora
            cargarSponsorBlock(nextVideo.videoId);
        }
    }
}
async function cargarSponsorBlock(videoId) {
    // ✅ Verificar estructura correcta del caché
    const cached = segmentosCache[videoId];
    
    if (cached && typeof cached === 'object' && cached.segments) {
        const cacheAge = Date.now() - (cached.timestamp || 0);
        if (cacheAge < 10 * 60 * 1000) {
            console.log(`✅ SB: Usando caché para ${videoId}`);
            return cached.segments;
        }
    }

    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd';
    const apiUrl = `https://mix-yt.netlify.app/.netlify/functions/sponsorblock?videoId=${videoId}`;
    
    segmentosCache[videoId] = 'fetching';

    try {
        const response = await fetch(apiUrl, { 
            headers: { 'X-UserID': userId } 
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        // ✅ Guardar con estructura correcta
        const segments = Array.isArray(data) 
            ? data.filter(s => s.startTime < s.endTime)
            : [];
        
        segmentosCache[videoId] = {
            segments: segments,
            timestamp: Date.now()
        };
        
        console.log(`✅ SB: ${segments.length} segmentos para ${videoId}`);
        return segments;
        
    } catch (e) {
        console.warn(`⚠️ SB Error ${videoId}:`, e.message);
        segmentosCache[videoId] = { 
            segments: [], 
            timestamp: Date.now() 
        };
        return [];
    }
}

function checkAndSkipSegment(player) {
    const videoId = player.getVideoData()?.video_id;
    if (!videoId) return;
    
    const cached = segmentosCache[videoId];
    
    // ✅ Validar estructura del caché
    if (!cached || cached === 'fetching' || typeof cached !== 'object') {
        return;
    }
    
    const segments = cached.segments || [];
    if (segments.length === 0) return;

    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();

    if (Math.abs(currentTime - lastSkipTime) < 1.5) return;

    for (const seg of segments) {
        if (currentTime >= seg.startTime && currentTime < seg.endTime) {
            
            const nombreCat = nombresCategorias[seg.category] || seg.category;

            if (seg.endTime >= (duration - 2)) {
                console.log("🎬 SponsorBlock: Outro detectado");
                mostrarAvisoSB(`🎬 Final saltado`, player.getIframe().parentElement);
                player.seekTo(duration, true);
            } else {
                console.log(`⏩ SponsorBlock: Saltando ${nombreCat}`);
                mostrarAvisoSB(`⏩ Saltado: ${nombreCat}`, player.getIframe().parentElement);
                player.seekTo(seg.endTime, true);
            }

            lastSkipTime = seg.endTime;
            break;
        }
    }
}
// Función visual simple (asegúrate de tener el CSS .sb-toast que te pasé antes)
function mostrarAvisoSB(mensaje, container) {
    // ✅ CORRECCIÓN: Limpiar avisos anteriores primero
    const oldToasts = document.querySelectorAll('.sb-toast');
    oldToasts.forEach(toast => toast.remove());
    
    let toast = document.createElement('div');
    toast.className = 'sb-toast';
    toast.textContent = mensaje;
    
    // Estilos inline para asegurar visibilidad
    toast.style.cssText = `
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 100;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    (container || document.body).appendChild(toast);
    
    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
function monitorPlayers() {
    if (!playersInitialized || !reproduccionIniciada) return;

    try {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (!activePlayer?.getPlayerState) return;

        const playerState = activePlayer.getPlayerState();
        
        // ✅ CRÍTICO: Detectar final de video
        if (playerState === YT.PlayerState.ENDED) {
            console.log('🎬 Video terminado, llamando a playNextVideo...');
            
            // Limpiar monitor para evitar llamadas múltiples
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }
            
            // Resetear flags
            hasOutroCrossfadeStarted = false;
            nextVideoScheduled = false;
            isTransitioning = false;
            
            // Llamar a siguiente video
            if (window.unifiedCore?.playNextVideo) {
                window.unifiedCore.playNextVideo();
            }
            return;
        }
        
        if (playerState !== YT.PlayerState.PLAYING) return;

        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoData = activePlayer.getVideoData();
        const videoId = videoData?.video_id;

        // SponsorBlock
        if (videoId && !segmentosCache[videoId]) {
            cargarSponsorBlock(videoId);
        }

        if (videoId) {
            checkAndSkipSegment(activePlayer);
        }

        const timeRemaining = videoDuration - currentTime;

        // Preload
        if (timeRemaining < 25 && !isNextVideoPreloaded && !nextVideoScheduled) {
            preloadNextVideo();
            isNextVideoPreloaded = true; 
        }

        // ✅ CORRECCIÓN: Crossfade con mejor detección
        const triggerTime = calculateCrossfadeTriggerTime(videoDuration, videoId);

        if (currentTime >= triggerTime && 
            !hasOutroCrossfadeStarted && 
            !isTransitioning && 
            !nextVideoScheduled) {
            
            console.log(`🎨 CROSSFADE ACTIVADO - Trigger: ${triggerTime.toFixed(2)}s`);
            
            hasOutroCrossfadeStarted = true;
            nextVideoScheduled = true;
            isTransitioning = true;
            
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
            }

            document.dispatchEvent(new CustomEvent('crossfadeTriggered', {
                detail: { 
                    prevPlayer: currentPlayer, 
                    nextPlayer: currentPlayer === 1 ? 2 : 1,
                    timeRemaining: timeRemaining
                }
            }));
            
            if (window.unifiedCore?.playNextVideo) {
                window.unifiedCore.playNextVideo();
            }
        }
        
        // ✅ CORRECCIÓN: Fallback mejorado
        if (timeRemaining <= 0.5 && !nextVideoScheduled) {
            console.log("⚠️ Fallback activado - Video casi terminado");
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
    }
}

function calculateCrossfadeTriggerTime(videoDuration, videoId) {
    // Margen de seguridad para que no corte antes de tiempo
    const SAFETY_MARGIN = 0.5; 
    
    // Si no hay datos, usar el final normal menos la duración del efecto
    if (!videoId || !segmentosCache[videoId] || !Array.isArray(segmentosCache[videoId])) {
        return videoDuration - CROSSFADE_DURATION - SAFETY_MARGIN;
    }

    // 1. Encontrar el "Final Efectivo" (Donde termina la música realmente)
    // Buscamos segmentos tipo 'outro', 'selfpromo', etc. que estén cerca del final
    let effectiveEndTime = videoDuration;
    
    const endCategories = ['outro', 'selfpromo', 'interaction', 'music_offtopic', 'preview'];
    
    segmentosCache[videoId].forEach(segment => {
        if (endCategories.includes(segment.category)) {
            const start = segment.segment?.[0] ?? segment.startTime;
            const end = segment.segment?.[1] ?? segment.endTime;
            
            // Si este segmento termina cerca del final del video (margen de 2s)
            // entonces el video "musicalmente" termina donde empieza este segmento.
            if (Math.abs(videoDuration - end) < 5) {
                if (start < effectiveEndTime) {
                    effectiveEndTime = start;
                }
            }
        }
    });

    console.log(`⏱️ Video: ${videoDuration}s | Final Efectivo: ${effectiveEndTime}s | Trigger: ${effectiveEndTime - CROSSFADE_DURATION}s`);

    // 2. El trigger es: Final Efectivo - Duración del Crossfade - Margen
    return effectiveEndTime - CROSSFADE_DURATION - SAFETY_MARGIN;
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
// =============================================
// LIMPIEZA AUTOMÁTICA DE CACHÉ SPONSORBLOCK
// =============================================

/**
 * Limpiar segmentos de SponsorBlock antiguos para evitar memory leak
 */
function cleanupSponsorBlockCache() {
    const MAX_AGE = 10 * 60 * 1000; // 10 minutos
    const MAX_ENTRIES = 100;
    const now = Date.now();
    
    const entries = Object.entries(segmentosCache);
    const validEntries = entries.filter(([videoId, data]) => {
        if (!data.timestamp) return false;
        return (now - data.timestamp) < MAX_AGE;
    });
    
    if (validEntries.length > MAX_ENTRIES) {
        validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        validEntries.splice(MAX_ENTRIES);
    }
    
    segmentosCache = Object.fromEntries(validEntries);
    
    try {
        sessionStorage.setItem('ytcm_sponsor_cache', JSON.stringify(segmentosCache));
    } catch (e) {
        console.warn('⚠️ Cache muy grande, limpiando...');
        segmentosCache = {};
    }
}

// Ejecutar cada 5 minutos
setInterval(cleanupSponsorBlockCache, 5 * 60 * 1000);

window.savePlaylistsDataPersistent = savePlaylistsDataPersistent;
window.loadPlaylistsDataPersistent = loadPlaylistsDataPersistent;
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
    
    // ✅ CORRECCIÓN: LIMPIEZA COMPLETA DE RECURSOS
    
    // 1. Guardar datos y detener monitoring
    if (window.unifiedCore?.state?.initialized) {
        try {
            window.unifiedCore.saveData();
            window.unifiedCore.stopMonitoring();
        } catch (e) {
            console.warn('⚠️ Error en saveData:', e);
        }
    }
    
    // 2. Desconectar observers
    if (window.unifiedCore) {
        // Search scroll observer
        if (window.unifiedCore.searchScrollObserver) {
            try {
                window.unifiedCore.searchScrollObserver.disconnect();
                window.unifiedCore.searchScrollObserver = null;
            } catch (e) {
                console.warn('⚠️ Error desconectando search observer:', e);
            }
        }
        
        // Mini player observer (si existe)
        if (window.unifiedCore.miniPlayerObserver) {
            try {
                window.unifiedCore.miniPlayerObserver.disconnect();
                window.unifiedCore.miniPlayerObserver = null;
            } catch (e) {
                console.warn('⚠️ Error desconectando mini player observer:', e);
            }
        }
        
        // Limpiar interval de guardado automático
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
    
    // 4. Limpiar interval de letras
    if (window.playlistManager?.lyricsSyncInterval) {
        clearInterval(window.playlistManager.lyricsSyncInterval);
        window.playlistManager.lyricsSyncInterval = null;
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
    
    // 6. Limpiar cache de SponsorBlock
    if (typeof cleanupSponsorBlockCache === 'function') {
        try {
            cleanupSponsorBlockCache();
        } catch (e) {
            console.warn('⚠️ Error limpiando cache SB:', e);
        }
    }
    
    // 7. Remover event listeners de resize
    window.removeEventListener('resize', window.resizeTimeout);
    
    console.log('✅ Recursos limpiados correctamente');
});

window.UnifiedCore = UnifiedCore;

