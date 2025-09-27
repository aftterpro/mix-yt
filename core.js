console.log('Core cargando...');

// =============================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// =============================================
const CROSSFADE_DURATION = 10; // Duración del crossfade en segundos

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

// Estado del sistema unificado
const unifiedState = {
    initialized: false,
    currentView: 'home',
    debugMode: false,
    authReady: false,
    playersReady: false
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
    constructor() {
        this.state = unifiedState;
        this.views = ['home', 'search', 'library', 'playing'];
        this.currentView = 'home';
        this.debugMode = localStorage.getItem('ytcm_debug') === 'true';
        this.init();
        this.setupAutomaticSaving();
        this.playlistsData = playlistsData;
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
    this.updateStatusIndicator('Inicializando...', 'loading');
       
    // Configurar debug
    if (this.debugMode) {
        this.enableDebugMode();
    }
    
    // Inicializar componentes
    await this.initializeComponents();
    
    // Configurar eventos
    this.setupEventListeners();
    
    // Cargar datos iniciales
    this.loadInitialData();
    
    // Inicializar playlist manager
    this.initializePlaylistManager();
    
    this.state.initialized = true;
    this.updateStatusIndicator('Sistema Listo', 'success');
    this.enableUnifiedElements();
    
    // NUEVO: Procesar playlists pendientes si las hay
    if (window.pendingYouTubePlaylists) {
        console.log("🔄 Procesando playlists de YouTube pendientes");
        this.processYouTubePlaylists(window.pendingYouTubePlaylists);
        window.pendingYouTubePlaylists = null;
    }
    
    setTimeout(() => {
        if (!window.playlistManager) {
            console.error("❌ CRÍTICO: playlistManager no está disponible después de la inicialización");
            this.showMessage("Error: Gestor de playlists no disponible", 'error');
        } else {
            console.log("✅ playlistManager verificado y disponible");
        }
    }, 1000); // Reducido de 3000ms a 1000ms
    
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
            this.updateCurrentPlayingIndex();
            // Guardar estado cuando se reproduce
            setTimeout(() => saveAllData(), 1000);
        }
    }

    onPlayerError(event) {
        console.error('❌ Error en reproductor:', event.data);
        this.showMessage(`Error en reproductor: ${event.data}`, 'error');
    }

initializeAuth() {
    console.log("🔧 Configurando eventos de autenticación optimizados...");
    
    if (window.authEventsConfigured) {
        console.log("⚠️ Eventos de auth ya configurados");
        return;
    }
    window.authEventsConfigured = true;
    
    // Crear handler unificado pero mantener lógica específica
    const playlistHandler = (event) => {
        let playlists, source;
        
        // Determinar tipo de evento y extraer datos
        if (event.type === 'youtubePlaylistsReady') {
            ({ playlists, source } = event.detail);
        } else if (event.type === 'playlistsFetched') {
            playlists = event.detail;
            source = 'realtime';
        }
        
        if (!playlists || playlists.length === 0) return;
        
        console.log(`📁 Evento ${event.type} recibido:`, {
            playlistsCount: playlists.length,
            source,
            systemReady: this.state.initialized
        });
        
        // Verificar que el sistema esté listo
        if (!this.state.initialized || !window.playlistManager) {
            console.log("⏳ Sistema no listo, programando procesamiento diferido");
            window.pendingYouTubePlaylists = playlists;
            return;
        }
        
        this.processYouTubePlaylists(playlists);
    };
    
    // Usar el mismo handler para ambos eventos
    document.addEventListener('youtubePlaylistsReady', playlistHandler);
    document.addEventListener('playlistsFetched', playlistHandler);

    // Evento de logout (mantener separado porque es diferente)
    document.addEventListener('userLoggedOut', () => {
        console.log("🚪 Usuario desconectado, limpiando playlists de YouTube");
        if (window.playlistManager?.clearYouTubeLibraryPlaylists) {
            window.playlistManager.clearYouTubeLibraryPlaylists();
        }
        window.playlistsAlreadyProcessed = false;
        setTimeout(() => this.updatePlaylistsUI(), 500);
    });
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
            playBtn.addEventListener('click', () => this.handlePlayPause());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.handleNext());
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.handlePrevious());
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
    // COLA COMO POPUP
    // =============================================
    showQueuePopup() {
        // Eliminar popup existente si existe
        this.closeQueuePopup();

        const popup = document.createElement('div');
        popup.className = 'queue-popup-overlay';
        popup.innerHTML = `
            <div class="queue-popup">
                <div class="queue-popup-header">
                    <h3 class="queue-popup-title">
                        <i class="fas fa-list"></i>
                        Cola de Reproducción
                    </h3>
                    <button class="queue-popup-close" id="queuePopupClose">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="queue-popup-content" id="queuePopupContent">
                    ${this.renderQueueContent()}
                </div>
            </div>
        `;

        // Event listeners
        popup.querySelector('.queue-popup-close').addEventListener('click', () => {
            this.closeQueuePopup();
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                this.closeQueuePopup();
            }
        });

        document.body.appendChild(popup);
        
        // Animación de entrada
        setTimeout(() => {
            popup.classList.add('show');
        }, 10);

        console.log('📋 Popup de cola abierto');
    }

    closeQueuePopup() {
        const existingPopup = document.querySelector('.queue-popup-overlay');
        if (existingPopup) {
            existingPopup.classList.add('fade-out');
            setTimeout(() => {
                existingPopup.remove();
            }, 300);
        }
    }


renderQueueContent() {
    const flatList = this.getFlattenedPlaylist();
    
    console.log(`📋 Renderizando contenido de cola: ${flatList.length} videos`);
    
    if (flatList.length === 0) {
        return `
            <div class="empty-queue-message">
                <i class="fas fa-music"></i>
                <p>La cola está vacía</p>
                <p>Añade música desde la biblioteca o búsqueda</p>
            </div>
        `;
    }

    let html = `
        <div class="queue-controls">
            <div class="queue-info">
                <span class="queue-count">${flatList.length} videos en cola</span>
                <span class="queue-duration">Duración estimada: ${this.formatTotalDuration(flatList)}</span>
            </div>
            <button class="clear-queue-btn" onclick="window.unifiedCore.clearQueue()">
                <i class="fas fa-trash"></i>
                Borrar todo
            </button>
        </div>
        <div class="queue-items">
    `;
    
    flatList.forEach((video, index) => {
        const isPlaying = video.videoId === currentPlayingInfo.videoId;
        const duration = video.duration && video.duration > 0 
            ? this.formatDuration(video.duration) 
            : '--:--';
            
        // DEBUG: Agregar más información para debugging
        console.log(`📋 Renderizando video ${index}: ${video.title} (${video.videoId})`);
            
        html += `
            <div class="queue-item ${isPlaying ? 'playing' : ''}" 
                 data-video-id="${video.videoId}" 
                 data-flat-index="${index}"
                 title="Click para reproducir">
                <div class="queue-item-number">${index + 1}</div>
                <img src="${video.thumbnail}" alt="${video.title}" class="queue-item-thumbnail" loading="lazy">
                <div class="queue-item-info">
                    <div class="queue-item-title" title="${video.title}">${video.title}</div>
                    <div class="queue-item-meta">
                        <span class="queue-item-duration">${duration}</span>
                        <span class="queue-item-author" title="${video.uploaderName || 'YouTube'}">${video.uploaderName || 'YouTube'}</span>
                    </div>
                </div>
                ${isPlaying ? '<i class="fas fa-volume-up queue-item-playing"></i>' : ''}
                <button class="queue-item-remove" 
                        data-video-id="${video.videoId}" 
                        title="Eliminar de la cola">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });
    
    html += '</div>';
    
    console.log('📋 Contenido de cola renderizado completamente');
    return html;
}

    // Actualizar contenido de popup de cola si está abierto
updateQueuePopup() {
    const queuePopupContent = document.getElementById('queuePopupContent');
    if (!queuePopupContent) {
        return; // No hay popup abierto
    }
    
    console.log('🔄 Actualizando popup de cola...');
    
    // Renderizar nuevo contenido
    queuePopupContent.innerHTML = this.renderQueueContent();
    
    // RECONFIGURAR EVENT LISTENERS después de actualizar - CON DELAY
    setTimeout(() => {
        this.setupQueuePopupEventListeners(queuePopupContent);
    }, 50); // Pequeño delay para asegurar que el DOM esté actualizado
    
    console.log('✅ Popup de cola actualizado y event listeners reconfigurados');
}
setupQueuePopupEventListeners(container) {
    if (!container) {
        console.warn('⚠️ Container no encontrado para event listeners');
        return;
    }
    
    console.log('🔧 Configurando event listeners de cola popup (core.js)');
    
    // LIMPIAR EVENT LISTENERS DUPLICADOS - MÉTODO MEJORADO
    container.querySelectorAll('.queue-item').forEach(item => {
        // Clonar el elemento para remover todos los listeners
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
    });
    
    // RECONFIGURAR EVENT LISTENERS EN LOS ELEMENTOS NUEVOS
    const newItems = container.querySelectorAll('.queue-item');
    console.log(`🔧 Configurando listeners para ${newItems.length} items de cola`);
    
    // Event listeners para reproducir video
    newItems.forEach((item, index) => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.queue-item-remove')) {
                const flatIndex = parseInt(item.dataset.flatIndex);
                if (!isNaN(flatIndex)) {
                    console.log(`▶️ Reproducir video en índice ${flatIndex}`);
                    this.playVideoAtIndex(flatIndex);
                    // Cerrar popup después de seleccionar
                    this.closeQueuePopup();
                } else {
                    console.warn(`⚠️ Índice inválido en item ${index}`);
                }
            }
        });
        
        console.log(`✅ Listener de reproducción configurado para item ${index}`);
    });
    
    // Event listeners para eliminar video
    const removeButtons = container.querySelectorAll('.queue-item-remove');
    console.log(`🔧 Configurando ${removeButtons.length} botones de eliminación`);
    
    removeButtons.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const videoId = btn.dataset.videoId;
            
            if (!videoId) {
                console.warn(`⚠️ videoId no encontrado en botón ${index}`);
                return;
            }
            
            console.log(`🗑️ Solicitud de eliminación: ${videoId}`);
            
            // FEEDBACK VISUAL INMEDIATO
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            btn.style.opacity = '0.7';
            
            // MARCAR ITEM COMO EN PROCESO DE ELIMINACIÓN
            const queueItem = btn.closest('.queue-item');
            if (queueItem) {
                queueItem.classList.add('removing');
            }
            
            // Ejecutar eliminación con pequeño delay para el feedback visual
            setTimeout(() => {
                const success = this.removeVideoFromQueue(videoId);
                
                if (success) {
                    console.log(`✅ Video ${videoId} eliminado exitosamente`);
                    // El popup se actualizará automáticamente por updateQueuePopup()
                } else {
                    console.error(`❌ Error eliminando video ${videoId}`);
                    // Restaurar botón si falló
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    if (queueItem) {
                        queueItem.classList.remove('removing');
                    }
                    this.showMessage('Error eliminando video', 'error');
                }
            }, 150); // Pequeño delay para mostrar el spinner
        });
        
        console.log(`✅ Listener de eliminación configurado para botón ${index}`);
    });
    
    console.log('✅ Todos los event listeners de cola configurados correctamente');
}

    // Función para calcular duración total
formatTotalDuration(videos) {
    const totalSeconds = videos.reduce((sum, video) => sum + (video.duration || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
    // Borrar toda la cola
    clearQueue() {
        if (confirm('¿Estás seguro de que quieres borrar toda la cola?')) {
            const queuePlaylist = playlistsData.find(p => p.id === 'queue');
            if (queuePlaylist) {
                queuePlaylist.videos = [];
            }
            
            this.updatePlaylistsUI();
            this.showMessage('Cola limpiada', 'success');
            
            const flatList = this.getFlattenedPlaylist();
            if (flatList.length === 0) {
                this.handleEmptyPlaylist();
            }
        }
    }

    // =============================================
    // GESTIÓN DE VISTAS
    // =============================================
    switchView(viewName) {
        if (!this.views.includes(viewName)) return;

        console.log(`🔄 Cambiando a vista: ${viewName}`);

        // Actualizar navegación activa (tanto desktop como móvil)
        document.querySelectorAll('.nav-item, .tab, .nav-tab').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelectorAll(`[data-view="${viewName}"]`).forEach(item => {
            item.classList.add('active');
        });

        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
        });

        // Mostrar vista seleccionada
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');
        }

        this.currentView = viewName;

        // Acciones específicas por vista
        switch (viewName) {
            case 'library':
                this.refreshLibraryView();
                break;
            case 'search':
                this.focusSearchInput();
                break;
            case 'playing':
                this.refreshPlayingView();
                break;
        }
    }

    refreshLibraryView() {
        this.updatePlaylistsUI();
    }

    refreshPlayingView() {
        this.updateNowPlaying();
        if (window.playlistManager) {
            window.playlistManager.updateQueueDisplay();
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
        if (!playersInitialized) {
            this.showMessage("Los reproductores no están listos", 'error');
            return;
        }

        const activePlayer = currentPlayer === 1 ? player1 : player2;
        
        if (!reproduccionIniciada) {
            this.playFirstVideo();
        } else {
            const playerState = activePlayer.getPlayerState();
            
            if (playerState === YT.PlayerState.PLAYING) {
                activePlayer.pauseVideo();
                this.updatePlayButton('play');
                this.stopMonitoring();
            } else if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
                activePlayer.playVideo();
                this.updatePlayButton('pause');
                this.startMonitoring();
            }
        }
    }

    handleNext() {
        if (!reproduccionIniciada) {
            this.showMessage("Inicia la reproducción primero", 'warning');
            return;
        }
        
        const flatList = this.getFlattenedPlaylist();
        if (flatList.length === 0) {
            this.showMessage("No hay videos en la cola", 'warning');
            return;
        }
        
        // Obtener índice siguiente
        let nextIndex = currentPlayingInfo.flattenedIndex + 1;
        if (nextIndex >= flatList.length) {
            nextIndex = 0; // Volver al principio
        }
        
        const nextVideo = flatList[nextIndex];
        console.log(`⏭️ Botón Next: Saltando a ${nextVideo.title} (índice ${nextIndex})`);
        
        // Usar playNextVideo en lugar de playVideoAtIndex para crossfade suave
        hasOutroCrossfadeStarted = true; // Forzar inicio de crossfade
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
        const currentFlatIndex = currentPlayingInfo.flattenedIndex;
        const flatList = this.getFlattenedPlaylist();

        if (flatList.length === 0) {
            this.handleEmptyPlaylist();
            return;
        }

        let nextIndex = currentFlatIndex + 1;
        if (nextIndex >= flatList.length) {
            this.handleEndOfPlaylist();
            return;
        }

        const nextVideo = flatList[nextIndex];
        console.log(`⏭️ Reproduciendo siguiente: ${nextVideo.title} (índice ${nextIndex})`);

        // Actualizar estado INMEDIATAMENTE antes de cualquier cambio
        currentPlayingInfo = {
            flattenedIndex: nextIndex,
            videoId: nextVideo.videoId,
            playlistId: nextVideo.sourcePlaylistId
        };

        // Actualizar UI inmediatamente
        this.updateNowPlaying();

        // Determinar reproductores
        const currentPlayerInstance = currentPlayer === 1 ? player1 : player2;
        const nextPlayerInstance = currentPlayer === 1 ? player2 : player1;
        const nextPlayerElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);

        try {
            console.log(`🎬 Preparando video en player${currentPlayer === 1 ? 2 : 1}`);
            
            // Preparar siguiente reproductor con Promise para esperar carga
            await new Promise((resolve, reject) => {
                // Timeout de seguridad
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout cargando video'));
                }, 8000); // Aumentado a 8 segundos

                let hasResolved = false;
                
                const resolveOnce = () => {
                    if (!hasResolved) {
                        hasResolved = true;
                        clearTimeout(timeout);
                        resolve();
                    }
                };

                // Listener para cuando el video esté listo
                const onStateChange = (event) => {
                    if (event.target === nextPlayerInstance) {
                        const state = event.data;
                        // Cuando el video esté cued o buffering, está listo para reproducir
                        if (state === YT.PlayerState.CUED || 
                            state === YT.PlayerState.BUFFERING || 
                            state === YT.PlayerState.PLAYING) {
                            nextPlayerInstance.removeEventListener?.('onStateChange', onStateChange);
                            resolveOnce();
                        }
                    }
                };

                // Agregar listener temporal
                if (nextPlayerInstance.addEventListener) {
                    nextPlayerInstance.addEventListener('onStateChange', onStateChange);
                }

                try {
                    // Cargar video
                    nextPlayerInstance.loadVideoById({
                        videoId: nextVideo.videoId,
                        startSeconds: 0
                    });

                    // Mostrar elemento si estaba oculto
                    if (nextPlayerElement) {
                        nextPlayerElement.classList.remove('hidden');
                        nextPlayerElement.style.display = 'block';
                    }

                    // Resolver después de un tiempo mínimo para dar chance de carga
                    setTimeout(resolveOnce, 1500);
                    
                } catch (loadError) {
                    console.error('Error cargando video:', loadError);
                    reject(loadError);
                }
            });

            console.log(`▶️ Video cargado, iniciando crossfade`);
            
            // Configurar volumen inicial del próximo reproductor
            nextPlayerInstance.setVolume(0);
            
            // CAMBIAR currentPlayer ANTES del crossfade
            const previousPlayer = currentPlayer;
            currentPlayer = currentPlayer === 1 ? 2 : 1;
            
            console.log(`🔄 Cambio de reproductor: ${previousPlayer} → ${currentPlayer}`);
            
            // Iniciar crossfade visual y de audio
            this.startCrossfade(currentPlayerInstance, nextPlayerInstance);
            
            // Actualizar UI final después del crossfade
            setTimeout(() => {
                this.updateNowPlaying();
                this.updatePlaylistsUI();
                this.updateQueuePopup(); // Si el popup está abierto
                
                console.log(`✅ Reproducción actualizada: ${currentPlayingInfo.videoId} en player${currentPlayer}`);
            }, 200);
            
            // Reset de bandera de crossfade
            hasOutroCrossfadeStarted = false;

        } catch (error) {
            console.error("❌ Error en playNextVideo:", error);
            this.showMessage(`Error cambiando video: ${error.message}`, 'error');
            
            // En caso de error, intentar reproducción directa como fallback
            try {
                console.log("🔄 Intentando reproducción directa como fallback...");
                
                // Restaurar currentPlayer original para el fallback
                currentPlayer = currentPlayer === 1 ? 2 : 1;
                
                // Reproducción directa sin crossfade
                nextPlayerInstance.loadVideoById(nextVideo.videoId);
                nextPlayerInstance.setVolume(100);
                
                // Detener el reproductor anterior
                currentPlayerInstance.stopVideo();
                
                // Mostrar el nuevo reproductor
                if (nextPlayerElement) {
                    nextPlayerElement.classList.remove('hidden', 'fade-out');
                    nextPlayerElement.classList.add('fade-in');
                }
                
                // Ocultar el reproductor anterior
                const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
                if (prevElement) {
                    prevElement.classList.add('hidden');
                }
                
                // Cambiar currentPlayer para el fallback
                currentPlayer = currentPlayer === 1 ? 2 : 1;
                
            } catch (fallbackError) {
                console.error("❌ Error en fallback:", fallbackError);
                this.showMessage("Error crítico en reproducción", 'error');
                this.handleEmptyPlaylist();
            }
        }
    }

    startCrossfade(prevPlayer, nextPlayer) {
        if (crossfadeInProgress) return;
        
        console.log('🎨 Iniciando crossfade visual y de audio...');
        crossfadeInProgress = true;
        
        // Obtener elementos DOM
        const prevElement = document.getElementById(`player${currentPlayer === 1 ? 2 : 1}`);
        const nextElement = document.getElementById(`player${currentPlayer}`);
        
        console.log('🎨 Elementos:', {
            prev: prevElement ? `player${currentPlayer === 1 ? 2 : 1}` : 'null',
            next: nextElement ? `player${currentPlayer}` : 'null'
        });
        
        // Aplicar efectos visuales INMEDIATAMENTE
        if (prevElement) {
            prevElement.classList.remove('fade-in', 'hidden');
            prevElement.classList.add('fade-out', 'crossfade-exit');
            console.log('🎨 Aplicando fade-out a elemento previo');
        }
        
        if (nextElement) {
            nextElement.classList.remove('hidden', 'fade-out');
            nextElement.classList.add('fade-in', 'crossfade-enter');
            nextElement.style.zIndex = '3';
            console.log('🎨 Aplicando fade-in a elemento siguiente');
        }
        
        // Crossfade de audio
        const duration = CROSSFADE_DURATION * 1000;
        const steps = 60;
        const stepTime = duration / steps;
        let step = 0;
        
        crossfadeInterval = setInterval(() => {
            step++;
            const progress = step / steps;
            
            const prevVolume = Math.max(0, Math.round(100 * (1 - progress)));
            const nextVolume = Math.min(100, Math.round(100 * progress));
            
            try {
                prevPlayer.setVolume(prevVolume);
                nextPlayer.setVolume(nextVolume);
            } catch (e) {
                console.warn("Error durante crossfade de audio:", e);
            }
            
            if (step >= steps) {
                clearInterval(crossfadeInterval);
                crossfadeInterval = null;
                crossfadeInProgress = false;
                
                console.log('🎨 Crossfade completado');
                
                // Limpiar elementos después del crossfade
                setTimeout(() => {
                    try {
                        prevPlayer.stopVideo();
                        if (prevElement) {
                            prevElement.classList.add('hidden');
                            prevElement.classList.remove('fade-out', 'crossfade-exit');
                            prevElement.style.zIndex = '1';
                        }
                        if (nextElement) {
                            nextElement.classList.remove('crossfade-enter');
                        }
                    } catch (e) {
                        console.error('Error limpiando después del crossfade:', e);
                    }
                }, 500);
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
// Asegurar que displaySearchResults tenga scroll infinito:
displaySearchResults(results, append = false) {
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;

    console.log(`📊 displaySearchResults:`, {
        itemsReceived: results?.items?.length || 0,
        append: append,
        hasNextPage: !!results?.nextpage,
        nextPageType: typeof results?.nextpage
    });

    // 1. LIMPIEZA INICIAL Y CONFIGURACIÓN
    if (!append) {
        currentSearchQuery = results.query || currentSearchQuery;
        searchResults.innerHTML = '';
        
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
            this.scrollObserver = null;
        }
    }

    // 2. MANEJO DE RESULTADOS VACÍOS
    if (!results?.items?.length) {
        if (!append) {
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados</p>
                </div>
            `;
        }
        return;
    }

    // 3. ACTUALIZAR NEXTPAGE (PAGINACIÓN)
    if (results.nextpage) {
        nextPageContext = results.nextpage;
        console.log('📄 NextPage actualizado:', {
            type: typeof nextPageContext,
            valid: !!nextPageContext
        });
    } else {
        nextPageContext = null;
        console.log('📄 No hay más páginas');
    }

    // 4. INICIALIZAR GRUPO DE RESULTADOS (GRID)
    let grid = searchResults.querySelector('.search-results-grid');
    if (!grid) {
        grid = this.createSearchGrid();
        searchResults.appendChild(grid);
    }

    // 5. LÓGICA DE FILTRADO (SOLO EN PAGINACIÓN)
    let videoItems = results.items; // Por defecto, usamos todos los items (si append=false)

    if (append) {
        // Solo aplica el filtro si estamos en paginación (append=true)
        videoItems = results.items.filter(video => {
            const videoId = video.videoId || video.url?.split('v=')[1];
            if (!videoId) return false;
            // Solo se mantiene si NO existe una tarjeta con el mismo ID en el grid
            return !grid.querySelector(`[data-video-id="${videoId}"]`);
        });
    }

    console.log(`📊 Videos nuevos: ${videoItems.length} de ${results.items.length}`);

    if (videoItems.length === 0) {
        console.log('🚫 No hay videos nuevos para agregar');
        return;
    }

    // 6. RENDERIZAR Y AÑADIR VIDEOS
    const fragment = document.createDocumentFragment();
    videoItems.forEach(video => {
        const videoId = video.videoId || video.url?.split('v=')[1];
        const card = this.createSearchResultCard(video, videoId);
        fragment.appendChild(card);
    });
    
    grid.appendChild(fragment);

    // 7. CONFIGURAR SCROLL INFINITO
    if (nextPageContext) {
        this.setupImprovedInfiniteScroll(searchResults);
        console.log(`✅ ${videoItems.length} videos agregados - Scroll infinito activo`);
    } else {
        console.log(`✅ ${videoItems.length} videos agregados - Sin más páginas`);
    }
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
        console.log('⚠️ Ya cargando o no hay más páginas');
        return;
    }
    
    const searchResults = document.getElementById('searchResults');
    if (!searchResults) return;
    
    console.log('📜 ⏳ Cargando más resultados...', {
        currentQuery: currentSearchQuery,
        nextPageType: typeof nextPageContext
    });
    
    isLoadingMore = true;
    
    let spinner = searchResults.querySelector('.search-loading-more');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.className = 'search-loading-more';
        spinner.innerHTML = `
            <div class="search-spinner">
                <i class="fas fa-circle-notch fa-spin"></i>
                <span>Cargando más música...</span>
            </div>
        `;
        searchResults.appendChild(spinner);
    }
    
    try {
        // === CORRECCIÓN CLAVE: Preparar el token de continuación ===
        let continuationToken = nextPageContext;
        if (typeof continuationToken === 'string') {
            try {
                // Intenta parsear la cadena JSON a un objeto
                continuationToken = JSON.parse(continuationToken);
                console.log('✅ Token de paginación parseado a objeto.');
            } catch (e) {
                console.warn("⚠️ Error al parsear token, enviando cadena directamente:", e);
            }
        }
        
        // USAR DIRECTAMENTE EL CLIENTE DE PIPED CON EL TOKEN (ahora potencialmente parseado)
        const data = await window.youtubeJSClient.search(currentSearchQuery, continuationToken);
        
        console.log('📜 Respuesta exitosa:', {
            items: data.items?.length || 0,
            hasNextPage: !!data.nextpage,
            error: data.error || 'none'
        });

        if (data.error) {
            throw new Error(data.details || data.error);
        }
        
        // Procesar resultados
        this.displaySearchResults(data, true);
        console.log('✅ Paginación completada exitosamente');
        
    } catch (error) {
        console.error('❌ Error en paginación:', error);
        
        let userMessage = 'Error cargando más resultados';
        if (error.message.includes('Timeout')) {
            userMessage = 'Tiempo de espera agotado';
        } else if (error.message.includes('500') || error.message.includes('400')) {
            userMessage = 'Error del servidor o token inválido';
        } else if (error.message.includes('Token')) {
            userMessage = 'Error de paginación';
        }
        
        this.showMessage(userMessage, 'error');
        
        // Mostrar botón de reintento
        if (spinner) {
            spinner.innerHTML = `
                <div class="search-error-retry">
                    <p>${userMessage}</p>
                    <button onclick="window.unifiedCore.retryLoadMore()" class="retry-btn">
                        <i class="fas fa-redo"></i> Reintentar
                    </button>
                </div>
            `;
        }
        
        // Limpiar token en errores críticos
        if (error.message.includes('Token') || error.message.includes('400')) {
            console.log('🚫 Limpiando token por error crítico o 400');
            nextPageContext = null;
        }
        
    } finally {
        isLoadingMore = false;
        
        setTimeout(() => {
            const existingSpinner = searchResults.querySelector('.search-loading-more');
            if (existingSpinner && !existingSpinner.querySelector('.search-error-retry')) {
                existingSpinner.remove();
            }
        }, 1000);
    }
}
retryLoadMore() {
    console.log('🔄 Reintentando carga de más resultados...');
    const spinner = document.querySelector('.search-loading-more');
    if (spinner) {
        spinner.remove();
    }
    // Pequeño delay antes de reintentar
    setTimeout(() => {
        this.loadMoreSearchResults();
    }, 500);
}
    createSearchGrid() {
        const grid = document.createElement('div');
        grid.className = 'search-results-grid';
        return grid;
    }

 createSearchResultCard(video, videoId) {
    // VALIDACIÓN CRÍTICA: Verificar videoId antes de crear la tarjeta
    if (!videoId || videoId === 'undefined') {
        console.error('❌ createSearchResultCard: videoId inválido:', { videoId, video });
        return document.createElement('div'); // Retornar div vacío en lugar de fallar
    }

    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.dataset.videoId = videoId;

    const duration = video.duration ? this.formatDuration(video.duration) : '';
    const author = video.uploaderName || 'Autor Desconocido';

    // VALIDACIÓN: Verificar datos antes de usar
    const safeTitle = (video.title || 'Título Desconocido').replace(/'/g, "\\'");
    const safeThumbnail = video.thumbnail || './electronic.ico';
    const safeAuthor = author.replace(/'/g, "\\'");

    card.innerHTML = `
        <div class="search-result-thumbnail">
            <img src="${safeThumbnail}" alt="${safeTitle}" loading="lazy" 
                 onerror="this.src='./electronic.ico'">
            ${duration ? `<span class="search-result-duration">${duration}</span>` : ''}
        </div>
        <div class="search-result-info">
            <h3 class="search-result-title">${safeTitle}</h3>
            <p class="search-result-author">${safeAuthor}</p>
            <button class="search-result-add-btn" data-video-id="${videoId}" 
                    data-title="${safeTitle}" data-thumbnail="${safeThumbnail}"
                    data-duration="${video.duration || 0}"
                    data-author="${safeAuthor}">
                <i class="fas fa-plus"></i>
                Añadir a Cola
            </button>
        </div>
    `;

    const addBtn = card.querySelector('.search-result-add-btn');
    addBtn.addEventListener('click', (e) => {
        // VALIDACIÓN FINAL en el evento click
        const btnVideoId = e.target.dataset.videoId;
        if (!btnVideoId || btnVideoId === 'undefined') {
            console.error('❌ Click handler: videoId inválido');
            this.showMessage('Error: Video inválido', 'error');
            return;
        }

        const videoData = {
            videoId: btnVideoId,
            title: e.target.dataset.title,
            thumbnail: e.target.dataset.thumbnail,
            duration: parseInt(e.target.dataset.duration) || 0,
            uploaderName: e.target.dataset.author,
            author: e.target.dataset.author
        };

        // LOG DE DEBUG
        console.log('🎵 Click en añadir video:', {
            videoId: videoData.videoId,
            title: videoData.title.substring(0, 50),
            isValid: !!videoData.videoId && videoData.videoId !== 'undefined'
        });

        this.addVideoToQueue(videoData);
    });
    
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
    // GESTIÓN DE VIDEOS EN COLA
    // =============================================
async addVideoToQueue(videoData) {
    // VALIDACIÓN CRÍTICA: Verificar videoId antes de continuar
    if (!videoData || !videoData.videoId) {
        console.error('❌ addVideoToQueue: videoData o videoId inválido:', videoData);
        this.showMessage('Error: Video inválido', 'error');
        return;
    }

    // VALIDACIÓN ADICIONAL: Verificar que videoId no sea 'undefined'
    if (videoData.videoId === 'undefined' || videoData.videoId === undefined) {
        console.error('❌ addVideoToQueue: videoId es undefined');
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

    // MEJORADO: Obtener duración si no la tiene
    let duration = videoData.duration || 0;
    
    if (!duration && videoData.videoId && window.isAuthorized) {
        try {
            const durations = await this.getBatchVideoDurations([videoData.videoId]);
            duration = durations[videoData.videoId] || 0;
        } catch (error) {
            console.warn('No se pudo obtener duración para', videoData.videoId);
        }
    }

    // VALIDACIÓN FINAL: Verificar datos antes de crear el objeto
    const videoObject = {
        videoId: videoData.videoId, // Ya validado arriba
        title: videoData.title || "Título no disponible",
        thumbnail: videoData.thumbnail || './electronic.ico',
        duration: duration,
        uploaderName: videoData.uploaderName || videoData.author || 'Desconocido',
        author: videoData.author || videoData.uploaderName || 'Desconocido',
        sourcePlaylistId: 'queue'
    };

    // LOG DE DEBUG para verificar datos
    console.log('🎵 Video a añadir:', {
        videoId: videoObject.videoId,
        title: videoObject.title.substring(0, 50),
        hasValidId: !!videoObject.videoId && videoObject.videoId !== 'undefined'
    });

    queuePlaylist.videos.push(videoObject);
    this.showMessage(`Añadido a cola: ${videoObject.title}`, 'success');
    
    this.updatePlaylistsUI();
    this.enablePlayButton();
    
    console.log(`🎵 Video añadido exitosamente. Total: ${queuePlaylist.videos.length} videos`);
    setTimeout(() => saveAllData(), 500);
}
removeVideoFromQueue(videoId) {
    console.log(`🗑️ Eliminando video de cola: ${videoId}`);
    
    const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
    if (!queuePlaylist) {
        console.warn('⚠️ No se encontró playlist de cola');
        return false;
    }
    
    const initialLength = queuePlaylist.videos.length;
    const videoIndex = queuePlaylist.videos.findIndex(v => v.videoId === videoId);
    
    if (videoIndex === -1) {
        console.warn(`⚠️ Video ${videoId} no encontrado en cola`);
        this.showMessage('Video no encontrado en la cola', 'warning');
        return false;
    }
    
    // OBTENER INFO DEL VIDEO ANTES DE ELIMINARLO
    const removedVideo = queuePlaylist.videos[videoIndex];
    const wasCurrentlyPlaying = currentPlayingInfo.videoId === videoId;
    
    // ELIMINAR EL VIDEO
    queuePlaylist.videos.splice(videoIndex, 1);
    
    console.log(`✅ Video eliminado: ${removedVideo.title}`);
    console.log(`📊 Cola: ${initialLength} → ${queuePlaylist.videos.length} videos`);
    
    // AJUSTAR ÍNDICES DESPUÉS DE LA ELIMINACIÓN
    if (currentPlayingInfo.flattenedIndex > videoIndex) {
        currentPlayingInfo.flattenedIndex--;
        console.log(`🔄 Índice ajustado: ${currentPlayingInfo.flattenedIndex}`);
    } else if (wasCurrentlyPlaying) {
        // Si eliminamos el video que se está reproduciendo
        console.log('⏭️ Video en reproducción eliminado, saltando al siguiente');
        
        if (queuePlaylist.videos.length > 0) {
            // Ajustar índice para el siguiente video
            if (currentPlayingInfo.flattenedIndex >= queuePlaylist.videos.length) {
                currentPlayingInfo.flattenedIndex = 0; // Volver al inicio
            }
            
            // Reproducir el siguiente video inmediatamente
            setTimeout(() => {
                const nextVideo = queuePlaylist.videos[currentPlayingInfo.flattenedIndex];
                if (nextVideo) {
                    this.playVideoAtIndex(currentPlayingInfo.flattenedIndex);
                }
            }, 100);
        } else {
            this.handleEmptyPlaylist();
        }
    }
    
    // FORZAR ACTUALIZACIÓN DE UI
    this.updatePlaylistsUI();
    this.updateQueuePopup();
    
    // GUARDAR CAMBIOS
    setTimeout(() => saveAllData(), 100);
    
    this.showMessage(`Eliminado: ${removedVideo.title}`, 'success');
    
    // VERIFICAR SI LA COLA QUEDÓ VACÍA
    if (queuePlaylist.videos.length === 0) {
        console.log('📭 Cola vacía después de eliminación');
        this.handleEmptyPlaylist();
        return true;
    }
    
    return true;
}

    // =============================================
    // UTILIDADES Y HELPERS
    // =============================================
getFlattenedPlaylist() {
    const queuePlaylist = playlistsData.find(p => p.id === 'queue' || p.isQueue);
    
    if (!queuePlaylist) {
        return [];
    }
    
    const flatList = queuePlaylist.videos.map(video => {
        // MEJORADO: Obtener duración correcta
        let duration = 0;
        
        if (video.duration) {
            duration = typeof video.duration === 'number' ? video.duration : this.parseDuration(video.duration);
        } else if (video.contentDetails?.duration) {
            duration = this.parseDuration(video.contentDetails.duration);
        }
        
        return {
            videoId: video.videoId,
            title: video.title || "Título Desconocido",
            thumbnail: video.thumbnail || './electronic.ico',
            duration: duration,
            uploaderName: video.uploaderName || video.author || this.extractArtistFromTitle(video.title),
            author: video.author || video.uploaderName || this.extractArtistFromTitle(video.title),
            sourcePlaylistId: 'queue',
            source: 'queue'
        };
    });
    
    console.log(`📊 Cola de reproducción: ${flatList.length} videos`);
    return flatList;
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
extractArtistFromTitle(title) {
    if (!title) return 'Artista Desconocido';
    
    const patterns = [
        /^([^-]+)\s*-\s*(.+)$/,
        /^([^:]+)\s*:\s*(.+)$/,
        /^([^|]+)\s*\|\s*(.+)$/,
        /^([^•]+)\s*•\s*(.+)$/
    ];
    
    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    // Si no encuentra patrón, extraer primera palabra/palabras
    const words = title.split(' ');
    if (words.length > 1) {
        return words.slice(0, 2).join(' '); // Primeras dos palabras
    }
    
    return 'YT CrossMix';
}
    // =============================================
    // MONITOREO Y ESTADO
    // =============================================
    startMonitoring() {
        if (!monitorInterval) {
            monitorInterval = setInterval(() => {
                monitorPlayers();
                
                // SPONSORBLOCK integrado aquí
                const activePlayer = (currentPlayer === 1) ? player1 : player2;
                if (activePlayer && reproduccionIniciada) {
                    checkAndSkipSegment(activePlayer);
                }
            }, 300);
            console.log('📊 Monitoreo iniciado (intervalo: 300ms)');
        }
    }

    stopMonitoring() {
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
            console.log('📊 Monitoreo detenido');
        }
    }

updateCurrentPlayingIndex() {
    const flatList = this.getFlattenedPlaylist();
    let playingVideoId = null;
    let activePlayerNum = null;

    // NO ACTUALIZAR SI HAY UNA TRANSICIÓN EN PROGRESO
    if (crossfadeInProgress || isTransitioning) {
        console.log('🔒 Evitando actualización durante transición');
        return;
    }

    try {
        // Verificar cuál reproductor está activo
        if (player1 && player1.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player1.getVideoData()?.video_id;
            activePlayerNum = 1;
        } else if (player2 && player2.getPlayerState() === YT.PlayerState.PLAYING) {
            playingVideoId = player2.getVideoData()?.video_id;
            activePlayerNum = 2;
        }
        
        if (!playingVideoId) return;
        
        // VALIDAR QUE EL VIDEO COINCIDA CON EL ESPERADO
        if (currentPlayingInfo.videoId && currentPlayingInfo.videoId !== playingVideoId) {
            console.log(`⚠️ Mismatch detectado: esperado ${currentPlayingInfo.videoId}, actual ${playingVideoId}`);
            // NO actualizar si hay discrepancia durante crossfade
            return;
        }
        
        console.log(`🔄 Video activo validado: ${playingVideoId} en player${activePlayerNum}`);
        
        // Buscar el índice correcto SOLO SI NO LO TENEMOS
        if (currentPlayingInfo.videoId !== playingVideoId) {
            const newIndex = flatList.findIndex(v => v.videoId === playingVideoId);
            
            if (newIndex !== -1) {
                const videoObj = flatList[newIndex];
                currentPlayingInfo = {
                    videoId: playingVideoId,
                    playlistId: videoObj.sourcePlaylistId,
                    flattenedIndex: newIndex
                };
                
                currentPlayer = activePlayerNum;
                
                console.log(`📍 Índice actualizado: ${newIndex} (${playingVideoId}) en player${currentPlayer}`);
                this.updateNowPlaying();
                this.updatePlaylistsUI();
            }
        }
    } catch (e) {
        console.error("Error obteniendo datos de reproducción:", e);
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
        if (index < 0 || index >= flatList.length) return;

        const video = flatList[index];
        console.log(`🎵 Reproduciendo video en índice ${index}: ${video.title}`);

        currentPlayingInfo = {
            flattenedIndex: index,
            videoId: video.videoId,
            playlistId: video.sourcePlaylistId
        };

        try {
            const activePlayer = currentPlayer === 1 ? player1 : player2;
            activePlayer.loadVideoById(video.videoId);
            
            reproduccionIniciada = true;
            this.updatePlayButton('pause');
            this.startMonitoring();
            this.updateNowPlaying();
            this.updatePlaylistsUI();
            
        } catch (error) {
            console.error("Error reproduciendo video:", error);
            this.showMessage("Error al reproducir video", 'error');
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
 * Obtener segmentos SponsorBlock - CORREGIDO
 */
function obtenerSegmentosSponsorBlock(videoId) {
    if (segmentosCache[videoId] === 'fetching') return;
    
    segmentosCache[videoId] = 'fetching';
    console.log(`🔍 Obteniendo segmentos SponsorBlock para: ${videoId}`);

    fetch(`/api/segments/${videoId}`, {
        headers: { 'X-UserID': 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd' }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    })
    .then(segments => {
        // VALIDACIÓN CRÍTICA: Asegurar que segments es un array válido
        if (Array.isArray(segments)) {
            segmentosCache[videoId] = segments;
            console.log(`✅ ${segments.length} segmentos SponsorBlock para ${videoId}`);
        } else {
            console.warn(`⚠️ Respuesta inválida para ${videoId}:`, segments);
            segmentosCache[videoId] = [];
        }
    })
    .catch(error => {
        console.error("❌ Error obteniendo segmentos SponsorBlock:", error);
        segmentosCache[videoId] = [];
    });
}

/**
 * Verificar y saltar segmentos - COMPLETAMENTE CORREGIDO
 */
function checkAndSkipSegment(player) {
    try {
        const currentTime = player.getCurrentTime();
        const videoId = player.getVideoData()?.video_id;

        if (!videoId || isNaN(currentTime) || currentTime < 0) return;

        // CRITICAL: Evitar loop infinito - verificar si ya saltamos este segmento recientemente
        const skipKey = `${videoId}_${Math.floor(currentTime)}`;
        const now = Date.now();
        
        // Si saltamos este mismo segundo en los últimos 2 segundos, no saltar de nuevo
        if (lastSeekVideoId === videoId && Math.abs(currentTime - lastSeekEndTime) < 3) {
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

        // Buscar segmento a saltar - SOLO music_offtopic para música
        const segmentToSkip = segments.find(segment => {
            if (!segment || typeof segment !== 'object') return false;
            
            // FILTRAR: Solo saltar intros/outros muy largos, no música
            if (segment.category === 'music_offtopic') {
                const start = segment.startTime || segment.segment?.[0] || 0;
                const end = segment.endTime || segment.segment?.[1] || 0;
                
                // Solo saltar si es intro/outro muy largo (más de 10 segundos)
                if ((end - start) < 10) return false;
                
                return currentTime >= start && currentTime < end;
            }
            
            return false; // No saltar otros tipos de segmentos en música
        });

        if (segmentToSkip) {
            const skipToTime = segmentToSkip.endTime || segmentToSkip.segment?.[1];
            
            if (skipToTime && typeof skipToTime === 'number' && skipToTime > currentTime) {
                console.log(`⏭️ SponsorBlock: Saltando intro/outro de ${currentTime.toFixed(1)}s a ${skipToTime.toFixed(1)}s`);
                
                // Guardar información del salto para evitar loops
                lastSeekVideoId = videoId;
                lastSeekEndTime = skipToTime;
                
                try {
                    player.seekTo(skipToTime, true);
                    
                    if (window.unifiedCore) {
                        window.unifiedCore.showMessage(`Saltado intro/outro`, 'info', 2000);
                    }
                } catch (seekError) {
                    console.error("❌ Error saltando segmento:", seekError);
                }
            }
        }
        
    } catch (error) {
        console.error("❌ Error general en checkAndSkipSegment:", error);
    }
}

/**
 * Monitorear reproductores - MEJORADO
 */
function monitorPlayers() {
    if (!playersInitialized || !reproduccionIniciada) return;

    try {
        const activePlayer = (currentPlayer === 1) ? player1 : player2;
        if (!activePlayer?.getPlayerState) return;

        const playerState = activePlayer.getPlayerState();
        const currentTime = activePlayer.getCurrentTime();
        const videoDuration = activePlayer.getDuration();
        const videoId = activePlayer.getVideoData()?.video_id;

        // SponsorBlock integrado aquí
        if (videoId && playerState === YT.PlayerState.PLAYING && 
            currentTime > 0 && !isNaN(currentTime)) {
            checkAndSkipSegment(activePlayer);
        }

        // Lógica de crossfade - MEJORADA
        if (playerState === YT.PlayerState.PLAYING && videoDuration > 0 && currentTime > 0) {
            const timeRemaining = videoDuration - currentTime;
            
            // Iniciar crossfade cuando queden exactamente 10 segundos
            if (timeRemaining <= CROSSFADE_DURATION && 
                timeRemaining > (CROSSFADE_DURATION - 1) && 
                !hasOutroCrossfadeStarted && 
                !crossfadeInProgress) {
                
                console.log(`⏰ Iniciando crossfade: ${timeRemaining.toFixed(1)}s restantes`);
                hasOutroCrossfadeStarted = true;
                
                if (window.unifiedCore) {
                    window.unifiedCore.playNextVideo();
                }
            }
        }
        
    } catch (error) {
        console.error("❌ Error en monitorPlayers:", error);
    }
}
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
// Función de debug para verificar estado de playlists
window.debugPlaylistsDOM = function() {
    console.log("🐛 === DEBUG PLAYLISTS DOM ===");
    
    const container = document.getElementById('playlistsGrid');
    const playlistManager = window.playlistManager;
    const unifiedCore = window.unifiedCore;
    
    console.log("📊 Estado actual:", {
        container: !!container,
        containerHTML: container ? container.innerHTML.substring(0, 100) + "..." : "No encontrado",
        renderedCards: container ? container.querySelectorAll('.playlist-card').length : 0,
        playlistManagerExists: !!playlistManager,
        playlistsData: playlistManager ? playlistManager.playlistsData.length : 0,
        unifiedCoreExists: !!unifiedCore,
        corePlaylistsData: unifiedCore ? unifiedCore.playlistsData?.length : 0,
        currentView: unifiedCore ? unifiedCore.currentView : 'unknown'
    });
    
    if (playlistManager && playlistManager.playlistsData.length > 0) {
        console.log("📋 Playlists en memoria:");
        playlistManager.playlistsData.forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.name} (${p.source || 'unknown'}) - ${p.videos.length} videos`);
        });
    }
    
    // FORZAR ACTUALIZACIÓN SI HAY PROBLEMAS
    if (container && playlistManager && playlistManager.playlistsData.length > 0 && 
        container.querySelectorAll('.playlist-card').length === 0) {
        console.log("🔧 Detectado problema, forzando actualización...");
        playlistManager.forceRecreatePlaylistsUI();
    }
};
