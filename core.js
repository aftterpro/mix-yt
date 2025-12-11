console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const CROSSFADE_DURATION = 10; // Duración del crossfade en segundos
// ✅ CRÍTICO: Variables globales expuestas
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
const CROSSFADE_DEBOUNCE = 500; // ms
const CROSSFADE_TRIGGER_TIME = 10; // segundos antes del fin para iniciar crossfade

// Estado de playlists y reproducción
let playlistsData = [];
let currentPlayingInfo = {
    playlistId: null,
    videoId: null,
    flattenedIndex: -1
};

// Variables para búsqueda
let isLoadingMore = false;
let nextPageContext = null;
let currentSearchQuery = '';

// Variables SponsorBlock - CORREGIDAS
let segmentosCache = {};
let lastSeekEndTime = -1;
let lastSeekVideoId = null;

const PIPED_SPONSOR_BLOCK_URL = 'https://api.piped.private.coffee/sponsors/';

// Estado del sistema unificado
const unifiedState = {
    initialized: false,
    currentView: 'home',
    debugMode: false,
    authReady: false,
    playersReady: false
};
// =============================================
// CONFIGURACIÓN DE PERSISTENCIA
// =============================================
const PERSISTENCE_CONFIG = {
    STORAGE_KEYS: {
        PLAYLISTS_CORE: 'ytcm_playlists_persistent',
        QUEUE: 'ytcm_queue_persistent',
        PLAYING_STATE: 'ytcm_playing_state'
    },
    PLAYLISTS_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 días
    QUEUE_DURATION: 7 * 24 * 60 * 60 * 1000 // 7 días
};
// =============================================
// SISTEMA UNIFICADO - CORE
// =============================================

// FUNCIONES DE PERSISTENCIA
function saveAllData() {
    try {
        // Solo guardar si las funciones existen
        if (typeof savePlaylistsDataPersistent === 'function') {
            // Guardar playlists (excluyendo YouTube Library)
            const playlistsToSave = playlistsData.filter(p => p.source !== 'youtube_library');
            savePlaylistsDataPersistent(playlistsToSave);
        }
        
        // Guardar cola
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
/**
 * Guardar playlists persistentes (core)
 */
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
/**
 * Cargar playlists persistentes (core)
 */
function loadPlaylistsDataPersistent() {
    try {
        const storedData = localStorage.getItem(PERSISTENCE_CONFIG.STORAGE_KEYS.PLAYLISTS_CORE);
        if (!storedData) {
            console.log('📋 No hay playlists persistentes guardadas');
            return null;
        }
        
        const parsed = JSON.parse(storedData);
        const now = Date.now();
        
        // Verificar si han expirado
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
        this.init();
        this.setupAutomaticSaving();
        this.playlistsData = playlistsData;
        this.setupPlayerContainerHandlers();
    }

setupAutomaticSaving() {
    // Guardar cada 60 segundos en lugar de 30
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
    
    // ✅ CORRECCIÓN 1: Mostrar la interfaz INMEDIATAMENTE
    // No esperamos a las APIs para mostrar el esqueleto de la web
    this.enableUnifiedElements(); 
    this.updateStatusIndicator('Cargando motor de audio...', 'loading');
        
    // Configurar debug
    if (this.debugMode) {
        this.enableDebugMode();
    }
    
    // Configurar eventos básicos (UI)
    this.setupEventListeners();
    
    // Cargar datos iniciales (localStorage)
    this.loadInitialData();

    // Inicializar playlist manager (sin esperar)
    this.initializePlaylistManager();

    // ⏳ AHORA sí cargamos las cosas pesadas en segundo plano
    await this.initializeComponents();
    
    this.state.initialized = true;
    this.updateStatusIndicator('Sistema Listo', 'success');
    
    // Procesar playlists pendientes si las hay
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
    console.log('✅ Sistema Unificado Inicializado');
}
processYouTubePlaylists(playlists) {
    console.log(`📁 processYouTubePlaylists llamada con ${playlists?.length || 0} playlists`);
    
    if (!playlists || playlists.length === 0) {
        console.warn("❌ No se recibieron playlists válidas");
        return;
    }

    // Verificar que playlistManager esté disponible
    if (!window.playlistManager) {
        console.warn("⚠️ playlistManager no está disponible, programando para más tarde");
        window.pendingYouTubePlaylists = playlists;
        return;
    }

    // Delegar a playlistManager
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
        
        // Mostrar en la pestaña de playlists de explorar
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
        // Esperar a que las APIs estén disponibles
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
                
                // Timeout de seguridad
                setTimeout(resolve, 10000);
            });
        }
        
        // Inicializar YouTube API
        await this.initializeYouTubeAPI();
        
        // Inicializar Auth
        this.initializeAuth();
        
        // Configurar UI inicial
        this.initializeUI();
    }

    async initializeYouTubeAPI() {
        console.log('🎵 Configurando reproductores de YouTube...');
        
        if (window.YT && window.YT.Player) {
            this.initializePlayers();
            return;
        }
        
        // Esperar a que YouTube API esté disponible
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
        
        // ✅ NUEVO: Exponer globalmente
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
        
        // 1. ACTUALIZAR INDICE GLOBAL
        const videoData = player.getVideoData();
        if (videoData?.video_id) {
            const flatList = this.getFlattenedPlaylist();
            const index = flatList.findIndex(v => v.videoId === videoData.video_id);
            
            if (index !== -1) {
                // Actualizar TODAS las referencias globales
                window.currentPlayingInfo.flattenedIndex = index;
                window.currentPlayingInfo.videoId = videoData.video_id;
                this.state.currentPlayingInfo = window.currentPlayingInfo;
                console.log(`✅ Índice sincronizado: ${index} (${videoData.video_id})`);
            }
        }
        
        this.updateCurrentPlayingIndex();
        this.updateNowPlaying(); // Actualizar textos del reproductor
        
        // 2. FORZAR ACTUALIZACIÓN DE COLA Y PESTAÑAS (CRÍTICO)
        if (window.playlistManager) {
            console.log('🔄 Forzando actualización de UI y Pestañas...');
            
            // Actualizar lista de cola visual (Pestaña "Siguiente")
            this.updatePersistentQueue(); 
            
            // Actualizar indicador visual en cola
            if (window.playlistManager.syncQueueIndicator) {
                window.playlistManager.syncQueueIndicator();
            }

            // Recargar contenido de la pestaña activa (LETRAS o RELACIONADOS)
            // Esto es lo que hace que cargue la nueva letra
            if (window.playlistManager.refreshActiveQueueTab) {
                window.playlistManager.refreshActiveQueueTab();
            }
        }
        
        setTimeout(() => saveAllData(), 1000);
    }
}
/**
 * Actualiza el contenido de la pestaña activa cuando cambia la canción
 */
refreshActiveQueueTab() {
    const activeTab = document.querySelector('.queue-tab.active');
    if (!activeTab) return;

    const tabName = activeTab.dataset.tab;
    
    // ✅ CORRECCIÓN: Obtener el índice ACTUAL desde currentPlayingInfo
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;
    
    const flatList = this.core?.getFlattenedPlaylist() || [];
    const currentVideo = currentIndex >= 0 ? flatList[currentIndex] : null;
    
    console.log('🎵 refreshActiveQueueTab:', { 
        tabName, 
        currentIndex,
        videoId: currentVideo?.videoId,
        title: currentVideo?.title?.substring(0, 40)
    });
    
    // ✅ CRÍTICO: Verificar que hay un video válido
    if (!currentVideo || currentIndex < 0) {
        console.warn('⚠️ No hay video actual para refrescar tab');
        return;
    }
    
    // Refrescar según el tab activo
    if (tabName === 'lyrics') {
        console.log('🎵 Canción cambió, recargando letras...');
        // ✅ Esperar un poco para que el estado se actualice
        setTimeout(() => {
            this.loadLyrics();
        }, 500);
    } else if (tabName === 'related') {
        console.log('🎵 Canción cambió, recargando relacionados...');
        setTimeout(() => {
            this.loadRelatedVideos();
        }, 500);
    } else if (tabName === 'next') {
        // La cola se actualiza automáticamente
        console.log('🎵 Cola de reproducción actualizada');
    }
}
    onPlayerError(event) {
        console.error('❌ Error en reproductor:', event.data);
        this.showMessage(`Error en reproductor: ${event.data}`, 'error');
    }
initializeAuth() {
    console.log("🔧 Configurando eventos de autenticación...");
    
    if (window.authEventsConfigured) {
        console.log("⚠️ Eventos de auth ya configurados");
        return;
    }
    window.authEventsConfigured = true;
    
    // ✅ HANDLER UNIFICADO SIMPLIFICADO
    const playlistHandler = (event) => {
        const { playlists, source } = event.detail;
        
        if (!playlists || playlists.length === 0) {
            console.warn('❌ Evento sin playlists válidas');
            return;
        }
        
        console.log(`📁 Evento ${event.type} recibido:`, {
            playlistsCount: playlists.length,
            source,
            systemReady: this.state.initialized,
            managerReady: !!window.playlistManager
        });
        
        // ✅ VERIFICAR SISTEMA LISTO
        if (!this.state.initialized || !window.playlistManager) {
            console.log("⏳ Sistema no listo, guardando en pendientes");
            window.pendingYouTubePlaylists = playlists;
            return;
        }
        
        // ✅ PROCESAR INMEDIATAMENTE
        this.processYouTubePlaylists(playlists);
    };
    
    // Escuchar evento unificado
    document.addEventListener('youtubePlaylistsReady', playlistHandler);

    // Evento de logout
    document.addEventListener('userLoggedOut', () => {
        console.log("🚪 Usuario desconectado, limpiando playlists de YouTube");
        if (window.playlistManager?.clearYouTubeLibraryPlaylists) {
            window.playlistManager.clearYouTubeLibraryPlaylists();
        }
        setTimeout(() => this.updatePlaylistsUI(), 500);
    });
    
    console.log("✅ Eventos de autenticación configurados");
}
    initializeUI() {
        // Asegurar que existe la cola de reproducción
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

        // Asegurar que existe la playlist manual (opcional)
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
    
    // Crear promesa simple
    const waitForPlaylistManager = new Promise((resolve, reject) => {
        if (typeof initializePlaylistManager === 'function') {
            resolve();
            return;
        }
        
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
        await waitForPlaylistManager;
        
        // Ejecutar e inmediatamente sincronizar
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
    /**
 * Mueve visualmente el contenedor de video SIN recargar el iframe
 */
updatePlayerPosition(targetContainerId) {
    const playersLayer = document.getElementById('persistent-player-layer');
    const targetContainer = document.getElementById(targetContainerId);
    
    // Crear la capa persistente si no existe
    if (!playersLayer) {
        console.log('🔧 Creando capa persistente de video...');
        const layer = document.createElement('div');
        layer.id = 'persistent-player-layer';
        layer.style.cssText = `
            position: fixed;
            z-index: 1000;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            background: #000;
            overflow: hidden;
            pointer-events: none; /* Permitir clicks passthrough durante transiciones */
        `;
        document.body.appendChild(layer);
        
        // Mover reproductores a esta capa UNA SOLA VEZ
        const p1 = document.getElementById('player1');
        const p2 = document.getElementById('player2');
        if (p1) layer.appendChild(p1);
        if (p2) layer.appendChild(p2);
        
        return this.updatePlayerPosition(targetContainerId); // Reintentar
    }

    // Si no hay contenedor destino (ej: inicio sin reproducir), ocultar
    if (!targetContainer || targetContainer.classList.contains('hidden')) {
        playersLayer.style.opacity = '0';
        playersLayer.style.pointerEvents = 'none';
        return;
    }

    // OBTENER COORDENADAS DEL DESTINO
    const rect = targetContainer.getBoundingClientRect();
    
    // Si el destino está oculto (display: none), no actualizar
    if (rect.width === 0 && rect.height === 0) return;

    // APLICAR COORDENADAS
    playersLayer.style.top = `${rect.top}px`;
    playersLayer.style.left = `${rect.left}px`;
    playersLayer.style.width = `${rect.width}px`;
    playersLayer.style.height = `${rect.height}px`;
    playersLayer.style.opacity = '1';
    
    // Habilitar interacción solo si es grande
    if (targetContainerId === 'videoWrapper') {
         playersLayer.style.pointerEvents = 'auto';
         playersLayer.style.borderRadius = '0';
    } else {
         // En mini player, a veces queremos clicks passthrough o no
         playersLayer.style.pointerEvents = 'auto';
         playersLayer.style.borderRadius = '12px'; // Coincidir con estilo mini
         playersLayer.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
    }
}
    // Actualizar UI de playlists (delegado)
updatePlaylistsUI() {
    if (window.playlistManager && window.playlistManager.updatePlaylistsUI) {
        // Solo actualizar UI, no duplicar datos
        window.playlistManager.updatePlaylistsUI();
        
        // Actualizar stats solo después, no durante
        requestAnimationFrame(() => {
            this.updateOverviewStats();
        });
    }
}

    setupEventListeners() {
        // Navegación
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });

        // Botones de control
        this.setupControlButtons();
        
        // Búsqueda
        this.setupSearch();
        
        // Cola de reproducción
        this.setupQueue();
        
        // Cerrar menús al hacer clic fuera
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
        // Limpiar listener anterior
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
                        this.switchView('search');
                    }
                } else {
                    this.clearSearchResults();
                }
            });
        });
    }

    // Configurar cola como popup
    setupQueue() {
        const queueBtn = document.getElementById('queueButton');

        if (queueBtn) {
            queueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showQueuePopup();
            });
        }
    }
    // =============================================
// GESTIÓN DE CONTENEDORES DE REPRODUCTOR
// =============================================
/**
 * Configurar handlers para cambio de contenedor
 */
setupPlayerContainerHandlers() {
    console.log('🎬 Configurando handlers de barra inferior');
    
    const bottomPlayer = document.querySelector('.bottom-player');
    if (bottomPlayer) {
        // Clonar para limpiar eventos previos y asegurar limpieza
        const newBottomPlayer = bottomPlayer.cloneNode(true);
        bottomPlayer.parentNode.replaceChild(newBottomPlayer, bottomPlayer);
        
        // Estilo cursor para indicar clic
        newBottomPlayer.style.cursor = 'pointer';
        
        // EVENTO CLIC EN TODA LA BARRA
        newBottomPlayer.addEventListener('click', (e) => {
            // IGNORAR clic si fue en un botón, slider o control
            if (e.target.closest('button') || 
                e.target.closest('.volume-slider') || 
                e.target.closest('.player-controls') ||
                e.target.closest('.control-button')) {
                return;
            }
            
            // Verificar si hay video para expandir
            const hasVideo = this.state?.currentPlayingInfo?.videoId || window.currentPlayingInfo?.videoId;
            
            if (hasVideo) {
                console.log('🎬 Click en barra -> Full Player');
                this.switchView('fullPlayer');
            }
        });
        
        // Re-asignar eventos a los botones (porque el cloneNode los borró)
        // Esto es necesario porque clonamos la barra entera
        this.setupControlButtons(); // Asegúrate de llamar a esto para reactivar play/pause/next
        this.forceBottomPlayerVisible();
    }
}
/**
 * Mostrar reproductor en vista completa
 */
showFullPlayer() {
    console.log('🎬 Mostrando reproductor completo');
    
    // Cambiar a vista fullPlayer
    this.switchView('fullPlayer');
    
    // Mover reproductor al contenedor completo
    this.movePlayer('full');
    
    // Ocultar mini-player
    this.hideMiniPlayer();
    
    // Actualizar cola persistente
    this.updatePersistentQueue();
}

/**
 * Mover reproductor entre contenedores
 */
movePlayer(target) {
    const activePlayerId = currentPlayer === 1 ? 'player1' : 'player2';
    const activePlayerElement = document.getElementById(activePlayerId);

    if (!activePlayerElement) {
        console.warn('❌ Jugador activo no encontrado');
        return;
    }

    let targetContainer;
    if (target === 'full') {
        targetContainer = document.getElementById('fullVideoContainer');
    } else if (target === 'mini') {
        targetContainer = document.getElementById('miniPlayerContainer');
    }

    if (targetContainer) {
        targetContainer.appendChild(activePlayerElement);
        
        // Asegurar dimensiones correctas
        activePlayerElement.style.width = '100%';
        activePlayerElement.style.height = '100%';
        activePlayerElement.style.position = 'absolute';
        activePlayerElement.style.top = '0';
        activePlayerElement.style.left = '0';
        
        console.log(`🎬 Jugador movido a: ${target}`);
    }
}

/**
 * Mostrar mini-player
 */
showMiniPlayer() {
    const miniPlayer = document.getElementById('miniPlayerContainer');
    if (miniPlayer) {
        miniPlayer.classList.remove('hidden');
        console.log('🎬 Mini-player visible');
    }
}

/**
 * Ocultar mini-player
 */
hideMiniPlayer() {
    const miniPlayer = document.getElementById('miniPlayerContainer');
    if (miniPlayer) {
        miniPlayer.classList.add('hidden');
        console.log('🎬 Mini-player oculto');
    }
}
/**
 * Actualizar cola persistente
 */
updatePersistentQueue() {
    console.log('🔄 Actualizando cola persistente...');
    
    const queueContentList = document.getElementById('queueContentList');
    if (!queueContentList) {
        console.error('❌ queueContentList no encontrado en el DOM');
        // Intentar verificar si estamos en la vista correcta
        const fullPlayerView = document.getElementById('fullPlayerView');
        if (fullPlayerView && !fullPlayerView.classList.contains('active')) {
            console.warn('⚠️ fullPlayerView no está activa, cola no visible aún');
        }
        return;
    }

    const flatList = this.getFlattenedPlaylist();
    console.log(`📊 Videos en cola: ${flatList.length}`);
    
    if (flatList.length === 0) {
        queueContentList.innerHTML = '<p class="queue-placeholder">La cola está vacía. Añade canciones para empezar.</p>';
        this.updateQueueCount(0);
        return;
    }

    // Validar currentPlayingInfo
    const currentIndex = this.state?.currentPlayingInfo?.flattenedIndex ?? 
                        window.currentPlayingInfo?.flattenedIndex ?? 
                        -1;

    console.log(`🎵 Índice actual: ${currentIndex}, Total videos: ${flatList.length}`);

    // Crear fragment para mejor rendimiento
    const fragment = document.createDocumentFragment();
    let validCount = 0;

    flatList.forEach((video, index) => {
        // VALIDACIÓN: Asegurar que video tiene datos válidos
        if (!video || !video.videoId) {
            console.warn(`⚠️ Video inválido en índice ${index}:`, video);
            return;
        }
        
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
            
            <img src="${video.thumbnail || './electronic.ico'}" 
                 alt="${this.escapeHTML(video.title || 'Sin título')}" 
                 class="queue-item-thumbnail"
                 onerror="this.src='./electronic.ico';">
            
            <div class="queue-item-info">
                <div class="queue-item-title">${this.escapeHTML(video.title || 'Sin título')}</div>
                <div class="queue-item-meta">
                    <span class="queue-item-duration">${this.formatDuration(video.duration || 0)}</span>
                    ${video.uploaderName ? `<span class="queue-item-author">${this.escapeHTML(video.uploaderName)}</span>` : ''}
                </div>
            </div>
            
            <button class="queue-item-remove" 
                    data-video-id="${video.videoId}"
                    title="Eliminar de la cola">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Event listener para botón de eliminar
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

    // Limpiar y actualizar de una vez
    queueContentList.innerHTML = '';
    queueContentList.appendChild(fragment);
    
    this.updateQueueCount(validCount);
    
    // Reiniciar drag & drop después de renderizar
    setTimeout(() => {
        if (window.queueDragDrop) {
            window.queueDragDrop.attachDragListeners();
        }
    }, 100);
    
    console.log(`✅ Cola persistente actualizada: ${validCount} videos renderizados`);
    console.log(`📊 Elementos en el DOM: ${queueContentList.children.length}`);
    
    // Scroll al item actual si existe
    if (currentIndex >= 0) {
        requestAnimationFrame(() => {
            const playingItem = queueContentList.querySelector('.queue-item.playing');
            if (playingItem) {
                playingItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }
}
/**
 * Actualizar contador de cola
 */
updateQueueCount(count) {
    const queueCountBadge = document.getElementById('queueCount');
    if (queueCountBadge) {
        queueCountBadge.textContent = count;
    }
}
    // =============================================
    // GESTIÓN DE VISTAS
    // =============================================
switchView(viewName) {
    const validViews = ['home', 'search', 'library', 'fullPlayer'];
    if (!validViews.includes(viewName)) return;

    console.log(`🔄 Cambiando a vista: ${viewName}`);

    // UI Updates (Navegación)
    document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) item.classList.add('active');
    });

    document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) targetView.classList.add('active');
    
    this.currentView = viewName;

    // LÓGICA DE VIDEO PERSISTENTE
    const hasActiveVideo = window.reproduccionIniciada;
    const miniPlayerFloat = document.getElementById('miniPlayerFloat');
    
    // Necesitamos asegurarnos que el contenedor "VideoWrapper" (el hueco en el diseño Full) tenga ID
    const fullView = document.getElementById('fullPlayerView');
    let videoWrapper = fullView.querySelector('.video-wrapper');
    if(videoWrapper && !videoWrapper.id) videoWrapper.id = 'videoWrapper';

    if (viewName === 'fullPlayer') {
        // VISTA COMPLETA
        // 1. Ocultar mini player fantasma
        if (miniPlayerFloat) miniPlayerFloat.classList.add('hidden');
        
        // 2. Mover la capa persistente sobre el hueco del full player
        // Usamos setTimeout para dar tiempo al navegador a renderizar el layout full
        requestAnimationFrame(() => {
            this.updatePlayerPosition('videoWrapper');
        });
        
    } else {
        // VISTA MINI
        if (hasActiveVideo) {
            // 1. Mostrar el mini player "fantasma" (placeholder)
            if (miniPlayerFloat) {
                miniPlayerFloat.classList.remove('hidden');
                miniPlayerFloat.style.display = 'block';
            }
            
            // 2. Mover la capa persistente sobre el mini player
            requestAnimationFrame(() => {
                this.updatePlayerPosition('miniPlayerFloat');
            });
        } else {
            // Ocultar todo
            if (miniPlayerFloat) miniPlayerFloat.classList.add('hidden');
            const layer = document.getElementById('persistent-player-layer');
            if (layer) layer.style.opacity = '0';
        }
    }
}
movePlayersToFullView() {
    console.log('🎬 Moviendo reproductores a vista completa (SIN interrupción)');
    
    const fullPlayerView = document.getElementById('fullPlayerView');
    if (!fullPlayerView) {
        console.error('❌ fullPlayerView no encontrado');
        return;
    }
    
    const videoWrapper = fullPlayerView.querySelector('.video-wrapper');
    if (!videoWrapper) {
        console.error('❌ video-wrapper no encontrado');
        return;
    }
    
    const player1El = document.getElementById('player1');
    const player2El = document.getElementById('player2');
    
    if (!player1El || !player2El) {
        console.error('❌ Reproductores no encontrados');
        return;
    }
    
    // ✅ MOVER SOLO SI NO ESTÁN YA EN EL WRAPPER
    if (!videoWrapper.contains(player1El)) {
        videoWrapper.appendChild(player1El);
    }
    if (!videoWrapper.contains(player2El)) {
        videoWrapper.appendChild(player2El);
    }
    
    // ✅ ASEGURAR ESTILOS SIN PAUSAR
    [player1El, player2El].forEach((player, index) => {
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
    
    console.log('✅ Reproductores en vista completa (audio continuo)');
}
// =============================================
// FORZAR VISIBILIDAD DEL BOTTOM PLAYER
// =============================================

forceBottomPlayerVisible() {
    const bottomPlayer = document.querySelector('.bottom-player');
    
    if (!bottomPlayer) {
        console.warn('⚠️ Bottom player no encontrado en el DOM');
        return;
    }
    
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
/**
 * Refrescar vista de biblioteca
 */
refreshLibraryView() {
    this.updatePlaylistsUI();
}
/**
 * Enfocar input de búsqueda
 */
focusSearchInput() {
    const searchInput = document.getElementById('sidebarSearchInput') || 
                      document.getElementById('searchInput');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 100);
    }
}
/**
 * SHOW MINI PLAYER FLOAT
 */
showMiniPlayerFloat() {
    console.log('🎬 Activando mini player flotante...');
    
    // ✅ VALIDACIÓN CRÍTICA: Verificar que hay video activo
    const hasActiveVideo = this.state?.currentPlayingInfo?.flattenedIndex >= 0 || 
                          window.currentPlayingInfo?.flattenedIndex >= 0 ||
                          window.reproduccionIniciada;
    
    if (!hasActiveVideo) {
        console.warn('⚠️ No hay video activo, mini player no se mostrará');
        return;
    }
    
    let miniPlayer = document.getElementById('miniPlayerFloat');
    
    if (!miniPlayer) {
        console.warn('⚠️ Mini player no existe en DOM');
        return;
    }
    
    // ✅ FORZAR VISIBILIDAD COMPLETA
    miniPlayer.classList.remove('hidden');
    
    // ✅ Esperar que el DOM se actualice antes de mover reproductores
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
        
        // ✅ SEGUNDO requestAnimationFrame para asegurar que CSS se aplicó
        requestAnimationFrame(() => {
            this.movePlayersToMini();
            console.log('✅ Mini player flotante activado con video activo');
        });
    });
}
movePlayersToMini() {
    console.log('🎬 Moviendo reproductores a mini (FORZADO FINAL)');
    
    const player1 = document.getElementById('player1');
    const player2 = document.getElementById('player2');
    const miniFloat = document.getElementById('miniPlayerFloat');
    const miniContainer1 = document.getElementById('miniPlayer1Container');
    const miniContainer2 = document.getElementById('miniPlayer2Container');
    
    // Validación
    if (!miniFloat || !miniContainer1 || !miniContainer2 || !player1 || !player2) {
        return;
    }
    
    // 1. FORZAR VISIBILIDAD DEL CONTENEDOR PRINCIPAL
    miniFloat.classList.remove('hidden');
    miniFloat.style.display = 'block';
    
    // 2. MOVER ELEMENTOS (Solo si no están ya ahí)
    if (!miniContainer1.contains(player1)) miniContainer1.appendChild(player1);
    if (!miniContainer2.contains(player2)) miniContainer2.appendChild(player2);
    
    // 3. IDENTIFICAR JUGADOR ACTIVO
    const activePlayerNum = window.currentPlayer;
    
    // 4. APLICAR ESTILOS A LOS REPRODUCTORES
    [player1, player2].forEach((player, index) => {
        const isPlayer1 = index === 0;
        const isActive = (activePlayerNum === 1 && isPlayer1) || (activePlayerNum === 2 && !isPlayer1);
        
        // Limpiar clases que puedan ocultarlo
        player.className = 'video-player'; 
        player.classList.remove('hidden', 'fade-out', 'crossfade-exit');
        
        if (isActive) {
            // ESTILOS ACTIVOS: Ocupar 100% y ser visible
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
            // ESTILOS INACTIVOS: Oculto
            player.style.cssText = `
                display: none !important;
                opacity: 0 !important;
                z-index: 0 !important;
            `;
        }
    });
    
    console.log('✅ Mini Player corregido y visible');
}
/**
 * Mover reproductores a vista completa
 */
movePlayerToFullView() {
    const fullPlayerView = document.getElementById('fullPlayerView');
    if (!fullPlayerView) {
        console.error('❌ fullPlayerView no encontrado');
        return;
    }
    
    const videoWrapper = fullPlayerView.querySelector('.video-wrapper');
    if (!videoWrapper) {
        console.error('❌ video-wrapper no encontrado en fullPlayerView');
        return;
    }
    
    const player1El = document.getElementById('player1');
    const player2El = document.getElementById('player2');
    
    if (!player1El || !player2El) {
        console.error('❌ Reproductores no encontrados');
        return;
    }
    
    // ✅ NO mover si ya están en el wrapper
    if (!videoWrapper.contains(player1El)) {
        videoWrapper.appendChild(player1El);
    }
    if (!videoWrapper.contains(player2El)) {
        videoWrapper.appendChild(player2El);
    }
    
    // Asegurar estilos correctos sin pausar
    [player1El, player2El].forEach(player => {
        if (player) {
            player.style.position = 'absolute';
            player.style.top = '0';
            player.style.left = '0';
            player.style.width = '100%';
            player.style.height = '100%';
        }
    });
    
    console.log('✅ Reproductores movidos a vista completa (sin interrupción)');
}

    refreshLibraryView() {
        this.updatePlaylistsUI();
    }

refreshPlayingView() {
    this.updateNowPlaying();
    if (window.playlistManager?.updateQueuePopup) {
        window.playlistManager.updateQueuePopup();
    }
}

    focusSearchInput() {
        const searchInput = document.getElementById('sidebarSearchInput') || 
                          document.getElementById('searchInput');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    // =============================================
    // SISTEMA DE REPRODUCCIÓN
    // =============================================
handlePlayPause() {
    if (!playersInitialized || !window.player1 || !window.player2) {
        this.showMessage("Los reproductores no están listos", 'error');
        return;
    }

    const flatList = this.getFlattenedPlaylist();
    const currentIndex = window.currentPlayingInfo?.flattenedIndex ?? -1;

    // ✅ Usar window.reproduccionIniciada
    if (!window.reproduccionIniciada || currentIndex === -1 || currentIndex === undefined) {
        if (flatList.length === 0) {
            this.showMessage("La cola está vacía. Añade canciones primero.", 'warning');
            return;
        }
        
        console.log('▶️ Iniciando reproducción desde el principio...');
        this.playVideoAtIndex(0);
        return;
    }

    // ✅ Usar window.currentPlayer
    const activePlayer = window.currentPlayer === 1 ? window.player1 : window.player2;
    
    try {
        const playerState = activePlayer.getPlayerState();
        
        if (playerState === YT.PlayerState.PLAYING) {
            console.log('⏸️ Pausando reproducción...');
            activePlayer.pauseVideo();
            this.updatePlayButton('play');
            this.stopMonitoring();
        } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
            console.log('▶️ Reanudando reproducción...');
            activePlayer.playVideo();
            this.updatePlayButton('pause');
            this.startMonitoring();
        } else {
            // Estado desconocido, reiniciar
            console.warn('⚠️ Estado desconocido del reproductor, reiniciando...');
            this.playVideoAtIndex(currentIndex);
        }
    } catch (error) {
        console.error('❌ Error en handlePlayPause:', error);
        this.showMessage('Error controlando reproducción', 'error');
    }
}
handleNext() {
    // 1. Obtener la lista actual
    const flatList = this.getFlattenedPlaylist();
    
    // 2. Validar si hay videos
    if (flatList.length === 0) {
        this.showMessage("No hay videos en la cola", 'warning');
        return;
    }

    // --- CORRECCIÓN DEL ERROR ---
    // Usamos window.currentPlayingInfo como fuente de verdad y aseguramos un valor por defecto
    const currentInfo = window.currentPlayingInfo || { flattenedIndex: -1 };
    let currentIndex = currentInfo.flattenedIndex;
    
    // Si es undefined o null, lo tratamos como -1
    if (currentIndex === undefined || currentIndex === null) {
        currentIndex = -1;
    }
    // -----------------------------

    // LOGICA CORREGIDA: Si no hay reproducción activa, reproducir el primero
    if (currentIndex === -1) {
        console.log('⏭️ Estado detenido, reproduciendo primer video de la cola');
        this.playVideoAtIndex(0);
        return;
    }

    // 4. Calcular siguiente índice
    let nextIndex = currentIndex + 1;

    // 5. Verificar fin de lista
    if (nextIndex >= flatList.length) {
        console.log('End of playlist reached');
        this.showMessage("Fin de la lista de reproducción", 'info');
        return;
    }

    // 6. Ejecutar cambio
    console.log(`⏭️ Saltando al índice: ${nextIndex}`);
    
    // Detener monitoreo temporalmente
    if (monitorInterval) clearInterval(monitorInterval);
    
    // Activar banderas de transición
    hasOutroCrossfadeStarted = true; 
    nextVideoScheduled = true;
    
    // Llamar a la función que hace el trabajo sucio
    this.playNextVideo();
}

    handlePrevious() {
        // Implementar lógica de video anterior
        console.log('⏮️ Función anterior no implementada aún');
    }

    playFirstVideo() {
        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage("No hay videos para reproducir", 'warning');
            return;
        }

        const firstVideo = flatList[0];
        console.log('▶️ Reproduciendo primer video:', firstVideo.title);

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
            console.error("Error iniciando reproducción:", error);
            this.showMessage("Error al iniciar reproducción", 'error');
            reproduccionIniciada = false;
            this.updatePlayButton('play');
        }
    }

async playNextVideo() {
    const now = Date.now();
    
    // ✅ DEBOUNCE CRÍTICO
    if (now - lastCrossfadeTime < 1000) {
        console.log('🔒 Ignorando llamada duplicada (debounce)');
        return;
    }
    lastCrossfadeTime = now;
    
    // ✅ PREVENIR MÚLTIPLES TRANSICIONES
    if (isTransitioning || crossfadeInProgress) {
        console.log('🔒 Ya hay transición en progreso');
        this.showMessage('Transición en progreso, espera...', 'info');
        return;
    }

    if (!playersInitialized) {
        console.error('❌ Reproductores no inicializados');
        return;
    }

    // ✅ MARCAR COMO EN TRANSICIÓN
    isTransitioning = true;
    console.log('🎵 Iniciando playNextVideo...');

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
    
    // ✅ VALIDAR VIDEO
    if (!nextVideo?.videoId) {
        console.warn(`⚠️ Video inválido en índice ${nextIndex}`);
        isTransitioning = false;
        setTimeout(() => this.playNextVideo(), 500);
        return;
    }
    
    // ✅ ACTUALIZAR INFO INMEDIATAMENTE
    currentPlayingInfo = {
        flattenedIndex: nextIndex,
        videoId: nextVideo.videoId,
        playlistId: nextVideo.sourcePlaylistId
    };
    
    this.updateNowPlaying();

    const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;
    const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
    const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

    let loadError = null; // ✅ Variable para capturar errores

    try {
        // ✅ PREPARAR SIGUIENTE
        if (nextPlayerElement) {
            nextPlayerElement.classList.remove('hidden', 'fade-out');
            nextPlayerElement.style.display = 'block';
            nextPlayerElement.style.opacity = '0';
        }

        // ✅ CARGAR VIDEO
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

        // ✅ CAMBIAR REPRODUCTOR
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        
        // ✅ INICIAR CROSSFADE
        this.startCrossfade(currentPlayerInstance, nextPlayerInstance);
        
        // ✅ ACTUALIZAR UI
         setTimeout(() => {
            // Actualizar UI
            if (window.playlistManager) {
                window.playlistManager.updateQueuePopup();
                window.playlistManager.syncQueueIndicator();
                
                //Refrescar tab activa
                window.playlistManager.refreshActiveQueueTab();
            }
        }, 200);
        
        console.log('✅ playNextVideo completado, crossfade en progreso');

    } catch (error) {
        loadError = error; // ✅ Capturar error
        console.error("❌ Error en playNextVideo:", error);
        
        if (error.message.includes('Timeout')) {
            console.log('🔄 Video no disponible, saltando...');
            if (window.playlistManager) {
                window.playlistManager.removeVideoFromQueue(nextVideo.videoId);
            }
            
            // ✅ RESETEAR FLAGS
            isTransitioning = false;
            hasOutroCrossfadeStarted = false;
            nextVideoScheduled = false;
            
            // Reiniciar monitoreo
            if (!monitorInterval) {
                this.startMonitoring();
            }
            
            setTimeout(() => this.playNextVideo(), 500);
        } else {
            // ✅ RESETEAR FLAGS en otros errores
            isTransitioning = false;
            hasOutroCrossfadeStarted = false;
            nextVideoScheduled = false;
            
            // Reiniciar monitoreo
            if (!monitorInterval) {
                this.startMonitoring();
            }
        }
    } finally {
        // ✅ CORRECCIÓN: Solo resetear si NO fue timeout
        if (!loadError || !loadError.message.includes('Timeout')) {
            setTimeout(() => {
                isTransitioning = false;
            }, 1000);
        }
    }
}
// =============================================
// PREPARAR SIGUIENTE (OPCIONAL)
// =============================================
async preLoadNextVideo() {
    try {
        const flatList = this.getFlattenedPlaylist();
        const nextIndex = currentPlayingInfo.flattenedIndex + 2;
        
        if (nextIndex < flatList.length) {
            const nextNextVideo = flatList[nextIndex];
            // Pre-cargar en memoria pero no reproducir
            console.log(`📥 Pre-cargando: ${nextNextVideo.title}`);
            // Esto ayuda a reducir latencia en el siguiente crossfade
        }
    } catch (error) {
        console.warn('⚠️ Pre-carga no disponible:', error);
    }
}

/**
 * Crossfade sin pantalla oscura
 */
startCrossfade(prevPlayer, nextPlayer) {
    if (crossfadeInProgress) {
        console.warn('🔒 Crossfade ya en progreso, ignorando');
        return;
    }

    const CROSSFADE_DURATION_MS = CROSSFADE_DURATION * 1000;
    console.log(`🎨 Iniciando crossfade de ${CROSSFADE_DURATION}s...`);
    crossfadeInProgress = true;

    const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
    const nextElement = document.getElementById(`player${currentPlayer}`);

    // ✅ PREPARACIÓN: Ambos visibles durante crossfade
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

    // Iniciar siguiente video
    try {
        nextPlayer.playVideo();
        nextPlayer.setVolume(0);
    } catch (e) {
        console.warn('⚠️ Error iniciando siguiente video:', e);
    }

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

        // ✅ ACTUALIZAR OPACIDAD SIN OCULTAR
        if (prevElement) {
            prevElement.style.opacity = (1 - progress).toFixed(2);
        }
        if (nextElement) {
            nextElement.style.opacity = progress.toFixed(2);
        }

        if (step >= steps) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;
            crossfadeInProgress = false;
            console.log('✅ Crossfade completado');

            setTimeout(() => {
                try {
                    prevPlayer.stopVideo();
                    if (prevElement) {
                        prevElement.classList.add('hidden');
                        prevElement.style.cssText = `
                            display: none !important;
                            opacity: 0;
                            z-index: 1;
                        `;
                    }
                    if (nextElement) {
                        nextElement.classList.remove('hidden');
                        nextElement.style.cssText = `
                            display: block !important;
                            visibility: visible !important;
                            opacity: 1;
                            z-index: 2;
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                        `;
                    }
                    
                    hasOutroCrossfadeStarted = false;
                    nextVideoScheduled = false;
                    isTransitioning = false;

                    if (!monitorInterval && window.unifiedCore) {
                        window.unifiedCore.startMonitoring();
                    }
                } catch (e) {
                    console.error('❌ Error limpiando crossfade:', e);
                }
            }, 100);
        }
    }, stepTime);
}
    // =============================================
    // BÚSQUEDA
    // =============================================
    
async performSearch(query, continuation = null) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    if (!continuation) {
        currentSearchQuery = query;
        nextPageContext = null;
        searchResults.innerHTML = '<div class="search-loading">🔍 Buscando música...</div>';
        
        if (this.handleSearchScroll) {
            searchResults.removeEventListener('scroll', this.handleSearchScroll);
        }
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }
    }

    isLoadingMore = true;

    try {
        console.log(`🔍 Realizando búsqueda: "${query}"${continuation ? ' (página siguiente)' : ''}`);
        
        // USAR DIRECTAMENTE EL CLIENTE DE PIPED
        const data = await window.youtubeJSClient.search(query, continuation);
        
        console.log(`📊 Respuesta recibida:`, {
            items: data.items?.length || 0,
            hasNextPage: !!data.nextpage,
            isNextPageRequest: !!continuation,
            source: data.metadata?.source || 'piped'
        });
        
        this.displaySearchResults(data, !!continuation);

    } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        
        if (!continuation) {
            searchResults.innerHTML = `
                <div class="search-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error en búsqueda: ${error.message}</p>
                    <button onclick="window.unifiedCore.performSearch('${query}')" class="retry-search-btn">
                        <i class="fas fa-redo"></i> Intentar de nuevo
                    </button>
                </div>
            `;
        } else {
            this.showMessage('Error cargando más resultados', 'error');
        }
        
    } finally {
        isLoadingMore = false;
    }
}
// Método fallback usando el sistema anterior
async performSearchFallback(query, nextPage) {
    try {
        let apiUrl = `/.netlify/functions/search?q=${encodeURIComponent(query)}`;
        if (nextPage) {
            apiUrl += `&nextpage=${encodeURIComponent(nextPage)}`;
        }

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        this.displaySearchResults(data, !!nextPage);
        
    } catch (error) {
        console.error("❌ Error en fallback:", error);
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.innerHTML = `
                <div class="search-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error en búsqueda: ${error.message}</p>
                    <button onclick="window.unifiedCore.clearSearchResults()" class="retry-search-btn">
                        <i class="fas fa-redo"></i> Intentar de nuevo
                    </button>
                </div>
            `;
        }
    }
}
    parseDurationToSeconds(durationStr) {
    if (!durationStr) return 0;
    
    const parts = durationStr.split(':').map(Number);
    
    if (parts.length === 2) {
        return (parts[0] * 60) + parts[1];
    } else if (parts.length === 3) {
        return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
    
    return 0;
}
    // =============================================
// DELEGACIÓN A PLAYLIST MANAGER
// ==
  async addVideoToQueue(videoData) {
    if (!window.playlistManager) {
        console.error('❌ PlaylistManager no disponible');
        this.showMessage('Error: Gestor de playlists no disponible', 'error');
        return;
    }
    
    return await window.playlistManager.addVideoToQueue(videoData);
}
// Añadir video después del actual (DELEGADO)
  async addVideoToQueueAfterCurrent(videoData) {
    if (!window.playlistManager) {
        console.error('❌ PlaylistManager no disponible');
        this.showMessage('Error: Gestor de playlists no disponible', 'error');
        return;
    }
    
    return await window.playlistManager.addVideoToQueueAfterCurrent(videoData);
}  
 async addVideoToQueueAfterCurrent(videoData) {
    if (!window.playlistManager) {
        console.error('❌ PlaylistManager no disponible');
        this.showMessage('Error: Gestor de playlists no disponible', 'error');
        return;
    }
    
    return await window.playlistManager.addVideoToQueueAfterCurrent(videoData);
}
  removeVideoFromQueue(videoId) {
    if (!window.playlistManager) {
        console.error('❌ PlaylistManager no disponible');
        this.showMessage('Error: Gestor de playlists no disponible', 'error');
        return false;
    }
    
    return window.playlistManager.removeVideoFromQueue(videoId);
}  
   showQueuePopup() {
    if (!window.playlistManager) {
        console.error('❌ PlaylistManager no disponible');
        this.showMessage('Error: Gestor de playlists no disponible', 'error');
        return;
    }
    
    window.playlistManager.showQueuePopup();
} 
  updateQueuePopup() {
    if (!window.playlistManager) {
        return; // No mostrar error, puede no estar abierto
    }
    
    window.playlistManager.updateQueuePopup();
}  
displaySearchResults(data) {
    console.log('📊 displaySearchResults, log netlify con', data);

    const resultsContainer = document.getElementById('results-container'); // O el ID de tu contenedor
    resultsContainer.innerHTML = ''; // Limpiar resultados anteriores
    
    if (!data.items || data.items.length === 0) {
        resultsContainer.innerHTML = '<p>No se encontraron videos.</p>';
        return;
    }

    data.items.forEach(video => {
        // --- 1. PROCESAMIENTO DE DURACIÓN ---
        const segundos = parseDurationToSeconds(video.duration); 

        // 2. CREACIÓN DEL ELEMENTO HTML (Aquí necesitas tu estructura exacta)
        const trackDiv = document.createElement('div');
        trackDiv.className = 'track-item'; // Asegúrate que esta es la clase de tus resultados

        // 3. ATRIBUTOS DE DATOS (DATASET)
        // Guardamos el videoId y la duración en segundos para el reproductor
        trackDiv.dataset.videoId = video.videoId;
        trackDiv.dataset.durationText = video.duration; // Texto "3:04"
        trackDiv.dataset.durationSeconds = segundos;     // Número 184 (CLAVE para la duración)

        // 4. ESTRUCTURA INTERNA
        // *************************************************************
        // Reemplaza el contenido de abajo con tu estructura HTML real
        // *************************************************************
        trackDiv.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}" class="track-thumbnail">
            <div class="track-details">
                <p class="track-title">${video.title}</p>
                <p class="track-artist">${video.artist}</p>
                <p class="track-duration">${video.duration}</p> 
            </div>
            `;
        
        // --- 5. EVENTO CLICK (DONDE DAS PLAY) ---
        trackDiv.addEventListener('click', function() {
            // Obtenemos los datos del dataset del elemento clickeado
            const videoId = this.dataset.videoId;
            const durationInSeconds = parseInt(this.dataset.durationSeconds); // Recogemos el número

            // Verifica en consola (opcional)
            console.log(`▶️ Reproduciendo video ID: ${videoId} con duración: ${durationInSeconds}s`);

            // LLAMA A TU FUNCIÓN DE REPRODUCCIÓN AQUÍ
            // Asegúrate de pasarle la duración en segundos al reproductor
            // EL NOMBRE DE TU FUNCIÓN DE REPRODUCCIÓN PUEDE SER DIFERENTE
            // Por ejemplo:
            // player.loadVideo(videoId, durationInSeconds);
            // setTrackDuration(durationInSeconds); 
            
            // --- Reemplaza esta línea con tu llamada real ---
            handlePlayTrack(videoId, durationInSeconds); // <--- Usa el nombre real de tu función
            // ------------------------------------------------
            
        });

        // Añadir el elemento al contenedor
        resultsContainer.appendChild(trackDiv);
    });

    // Manejo de paginación si aplica...
}       

setupImprovedInfiniteScroll(searchResults) {
    if (!nextPageContext) {
        console.log('📜 Sin más páginas disponibles para scroll infinito');
        return;
    }

    console.log('📜 Configurando scroll infinito mejorado...');
    
    // Limpiar observer anterior si existe
    if (this.scrollObserver) {
        this.scrollObserver.disconnect();
    }
    
    // Crear elemento trigger más arriba del final
    let trigger = searchResults.querySelector('.scroll-trigger');
    if (trigger) {
        trigger.remove(); // Remover trigger anterior
    }
    
    trigger = document.createElement('div');
    trigger.className = 'scroll-trigger';
    trigger.style.cssText = `
        height: 20px;
        margin: 20px 0;
        visibility: hidden;
        background: transparent;
    `;
    searchResults.appendChild(trigger);

    // Observer para intersección
    this.scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && nextPageContext && !isLoadingMore) {
                console.log('📜 🚀 Trigger activado, cargando más...');
                this.loadMoreSearchResults();
            }
        });
    }, {
        rootMargin: '200px', // Activar 200px antes de llegar al trigger
        threshold: 0.1
    });

    this.scrollObserver.observe(trigger);
    console.log('✅ Scroll infinito configurado con trigger');
}
async loadMoreSearchResults() {
    if (isLoadingMore || !nextPageContext) {
        return;
    }

    console.log('📜 🚀 Cargando más resultados...');
    isLoadingMore = true;

    const searchResults = document.getElementById('searchResults');
    let trigger = searchResults.querySelector('.scroll-trigger');
    if (trigger) {
        trigger.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
    }

    try {
        // Llamar a performSearch con el contexto de la siguiente página
        await this.performSearch(currentSearchQuery, nextPageContext);
    } catch (error) {
        console.error('❌ Error cargando más resultados:', error);
        if (trigger) {
            trigger.innerHTML = '<p class="related-error">Error al cargar</p>';
        }
    }
    // No necesitamos poner isLoadingMore = false aquí,
    // porque performSearch() lo hace en su bloque 'finally'
}
retryLoadMore() {
    console.log('🔄 Reintentando carga de más resultados...');
}
    createSearchGrid() {
        const grid = document.createElement('div');
        grid.className = 'search-results-grid';
        return grid;
    }

createSearchResultCard(video, videoId) {
    // VALIDACIÓN CRÍTICA
    if (!videoId || videoId === 'undefined' || videoId === 'null') {
        console.error('❌ createSearchResultCard: videoId inválido:', { 
            videoId, 
            title: video?.title?.substring(0, 30) 
        });
        const emptyCard = document.createElement('div');
        emptyCard.style.display = 'none';
        return emptyCard;
    }

    console.log('🎵 Creando card para:', {
        videoId,
        title: video.title?.substring(0, 30),
        artist: video.artist,
        backendProcessed: !!video.artist
    });

    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.dataset.videoId = videoId;

    // ✅ SIMPLIFICADO: Los datos ya vienen procesados del backend
    // El backend separó: video.title (limpio) y video.artist
    const title = video.title || 'Título Desconocido';
    const artist = video.artist || video.uploaderName || 'Autor Desconocido';
    const duration = video.duration ? this.formatDuration(video.duration) : '';
    const thumbnail = video.thumbnail || './electronic.ico';

    // Escapar datos para HTML (seguridad)
    const safeTitle = this.escapeHTML(title);
    const safeArtist = this.escapeHTML(artist);
    const safeThumbnail = thumbnail;

    card.innerHTML = `
        <div class="search-result-thumbnail">
            <img src="${safeThumbnail}" 
                 alt="${safeTitle}" 
                 loading="lazy" 
                 onerror="this.src='./electronic.ico';">
            ${duration ? `<span class="search-result-duration">${duration}</span>` : ''}
        </div>
        <div class="search-result-info">
            <h3 class="search-result-title" title="${safeTitle}">${safeTitle}</h3>
            <p class="search-result-author">${safeArtist}</p>
            <div class="search-result-actions">

    <button class="search-result-add-next-btn" 
            data-video-id="${videoId}" 
            data-title="${safeTitle}" 
            data-thumbnail="${safeThumbnail}"
            data-duration="${video.duration || 0}"
            data-author="${safeArtist}">
        <i class="fas fa-forward"></i>
        Añadir Siguiente
    </button>
</div>
    `;

// Event listener para botón "Añadir Siguiente"
const addNextBtn = card.querySelector('.search-result-add-next-btn');
addNextBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const btn = e.target.closest('.search-result-add-next-btn');
    const btnVideoId = btn.dataset.videoId;
    
    if (!btnVideoId || btnVideoId === 'undefined') {
        console.error('❌ Click handler: videoId inválido en botón');
        this.showMessage('Error: Video inválido', 'error');
        return;
    }

    const videoData = {
        videoId: btnVideoId,
        title: btn.dataset.title,
        thumbnail: btn.dataset.thumbnail,
        duration: parseInt(btn.dataset.duration) || 0,
        uploaderName: btn.dataset.author,
        author: btn.dataset.author
    };

    this.addVideoToQueueAfterCurrent(videoData);
});
    
    console.log('✅ Card creada exitosamente:', videoId);
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
    // =============================================
    // UTILIDADES Y HELPERS
    // =============================================
    escapeHTML(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * Obtener cola limpia (sin videos eliminados)
 */
getFlattenedPlaylist() {
    const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
    
    if (!queuePlaylist) {
        console.warn('⚠️ No se encontró playlist de cola');
        return [];
    }
    
    if (!queuePlaylist.videos || !Array.isArray(queuePlaylist.videos)) {
        console.warn('⚠️ Cola sin videos o estructura inválida');
        return [];
    }
    
    // ✅ FILTRAR VIDEOS ELIMINADOS Y VALIDAR
    const validVideos = queuePlaylist.videos.filter((video, index) => {
        // Validar videoId
        if (!video.videoId || video.videoId === 'undefined') {
            console.error(`❌ Video ${index} sin videoId válido:`, video);
            return false;
        }
        
        // ✅ DETECTAR VIDEOS ELIMINADOS
        const title = (video.title || '').toLowerCase();
        const isDeleted = 
            title.includes('deleted video') ||
            title.includes('[deleted video]') ||
            title.includes('video unavailable') ||
            title.includes('private video') ||
            title === 'deleted video' ||
            title === '';
        
        if (isDeleted) {
            console.warn(`🗑️ Video eliminado detectado: "${video.title}" (${video.videoId})`);
            
            // Eliminar de cola automáticamente
            setTimeout(() => {
                if (window.playlistManager) {
                    window.playlistManager.removeVideoFromQueue(video.videoId);
                    window.unifiedCore?.showMessage(`Video eliminado: "${video.title}"`, 'info');
                }
            }, 100);
            
            return false;
        }
        
        return true;
    });
    
    // Log si se filtraron videos
    if (validVideos.length !== queuePlaylist.videos.length) {
        const filtered = queuePlaylist.videos.length - validVideos.length;
        console.warn(`⚠️ Se filtraron ${filtered} videos inválidos/eliminados`);
    }
    
    // Mapear a estructura normalizada
    const flatList = validVideos.map((video, index) => {
        let duration = 0;
        
        if (video.duration) {
            duration = typeof video.duration === 'number' 
                ? video.duration 
                : this.parseDuration(video.duration);
        } else if (video.contentDetails?.duration) {
            duration = this.parseDuration(video.contentDetails.duration);
        }
        
        let artist = video.artist || video.uploaderName || video.author;
        let title = video.title || "Título Desconocido";
        
        if (!artist || artist === 'Desconocido') {
            if (video.uploaderName && video.uploaderName !== 'Desconocido') {
                artist = video.uploaderName;
            } else if (video.author && video.author !== 'Desconocido') {
                artist = video.author;
            } else {
                const separatorMatch = title.match(/^(.+?)\s*[-:]\s*(.+?)$/);
                if (separatorMatch && separatorMatch[1]) {
                    artist = separatorMatch[1].trim();
                } else {
                    artist = 'YouTube';
                }
            }
        }
        
        return {
            videoId: video.videoId,
            sourcePlaylistId: video.sourcePlaylistId || 'queue',
            source: video.source || 'queue',
            title: title,
            artist: artist,
            uploaderName: artist,
            author: artist,
            thumbnail: video.thumbnail || './electronic.ico',
            duration: duration,
            addedAt: video.addedAt || Date.now(),
            originalTitle: video.originalTitle || video.title
        };
    });
    
    console.log(`📊 Cola de reproducción: ${flatList.length} videos válidos`);
    
    return flatList;
}

/**
 * Validar video antes de reproducir
 */
async validateVideoBeforePlay(videoId) {
    try {
        // Intentar obtener info del video
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        
        if (!response.ok) {
            console.warn(`⚠️ Video ${videoId} no disponible (HTTP ${response.status})`);
            return false;
        }
        
        const data = await response.json();
        
        if (!data.title || data.title.toLowerCase().includes('deleted')) {
            console.warn(`⚠️ Video ${videoId} eliminado: "${data.title}"`);
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.warn(`⚠️ Error validando video ${videoId}:`, error);
        return false; // Asumir inválido si hay error
    }
}
    async getBatchVideoDurations(videoIds) {
    if (!videoIds || videoIds.length === 0) return {};
    
    const durations = {};
    const batchSize = 50; // YouTube API permite max 50 IDs por request
    
    try {
        // Dividir en lotes de 50
        for (let i = 0; i < videoIds.length; i += batchSize) {
            const batch = videoIds.slice(i, i + batchSize);
            console.log(`🕒 Obteniendo duraciones para lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(videoIds.length/batchSize)}`);
            
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
            
            // Pequeño delay entre requests para no saturar API
            if (i + batchSize < videoIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`✅ Duraciones obtenidas: ${Object.keys(durations).length}/${videoIds.length} videos`);
        return durations;
        
    } catch (error) {
        console.error('❌ Error obteniendo duraciones:', error);
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
        if (typeof durationInput === 'number' && !isNaN(durationInput)) {
            return Math.floor(Math.abs(durationInput));
        }
        
        if (typeof durationInput !== 'string') return 0;

        // Formato ISO PT1H2M3S
        const isoMatch = durationInput.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
        if (isoMatch) {
            const hours = parseInt(isoMatch[1] || '0', 10);
            const minutes = parseInt(isoMatch[2] || '0', 10);
            const seconds = parseFloat(isoMatch[3] || '0');
            return Math.floor(hours * 3600 + minutes * 60 + seconds);
        }

        // Formato MM:SS o HH:MM:SS
        const timeParts = durationInput.split(':').map(part => parseInt(part, 10));
        if (timeParts.length === 2 && timeParts.every(p => !isNaN(p))) {
            return timeParts[0] * 60 + timeParts[1];
        } else if (timeParts.length === 3 && timeParts.every(p => !isNaN(p))) {
            return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
        }

        // Número directo
        const directNumber = parseInt(durationInput, 10);
        if (!isNaN(directNumber) && directNumber > 0) {
            return directNumber;
        }

        // Si no se puede parsear, asumir duración promedio de canción (3.5 minutos)
        console.warn(`⚠️ No se pudo parsear duración: "${durationInput}", usando 210s por defecto`);
        return 210;
    }
    // =============================================
    // MONITOREO Y ESTADO
    // =============================================
    startMonitoring() {
        if (monitorInterval) {
        console.warn('⚠️ Ya hay un monitoreo activo, no se crea otro');
        return;
    }
    
    monitorInterval = setInterval(() => {
        monitorPlayers();
        
        // SPONSORBLOCK integrado aquí
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (activePlayer && reproduccionIniciada) {
            checkAndSkipSegment(activePlayer);
        }
    }, 300); // Cada 300ms
    
    console.log('📊 Monitoreo iniciado (intervalo: 300ms)');
};

    stopMonitoring() {
        if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
        console.log('📊 Monitoreo detenido');
    }
};

updateCurrentPlayingIndex() {
    const flatList = this.getFlattenedPlaylist();
    
    // NO ACTUALIZAR SI HAY TRANSICIÓN
    if (crossfadeInProgress || isTransitioning) {
        console.log('🔒 Evitando actualización durante transición');
        return;
    }

    try {
        let playingVideoId = null;
        let activePlayerNum = null;

        if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player1.getVideoData()?.video_id;
            activePlayerNum = 1;
        } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player2.getVideoData()?.video_id;
            activePlayerNum = 2;
        }
        
        if (!playingVideoId) return;
        
        // ✅ VALIDAR QUE COINCIDA
        if (currentPlayingInfo.videoId && currentPlayingInfo.videoId !== playingVideoId) {
            console.log(`⚠️ Mismatch detectado: esperado ${currentPlayingInfo.videoId}, actual ${playingVideoId}`);
            // No actualizar si hay discrepancia
            return;
        }
        
        console.log(`🔄 Video activo validado: ${playingVideoId} en player${activePlayerNum}`);
        
    } catch (e) {
        console.error("Error en updateCurrentPlayingIndex:", e);
    }
}
    // =============================================
    // UI UPDATES
    // =============================================
    updateNowPlaying() {
        const flatList = this.getFlattenedPlaylist();
        const currentVideo = flatList[currentPlayingInfo.flattenedIndex];
        
        if (currentVideo) {
            // Obtener información adicional del video si está disponible
            let artistInfo = 'YT CrossMix';
            
            // Si el video tiene información del canal, usarla
            if (currentVideo.uploaderName) {
                artistInfo = currentVideo.uploaderName;
            } else if (currentVideo.author) {
                artistInfo = currentVideo.author;
            } else {
                // Intentar extraer del título
                const titleParts = currentVideo.title.split(' - ');
                if (titleParts.length > 1) {
                    artistInfo = titleParts[0];
                }
            }
            
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
            if (elements.playerThumbnail) {
                elements.playerThumbnail.src = currentVideo.thumbnail;
                elements.playerThumbnail.alt = currentVideo.title;
            }
           // Notificar al playlistManager que la canción cambió
    if (window.playlistManager && typeof window.playlistManager.refreshActiveQueueTab === 'function') {
        window.playlistManager.refreshActiveQueueTab();
    } 
        }
    }
/**
 * Actualizar información en vista completa
 */
updateNowPlayingFull() {
    const flatList = this.getFlattenedPlaylist();
    const currentVideo = flatList[this.state.currentPlayingInfo?.flattenedIndex];
    
    if (currentVideo) {
        const titleFull = document.getElementById('nowPlayingTitleFull');
        const artistFull = document.getElementById('nowPlayingArtistFull');
        
        if (titleFull) titleFull.textContent = currentVideo.title;
        if (artistFull) {
            const artist = currentVideo.artist || 
                          currentVideo.uploaderName || 
                          currentVideo.author || 
                          'YouTube';
            artistFull.textContent = artist;
        }
    }
}
    updatePlayButton(state) {
        const playBtn = document.getElementById('botonPlay');
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        
        const icon = state === 'play' ? 'fa-play' : 'fa-pause';
        const buttons = [playBtn, miniPlayBtn].filter(Boolean);
        
        buttons.forEach(btn => {
            const iconElement = btn.querySelector('i');
            if (iconElement) {
                iconElement.className = `fas ${icon}`;
            }
        });
    }

    enablePlayButton() {
        const flatList = this.getFlattenedPlaylist();
        const shouldEnable = flatList.length > 0 && playersInitialized;
        
        const buttons = [
            document.getElementById('botonPlay'),
            document.getElementById('botonNext'),
            document.getElementById('prevButton'),
            document.getElementById('miniPlayBtn'),
            document.getElementById('miniNextBtn')
        ].filter(Boolean);
        
        buttons.forEach(btn => {
            btn.disabled = !shouldEnable;
        });
    }

    updateOverviewStats() {
        const totalPlaylists = playlistsData.length;
        const totalVideos = playlistsData.reduce((sum, p) => sum + p.videos.length, 0);
        
        const overviewGrid = document.getElementById('overviewGrid');
        if (overviewGrid) {
            const playlistStat = overviewGrid.querySelector('.overview-stat');
            if (playlistStat) {
                playlistStat.textContent = `${totalPlaylists} playlists cargadas`;
            }
            const videoStat = overviewGrid.querySelector('.overview-stat:nth-child(2)');
            if (videoStat) {
                videoStat.textContent = `${totalVideos} videos en total`;
            }
        }
    }

    updateStatusIndicator(message, type = 'info') {
        const indicator = document.getElementById('unifiedStatusIndicator');
        if (!indicator) return;

        indicator.textContent = message;
        indicator.className = `unified-status-indicator show ${type}`;
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        }
    }

    updatePlayersStatus(status) {
        const statusElement = document.getElementById('unifiedPlayersStatus');
        if (statusElement) {
            statusElement.textContent = `Reproductores: ${status}`;
        }
    }

    // =============================================
    // MANEJO DE EVENTOS Y ESTADOS
    // =============================================
    handleEmptyPlaylist() {
        console.log('📭 Lista vacía');
        this.stopMonitoring();
        reproduccionIniciada = false;
        this.updatePlayButton('play');
        this.enablePlayButton();
        currentPlayingInfo = { flattenedIndex: -1, videoId: null, playlistId: null };
        this.updatePlaylistsUI();
    }

    handleEndOfPlaylist() {
        console.log('🔚 Final de lista alcanzado');
        const repeat = confirm('¿Deseas repetir la lista desde el principio?');
        
        if (repeat) {
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
        console.error(`❌ Índice fuera de rango: ${index} (Total: ${flatList.length})`);
        return;
    }

    const video = flatList[index];
    console.log(`🎵 Reproduciendo video en índice ${index}: ${video.title}`);

    // ✅ ACTUALIZAR VARIABLES LOCALES
    currentPlayingInfo = {
        flattenedIndex: index,
        videoId: video.videoId,
        playlistId: video.sourcePlaylistId
    };
    
    // ✅ NUEVO: ACTUALIZAR VARIABLES GLOBALES
    window.currentPlayingInfo = currentPlayingInfo;
    window.reproduccionIniciada = true;

    try {
        const activePlayer = currentPlayer === 1 ? player1 : player2;
        activePlayer.loadVideoById(video.videoId);
        
        reproduccionIniciada = true; // Variable local también
        
        this.updatePlayButton('pause');
        this.startMonitoring();
        this.updateNowPlaying();
        this.updatePlaylistsUI();
        
        // Asegurar que el mini player se muestre si no estamos en fullPlayer
        if (this.currentView !== 'fullPlayer') {
            setTimeout(() => {
                this.showMiniPlayerFloat();
            }, 500);
        }
        
        // Refrescar tabs
        setTimeout(() => {
            this.refreshActiveQueueTab();
        }, 1000);
        
    } catch (error) {
        console.error("❌ Error reproduciendo video:", error);
        this.showMessage("Error al reproducir video", 'error');
        reproduccionIniciada = false;
        window.reproduccionIniciada = false; // ✅ También global
        this.updatePlayButton('play');
    }
}
    // =============================================
    // SISTEMA DE MENSAJES Y DEBUG
    // =============================================
    showMessage(message, type = 'info', duration = 4000) {
        console.log(`💬 ${type.toUpperCase()}: ${message}`);
        
        const container = document.getElementById('floatingMessageContainer') || 
                         document.querySelector('.floating-messages');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `floating-message ${type}`;
        messageEl.textContent = message;

        container.appendChild(messageEl);

        // Auto-remove después del duration
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
        document.querySelectorAll('[data-requires-unified]').forEach(el => {
            el.classList.add('unified-ready');
        });
        document.body.classList.remove('unified-loading');
        
        // Actualizar indicador visual
        const indicator = document.getElementById('unifiedIndicator');
        if (indicator) {
            indicator.style.background = '#4caf50';
            indicator.title = 'Sistema Unificado - Activo';
        }
    }

    enableDebugMode() {
        console.log('🔧 Modo debug habilitado');
        document.getElementById('unifiedDebugToggle')?.style.setProperty('display', 'block');
        document.getElementById('unifiedControls')?.style.setProperty('display', 'flex');
    }

    loadInitialData() {
        // Solo cargar si NO hay datos persistentes ya cargados
        if (playlistsData.length === 0) {
            try {
                const savedPlaylists = localStorage.getItem('ytcm_playlists');
                if (savedPlaylists) {
                    const parsed = JSON.parse(savedPlaylists);
                    if (Array.isArray(parsed)) {
                        playlistsData = parsed;
                        console.log('📂 Datos legacy cargados del localStorage');
                    }
                }
            } catch (e) {
                console.warn('Error cargando datos legacy:', e);
            }
        }
    }

    saveData() {
        try {
            // Filtrar playlists de YouTube Library para no guardarlas
            const playlistsToSave = playlistsData.filter(p => p.source !== 'youtube_library');
            localStorage.setItem('ytcm_playlists', JSON.stringify(playlistsToSave));
        } catch (e) {
            console.warn('Error guardando datos:', e);
        }
    }
}

// =============================================
// FUNCIONES GLOBALES Y UTILIDADES - CORREGIDAS
// =============================================

/**
 * Obtener segmentos SponsorBlock
 */
async function obtenerSegmentosSponsorBlock(videoId) {
    // Si ya hay segmentos en caché (es un array) o ya se está obteniendo ('fetching'), no hacer nada.
    if (segmentosCache[videoId] === 'fetching' || Array.isArray(segmentosCache[videoId])) {
         // console.log(`SB Fetch: Segmentos ya en caché o obteniendo para ${videoId}. Saliendo.`);
         return null; 
    }

    // Si llegamos aquí, segmentosCache[videoId] es undefined.
    // Marcar el estado como 'fetching' SINCRÓNICAMENTE ANTES de la llamada await fetch.
    segmentosCache[videoId] = 'fetching';
    console.log(`SB Fetch: Iniciando obtención para ${videoId}. Marcando estado 'fetching'.`);

    // NOTA: Asegúrate de tener tu userId configurado o pasarlo como argumento
    const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd'; // Tu userId del backup
    const apiUrl = `/api/segments/${videoId}`; // URL relativa a tu función Netlify
    console.log(`SB Fetch: Llamando a la API local SB: ${apiUrl}`);

    try {
        // Tu llamada fetch con el encabezado X-UserID
        const response = await fetch(apiUrl, {
            headers: {
                'X-UserID': userId 
            }
        });

        if (!response.ok) {
             console.error(`SB Fetch: Error desde la API SB (${apiUrl}): ${response.status} ${response.statusText}`);
             throw new Error(`API SB Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
             console.warn(`SB Fetch: La API SB (${apiUrl}) no devolvió un array para ${videoId}. Respuesta:`, data);
              throw new Error(`API SB Error: Respuesta no es un array`);
        }

        console.log(`SB Fetch: Segmentos recibidos de API SB para ${videoId} (crudos): ${data.length}`);

        // --- LÓGICA DE VALIDACIÓN ---
        const validSegments = data.filter(segment => {
            if (!segment || typeof segment.startTime === 'undefined' || typeof segment.endTime === 'undefined') {
                return false; 
            }
            const start = parseFloat(segment.startTime);
            const end = parseFloat(segment.endTime);

            if (isNaN(start) || isNaN(end)) return false;
            if (start < 0 || end < 0 || end < start) return false;

            return true;
        });

        // Almacenar los SEGMENTOS VÁLIDOS en caché
        segmentosCache[videoId] = validSegments; 
        return validSegments; 

    } catch (error) {
        console.error(`SB Fetch: Error en fetch/procesamiento SB para ${apiUrl}:`, error);
        segmentosCache[videoId] = null; // Devolver null para indicar el fallo
        return null; 
    }
}
/**
 * Verificar y saltar segmentos
 */
function checkAndSkipSegment(player) {
    try {
        const currentTime = player.getCurrentTime();
        const videoId = player.getVideoData()?.video_id;

        if (!videoId || isNaN(currentTime) || currentTime < 0) return;

        // CRITICAL: Evitar loop infinito - verificar si ya saltamos este segmento recientemente
        const now = Date.now();
        const skipKey = `${videoId}_${Math.floor(currentTime)}`;
        
        // Si saltamos este mismo video y tiempo en los últimos 3 segundos, no saltar de nuevo
        if (lastSeekVideoId === videoId && 
            lastSeekEndTime > 0 && 
            Math.abs(currentTime - lastSeekEndTime) < 5) {
            return;
        }

        // Si no hay segmentos en caché, obtenerlos
        if (!segmentosCache[videoId]) {
            obtenerSegmentosSponsorBlock(videoId);
            return;
        }

        // Si aún se están obteniendo, esperar
        if (segmentosCache[videoId] === 'fetching') return;

        // Si no hay segmentos válidos, salir
        const segments = segmentosCache[videoId];
        if (!Array.isArray(segments) || segments.length === 0) return;

        // CORRECCIÓN CRÍTICA: Buscar segmento a saltar
        // Para música, solo saltar intros/outros largos (music_offtopic)
        const segmentToSkip = segments.find(segment => {
            if (!segment || typeof segment !== 'object') return false;
            
            // Obtener tiempos del segmento
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
            
            // Validar que los tiempos sean números válidos
            if (typeof start !== 'number' || typeof end !== 'number') return false;
            if (isNaN(start) || isNaN(end)) return false;
            if (end <= start) return false;
            
            // FILTRAR: Solo saltar music_offtopic (intros/outros)
            if (segment.category === 'music_offtopic') {
                const duration = end - start;
                
                // duracion para saltar
                if (duration < 4) return false;
                
                // Verificar si el tiempo actual está dentro del segmento
                // Dar un margen de 0.5 segundos para evitar saltos múltiples
                return currentTime >= start && currentTime < (end - 0.5);
            }
            
            return false;
        });

        if (segmentToSkip) {
            // Obtener tiempo de salto
            let skipToTime;
            
            if (segmentToSkip.segment && Array.isArray(segmentToSkip.segment)) {
                skipToTime = segmentToSkip.segment[1];
            } else if (segmentToSkip.endTime !== undefined) {
                skipToTime = segmentToSkip.endTime;
            }
            
            // Validar tiempo de salto
            if (!skipToTime || typeof skipToTime !== 'number' || isNaN(skipToTime)) {
                console.warn('⚠️ Tiempo de salto inválido:', skipToTime);
                return;
            }
            
            // Verificar que el salto sea hacia adelante
            if (skipToTime <= currentTime) {
                console.warn('⚠️ Tiempo de salto no es mayor al actual');
                return;
            }
            
            const segmentDuration = skipToTime - currentTime;
            
            console.log(`⏭️ SponsorBlock: Saltando intro/outro de ${currentTime.toFixed(1)}s a ${skipToTime.toFixed(1)}s (${segmentDuration.toFixed(1)}s)`);
            
            // Guardar información del salto ANTES de saltar
            lastSeekVideoId = videoId;
            lastSeekEndTime = skipToTime;
            
            try {
                // Realizar el salto
                player.seekTo(skipToTime, true);
                
                // Mostrar notificación al usuario
                if (window.unifiedCore) {
                    window.unifiedCore.showMessage(`⏭️ Intro/outro saltado (${segmentDuration.toFixed(0)}s)`, 'info', 2000);
                }
                
                console.log(`✅ Salto completado exitosamente`);
                
            } catch (seekError) {
                console.error("❌ Error ejecutando salto:", seekError);
                // Resetear variables si el salto falla
                lastSeekVideoId = null;
                lastSeekEndTime = -1;
            }
        }
        
    } catch (error) {
        console.error("❌ Error general en checkAndSkipSegment:", error);
    }
}

/**
 * Monitorear reproductores
 */
function monitorPlayers() {
    // Validaciones básicas
    if (!playersInitialized || !reproduccionIniciada) return;

    try {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (!activePlayer?.getPlayerState) return;

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        // Solo monitorear cuando está reproduciendo
        if (playerState !== YT.PlayerState.PLAYING) return;
        if (isNaN(currentTime) || currentTime < 0 || videoDuration <= 0) return;
        if (!videoId) return;

        // =============================================
        // CALCULAR DURACIÓN TOTAL DE SPONSORBLOCK
        // =============================================
        let totalSponsorBlockDuration = 0;
        
        if (segmentosCache[videoId] && Array.isArray(segmentosCache[videoId])) {
            totalSponsorBlockDuration = segmentosCache[videoId]
                .filter(s => s.category === 'music_offtopic')
                .reduce((sum, s) => {
                    const start = s.segment?.[0] ?? s.startTime;
                    const end = s.segment?.[1] ?? s.endTime;
                    if (typeof start === 'number' && typeof end === 'number') {
                        return sum + (end - start);
                    }
                    return sum;
                }, 0);
        }

        // =============================================
        // CALCULAR PUNTO DE TRIGGER
        // =============================================
        const API_BUFFER = 1; // Buffer para carga de API
        const SAFETY_MARGIN = 0.5; // Margen de seguridad
        const totalAdjustment = CROSSFADE_DURATION + API_BUFFER + SAFETY_MARGIN;
        const triggerTime = videoDuration - (totalAdjustment + totalSponsorBlockDuration);
        const timeRemaining = videoDuration - currentTime;
        
        // =============================================
        // DEBUG CADA 5 SEGUNDOS (solo cuando está cerca del trigger)
        // =============================================
        const shouldLog = Math.floor(currentTime) % 5 === 0 && 
                         Math.floor(currentTime) !== Math.floor(currentTime - 0.3);
        
        if (shouldLog && currentTime > triggerTime - 20) {
            console.log(`⏱️ [${Math.round(currentTime)}s/${Math.round(videoDuration)}s]`, {
                triggerTime: Math.round(triggerTime * 10) / 10,
                timeRemaining: Math.round(timeRemaining * 10) / 10,
                shouldTrigger: currentTime >= triggerTime,
                transitionActive: isTransitioning,
                crossfadeActive: crossfadeInProgress,
                flags: {
                    hasOutro: hasOutroCrossfadeStarted,
                    nextScheduled: nextVideoScheduled
                }
            });
        }

        // =============================================
        // SPONSORBLOCK: Saltar segmentos durante reproducción
        // =============================================
        if (currentTime > 0) {
            checkAndSkipSegment(activePlayer);
        }

        // =============================================
        // ⚠️ CRITICAL: DISPARAR CROSSFADE
        // =============================================
        if (currentTime >= triggerTime && 
            !hasOutroCrossfadeStarted && 
            !isTransitioning && 
            !crossfadeInProgress &&
            !nextVideoScheduled) { 
            
            console.log(`🚀 ¡CROSSFADE TRIGGER!`, {
                currentTime: Math.round(currentTime * 10) / 10,
                triggerTime: Math.round(triggerTime * 10) / 10,
                timeRemaining: Math.round(timeRemaining * 10) / 10,
                videoDuration: Math.round(videoDuration)
            });
            
            // ✅ MARCAR FLAGS INMEDIATAMENTE
            hasOutroCrossfadeStarted = true;
            nextVideoScheduled = true;
            
            // ✅ PAUSAR MONITOREO DURANTE CROSSFADE
            if (monitorInterval) {
                clearInterval(monitorInterval);
                monitorInterval = null;
                console.log('📊 Monitoreo pausado durante crossfade');
            }
        
            // Efectos visuales
            if (window.applyCrossfadeVisualEffect) {
                window.applyCrossfadeVisualEffect();
            }
            
            // Disparar evento
            document.dispatchEvent(new CustomEvent('crossfadeTriggered', {
                detail: {
                    currentTime,
                    triggerTime,
                    timeRemaining,
                    videoDuration
                }
            }));
            
            // Ejecutar playNextVideo
            if (window.unifiedCore?.playNextVideo) {
                setTimeout(() => {
                    window.unifiedCore.playNextVideo();
                }, 100);
            }
            
            return; // Salir inmediatamente
        }
        
    } catch (error) {
        console.error("❌ Error en monitorPlayers:", error);
    }
}

// =============================================
// FUNCIÓN AUXILIAR: Calcular tiempo pasado en SponsorBlock
// =============================================
function calculatePastSponsorBlockTime(videoId, currentTime) {
    if (!videoId || !segmentosCache[videoId]) return 0;
    
    const segments = segmentosCache[videoId];
    let pastTime = 0;
    
    segments.forEach(segment => {
        if (segment.category === 'music_offtopic') {
            let start, end;
            
            if (segment.segment && Array.isArray(segment.segment)) {
                start = segment.segment[0];
                end = segment.segment[1];
            } else if (segment.startTime !== undefined && segment.endTime !== undefined) {
                start = segment.startTime;
                end = segment.endTime;
            }
            
            // Si el segmento ya pasó completamente
            if (currentTime > end && typeof start === 'number' && typeof end === 'number') {
                pastTime += (end - start);
            }
            // Si estamos dentro del segmento
            else if (currentTime >= start && currentTime < end) {
                pastTime += (currentTime - start);
            }
        }
    });
    
    return pastTime;
}

// =============================================
// FUNCIÓN AUXILIAR: Obtener tiempo de trigger
// =============================================
function calculateCrossfadeTriggerTime(videoDuration, videoId) {
    const CROSSFADE_DURATION = 10;
    const API_BUFFER = 1;
    const SAFETY_MARGIN = 0.5;
    
    // Calcular TOTAL SponsorBlock (todos los segmentos)
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
    
    // Duración efectiva del video
    const effectiveVideoDuration = videoDuration - totalSponsorBlockDuration;
    
    const totalAdjustment = CROSSFADE_DURATION + API_BUFFER + SAFETY_MARGIN;
    return effectiveVideoDuration - totalAdjustment;
}

// =============================================
// FUNCIÓN AUXILIAR: Resetear flags de crossfade
// =============================================
function resetCrossfadeFlags() {
    hasOutroCrossfadeStarted = false;
    nextVideoScheduled = false;
    console.log('🔄 Flags de crossfade reseteados');
}
// Función para forzar recarga de segmentos
window.reloadSponsorBlockSegments = function(videoId) {
    if (!videoId) {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        videoId = activePlayer?.getVideoData()?.video_id;
    }
    
    if (!videoId) {
        console.log('❌ No hay video activo');
        return;
    }
    
    console.log('🔄 Recargando segmentos para:', videoId);
    delete segmentosCache[videoId];
    obtenerSegmentosSponsorBlock(videoId);
};
// Configuración de persistencia central
const CORE_STORAGE_KEYS = {
    PLAYLISTS_CORE: 'ytcm_playlists_persistent',
    QUEUE: 'ytcm_queue_persistent', 
    PLAYING_STATE: 'ytcm_playing_state'
};
const CORE_PERSISTENCE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 días

// Exponer funciones globalmente para compatibilidad
window.savePlaylistsDataPersistent = savePlaylistsDataPersistent;
window.loadPlaylistsDataPersistent = loadPlaylistsDataPersistent;
window.loadQueuePersistent = loadQueuePersistent;
window.saveQueuePersistent = saveQueuePersistent;
// =============================================
// FUNCIONES DE DEBUG
// =============================================
function toggleUnifiedDebug() {
    const debugPanel = document.getElementById('unifiedDebugPanel');
    const statePanel = document.getElementById('unifiedStateDebug');
    
    if (debugPanel) {
        debugPanel.classList.toggle('show');
    }
    if (statePanel) {
        statePanel.classList.toggle('show');
        if (statePanel.classList.contains('show')) {
            updateDebugInfo();
        }
    }
}

function updateDebugInfo() {
    const debugContent = document.getElementById('stateDebugContent');
    if (!debugContent) return;

    const info = {
        'Sistema': unifiedState.initialized ? '✅ Inicializado' : '❌ No inicializado',
        'Vista actual': window.unifiedCore?.currentView || 'Desconocida',
        'Reproductores': playersInitialized ? '✅ Listos' : '❌ No listos',
        'Reproducción': reproduccionIniciada ? '▶️ Activa' : '⏸️ Detenida',
        'Playlists cargadas': playlistsData.length,
        'Videos totales': playlistsData.reduce((sum, p) => sum + p.videos.length, 0),
        'Video actual': currentPlayingInfo.videoId || 'Ninguno',
        'Índice actual': currentPlayingInfo.flattenedIndex,
        'Crossfade activo': crossfadeInProgress ? '✅ Sí' : '❌ No',
        'Monitoreo activo': monitorInterval ? '✅ Sí' : '❌ No',
        'Cache SponsorBlock': Object.keys(segmentosCache).length + ' videos'
    };

    debugContent.innerHTML = Object.entries(info).map(([key, value]) => 
        `<div class="state-section"><span class="state-key">${key}:</span> <span class="state-value">${value}</span></div>`
    ).join('');
}

// Funciones globales de debug
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
    updateDebugInfo();
};

window.resetUnified = function() {
    if (confirm('¿Resetear completamente el sistema?')) {
        localStorage.removeItem('ytcm_playlists');
        localStorage.removeItem('ytcm_debug');
        localStorage.removeItem('google_token');
        segmentosCache = {}; // Limpiar caché SponsorBlock
        location.reload();
    }
};

window.clearSponsorBlockCache = function() {
    segmentosCache = {};
    console.log('🧹 Caché de SponsorBlock limpiado');
    if (window.unifiedCore) {
        window.unifiedCore.showMessage('Caché SponsorBlock limpiado', 'success');
    }
};

// =============================================
// INICIALIZACIÓN AUTOMÁTICA
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 DOM cargado, iniciando Sistema Unificado...');
    
    // Crear instancia global
    window.unifiedCore = new UnifiedCore();
    window.unifiedStateManager = window.unifiedCore;
    
    // Guardar datos periódicamente
    setInterval(() => {
        if (window.unifiedCore?.state?.initialized) {
            window.unifiedCore.saveData();
        }
    }, 30000); // Cada 30 segundos
    
    // Debug automático en desarrollo
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        localStorage.setItem('ytcm_debug', 'true');
        setTimeout(() => window.unifiedCore?.enableDebugMode(), 1000);
    }
    //Agregar video despues 
    if (window.UnifiedCore && window.UnifiedCore.prototype) {
    window.UnifiedCore.prototype.addVideoToQueueAfterCurrent = async function(videoData) {
        // VALIDACIÓN CRÍTICA
        if (!videoData || !videoData.videoId) {
            console.error('❌ addVideoToQueueAfterCurrent: videoData o videoId inválido:', videoData);
            this.showMessage('Error: Video inválido', 'error');
            return;
        }

        if (videoData.videoId === 'undefined' || videoData.videoId === undefined) {
            console.error('❌ addVideoToQueueAfterCurrent: videoId es undefined');
            this.showMessage('Error: ID de video no válido', 'error');
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

        // Verificar duplicados
        const isDuplicate = queuePlaylist.videos.some(v => v.videoId === videoData.videoId);
        if (isDuplicate) {
            this.showMessage(`"${videoData.title}" ya está en la cola`, 'warning');
            return;
        }

        // Obtener duración si no la tiene
        let duration = videoData.duration || 0;
        
        if (!duration && videoData.videoId && window.isAuthorized) {
            try {
                const durations = await this.getBatchVideoDurations([videoData.videoId]);
                duration = durations[videoData.videoId] || 0;
            } catch (error) {
                console.warn('No se pudo obtener duración para', videoData.videoId);
            }
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

        // INSERTAR DESPUÉS DEL VIDEO ACTUAL
        const currentIndex = currentPlayingInfo.flattenedIndex;
        
        if (currentIndex >= 0 && currentIndex < queuePlaylist.videos.length) {
            // Insertar justo después del video actual
            queuePlaylist.videos.splice(currentIndex + 1, 0, videoObject);
            this.showMessage(`Añadido después de la canción actual: ${videoObject.title}`, 'success');
            console.log(`🎵 Video insertado en posición ${currentIndex + 1}`);
        } else {
            // Si no hay reproducción, añadir al final
            queuePlaylist.videos.push(videoObject);
            this.showMessage(`Añadido a cola: ${videoObject.title}`, 'success');
        }
        
        this.updatePlaylistsUI();
        this.enablePlayButton();
        
        console.log(`🎵 Video añadido exitosamente. Total: ${queuePlaylist.videos.length} videos`);
        setTimeout(() => saveAllData(), 500);
    };
}
});

// Preservar datos al cambiar tamaño de ventana
window.addEventListener('resize', () => {
    // Debounce para evitar múltiples llamadas
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        console.log('🖥️ Redimensionando ventana, preservando datos...');
        if (window.unifiedCore) {
            window.unifiedCore.updatePlaylistsUI();
            window.unifiedCore.updateNowPlaying();
        }
        
        // Forzar actualización de auth UI
        setTimeout(() => {
            if (window.updateAuthUI) {
                window.updateAuthUI();
            }
        }, 100);
    }, 300);
});

// Cleanup al salir
window.addEventListener('beforeunload', () => {
    if (window.unifiedCore?.state?.initialized) {
        window.unifiedCore.saveData();
        window.unifiedCore.stopMonitoring();
    }
    
    // Limpiar intervalos de crossfade
    if (crossfadeInterval) {
        clearInterval(crossfadeInterval);
    }
    if (monitorInterval) {
        clearInterval(monitorInterval);
    }
});
// Exponer UnifiedCore globalmente
window.UnifiedCore = UnifiedCore;
