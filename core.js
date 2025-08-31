 // ===== YT CROSSMIX - SISTEMA UNIFICADO COMPLETO =====
// Archivo único que contiene todo el sistema: configuración, estados, managers y inicialización

console.log('🚀 YT CrossMix - Sistema Unificado Completo Iniciando...');

// ===== 1. CONFIGURACIÓN GLOBAL =====
const CONFIG = {
    CROSSFADE_DURATION: 15, // Duración del crossfade en segundos
    YOUTUBE_LIBRARY_SOURCE_ID: 'youtube_library',
    PIPED_INSTANCES: [
        "https://api.piped.private.coffee",
        "https://pipedapi.ducks.party"
    ],
    DEBUG_MODE: window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1'),
    MAX_CONCURRENT_MESSAGES: 3,
    MODULE_LOAD_ORDER: [
        'messages',
        'ui', 
        'auth',
        'playlistManager',
        'searchManager', 
        'playbackController',
        'sponsorblock',
        'utils'
    ],
    // ✅ NUEVO: Configuración para manejo de errores de módulos
    FALLBACK_ENABLED: true,
    CRITICAL_MODULES: ['ui', 'messages'],
    OPTIONAL_MODULES: ['sponsorblock', 'utils']
};

// ===== 2. SISTEMA DE ESTADOS UNIFICADO =====
class UnifiedStateManager {
    constructor() {
        this.state = {
            app: {
                player1: null,
                player2: null,
                currentPlayer: 1,
                playersInitialized: false,
                youtubeAPIReady: false,
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInterval: null,
                crossfadeInProgress: false,
                reproduccionIniciada: false,
                monitorInterval: null
            },
            ui: {
                currentView: 'home',
                isDesktop: window.innerWidth >= 1024,
                isPlaying: false,
                currentTrack: null,
                expandedPlaylists: new Set(),
                activeModals: new Set()
            },
            playlist: {
                playlistsData: [],
                currentPlayingInfo: {
                    playlistId: null,
                    videoId: null,
                    flattenedIndex: -1
                }
            },
            search: {
                isLoadingMore: false,
                nextPageContext: null,
                currentSearchQuery: '',
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
                token: null,
                userInfo: null
            },
            // ✅ NUEVO: Estado para módulos
            modules: {
                loaded: new Set(),
                failed: new Set(),
                loadedWithFallback: new Set()
            }
        };
        
        this.subscribers = new Map();
        this.setupGlobalReferences();
    }
    
    setupGlobalReferences() {
        // Referencias globales únicas
        window.State = this.state;
        window.unifiedStateManager = this;
        
        console.log('📊 Estado unificado configurado');
    }
    
    get(path) {
        const parts = path.split('.');
        let current = this.state;
        for (const part of parts) {
            if (current[part] === undefined) {
                console.warn(`⚠️ Estado no encontrado: ${path}`);
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    
    set(path, value) {
        const parts = path.split('.');
        const lastPart = parts.pop();
        let current = this.state;
        
        for (const part of parts) {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
        
        const oldValue = current[lastPart];
        current[lastPart] = value;
        
        this.notifySubscribers(path, value, oldValue);
        return value;
    }
    
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, new Set());
        }
        this.subscribers.get(path).add(callback);
        
        return () => this.subscribers.get(path)?.delete(callback);
    }
    
    notifySubscribers(path, newValue, oldValue) {
        const pathSubscribers = this.subscribers.get(path);
        if (pathSubscribers) {
            pathSubscribers.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error('State subscriber error:', error);
                }
            });
        }
        
        // Notificar evento global
        window.dispatchEvent(new CustomEvent('ytcrossmix:state:changed', {
            detail: { path, newValue, oldValue }
        }));
    }
    
    reset() {
        console.log('🔄 Reseteando estados...');
        
        // Reset app state
        Object.assign(this.state.app, {
            currentPlayer: 1,
            monitorInterval: null,
            isTransitioning: false,
            isAudioFading: false,
            hasOutroCrossfadeStarted: false,
            crossfadeInterval: null,
            crossfadeInProgress: false,
            reproduccionIniciada: false
        });
        
        // Reset otros estados
        this.state.playlist.currentPlayingInfo = {
            playlistId: null,
            videoId: null,
            flattenedIndex: -1
        };
        
        this.state.search = {
            isLoadingMore: false,
            nextPageContext: null,
            currentSearchQuery: '',
            resultsContainer: null,
            resultsDiv: null
        };
        
        this.state.sponsorBlock = {
            segmentosCache: {},
            lastSeekEndTime: -1,
            lastSeekVideoId: null
        };
        
        this.state.ui = {
            currentView: 'home',
            isDesktop: window.innerWidth >= 1024,
            isPlaying: false,
            currentTrack: null,
            expandedPlaylists: new Set(),
            activeModals: new Set()
        };
        
        console.log('✅ Estados reseteados');
    }
    
    debug() {
        console.log('=== STATE MANAGER DEBUG ===');
        console.log('App State:', this.state.app);
        console.log('Playlist State:', this.state.playlist);
        console.log('Search State:', this.state.search);
        console.log('SponsorBlock State:', this.state.sponsorBlock);
        console.log('UI State:', this.state.ui);
        console.log('Auth State:', this.state.auth);
        console.log('Modules State:', this.state.modules);
        console.log('Subscribers:', Array.from(this.subscribers.keys()));
        console.log('===========================');
    }
}

// ===== 3. LOADING MANAGER UNIFICADO =====
class UnifiedLoadingManager {
    constructor() {
        this.spinners = new Map();
    }
    
    show(id = 'global', options = {}) {
        const {
            type = 'overlay',
            container = document.body,
            size = 'normal',
            message = null
        } = options;
        
        if (this.spinners.has(id)) {
            return this.spinners.get(id);
        }
        
        const spinner = this.createSpinner(id, type, container, size, message);
        this.spinners.set(id, spinner);
        
        console.log(`✨ Loading mostrado: ${id} (${type})`);
        return spinner;
    }
    
    hide(id = 'global') {
        const spinner = this.spinners.get(id);
        if (spinner) {
            spinner.classList.add('hidden');
            setTimeout(() => {
                if (spinner.parentNode) {
                    spinner.remove();
                }
                this.spinners.delete(id);
            }, 300);
            console.log(`✨ Loading ocultado: ${id}`);
        }
    }
    
    hideAll() {
        this.spinners.forEach((spinner, id) => {
            this.hide(id);
        });
    }
    
    createSpinner(id, type, container, size, message) {
        const spinner = document.createElement('div');
        spinner.id = `loading-${id}`;
        spinner.className = this.getSpinnerClasses(type, size);
        
        const spinnerContent = this.getSpinnerContent(size, message);
        spinner.innerHTML = spinnerContent;
        
        if (type === 'overlay') {
            Object.assign(spinner.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                zIndex: '2000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backdropFilter: 'blur(10px)'
            });
        } else if (type === 'inline') {
            Object.assign(spinner.style, {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '20px'
            });
        }
        
        container.appendChild(spinner);
        return spinner;
    }
    
    getSpinnerClasses(type, size) {
        const classes = ['unified-spinner'];
        classes.push(`spinner-${type}`);
        classes.push(`spinner-${size}`);
        return classes.join(' ');
    }
    
    getSpinnerContent(size, message) {
        const spinnerSize = {
            small: '24px',
            normal: '40px',
            large: '60px'
        }[size] || '40px';
        
        return `
            <div class="spinner-animation" style="
                width: ${spinnerSize};
                height: ${spinnerSize};
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                border-top: 3px solid var(--accent-color, #ff6b35);
                animation: spin 1s linear infinite;
            "></div>
            ${message ? `<p style="margin-top: 16px; color: white; font-size: 14px;">${message}</p>` : ''}
        `;
    }
}

// ===== 4. MESSAGE MANAGER UNIFICADO =====
class UnifiedMessageManager {
    constructor() {
        this.activeMessages = new Set();
        this.messageQueue = [];
        this.maxConcurrent = CONFIG.MAX_CONCURRENT_MESSAGES;
    }
    
    show(message, type = 'info', duration = 3000, options = {}) {
        if (!message) return;
        
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const messageData = {
            id: messageId,
            text: message,
            type,
            duration,
            timestamp: Date.now(),
            ...options
        };
        
        if (this.activeMessages.size >= this.maxConcurrent) {
            this.messageQueue.push(messageData);
            return;
        }
        
        this.displayMessage(messageData);
    }
    
    displayMessage(messageData) {
        const { id, text, type, duration } = messageData;
        
        console.log(`💬 Mensaje unificado [${type}]:`, text);
        
        const messageEl = document.createElement('div');
        messageEl.id = id;
        messageEl.textContent = text;
        messageEl.className = 'unified-message';
        
        this.applyMessageStyles(messageEl, type);
        this.positionMessage(messageEl);
        
        document.body.appendChild(messageEl);
        this.activeMessages.add(id);
        
        // Animación entrada
        requestAnimationFrame(() => {
            messageEl.style.opacity = '1';
            messageEl.style.transform = 'translateX(-50%) translateY(0) scale(1)';
        });
        
        // Auto-remove
        setTimeout(() => {
            this.hideMessage(id);
        }, duration);
        
        // Click to dismiss
        messageEl.addEventListener('click', () => {
            this.hideMessage(id);
        });
    }
    
    applyMessageStyles(element, type) {
        const colors = {
            info: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
            success: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))',
            error: 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))',
            warning: 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(245, 124, 0, 0.9))'
        };
        
        Object.assign(element.style, {
            position: 'fixed',
            left: '50%',
            zIndex: '10001',
            background: colors[type] || colors.info,
            color: 'white',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '500',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            opacity: '0',
            transform: 'translateX(-50%) translateY(100px) scale(0.8)',
            transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            cursor: 'pointer'
        });
    }
    
    positionMessage(element) {
        const isMobile = window.innerWidth <= 768;
        const baseBottom = isMobile ? 
            'calc(64px + 80px + env(safe-area-inset-bottom, 0px) + 20px)' : 
            '120px';
        
        const offset = this.activeMessages.size * 60;
        element.style.bottom = `calc(${baseBottom} + ${offset}px)`;
    }
    
    hideMessage(id) {
        const messageEl = document.getElementById(id);
        if (!messageEl) return;
        
        messageEl.style.opacity = '0';
        messageEl.style.transform = 'translateX(-50%) translateY(-20px) scale(0.9)';
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.remove();
            }
            this.activeMessages.delete(id);
            
            // Procesar cola
            if (this.messageQueue.length > 0) {
                const nextMessage = this.messageQueue.shift();
                this.displayMessage(nextMessage);
            }
        }, 400);
    }
    
    clear() {
        this.activeMessages.forEach(id => {
            this.hideMessage(id);
        });
        this.messageQueue = [];
    }
}

// ===== 5. YOUTUBE API MANAGER UNIFICADO =====
class UnifiedYouTubeManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.apiReady = false;
        this.playersReady = false;
        this.initPromise = null;
    }
    
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this.loadAPI();
        return this.initPromise;
    }
    
    async loadAPI() {
        console.log('🎥 Cargando YouTube API (unificado)...');
        
        if (window.YT?.Player) {
            console.log('YT ya disponible');
            this.apiReady = true;
            this.createPlayers();
            return;
        }
        
        return new Promise((resolve, reject) => {
            window.onYouTubeIframeAPIReady = () => {
                console.log('📺 YouTube API lista');
                this.apiReady = true;
                this.createPlayers();
                resolve();
            };
            
            if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }
    
    createPlayers() {
        if (this.playersReady) return;
        
        console.log('🎬 Creando reproductores...');
        
        const player1El = document.getElementById('player1');
        const player2El = document.getElementById('player2');
        
        if (!player1El || !player2El) {
            console.error('❌ Elementos player no encontrados');
            return;
        }
        
        const playerConfig = {
            height: '315',
            width: '560',
            playerVars: {
                'playsinline': 1,
                'controls': 1,
                'modestbranding': 1,
                'rel': 0,
                'showinfo': 0,
                'enablejsapi': 1,
                'origin': window.location.origin,
                'autoplay': 0,
                'mute': 0
            }
        };
        
        try {
            const player1 = new YT.Player('player1', {
                ...playerConfig,
                events: {
                    'onReady': (e) => this.onPlayerReady(e, 1),
                    'onStateChange': (e) => this.onPlayerStateChange(e, 1),
                    'onError': (e) => this.onPlayerError(e, 1)
                }
            });
            
            const player2 = new YT.Player('player2', {
                ...playerConfig,
                events: {
                    'onReady': (e) => this.onPlayerReady(e, 2),
                    'onStateChange': (e) => this.onPlayerStateChange(e, 2),
                    'onError': (e) => this.onPlayerError(e, 2)
                }
            });
            
            this.stateManager.set('app.player1', player1);
            this.stateManager.set('app.player2', player2);
            
            console.log('✅ Reproductores creados exitosamente');
            
        } catch (error) {
            console.error('💥 Error creando reproductores:', error);
            throw error;
        }
    }
    
    onPlayerReady(event, playerNum) {
        console.log(`✅ Player ${playerNum} listo`);
        
        const player1 = this.stateManager.get('app.player1');
        const player2 = this.stateManager.get('app.player2');
        
        if (player1 && player2 && 
            typeof player1.getPlayerState === 'function' &&
            typeof player2.getPlayerState === 'function') {
            
            if (!this.playersReady) {
                this.playersReady = true;
                this.stateManager.set('app.playersInitialized', true);
                
                console.log('🎉 Ambos reproductores listos');
                
                this.enableControls();
                
                window.dispatchEvent(new CustomEvent('playersReady', {
                    detail: { unified: true }
                }));
            }
        }
    }
    
    onPlayerStateChange(event, playerNum) {
        const playerState = event.data;
        const videoId = event.target.getVideoData()?.video_id;
        
        console.log(`🎵 Player ${playerNum} estado: ${this.getStateString(playerState)}`);
        
        this.stateManager.set(`app.player${playerNum}State`, playerState);
        
        window.dispatchEvent(new CustomEvent('unifiedPlayerStateChanged', {
            detail: { 
                playerNum, 
                state: playerState, 
                videoId,
                timestamp: Date.now()
            }
        }));
    }
    
    onPlayerError(event, playerNum) {
        const errorCode = event.data;
        console.error(`❌ Error Player ${playerNum}:`, errorCode);
        
        const errorMessages = {
            2: 'ID de video inválido',
            5: 'Error HTML5 o derechos de autor',
            100: 'Video no encontrado',
            101: 'Reproducción incrustada no permitida',
            150: 'Reproducción incrustada no permitida'
        };
        
        const message = errorMessages[errorCode] || `Error desconocido (${errorCode})`;
        
        window.unifiedMessageManager?.show(`Player ${playerNum}: ${message}`, 'error');
        
        if ([100, 101, 150].includes(errorCode)) {
            setTimeout(() => this.skipToNext(), 1000);
        }
    }
    
    enableControls() {
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        
        if (playButton) playButton.disabled = false;
        if (nextButton) nextButton.disabled = false;
        
        console.log('✅ Controles habilitados');
    }
    
    skipToNext() {
        console.log('⏭️ Skip solicitado');
        // Implementar skip logic aquí
    }
    
    getStateString(state) {
        const states = {
            [-1]: 'UNSTARTED',
            [0]: 'ENDED',
            [1]: 'PLAYING',
            [2]: 'PAUSED',
            [3]: 'BUFFERING',
            [5]: 'CUED'
        };
        return states[state] || 'UNKNOWN';
    }
}

// ===== 6. CARGADOR DE MÓDULOS MEJORADO =====
class UnifiedModuleLoader {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.modules = new Map();
        this.loadOrder = CONFIG.MODULE_LOAD_ORDER;
        this.loaded = new Set();
        this.errors = new Map();
        this.fallbacks = new Map();
    }
    
    async loadAll() {
        console.log('📦 Cargando módulos...');
        const startTime = Date.now();
        
        for (const moduleName of this.loadOrder) {
            await this.loadModule(moduleName);
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`✅ Módulos cargados en ${totalTime}ms`);
        
        return this.getLoadResults();
    }
    
    async loadModule(moduleName) {
        if (this.loaded.has(moduleName)) {
            console.log(`⚠️ Módulo ${moduleName} ya cargado`);
            return;
        }
        
        console.log(`🔄 Cargando módulo: ${moduleName}`);
        
        try {
            let module;
            
            // ✅ MEJORADO: Try-catch individual para cada módulo
            try {
                module = await this.importModule(moduleName);
            } catch (importError) {
                console.warn(`⚠️ Error importando ${moduleName}:`, importError.message);
                
                // ✅ NUEVO: Intentar fallback si está disponible
                if (CONFIG.FALLBACK_ENABLED && this.hasFallback(moduleName)) {
                    console.log(`🔄 Intentando fallback para ${moduleName}...`);
                    module = await this.loadFallback(moduleName);
                    this.stateManager.set(`modules.loadedWithFallback`, 
                        new Set([...this.stateManager.get('modules.loadedWithFallback'), moduleName])
                    );
                } else {
                    throw importError;
                }
            }
            
            this.modules.set(moduleName, module);
            this.loaded.add(moduleName);
            this.stateManager.set('modules.loaded', this.loaded);
            
            console.log(`✅ Módulo ${moduleName} cargado`);
            
            await this.setupModule(moduleName, module);
            
        } catch (error) {
            console.error(`💥 Error cargando módulo ${moduleName}:`, error);
            this.errors.set(moduleName, error);
            this.stateManager.set('modules.failed', 
                new Set([...this.stateManager.get('modules.failed'), moduleName])
            );
            
            // ✅ MEJORADO: Solo fallar si es módulo crítico Y no tiene fallback
            if (this.isCriticalModule(moduleName) && !this.hasFallback(moduleName)) {
                throw new Error(`Módulo crítico ${moduleName} falló: ${error.message}`);
            } else {
                console.warn(`⚠️ Módulo no crítico ${moduleName} falló, continuando...`);
                // Registrar módulo como fallido pero continuar
                this.stateManager.set('modules.failed', 
                    new Set([...this.stateManager.get('modules.failed'), moduleName])
                );
            }
        }
    }
    
    // ✅ NUEVO: Importación de módulos con mejor manejo de errores
    async importModule(moduleName) {
        const moduleMap = {
            'messages': './messages.js',
            'ui': './ui.js',
            'auth': './auth.js',
            'playlistManager': './playlistManager.js',
            'searchManager': './searchManager.js',
            'playbackController': './playbackController.js',
            'sponsorblock': './sponsorblock.js',
            'utils': './utils.js'
        };
        
        const modulePath = moduleMap[moduleName];
        if (!modulePath) {
            throw new Error(`Ruta no encontrada para módulo: ${moduleName}`);
        }
        
        return await import(modulePath);
    }
    
    // ✅ NUEVO: Sistema de fallbacks
    hasFallback(moduleName) {
        const fallbackMap = {
            'ui': true,
            'messages': true,
            'searchManager': true,
            'sponsorblock': false,
            'utils': false
        };
        
        return fallbackMap[moduleName] || false;
    }
    
    async loadFallback(moduleName) {
        console.log(`🆘 Cargando fallback para ${moduleName}...`);
        
        switch (moduleName) {
            case 'ui':
                return await this.createUIFallback();
            case 'messages':
                return await this.createMessagesFallback();
            case 'searchManager':
                return await this.createSearchFallback();
            default:
                throw new Error(`Fallback no disponible para ${moduleName}`);
        }
    }
    
    // ✅ NUEVO: Fallbacks implementados
    async createUIFallback() {
        console.log('🆘 Creando UIManager fallback...');
        
        const UIManagerFallback = {
            initialize: async () => {
                console.log('🎨 UIManager fallback inicializado');
            },
            
            switchView: (view) => {
                console.log(`🔄 Switching to view: ${view} (fallback)`);
                
                // Basic view switching
                const views = document.querySelectorAll('.content-view');
                views.forEach(v => v.classList.remove('active'));
                
                const targetView = document.getElementById(`${view}View`);
                if (targetView) {
                    targetView.classList.add('active');
                }
                
                // Update navigation
                const navItems = document.querySelectorAll('.nav-item, .nav-tab');
                navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.view === view);
                });
                
                if (this.stateManager) {
                    this.stateManager.set('ui.currentView', view);
                }
            },
            
            updatePlaylistsUI: () => {
                console.log('🔄 Updating playlists UI (fallback)');
                // Basic playlist update
            },
            
            toggleQueue: () => {
                console.log('📋 Toggle queue (fallback)');
                const queueSection = document.getElementById('queueSection');
                if (queueSection) {
                    queueSection.classList.toggle('hidden');
                }
            },
            
            hideQueue: () => {
                console.log('📋 Hide queue (fallback)');
                const queueSection = document.getElementById('queueSection');
                if (queueSection) {
                    queueSection.classList.add('hidden');
                }
            },
            
            updateMiniPlayer: (data) => {
                console.log('📱 Update mini player (fallback):', data?.title);
            },
            
            updateQueueContent: () => {
                console.log('📋 Update queue content (fallback)');
            }
        };
        
        // Hacer disponible globalmente
        window.UIManager = UIManagerFallback;
        
        return { UIManager: UIManagerFallback };
    }
    
    async createMessagesFallback() {
        console.log('🆘 Creando Messages fallback...');
        
        // El UnifiedMessageManager ya maneja esto
        return {};
    }
    
    async createSearchFallback() {
        console.log('🆘 Creando SearchManager fallback...');
        
        const SearchManagerFallback = {
            initialize: () => {
                console.log('🔍 SearchManager fallback inicializado');
            },
            
            performSearch: async (query) => {
                console.log(`🔍 Búsqueda fallback: "${query}"`);
                
                const searchResults = document.getElementById('searchResults');
                if (searchResults) {
                    searchResults.innerHTML = `
                        <div class="search-placeholder">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Búsqueda no disponible</p>
                            <p><small>El módulo de búsqueda no se pudo cargar</small></p>
                            <button onclick="location.reload()" style="
                                background: #ff6b35; color: white; border: none;
                                padding: 8px 16px; border-radius: 4px; cursor: pointer;
                                margin-top: 10px;
                            ">Recargar Página</button>
                        </div>
                    `;
                }
                
                window.unifiedMessageManager?.show('Función de búsqueda no disponible', 'error');
            }
        };
        
        window.SearchManager = SearchManagerFallback;
        
        return { SearchManager: SearchManagerFallback };
    }
    
    async setupModule(moduleName, module) {
        console.log(`🔧 Configurando módulo: ${moduleName}`);
        
        try {
            switch (moduleName) {
                case 'ui':
                    if (module.UIManager && typeof module.UIManager.initialize === 'function') {
                        try {
                            await module.UIManager.initialize();
                            this.setupSearchEventListeners();
                            this.setupPlaylistUrlButton();
                            console.log(`🎨 UIManager inicializado`);
                        } catch (error) {
                            console.error('Error inicializando UIManager:', error);
                            // Si falla la inicialización, usar fallback
                            if (CONFIG.FALLBACK_ENABLED) {
                                console.log('🆘 Usando fallback para UIManager...');
                                await this.loadFallback('ui');
                            }
                        }
                    }
                    break;
                    
                case 'searchManager':
                    if (module.SearchManager && typeof module.SearchManager.initialize === 'function') {
                        try {
                            module.SearchManager.initialize();
                            
                            // ✅ CRÍTICO: Hacer SearchManager disponible globalmente
                            window.SearchManager = module.SearchManager;
                            
                            const searchResults = document.getElementById('searchResults');
                            if (!searchResults) {
                                console.error('❌ #searchResults no encontrado');
                                this.createSearchResultsContainer();
                            }
                            
                            console.log(`🔍 SearchManager inicializado y disponible globalmente`);
                        } catch (error) {
                            console.error('Error inicializando SearchManager:', error);
                            if (CONFIG.FALLBACK_ENABLED) {
                                await this.loadFallback('searchManager');
                            }
                        }
                    }
                    break;
                    
                case 'auth':
                    if (module.authManager || module.GoogleAuthManager) {
                        try {
                            await this.loadGoogleAPIs();
                            
                            const authManager = module.authManager || new module.GoogleAuthManager();
                            
                            if (typeof authManager.initialize === 'function') {
                                await authManager.initialize();
                            }
                            
                            this.setupAuthButtons(authManager);
                            
                            // Hacer disponible globalmente
                            window.authManager = authManager;
                            
                            console.log(`🔐 AuthManager inicializado`);
                        } catch (error) {
                            console.error('Error inicializando AuthManager:', error);
                            // Auth no es crítico, continuar sin él
                            window.unifiedMessageManager?.show('Sistema de autenticación no disponible', 'warning');
                        }
                    }
                    break;
                    
                case 'playlistManager':
                    if (module.PlaylistManager) {
                        // ✅ CRÍTICO: Hacer PlaylistManager disponible globalmente
                        window.PlaylistManager = module.PlaylistManager;
                        
                        // Inicializar cola vacía
                        if (typeof module.PlaylistManager.initializeManualPlaylist === 'function') {
                            module.PlaylistManager.initializeManualPlaylist();
                            console.log(`📋 Cola de reproducción inicializada`);
                        }
                        
                        console.log(`📚 PlaylistManager disponible globalmente`);
                    }
                    break;
                    
                case 'playbackController':
                    if (module.PlaybackController) {
                        // ✅ CRÍTICO: Hacer PlaybackController disponible globalmente
                        window.PlaybackController = module.PlaybackController;
                        console.log(`🎮 PlaybackController disponible globalmente`);
                    } else {
                        console.error('❌ PlaybackController no se importó correctamente');
                    }
                    break;
                    
                case 'sponsorblock':
                    if (module.SponsorBlockManager) {
                        window.SponsorBlockManager = module.SponsorBlockManager;
                        console.log(`🚫 SponsorBlockManager disponible globalmente`);
                    }
                    break;
                    
                case 'messages':
                    // Messages ya está manejado por UnifiedMessageManager
                    console.log(`💬 Messages module procesado`);
                    break;
                    
                case 'utils':
                    // Utils es opcional
                    if (module.Utils) {
                        window.Utils = module.Utils;
                        console.log(`🛠️ Utils disponible globalmente`);
                    }
                    break;
                    
                default:
                    console.log(`📦 Módulo ${moduleName} cargado (sin setup específico)`);
                    break;
            }
        } catch (setupError) {
            console.error(`❌ Error en setup de ${moduleName}:`, setupError);
            
            // Si el setup falla, intentar fallback si está disponible
            if (CONFIG.FALLBACK_ENABLED && this.hasFallback(moduleName)) {
                console.log(`🆘 Setup falló, usando fallback para ${moduleName}...`);
                try {
                    await this.loadFallback(moduleName);
                } catch (fallbackError) {
                    console.error(`💥 Fallback también falló para ${moduleName}:`, fallbackError);
                    throw setupError; // Lanzar error original
                }
            } else {
                throw setupError;
            }
        }
    }
    
    isCriticalModule(moduleName) {
        return CONFIG.CRITICAL_MODULES.includes(moduleName);
    }
    
    isOptionalModule(moduleName) {
        return CONFIG.OPTIONAL_MODULES.includes(moduleName);
    }
    
    getLoadResults() {
        return {
            loaded: Array.from(this.loaded),
            errors: Object.fromEntries(this.errors),
            fallbacks: Array.from(this.stateManager.get('modules.loadedWithFallback') || []),
            total: this.loadOrder.length,
            success: this.loaded.size,
            failed: this.errors.size
        };
    }
    
    // Métodos de setup integrados
    setupSearchEventListeners() {
        console.log('🔍 Configurando event listeners de búsqueda...');
        
        const searchInputs = [
            'sidebarSearchInput',
            'mobileSearchInput', 
            'searchInput2',
            'searchInput'
        ];
        
        searchInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.replaceWith(input.cloneNode(true));
                const newInput = document.getElementById(inputId);
                
                newInput.addEventListener('input', this.debounce((e) => {
                    const query = e.target.value.trim();
                    if (query.length > 2) {
                        console.log(`🔍 Búsqueda: "${query}"`);
                        
                        if (window.UIManager?.switchView) {
                            window.UIManager.switchView('search');
                        }
                        
                        if (window.SearchManager?.performSearch) {
                            window.SearchManager.performSearch(query);
                        }
                        
                        document.dispatchEvent(new CustomEvent('search-started', {
                            detail: { query }
                        }));
                    }
                }, 300));
                
                console.log(`✅ Event listener configurado: ${inputId}`);
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const activeInput = document.activeElement;
                if (activeInput && activeInput.id && searchInputs.includes(activeInput.id)) {
                    const query = activeInput.value.trim();
                    if (query.length > 2 && window.SearchManager?.performSearch) {
                        window.SearchManager.performSearch(query);
                    }
                }
            }
        });
    }
    
    setupPlaylistUrlButton() {
        console.log('🔗 Configurando botón de playlist URL...');
        
        const urlButton = document.getElementById('añadirUrlButton');
        const urlInput = document.getElementById('searchInput2');
        
        if (urlButton && urlInput) {
            urlButton.replaceWith(urlButton.cloneNode(true));
            const newButton = document.getElementById('añadirUrlButton');
            
            newButton.addEventListener('click', async (e) => {
                e.preventDefault();
                
                const url = urlInput.value.trim();
                if (!url) {
                    window.unifiedMessageManager?.show('Ingresa una URL de playlist', 'warning');
                    return;
                }
                
                if (!this.isValidYouTubePlaylistUrl(url)) {
                    window.unifiedMessageManager?.show('URL de playlist no válida', 'error');
                    return;
                }
                
                const playlistId = this.extractPlaylistId(url);
                if (!playlistId) {
                    window.unifiedMessageManager?.show('No se pudo extraer el ID', 'error');
                    return;
                }
                
                console.log(`🔗 Procesando playlist: ${playlistId}`);
                
                window.unifiedLoadingManager?.show('playlist-load', {
                    type: 'overlay',
                    message: 'Cargando playlist...'
                });
                
                try {
                    await this.loadPlaylistFromUrl(playlistId);
                    urlInput.value = '';
                } catch (error) {
                    console.error('Error cargando playlist:', error);
                    window.unifiedMessageManager?.show('Error cargando playlist', 'error');
                } finally {
                    window.unifiedLoadingManager?.hide('playlist-load');
                }
            });
            
            urlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    newButton.click();
                }
            });
            
            console.log('✅ Botón de playlist URL configurado');
        }
    }
    
    async loadGoogleAPIs() {
        console.log('📡 Cargando APIs de Google...');
        
        return new Promise((resolve, reject) => {
            if (!window.gapi) {
                const gapiScript = document.createElement('script');
                gapiScript.src = 'https://apis.google.com/js/api.js';
                gapiScript.async = true;
                gapiScript.defer = true;
                
                gapiScript.onload = () => {
                    console.log('✅ GAPI cargado');
                    
                    if (!window.google?.accounts) {
                        const gisScript = document.createElement('script');
                        gisScript.src = 'https://accounts.google.com/gsi/client';
                        gisScript.async = true;
                        gisScript.defer = true;
                        
                        gisScript.onload = () => {
                            console.log('✅ GIS cargado');
                            resolve();
                        };
                        
                        gisScript.onerror = () => {
                            reject(new Error('Error cargando GIS'));
                        };
                        
                        document.head.appendChild(gisScript);
                    } else {
                        resolve();
                    }
                };
                
                gapiScript.onerror = () => {
                    reject(new Error('Error cargando GAPI'));
                };
                
                document.head.appendChild(gapiScript);
            } else {
                resolve();
            }
        });
    }
    
    setupAuthButtons(authManager) {
        console.log('🔐 Configurando botones de auth...');
        
        const signInButton = document.getElementById('googleSignInButton');
        const signOutButton = document.getElementById('googleSignOutButton');
        
        if (signInButton) {
            signInButton.replaceWith(signInButton.cloneNode(true));
            const newSignInButton = document.getElementById('googleSignInButton');
            
            newSignInButton.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('🔐 Iniciando auth...');
                
                try {
                    if (authManager.handleAuthClick) {
                        await authManager.handleAuthClick();
                    } else if (authManager.signIn) {
                        await authManager.signIn();
                    }
                } catch (error) {
                    console.error('Error en auth:', error);
                    window.unifiedMessageManager?.show('Error al iniciar sesión', 'error');
                }
            });
        }
        
        if (signOutButton) {
            signOutButton.replaceWith(signOutButton.cloneNode(true));
            const newSignOutButton = document.getElementById('googleSignOutButton');
            
            newSignOutButton.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('🔐 Cerrando sesión...');
                
                try {
                    if (authManager.handleSignOutClick) {
                        authManager.handleSignOutClick();
                    } else if (authManager.signOut) {
                        authManager.signOut();
                    }
                } catch (error) {
                    console.error('Error cerrando sesión:', error);
                }
            });
        }
        
        if (authManager.updateUI) {
            authManager.updateUI(false);
        }
    }
    
    createSearchResultsContainer() {
        console.log('🔧 Creando contenedor de búsqueda...');
        
        const searchView = document.getElementById('searchView');
        if (searchView) {
            const searchResults = document.createElement('div');
            searchResults.id = 'searchResults';
            searchResults.className = 'search-results';
            searchResults.innerHTML = `
                <div class="search-placeholder">
                    <i class="fas fa-search"></i>
                    <p>Busca música, artistas o playlists</p>
                    <p><small>Sistema Unificado Activo</small></p>
                </div>
            `;
            
            searchView.appendChild(searchResults);
            console.log('✅ Contenedor creado');
        }
    }
    
    isValidYouTubePlaylistUrl(url) {
        try {
            const urlObj = new URL(url);
            return (
                (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com' || urlObj.hostname === 'youtu.be') &&
                (urlObj.pathname.includes('/playlist') || urlObj.searchParams.has('list'))
            );
        } catch (error) {
            return false;
        }
    }
    
    extractPlaylistId(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('list');
        } catch (error) {
            return null;
        }
    }
    
    async loadPlaylistFromUrl(playlistId) {
        console.log(`📚 Cargando playlist: ${playlistId}`);
        
        try {
            let playlistData = null;
            let lastError = null;
            
            for (const instance of CONFIG.PIPED_INSTANCES) {
                try {
                    console.log(`📡 Intentando: ${instance}`);
                    
                    const response = await fetch(`${instance}/playlists/${playlistId}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    
                    playlistData = await response.json();
                    console.log(`✅ Playlist obtenida`);
                    break;
                    
                } catch (error) {
                    console.warn(`⚠️ Fallo ${instance}:`, error.message);
                    lastError = error;
                    continue;
                }
            }
            
            if (!playlistData) {
                throw new Error(`No se pudo cargar: ${lastError?.message}`);
            }
            
            if (window.PlaylistManager?.handlePlaylistLoaded) {
                await window.PlaylistManager.handlePlaylistLoaded({
                    id: playlistId,
                    name: playlistData.name || 'Playlist Sin Nombre',
                    thumbnailUrl: playlistData.thumbnailUrl || '',
                    relatedStreams: playlistData.relatedStreams || []
                });
                
                console.log(`✅ Playlist procesada: ${playlistData.name}`);
                window.unifiedMessageManager?.show(`Playlist "${playlistData.name}" cargada`, 'success');
            } else {
                throw new Error('PlaylistManager no disponible');
            }
            
        } catch (error) {
            console.error('❌ Error cargando playlist:', error);
            throw error;
        }
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// ===== 7. CORE PRINCIPAL UNIFICADO =====
class UnifiedYTCrossMixCore {
    constructor() {
        console.log('🚀 Iniciando YT CrossMix Core Unificado...');
        
        // Managers únicos
        this.stateManager = new UnifiedStateManager();
        this.loadingManager = new UnifiedLoadingManager();
        this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
        this.messageManager = new UnifiedMessageManager();
        this.moduleLoader = new UnifiedModuleLoader(this.stateManager);
        
        // Estado
        this.initialized = false;
        this.initPromise = null;
        
        this.setupGlobalReferences();
    }
    
    setupGlobalReferences() {
        // Referencias globales únicas
        window.ytCrossMixUnified = this;
        window.unifiedStateManager = this.stateManager;
        window.unifiedLoadingManager = this.loadingManager;
        window.unifiedYouTubeManager = this.youtubeManager;
        window.unifiedMessageManager = this.messageManager;
        
        // Funciones de conveniencia
        window.showMessage = (msg, type, duration) => 
            this.messageManager.show(msg, type, duration);
        window.showLoading = (id, options) => 
            this.loadingManager.show(id, options);
        window.hideLoading = (id) => 
            this.loadingManager.hide(id);
        
        // Debug y control
        window.debugUnified = () => this.debug();
        window.resetUnified = () => this.reset();
        
        console.log('🌐 Referencias globales configuradas');
    }
    
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this.performInitialization();
        return this.initPromise;
    }
    
    async initializeDOM() {
        await this.waitForDOM();
        this.setupCriticalElements();
        this.detectDevice();
        console.log('🏠 DOM inicializado');
    }
    
    async initializeYouTube() {
        await this.youtubeManager.initialize();
        this.stateManager.set('app.youtubeAPIReady', true);
        console.log('🎥 YouTube inicializado');
    }

    async setupIntegrations() {
        console.log('🔗 Configurando integraciones...');
        
        // UI <-> State integration
        this.stateManager.subscribe('playlist.playlistsData', (newPlaylists) => {
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
            }
            
            // Actualizar contador de cola
            const manualPlaylist = newPlaylists.find(p => p.id === 'manual');
            if (manualPlaylist) {
                this.updateQueueCounter(manualPlaylist.videos?.length || 0);
            }
        });
        
        this.stateManager.subscribe('ui.currentView', (newView) => {
            console.log(`🔄 Vista cambió a: ${newView}`);
        });
        
        // ✅ CRÍTICO: Setup botón cola
        const queueButton = document.getElementById('queueButton');
        if (queueButton) {
            // Remover listener existente
            queueButton.replaceWith(queueButton.cloneNode(true));
            const newQueueButton = document.getElementById('queueButton');
            
            newQueueButton.addEventListener('click', () => {
                console.log('📋 Botón cola presionado');
                if (window.UIManager?.toggleQueue) {
                    window.UIManager.toggleQueue();
                } else {
                    console.error('❌ UIManager.toggleQueue no disponible');
                }
            });
            console.log('✅ Botón de cola configurado');
        }
        
        // Search integration
        document.addEventListener('search-started', (e) => {
            if (window.UIManager?.switchView) {
                window.UIManager.switchView('search');
            }
        });
        
        // Playback integration
        document.addEventListener('unifiedPlayerStateChanged', (e) => {
            const { playerNum, state: playerState, videoId } = e.detail;
            this.updatePlaybackControls(playerState);
            
            if (window.innerWidth <= 768) {
                this.updateMobilePlayer(videoId, playerState);
            }
            
            // Actualizar PlaylistManager
            if (window.PlaylistManager?.updateCurrentPlayingIndex) {
                window.PlaylistManager.updateCurrentPlayingIndex();
            }
        });
        
        // Auth integration
        document.addEventListener('playlistsFetched', (e) => {
            console.log('📚 Playlists recibidas del auth');
            
            if (e.detail && window.PlaylistManager?.processYouTubeLibraryPlaylists) {
                const newCount = window.PlaylistManager.processYouTubeLibraryPlaylists(e.detail);
                console.log(`✅ ${newCount} nuevas playlists procesadas`);
            }
            
            if (window.UIManager?.updatePlaylistsUI) {
                setTimeout(() => {
                    window.UIManager.updatePlaylistsUI();
                }, 500);
            }
        });
        
        document.addEventListener('userLoggedOut', () => {
            console.log('👤 Usuario deslogueado');
            
            // Limpiar playlists excepto manual
            const state = this.stateManager.state;
            const manualPlaylist = state.playlist.playlistsData.find(p => p.id === 'manual');
            const filteredPlaylists = manualPlaylist ? [manualPlaylist] : [];
            
            this.stateManager.set('playlist.playlistsData', filteredPlaylists);
            
            if (window.UIManager?.updatePlaylistsUI) {
                setTimeout(() => {
                    window.UIManager.updatePlaylistsUI();
                }, 300);
            }
        });
        
        console.log('✅ Integraciones configuradas');
    }
    
    updatePlaybackControls(playerState) {
        const playButtons = document.querySelectorAll('#botonPlay, #miniPlayBtn');
        
        playButtons.forEach(button => {
            if (playerState === YT.PlayerState.PLAYING) {
                button.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                button.innerHTML = '<i class="fas fa-play"></i>';
            }
        });
    }
    
    updateMobilePlayer(videoId, playerState) {
        if (videoId && window.UIManager?.updateMiniPlayer) {
            const state = this.stateManager.state;
            for (const playlist of state.playlist.playlistsData) {
                if (playlist.videos) {
                    const video = playlist.videos.find(v => v.videoId === videoId);
                    if (video) {
                        window.UIManager.updateMiniPlayer({
                            title: video.title,
                            artist: video.channelTitle,
                            thumbnail: video.thumbnail
                        });
                        break;
                    }
                }
            }
        }
    }
    
    setupGlobalEvents() {
        console.log('🌐 Configurando eventos globales...');
        
        // Error handling mejorado con filtrado
        window.addEventListener('error', (e) => {
            // Filtrar errores de extensiones y otros ruidos
            const errorMessage = e.error?.message || '';
            const shouldIgnore = 
                errorMessage.includes('Extension') ||
                errorMessage.includes('chrome-extension') ||
                errorMessage.includes('moz-extension') ||
                errorMessage.includes('safari-extension') ||
                e.filename?.includes('extension');
            
            if (!shouldIgnore) {
                console.error('🚨 Error global:', e.error);
                this.handleGlobalError(e.error);
            }
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            // Filtrar promise rejections de extensiones
            const reason = e.reason?.message || e.reason || '';
            const shouldIgnore = 
                reason.includes && (
                    reason.includes('Extension') ||
                    reason.includes('chrome-extension') ||
                    reason.includes('moz-extension')
                );
            
            if (!shouldIgnore) {
                console.error('🚨 Promise rejection:', e.reason);
                this.handlePromiseRejection(e.reason);
            }
            e.preventDefault();
        });
        
        // Visibility change para health checks
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('👁️ Tab visible - ejecutando health check');
                setTimeout(() => {
                    this.performHealthCheck();
                }, 1000);
            }
        });
        
        // Online/offline status
        window.addEventListener('online', () => {
            console.log('🌐 Conexión restaurada');
            this.messageManager.show('Conexión restaurada', 'success', 2000);
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Sin conexión');
            this.messageManager.show('Sin conexión a internet', 'warning', 4000);
        });
        
        // Resize handling mejorado
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
        
        // ✅ Navigation handling (delegación mejorada)
        this.setupGlobalNavigation();
        
        console.log('✅ Eventos globales configurados');
    }
    
    setupGlobalNavigation() {
        const sidebarNavItems = document.querySelectorAll('.sidebar-nav [data-view], .nav-item[data-view]');
        sidebarNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view && window.UIManager?.switchView) {
                    console.log(`🧭 Navegando: ${view}`);
                    window.UIManager.switchView(view);
                }
            });
        });
        
        const bottomNavItems = document.querySelectorAll('.bottom-nav [data-view], .nav-tab[data-view]');
        bottomNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view && window.UIManager?.switchView) {
                    console.log(`📱 Navegando: ${view}`);
                    window.UIManager.switchView(view);
                }
            });
        });
    }
    
    setupPlaybackControls() {
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        const miniNextBtn = document.getElementById('miniNextBtn');
        
        if (playButton) {
            // ✅ Remover listeners existentes
            playButton.replaceWith(playButton.cloneNode(true));
            const newPlayButton = document.getElementById('botonPlay');
            
            newPlayButton.addEventListener('click', () => {
                console.log('▶️ Play button clicked (unified)');
                
                if (!window.PlaybackController) {
                    console.error('❌ PlaybackController no disponible');
                    window.unifiedMessageManager?.show('Sistema de reproducción no disponible', 'error');
                    return;
                }
                
                const state = this.stateManager.state;
                if (state.app.reproduccionIniciada) {
                    const currentPlayer = state.app.currentPlayer === 1 ? state.app.player1 : state.app.player2;
                    if (currentPlayer) {
                        const playerState = currentPlayer.getPlayerState();
                        if (playerState === YT.PlayerState.PLAYING) {
                            currentPlayer.pauseVideo();
                        } else {
                            currentPlayer.playVideo();
                        }
                    }
                } else {
                    console.log('🎵 Iniciando primera reproducción...');
                    
                    // Verificar que hay videos en la cola
                    const queueInfo = window.PlaylistManager?.getQueueInfo?.();
                    if (!queueInfo || queueInfo.count === 0) {
                        window.unifiedMessageManager?.show('La cola está vacía. Añade música primero.', 'warning');
                        return;
                    }
                    
                    window.PlaybackController.playFirstVideo();
                }
            });
            
            console.log('✅ Botón Play configurado');
        }
        
        if (nextButton) {
            nextButton.replaceWith(nextButton.cloneNode(true));
            const newNextButton = document.getElementById('botonNext');
            
            newNextButton.addEventListener('click', () => {
                console.log('⏭️ Next button clicked (unified)');
                
                if (window.PlaybackController?.playNextVideo) {
                    window.PlaybackController.playNextVideo();
                } else {
                    console.error('❌ PlaybackController.playNextVideo no disponible');
                    window.unifiedMessageManager?.show('Función siguiente no disponible', 'error');
                }
            });
            
            console.log('✅ Botón Next configurado');
        }
        
        if (miniPlayBtn) {
            miniPlayBtn.replaceWith(miniPlayBtn.cloneNode(true));
            const newMiniPlayBtn = document.getElementById('miniPlayBtn');
            
            newMiniPlayBtn.addEventListener('click', () => {
                document.getElementById('botonPlay')?.click();
            });
        }
        
        if (miniNextBtn) {
            miniNextBtn.replaceWith(miniNextBtn.cloneNode(true));
            const newMiniNextBtn = document.getElementById('miniNextBtn');
            
            newMiniNextBtn.addEventListener('click', () => {
                document.getElementById('botonNext')?.click();
            });
        }
        
        // ✅ CRÍTICO: Keyboard shortcuts
        document.removeEventListener('keydown', this.keyboardShortcutsHandler);
        this.keyboardShortcutsHandler = (e) => {
            // Solo procesar si no estamos en un input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.code === 'Space') {
                e.preventDefault();
                document.getElementById('botonPlay')?.click();
            }
            
            if (e.code === 'ArrowRight' && e.ctrlKey) {
                e.preventDefault();
                document.getElementById('botonNext')?.click();
            }
            
            // Escape para cerrar cola
            if (e.code === 'Escape') {
                const queueSection = document.getElementById('queueSection');
                if (queueSection && !queueSection.classList.contains('hidden')) {
                    window.UIManager?.hideQueue();
                }
            }
        };
        
        document.addEventListener('keydown', this.keyboardShortcutsHandler);
        
        console.log('✅ Controles de reproducción configurados (mejorados)');
    }
    
    updateQueueCounter(count) {
        const queueBtn = document.getElementById('queueButton');
        if (!queueBtn) return;
        
        // Limpiar badge existente
        const existingBadge = queueBtn.querySelector('.queue-count-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        if (count > 0) {
            // Crear nuevo badge
            const badge = document.createElement('span');
            badge.className = 'queue-count-badge';
            badge.style.cssText = `
                position: absolute;
                top: -4px;
                right: -4px;
                background: var(--accent-color);
                color: white;
                border-radius: 10px;
                padding: 2px 6px;
                font-size: 10px;
                font-weight: 600;
                min-width: 16px;
                text-align: center;
                line-height: 1;
            `;
            badge.textContent = count > 99 ? '99+' : count;
            
            queueBtn.style.position = 'relative';
            queueBtn.appendChild(badge);
            
            queueBtn.title = `Cola: ${count} video${count > 1 ? 's' : ''}`;
        } else {
            queueBtn.style.position = '';
            queueBtn.title = 'Cola (vacía)';
        }
        
        console.log(`📊 Contador de cola actualizado: ${count}`);
    }
    
    // ✅ MEJORADO: performInitialization() con mejor manejo de errores
    async performInitialization() {
        console.log('📋 Iniciando inicialización...');
        
        const startTime = Date.now();
        
        try {
            await this.initializeDOM();
            await this.initializeYouTube();
            
            // ✅ NUEVO: Carga de módulos con manejo robusto de errores
            console.log('📦 Iniciando carga de módulos con recuperación de errores...');
            
            let moduleResults;
            try {
                moduleResults = await this.moduleLoader.loadAll();
            } catch (criticalError) {
                console.error('💥 Error crítico en carga de módulos:', criticalError);
                
                // ✅ NUEVO: Intentar recuperación con módulos básicos
                console.log('🆘 Intentando recuperación con módulos básicos...');
                moduleResults = await this.attemptBasicRecovery();
            }
            
            console.log('📊 Módulos cargados:', moduleResults);
            
            // ✅ MEJORADO: Verificación más flexible de módulos críticos
            const moduleVerification = this.verifyModules();
            
            if (!moduleVerification.canProceed) {
                console.error('❌ Verificación de módulos falló:', moduleVerification.issues);
                
                // ✅ NUEVO: Intentar carga de emergencia
                console.log('🚨 Activando modo de emergencia...');
                await this.activateEmergencyMode();
            }
            
            await this.setupIntegrations();
            this.setupGlobalEvents();
            this.setupPlaybackControls();
            await this.finalize();
            
            this.initialized = true;
            const totalTime = Date.now() - startTime;
            
            console.log(`✅ Sistema inicializado en ${totalTime}ms`);
            this.messageManager.show('🎵 YT CrossMix listo', 'success');
            
            // ✅ MEJORADO: Verificación final más robusta
            const finalVerification = this.performFinalVerification();
            
            // ✅ Solo mostrar advertencia si hay problemas críticos reales
            if (finalVerification.critical && finalVerification.criticalCount > 2) {
                console.error('❌ Verificación final falló:', finalVerification.issues);
                this.messageManager.show('Sistema con funcionalidad limitada', 'warning', 5000);
            } else if (finalVerification.issues.length > 0) {
                console.warn('⚠️ Verificación con advertencias:', finalVerification.issues);
            }
            
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: { 
                    timestamp: Date.now(), 
                    core: this, 
                    totalTime, 
                    moduleResults,
                    verification: finalVerification
                }
            }));
            
            return { 
                success: true, 
                totalTime, 
                modules: moduleResults, 
                verification: finalVerification 
            };
            
        } catch (error) {
            console.error('💥 Error en inicialización:', error);
            await this.handleCriticalError(error);
            throw error;
        }
    }
    
    // ✅ NUEVO: Verificación de módulos más flexible
    verifyModules() {
        const issues = [];
        let criticalIssues = 0;
        
        // Verificar módulos críticos con fallbacks
        const criticalChecks = {
            'UIManager': {
                exists: !!window.UIManager,
                hasFallback: true,
                methods: ['switchView', 'updatePlaylistsUI']
            },
            'PlaylistManager': {
                exists: !!window.PlaylistManager,
                hasFallback: false,
                methods: ['getQueueInfo', 'initializeManualPlaylist']
            },
            'PlaybackController': {
                exists: !!window.PlaybackController,
                hasFallback: false,
                methods: ['playFirstVideo', 'playNextVideo']
            }
        };
        
        Object.entries(criticalChecks).forEach(([name, check]) => {
            if (!check.exists) {
                if (check.hasFallback) {
                    issues.push(`${name} usando fallback`);
                } else {
                    issues.push(`${name} no disponible`);
                    criticalIssues++;
                }
            } else {
                // Verificar métodos críticos
                const missingMethods = check.methods.filter(method => 
                    !window[name] || typeof window[name][method] !== 'function'
                );
                
                if (missingMethods.length > 0) {
                    issues.push(`${name} métodos faltantes: ${missingMethods.join(', ')}`);
                    if (!check.hasFallback) {
                        criticalIssues++;
                    }
                }
            }
        });
        
        return {
            canProceed: criticalIssues === 0,
            issues,
            criticalCount: criticalIssues
        };
    }
    
    // ✅ NUEVO: Recuperación básica con módulos mínimos
    async attemptBasicRecovery() {
        console.log('🆘 Intentando recuperación básica...');
        
        const results = {
            loaded: [],
            errors: {},
            fallbacks: [],
            total: CONFIG.MODULE_LOAD_ORDER.length,
            success: 0,
            failed: 0
        };
        
        // Crear módulos básicos inline
        try {
            // UI Manager básico
            if (!window.UIManager) {
                console.log('🆘 Creando UIManager básico inline...');
                await this.moduleLoader.createUIFallback();
                results.fallbacks.push('ui');
                results.success++;
            }
            
            // SearchManager básico
            if (!window.SearchManager) {
                console.log('🆘 Creando SearchManager básico inline...');
                await this.moduleLoader.createSearchFallback();
                results.fallbacks.push('searchManager');
                results.success++;
            }
            
            // PlaylistManager - intentar cargar de nuevo
            if (!window.PlaylistManager) {
                try {
                    console.log('🔄 Reintentando carga de PlaylistManager...');
                    const playlistModule = await import('./playlistManager.js');
                    if (playlistModule.PlaylistManager) {
                        window.PlaylistManager = playlistModule.PlaylistManager;
                        window.PlaylistManager.initializeManualPlaylist();
                        results.loaded.push('playlistManager');
                        results.success++;
                    }
                } catch (e) {
                    console.error('❌ PlaylistManager falló en recuperación:', e);
                    results.errors.playlistManager = e.message;
                    results.failed++;
                }
            }
            
            // AuthManager - opcional
            if (!window.authManager) {
                try {
                    console.log('🔄 Reintentando carga de AuthManager...');
                    const authModule = await import('./auth.js');
                    if (authModule.authManager) {
                        window.authManager = authModule.authManager;
                        results.loaded.push('auth');
                        results.success++;
                    }
                } catch (e) {
                    console.warn('⚠️ AuthManager falló (no crítico):', e.message);
                    results.errors.auth = e.message;
                }
            }
            
        } catch (recoveryError) {
            console.error('💥 Error en recuperación básica:', recoveryError);
            results.errors.recovery = recoveryError.message;
        }
        
        console.log('🆘 Recuperación básica completada:', results);
        return results;
    }
    
    // ✅ NUEVO: Modo de emergencia
    async activateEmergencyMode() {
        console.log('🚨 Activando modo de emergencia...');
        
        // Crear interfaces básicas mínimas
        if (!window.UIManager) {
            window.UIManager = {
                switchView: (view) => {
                    console.log(`🔄 Emergency switchView: ${view}`);
                    const views = document.querySelectorAll('.content-view');
                    views.forEach(v => v.classList.remove('active'));
                    
                    const targetView = document.getElementById(`${view}View`);
                    if (targetView) {
                        targetView.classList.add('active');
                    }
                },
                
                updatePlaylistsUI: () => {
                    console.log('🔄 Emergency updatePlaylistsUI');
                },
                
                toggleQueue: () => {
                    console.log('📋 Emergency toggleQueue');
                    const queueSection = document.getElementById('queueSection');
                    if (queueSection) {
                        queueSection.classList.toggle('hidden');
                    }
                },
                
                hideQueue: () => {
                    const queueSection = document.getElementById('queueSection');
                    if (queueSection) {
                        queueSection.classList.add('hidden');
                    }
                }
            };
            
            console.log('🚨 UIManager de emergencia activado');
        }
        
        if (!window.PlaylistManager) {
            window.PlaylistManager = {
                getQueueInfo: () => ({
                    exists: false,
                    count: 0,
                    videos: [],
                    currentIndex: -1
                }),
                
                initializeManualPlaylist: () => {
                    console.log('🚨 Emergency manual playlist initialization');
                    
                    const state = this.stateManager.state;
                    if (state && state.playlist) {
                        state.playlist.playlistsData = [{
                            id: 'manual',
                            name: 'Cola de Reproducción',
                            thumbnailUrl: '/electronic.ico',
                            videos: [],
                            isExpanded: false,
                            source: 'manual',
                            isLoaded: true,
                            itemCount: 0
                        }];
                    }
                },
                
                addVideoToManualPlaylist: (videoData) => {
                    console.log('🚨 Emergency add to queue:', videoData?.title);
                    return null;
                }
            };
            
            console.log('🚨 PlaylistManager de emergencia activado');
        }
        
        if (!window.SearchManager) {
            window.SearchManager = {
                performSearch: (query) => {
                    console.log(`🚨 Emergency search: ${query}`);
                    this.messageManager.show('Búsqueda no disponible en modo emergencia', 'warning');
                }
            };
            
            console.log('🚨 SearchManager de emergencia activado');
        }
        
        this.messageManager.show('🚨 Modo de emergencia activado', 'warning', 8000);
    }
    
    performFinalVerification() {
        const issues = [];
        let criticalIssues = 0;
        
        // Verificar módulos críticos con más tolerancia
        const essentialModules = ['UIManager', 'PlaylistManager'];
        essentialModules.forEach(module => {
            if (!window[module]) {
                issues.push(`${module} no disponible globalmente`);
                criticalIssues++;
            } else {
                // Verificar funcionalidad básica
                const moduleObj = window[module];
                if (module === 'UIManager' && typeof moduleObj.switchView !== 'function') {
                    issues.push(`${module} sin funcionalidad básica`);
                    criticalIssues++;
                }
                if (module === 'PlaylistManager' && typeof moduleObj.getQueueInfo !== 'function') {
                    issues.push(`${module} sin funcionalidad básica`);
                    criticalIssues++;
                }
            }
        });
        
        // Verificar elementos DOM críticos (más tolerante)
        const essentialElements = ['botonPlay', 'botonNext'];
        essentialElements.forEach(id => {
            if (!document.getElementById(id)) {
                issues.push(`Elemento crítico ${id} no encontrado en DOM`);
                criticalIssues++;
            }
        });
        
        // Verificar estado unificado
        const state = this.stateManager?.state;
        if (!state) {
            issues.push('Estado unificado no disponible');
            criticalIssues++;
        } else {
            if (!state.playlist) {
                issues.push('Estado de playlist no inicializado');
                criticalIssues++;
            }
            
            if (!state.app.playersInitialized) {
                issues.push('Reproductores YouTube no inicializados');
                // No contar como crítico inmediatamente, pueden inicializarse después
            }
        }
        
        console.log(`🔍 Verificación final: ${issues.length} problemas (${criticalIssues} críticos)`);
        
        return {
            success: issues.length === 0,
            critical: criticalIssues > 0,
            issues: issues,
            criticalCount: criticalIssues,
            timestamp: Date.now()
        };
    }
    
    handleResize() {
        const isDesktop = window.innerWidth >= 1024;
        
        this.stateManager.set('ui.isDesktop', isDesktop);
        
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', !isDesktop);
        
        const mobileElements = document.querySelectorAll('.mobile-header, .bottom-nav, .mini-player');
        const desktopElements = document.querySelectorAll('.desktop-sidebar, .bottom-player');
        
        mobileElements.forEach(el => {
            el.style.display = isDesktop ? 'none' : '';
        });
        
        desktopElements.forEach(el => {
            el.style.display = isDesktop ? '' : 'none';
        });
        
        console.log(`📱 Resize: ${isDesktop ? 'Desktop' : 'Mobile'}`);
    }
    
    async finalize() {
        console.log('🏁 Finalizando...');
        
        // Cleanup loading
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.classList.add('hidden');
        }
        
        // Habilitar elementos
        const elementsToEnable = document.querySelectorAll('[data-requires-unified]');
        elementsToEnable.forEach(el => {
            el.classList.add('unified-ready');
        });
        
        // Remover loading del body
        document.body.classList.remove('unified-loading');
        
        // Viewport fix
        this.setupViewportFix();
        
        // Health check inicial
        setTimeout(() => {
            this.performHealthCheck();
        }, 2000);
        
        console.log('✅ Finalización completada');
    }
    
    waitForDOM() {
        return new Promise(resolve => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }
    
    setupCriticalElements() {
        const requiredElements = [
            { id: 'player1', tag: 'div', parent: '#videoContainer' },
            { id: 'player2', tag: 'div', parent: '#videoContainer' },
            { id: 'botonPlay', tag: 'button', parent: '.player-controls' },
            { id: 'botonNext', tag: 'button', parent: '.player-controls' }
        ];
        
        requiredElements.forEach(({ id, tag, parent }) => {
            if (!document.getElementById(id)) {
                const element = document.createElement(tag);
                element.id = id;
                
                const container = document.querySelector(parent) || document.body;
                container.appendChild(element);
                console.log(`🔧 Elemento ${id} creado`);
            }
        });
    }
    
    detectDevice() {
        const isDesktop = window.innerWidth >= 1024;
        this.stateManager.set('ui.isDesktop', isDesktop);
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', !isDesktop);
    }
    
    setupViewportFix() {
        function updateVH() {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        }
        
        updateVH();
        window.addEventListener('resize', updateVH);
        window.addEventListener('orientationchange', () => {
            setTimeout(updateVH, 100);
        });
    }
    
    performHealthCheck() {
        const health = {
            timestamp: Date.now(),
            core: this.initialized,
            modules: this.moduleLoader.loaded.size,
            state: !!this.stateManager.state,
            youtube: this.youtubeManager.apiReady,
            players: this.youtubeManager.playersReady,
            ui: !!window.UIManager,
            search: !!window.SearchManager,
            playlist: !!window.PlaylistManager,
            auth: !!window.authManager,
            online: navigator.onLine,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                isDesktop: window.innerWidth >= 1024
            },
            // ✅ NUEVO: Info sobre fallbacks
            fallbacks: Array.from(this.stateManager.get('modules.loadedWithFallback') || []),
            failed: Array.from(this.stateManager.get('modules.failed') || [])
        };
        
        console.log('🔍 Health Check:', health);
        
        const criticalIssues = [];
        if (!health.core) criticalIssues.push('Core no inicializado');
        if (!health.state) criticalIssues.push('State Manager no disponible');
        
        // Solo considerar UI crítico si no hay fallback
        if (!health.ui && !health.fallbacks.includes('ui')) {
            criticalIssues.push('UI Manager no disponible');
        }
        
        if (criticalIssues.length > 0) {
            console.warn('⚠️ Problemas críticos:', criticalIssues);
            this.handleHealthIssues(criticalIssues);
        }
        
        return health;
    }
    
    handleHealthIssues(issues) {
        this.messageManager.show(`Problemas: ${issues.join(', ')}`, 'warning', 5000);
        
        issues.forEach(issue => {
            if (issue.includes('UI Manager')) {
                this.attemptUIRecovery();
            }
        });
    }
    
    attemptUIRecovery() {
        console.log('🔧 Intentando recuperar UI...');
        
        try {
            const uiModule = this.moduleLoader.modules.get('ui');
            if (uiModule?.UIManager && typeof uiModule.UIManager.initialize === 'function') {
                uiModule.UIManager.initialize();
                console.log('✅ UI recuperado');
            } else {
                // Crear fallback
                this.moduleLoader.createUIFallback();
                console.log('✅ UI fallback creado');
            }
        } catch (error) {
            console.error('💥 Fallo en recuperación UI:', error);
        }
    }
    
    handleGlobalError(error) {
        console.error('🚨 Error global:', error);
        
        if (window.errorBoundary?.handleCriticalError) {
            window.errorBoundary.handleCriticalError(error, 'global');
        } else {
            this.messageManager.show('Error en la aplicación', 'error');
        }
    }
    
    handlePromiseRejection(reason) {
        console.error('🚨 Promise rejection:', reason);
        
        if (reason instanceof Error && !reason.message.includes('Extension')) {
            this.messageManager.show('Error en operación asíncrona', 'error', 3000);
        }
    }
    
    async handleCriticalError(error) {
        console.error('💀 Error crítico:', error);
        
        // ✅ NUEVO: Intentar una última recuperación antes de fallar
        if (!this.emergencyAttempted) {
            this.emergencyAttempted = true;
            console.log('🆘 Última oportunidad: intentando recuperación de emergencia...');
            
            try {
                await this.activateEmergencyMode();
                
                // Si la recuperación funciona, continuar con funcionalidad básica
                this.messageManager.show('🚨 Sistema en modo básico', 'warning', 8000);
                
                // Marcar como parcialmente inicializado
                this.initialized = 'emergency';
                
                return;
            } catch (emergencyError) {
                console.error('💥 Recuperación de emergencia falló:', emergencyError);
            }
        }
        
        // Si todo falla, mostrar interfaz de error
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000;
            background: #0f0f0f; color: white; display: flex; align-items: center;
            justify-content: center; text-align: center; padding: 20px;
            font-family: 'Roboto', sans-serif;
        `;
        
        errorDiv.innerHTML = `
            <div>
                <h1>💥 Error Crítico en YT CrossMix</h1>
                <p>El sistema unificado encontró un error irrecuperable.</p>
                <p><strong>Error:</strong> ${error.message}</p>
                <details style="margin: 20px 0; text-align: left;">
                    <summary style="cursor: pointer;">Detalles técnicos</summary>
                    <pre style="background: #333; padding: 10px; border-radius: 4px; overflow: auto; max-height: 200px; margin-top: 10px;">
${error.stack || error.message}
                    </pre>
                </details>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px;
                    ">Recargar Página</button>
                    <button onclick="this.parentElement.parentElement.remove()" style="
                        background: #666; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px;
                    ">Intentar Continuar</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
    }
    
    cleanup() {
        console.log('🧹 Limpiando sistema unificado...');
        
        const state = this.stateManager.state.app;
        
        // Limpiar intervalos
        if (state.monitorInterval) {
            clearInterval(state.monitorInterval);
            state.monitorInterval = null;
        }
        
        if (state.crossfadeInterval) {
            clearInterval(state.crossfadeInterval);
            state.crossfadeInterval = null;
        }
        
        // Limpiar event listeners
        if (this.keyboardShortcutsHandler) {
            document.removeEventListener('keydown', this.keyboardShortcutsHandler);
            this.keyboardShortcutsHandler = null;
        }
        
        // Limpiar managers
        this.loadingManager?.hideAll();
        this.messageManager?.clear();
        
        // Pausar reproductores
        try {
            const player1 = this.stateManager.get('app.player1');
            const player2 = this.stateManager.get('app.player2');
            
            if (player1?.pauseVideo) player1.pauseVideo();
            if (player2?.pauseVideo) player2.pauseVideo();
        } catch (error) {
            console.warn('Error pausando reproductores:', error);
        }
        
        console.log('✅ Cleanup completado');
    }
    
    reset() {
        if (!confirm('¿Reiniciar YT CrossMix? Esto limpiará la cola de reproducción.')) {
            return;
        }
        
        console.log('🔄 Reiniciando sistema unificado...');
        
        try {
            this.cleanup();
            
            // Reset estados
            Object.assign(this.stateManager.state.app, {
                currentPlayer: 1,
                isTransitioning: false,
                isAudioFading: false,
                hasOutroCrossfadeStarted: false,
                crossfadeInProgress: false,
                reproduccionIniciada: false
            });
            
            // Reset UI
            this.stateManager.set('ui.currentView', 'home');
            this.stateManager.set('ui.isPlaying', false);
            this.stateManager.set('ui.currentTrack', null);
            
            // Reset playlist info
            this.stateManager.set('playlist.currentPlayingInfo', {
                playlistId: null,
                videoId: null,
                flattenedIndex: -1
            });
            
            // Limpiar y reinicializar cola
            if (window.PlaylistManager?.clearQueue) {
                window.PlaylistManager.clearQueue();
            }
            
            if (window.PlaylistManager?.initializeManualPlaylist) {
                window.PlaylistManager.initializeManualPlaylist();
            }    
            // Actualizar UI
            if (window.UIManager?.updatePlaylistsUI) {
                window.UIManager.updatePlaylistsUI();
                window.UIManager.switchView('home');
            }
            
            this.messageManager.show('✅ YT CrossMix reiniciado', 'success');
            
            console.log('✅ Sistema reiniciado exitosamente');
            
        } catch (error) {
            console.error('❌ Error reiniciando:', error);
            this.messageManager.show('Error reiniciando sistema', 'error');
        }
    }
    
    debug() {
        console.log('=== YT CROSSMIX DEBUG UNIFICADO ===');
        console.log('Core Initialized:', this.initialized);
        console.log('Timestamp:', new Date().toLocaleString());
        
        // Módulos
        const modules = {
            'SearchManager': !!window.SearchManager,
            'PlaybackController': !!window.PlaybackController,
            'UIManager': !!window.UIManager,
            'PlaylistManager': !!window.PlaylistManager,
            'SponsorBlockManager': !!window.SponsorBlockManager,
            'authManager': !!window.authManager
        };
        console.log('Módulos disponibles:', modules);
        
        // Estado
        if (this.stateManager?.state) {
            const state = this.stateManager.state;
            console.log('Playlists totales:', state.playlist?.playlistsData?.length || 0);
            
            const queueInfo = window.PlaylistManager?.getQueueInfo?.();
            console.log('Cola de reproducción:', {
                existe: queueInfo?.exists || false,
                videos: queueInfo?.count || 0,
                indiceActual: queueInfo?.currentIndex || -1
            });
            
            console.log('Vista actual:', state.ui?.currentView || 'unknown');
            console.log('Reproductores:', {
                inicializados: state.app?.playersInitialized || false,
                reproductorActual: state.app?.currentPlayer || 0,
                reproduccionIniciada: state.app?.reproduccionIniciada || false
            });
            
            // ✅ NUEVO: Info sobre módulos fallidos/fallbacks
            console.log('Estado de módulos:', {
                cargados: Array.from(state.modules?.loaded || []),
                fallidos: Array.from(state.modules?.failed || []),
                conFallback: Array.from(state.modules?.loadedWithFallback || [])
            });
        }
        
        // Managers
        const managers = {
            stateManager: !!this.stateManager,
            loadingManager: !!this.loadingManager,
            youtubeManager: !!this.youtubeManager,
            messageManager: !!this.messageManager,
            moduleLoader: !!this.moduleLoader
        };
        console.log('Managers internos:', managers);
        
        // Health check
        const health = this.performHealthCheck();
        console.log('Health Check:', health);
        
        // Elementos DOM críticos
        const domElements = {
            botonPlay: !!document.getElementById('botonPlay'),
            botonNext: !!document.getElementById('botonNext'),
            queueButton: !!document.getElementById('queueButton'),
            playlistsGrid: !!document.getElementById('playlistsGrid'),
            queueSection: !!document.getElementById('queueSection')
        };
        console.log('Elementos DOM:', domElements);
        
        console.log('==================================');
        
        return {
            initialized: this.initialized,
            modules,
            managers,
            health,
            domElements,
            queueInfo: window.PlaylistManager?.getQueueInfo?.() || null,
            verification: this.performFinalVerification()
        };
    }
}

// ===== 8. BOOTSTRAP Y AUTO-INICIALIZACIÓN MEJORADO =====
class UnifiedBootstrap {
    static async initialize() {
        console.log('🚀 Bootstrap Unificado iniciando...');
        
        try {
            // ✅ NUEVO: Verificaciones previas
            const preflightCheck = UnifiedBootstrap.performPreflightCheck();
            if (!preflightCheck.success) {
                console.warn('⚠️ Preflight check falló:', preflightCheck.issues);
                
                // Intentar arreglar problemas básicos
                await UnifiedBootstrap.fixBasicIssues(preflightCheck.issues);
            }
            
            // Crear core único
            const unifiedCore = new UnifiedYTCrossMixCore();
            
            // Migrar funciones legacy si existen
            UnifiedBootstrap.setupLegacyCompatibility(unifiedCore);
            
            // Inicializar con retry logic
            let initResult;
            try {
                initResult = await unifiedCore.initialize();
            } catch (initError) {
                console.error('💥 Primera inicialización falló:', initError);
                
                // ✅ NUEVO: Retry con configuración de emergencia
                console.log('🔄 Reintentando con configuración de emergencia...');
                
                CONFIG.FALLBACK_ENABLED = true;
                CONFIG.CRITICAL_MODULES = ['ui']; // Reducir módulos críticos
                
                initResult = await unifiedCore.initialize();
            }
            
            console.log('✅ Bootstrap completado');
            
            return unifiedCore;
            
        } catch (error) {
            console.error('💥 Error en Bootstrap:', error);
            
            // ✅ MEJORADO: Interfaz de error más informativa
            UnifiedBootstrap.showCriticalErrorInterface(error);
            
            throw error;
        }
    }
    
    // ✅ NUEVO: Verificaciones previas al bootstrap
    static performPreflightCheck() {
        const issues = [];
        
        // Verificar DOM básico
        if (!document.body) {
            issues.push('document.body no disponible');
        }
        
        // Verificar elementos críticos del HTML
        const criticalElements = ['botonPlay', 'botonNext', 'queueButton'];
        criticalElements.forEach(id => {
            if (!document.getElementById(id)) {
                issues.push(`Elemento crítico ${id} no encontrado`);
            }
        });
        
        // Verificar APIs básicas
        if (typeof fetch === 'undefined') {
            issues.push('Fetch API no disponible');
        }
        
        if (typeof Promise === 'undefined') {
            issues.push('Promises no disponibles');
        }
        
        return {
            success: issues.length === 0,
            issues
        };
    }
    
    // ✅ NUEVO: Arreglar problemas básicos
    static async fixBasicIssues(issues) {
        console.log('🔧 Arreglando problemas básicos:', issues);
        
        for (const issue of issues) {
            if (issue.includes('Elemento crítico') && issue.includes('no encontrado')) {
                const elementId = issue.match(/Elemento crítico (\w+) no encontrado/)?.[1];
                if (elementId) {
                    console.log(`🔧 Creando elemento faltante: ${elementId}`);
                    
                    const element = document.createElement('button');
                    element.id = elementId;
                    element.className = 'control-button emergency-created';
                    element.style.cssText = 'display: none;'; // Oculto hasta que se configure
                    
                    // Buscar contenedor apropiado
                    const container = document.querySelector('.player-controls') || 
                                    document.querySelector('.bottom-player') || 
                                    document.body;
                    
                    container.appendChild(element);
                    
                    console.log(`✅ Elemento ${elementId} creado`);
                }
            }
        }
    }
    
    // ✅ MEJORADO: Interfaz de error más útil
    static showCriticalErrorInterface(error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000;
            background: linear-gradient(135deg, #0f0f0f, #1a1a1a); 
            color: white; display: flex; align-items: center;
            justify-content: center; text-align: center; padding: 20px;
            font-family: 'Roboto', sans-serif;
        `;
        
        errorDiv.innerHTML = `
            <div style="max-width: 600px;">
                <div style="font-size: 48px; margin-bottom: 20px;">💥</div>
                <h1 style="color: #ff6b35; margin-bottom: 16px;">Error en YT CrossMix</h1>
                <p style="margin-bottom: 20px; opacity: 0.9;">
                    El sistema no pudo inicializar completamente. Esto puede deberse a un problema 
                    en los archivos del módulo o conectividad.
                </p>
                
                <div style="background: rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 16px; margin: 20px 0; text-align: left;">
                    <strong style="color: #ff6b35;">Error técnico:</strong><br>
                    <code style="color: #ccc; font-size: 13px; word-break: break-word;">
                        ${error.message}
                    </code>
                </div>
                
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; font-weight: 500;
                    ">🔄 Recargar Página</button>
                    
                    <button onclick="window.unifiedEmergencyMode?.()" style="
                        background: #666; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; font-weight: 500;
                    ">🆘 Modo Básico</button>
                    
                    <button onclick="navigator.clipboard?.writeText('${error.message}').then(() => alert('Error copiado'))" style="
                        background: #333; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; font-weight: 500;
                    ">📋 Copiar Error</button>
                </div>
                
                <details style="margin-top: 20px; text-align: left;">
                    <summary style="cursor: pointer; color: #ff6b35;">Información para desarrolladores</summary>
                    <pre style="
                        background: #000; padding: 15px; border-radius: 4px; 
                        overflow: auto; max-height: 200px; margin-top: 10px;
                        font-size: 11px; color: #0f0;
                    ">${JSON.stringify({
                        error: error.message,
                        stack: error.stack,
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent,
                        url: window.location.href
                    }, null, 2)}</pre>
                </details>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Modo de emergencia básico
        window.unifiedEmergencyMode = () => {
            errorDiv.remove();
            
            const emergencyDiv = document.createElement('div');
            emergencyDiv.innerHTML = `
                <div style="text-align: center; padding: 40px; color: white;">
                    <h2>🆘 Modo Básico Activado</h2>
                    <p>Funcionalidad limitada disponible</p>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-top: 20px;
                    ">Intentar Carga Completa</button>
                </div>
            `;
            document.body.appendChild(emergencyDiv);
        };
    }
    
    static setupLegacyCompatibility(core) {
        console.log('🔄 Configurando compatibilidad legacy...');
        
        // Funciones legacy compatibles
        if (!window.mostrarMensajeFlotante) {
            window.mostrarMensajeFlotante = (msg, duration, type) => {
                return core.messageManager.show(msg, type || 'info', duration || 3000);
            };
        }
        
        if (!window.showLoadingSpinner) {
            window.showLoadingSpinner = (id = 'global', options = {}) => {
                return core.loadingManager.show(id, options);
            };
        }
        
        if (!window.hideLoadingSpinner) {
            window.hideLoadingSpinner = (id = 'global') => {
                return core.loadingManager.hide(id);
            };
        }
        
        // Getters legacy para estados
        Object.defineProperties(window, {
            AppState: {
                get: () => core.stateManager.state.app
            },
            PlaylistState: {
                get: () => core.stateManager.state.playlist
            },
            SearchState: {
                get: () => core.stateManager.state.search
            },
            SponsorBlockState: {
                get: () => core.stateManager.state.sponsorBlock
            },
            UIState: {
                get: () => core.stateManager.state.ui
            }
        });
        
        console.log('✅ Compatibilidad legacy configurada');
    }
}

// ===== 9. FUNCIÓN DE INICIALIZACIÓN PRINCIPAL =====
async function initializeUnifiedYTCrossMix() {
    try {
        console.log('🎯 Iniciando sistema unificado completo...');
        
        const core = await UnifiedBootstrap.initialize();
        
        console.log('🎉 YT CrossMix Sistema Unificado cargado exitosamente');
        
        return core;
        
    } catch (error) {
        console.error('💥 Error fatal en sistema unificado:', error);
        
        // ✅ NUEVO: No re-lanzar error para evitar crash total
        console.log('🆘 Intentando continuar con funcionalidad básica...');
        
        // Crear interfaz básica de emergencia
        window.unifiedMessageManager = new UnifiedMessageManager();
        window.unifiedMessageManager.show('⚠️ Sistema en modo limitado', 'warning', 8000);
        
        // Habilitar al menos los botones básicos
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        
        if (playButton) {
            playButton.disabled = false;
            playButton.onclick = () => {
                window.unifiedMessageManager.show('Función no disponible en modo limitado', 'warning');
            };
        }
        
        if (nextButton) {
            nextButton.disabled = false;
            nextButton.onclick = () => {
                window.unifiedMessageManager.show('Función no disponible en modo limitado', 'warning');
            };
        }
        
        return null; // Indicar que no se pudo cargar completamente
    }
}

// ===== 10. AUTO-INICIALIZACIÓN MEJORADA =====
console.log('🔄 Preparando auto-inicialización...');

// ✅ MEJORADO: Verificar condiciones previas más robusta
function performPreflightChecks() {
    const checks = {
        dom: document.readyState !== 'loading',
        windowDefined: typeof window !== 'undefined',
        bodyExists: !!document.body,
        fetchAPI: typeof fetch !== 'undefined',
        promiseSupport: typeof Promise !== 'undefined',
        esModuleSupport: typeof import !== 'undefined'
    };
    
    console.log('🔍 Preflight checks:', checks);
    
    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    
    return { checks, passed, total, success: passed === total };
}

// ✅ MEJORADO: Auto-inicialización con recovery
async function safeInitialize() {
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🎯 Intento de inicialización ${attempt}/${maxRetries}`);
            
            const preflight = performPreflightChecks();
            if (!preflight.success) {
                throw new Error(`Preflight falló: ${Object.entries(preflight.checks)
                    .filter(([_, passed]) => !passed)
                    .map(([check]) => check)
                    .join(', ')}`);
            }
            
            const core = await initializeUnifiedYTCrossMix();
            
            if (core) {
                console.log(`✅ Inicialización exitosa en intento ${attempt}`);
                return core;
            } else {
                throw new Error('Inicialización retornó null');
            }
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Intento ${attempt} falló:`, error.message);
            
            if (attempt < maxRetries) {
                const delay = attempt * 1000; // Incrementar delay
                console.log(`⏳ Esperando ${delay}ms antes del siguiente intento...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // Si todos los intentos fallaron
    console.error('💀 Todos los intentos de inicialización fallaron');
    console.error('💀 Último error:', lastError);
    
    // Activar modo de supervivencia
    UnifiedBootstrap.activateSurvivalMode(lastError);
}

// ✅ NUEVO: Modo de supervivencia
UnifiedBootstrap.activateSurvivalMode = function(lastError) {
    console.log('🆘 Activando modo de supervivencia...');
    
    // Crear mensaje manager básico
    window.unifiedMessageManager = {
        show: (message, type = 'info', duration = 3000) => {
            console.log(`[${type.toUpperCase()}] ${message}`);
            
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 10001;
                background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#4caf50'};
                color: white; padding: 12px 20px; border-radius: 6px;
                font-size: 14px; max-width: 300px;
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, duration);
        }
    };
    
    // Mensaje inicial
    window.unifiedMessageManager.show('🆘 YT CrossMix en modo supervivencia', 'warning', 10000);
    
    // Configurar botones básicos
    const playButton = document.getElementById('botonPlay');
    if (playButton) {
        playButton.disabled = false;
        playButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        playButton.title = 'Sistema no disponible';
        playButton.onclick = () => {
            window.unifiedMessageManager.show('Sistema no cargado completamente. Recarga la página.', 'error');
        };
    }
    
    // Botón de recarga en header
    const topBar = document.querySelector('.top-bar .user-actions');
    if (topBar) {
        const reloadBtn = document.createElement('button');
        reloadBtn.innerHTML = '<i class="fas fa-redo"></i> Recargar';
        reloadBtn.className = 'control-btn emergency-reload';
        reloadBtn.style.cssText = 'background: #ff6b35; color: white;';
        reloadBtn.onclick = () => location.reload();
        topBar.prepend(reloadBtn);
    }
    
    console.log('🆘 Modo supervivencia activado');
};

// Auto-inicialización inteligente con recovery
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(safeInitialize, 100);
    });
} else {
    // DOM ya listo
    setTimeout(safeInitialize, 100);
}

// ===== 11. EXPORTS Y COMPATIBILIDAD =====
// Para usar como módulo ES6
export {
    CONFIG,
    UnifiedStateManager,
    UnifiedLoadingManager,
    UnifiedMessageManager,
    UnifiedYouTubeManager,
    UnifiedModuleLoader,
    UnifiedYTCrossMixCore,
    UnifiedBootstrap,
    initializeUnifiedYTCrossMix
};

// Para compatibilidad con scripts tradicionales
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        UnifiedStateManager,
        UnifiedLoadingManager,
        UnifiedMessageManager,
        UnifiedYouTubeManager,
        UnifiedModuleLoader,
        UnifiedYTCrossMixCore,
        UnifiedBootstrap,
        initializeUnifiedYTCrossMix
    };
}

// ===== 12. HELPERS GLOBALES DE DESARROLLO MEJORADOS =====
if (CONFIG.DEBUG_MODE) {
    console.log('🔧 Modo desarrollo activado');
    
    // Helpers de debug globales
    window.YTCM_DEBUG = {
        core: () => window.ytCrossMixUnified,
        state: () => window.unifiedStateManager?.state,
        health: () => window.ytCrossMixUnified?.performHealthCheck(),
        reset: () => window.resetUnified?.(),
        modules: () => window.ytCrossMixUnified?.moduleLoader?.loaded,
        config: CONFIG,
        
        // ✅ NUEVO: Helpers de recuperación
        recovery: {
            fixUI: async () => {
                console.log('🔧 Intentando arreglar UI...');
                try {
                    if (window.ytCrossMixUnified?.moduleLoader) {
                        await window.ytCrossMixUnified.moduleLoader.createUIFallback();
                        window.unifiedMessageManager?.show('UI reparado con fallback', 'success');
                    }
                } catch (e) {
                    console.error('Error en fixUI:', e);
                }
            },
            
            fixPlaylist: () => {
                console.log('🔧 Intentando arreglar PlaylistManager...');
                try {
                    if (!window.PlaylistManager) {
                        window.PlaylistManager = {
                            getQueueInfo: () => ({ exists: false, count: 0, videos: [] }),
                            initializeManualPlaylist: () => console.log('Emergency playlist init'),
                            addVideoToManualPlaylist: () => null
                        };
                        console.log('✅ PlaylistManager de emergencia creado');
                    }
                } catch (e) {
                    console.error('Error en fixPlaylist:', e);
                }
            },
            
            forceReload: () => {
                if (confirm('¿Forzar recarga completa? Se perderán datos no guardados.')) {
                    localStorage.clear();
                    sessionStorage.clear();
                    location.reload(true);
                }
            }
        },
        
        // Shortcuts para testing
        testMessage: (type = 'info') => {
            window.showMessage(`Test message ${Date.now()}`, type, 3000);
        },
        
        testLoading: () => {
            const id = 'test-' + Date.now();
            window.showLoading(id, { message: 'Testing loading...' });
            setTimeout(() => window.hideLoading(id), 2000);
        },
        
        simulate: {
            error: () => {
                throw new Error('Test error for debugging');
            },
            
            offline: () => {
                window.dispatchEvent(new Event('offline'));
            },
            
            online: () => {
                window.dispatchEvent(new Event('online'));
            },
            
            moduleFailure: (moduleName) => {
                console.log(`🧪 Simulando fallo de módulo: ${moduleName}`);
                if (window.ytCrossMixUnified?.moduleLoader) {
                    window.ytCrossMixUnified.moduleLoader.errors.set(moduleName, new Error('Simulated failure'));
                }
            }
        }
    };
    
    // Keyboard shortcuts para debug mejorados
    document.addEventListener('keydown', (e) => {
        // Ctrl + Shift + D = Debug
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            window.debugUnified?.();
        }
        
        // Ctrl + Shift + R = Reset
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            window.resetUnified?.();
        }
        
        // Ctrl + Shift + H = Health Check
        if (e.ctrlKey && e.shiftKey && e.key === 'H') {
            e.preventDefault();
            console.log('Health:', window.YTCM_DEBUG.health());
        }
        
        // Ctrl + Shift + S = State
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            console.log('State:', window.YTCM_DEBUG.state());
        }
        
        // Ctrl + Shift + M = Test Message
        if (e.ctrlKey && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            window.YTCM_DEBUG.testMessage(['info', 'success', 'warning', 'error'][Math.floor(Math.random() * 4)]);
        }
        
        // Ctrl + Shift + L = Test Loading
        if (e.ctrlKey && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            window.YTCM_DEBUG.testLoading();
        }
        
        // ✅ NUEVO: Ctrl + Shift + E = Emergency Recovery
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            console.log('🆘 Activando recuperación de emergencia...');
            window.YTCM_DEBUG.recovery.fixUI();
            window.YTCM_DEBUG.recovery.fixPlaylist();
        }
        
        // ✅ NUEVO: Ctrl + Shift + F = Force Reload
        if (e.ctrlKey && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            window.YTCM_DEBUG.recovery.forceReload();
        }
    });
    
    console.log('🔧 Debug helpers disponibles en window.YTCM_DEBUG');
    console.log('🎯 Shortcuts: Ctrl+Shift+D(Debug) R(Reset) H(Health) S(State) M(Message) L(Loading) E(Emergency) F(ForceReload)');
}

// ===== 13. LOGGING Y MÉTRICAS MEJORADAS =====
const startTime = performance.now();

window.addEventListener('ytcrossmix:unified:ready', (e) => {
    const loadTime = performance.now() - startTime;
    
    console.log(`🎉 YT CrossMix cargado en ${loadTime.toFixed(2)}ms`);
    
    // Métricas detalladas
    const metrics = {
        loadTime,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        core: e.detail,
        // ✅ NUEVO: Métricas de módulos
        modules: {
            total: e.detail.modules?.total || 0,
            success: e.detail.modules?.success || 0,
            failed: e.detail.modules?.failed || 0,
            fallbacks: e.detail.modules?.fallbacks?.length || 0
        },
        browser: {
            name: navigator.userAgent.includes('Chrome') ? 'Chrome' : 
                  navigator.userAgent.includes('Firefox') ? 'Firefox' :
                  navigator.userAgent.includes('Safari') ? 'Safari' : 'Other',
            mobile: window.innerWidth <= 768,
            online: navigator.onLine
        }
    };
    
    // Guardar métricas para debug
    window.YTCM_METRICS = metrics;
    
    if (CONFIG.DEBUG_MODE) {
        console.table({
            'Load Time': `${loadTime.toFixed(2)}ms`,
            'Modules Success': `${metrics.modules.success}/${metrics.modules.total}`,
            'Fallbacks': metrics.modules.fallbacks,
            'Failed': metrics.modules.failed,
            'Viewport': `${metrics.viewport.width}x${metrics.viewport.height}`,
            'Device': metrics.browser.mobile ? 'Mobile' : 'Desktop',
            'Browser': metrics.browser.name
        });
    }
    
    // ✅ NUEVO: Enviar métricas al estado
    if (window.unifiedStateManager) {
        window.unifiedStateManager.set('app.metrics', metrics);
    }
});

// ===== 14. LIMPIEZA AL DESCARGAR =====
window.addEventListener('beforeunload', (e) => {
    if (window.ytCrossMixUnified) {
        console.log('🧹 Limpiando antes de descargar...');
        window.ytCrossMixUnified.cleanup();
    }
});

// ===== 15. FUNCIONES GLOBALES DE DEBUG MEJORADAS =====
if (typeof window !== 'undefined') {
    // Debug function mejorada
    window.debugUnified = function() {
        if (window.ytCrossMixUnified) {
            return window.ytCrossMixUnified.debug();
        } else {
            console.error('❌ Sistema unificado no disponible');
            
            // Debug básico sin core
            const basicDebug = {
                error: 'Sistema no inicializado',
                timestamp: Date.now(),
                available: {
                    UIManager: !!window.UIManager,
                    PlaylistManager: !!window.PlaylistManager,
                    PlaybackController: !!window.PlaybackController,
                    authManager: !!window.authManager,
                    unifiedStateManager: !!window.unifiedStateManager
                },
                dom: {
                    botonPlay: !!document.getElementById('botonPlay'),
                    botonNext: !!document.getElementById('botonNext'),
                    queueButton: !!document.getElementById('queueButton'),
                    playlistsGrid: !!document.getElementById('playlistsGrid')
                }
            };
            
            console.log('🔍 Debug básico:', basicDebug);
            return basicDebug;
        }
    };
    
    // Reset function mejorada
    window.resetUnified = function() {
        if (window.ytCrossMixUnified) {
            window.ytCrossMixUnified.reset();
        } else {
            console.error('❌ Sistema unificado no disponible para reset');
            
            if (confirm('Sistema no disponible. ¿Recargar página?')) {
                location.reload();
            }
        }
    };
    
    // Quick status function mejorada
    window.statusUnified = function() {
        const status = {
            initialized: !!window.ytCrossMixUnified?.initialized,
            initType: window.ytCrossMixUnified?.initialized,
            modules: {
                search: !!window.SearchManager,
                playback: !!window.PlaybackController,
                ui: !!window.UIManager,
                playlist: !!window.PlaylistManager,
                auth: !!window.authManager
            },
            queue: window.PlaylistManager?.getQueueInfo?.() || null,
            players: window.ytCrossMixUnified?.youtubeManager?.playersReady || false,
            state: window.unifiedStateManager?.state ? 'available' : 'missing',
            // ✅ NUEVO: Estado de módulos
            moduleState: {
                loaded: Array.from(window.unifiedStateManager?.state?.modules?.loaded || []),
                failed: Array.from(window.unifiedStateManager?.state?.modules?.failed || []),
                fallbacks: Array.from(window.unifiedStateManager?.state?.modules?.loadedWithFallback || [])
            }
        };
        
        console.log('📊 Estado rápido:', status);
        return status;
    };
    
    // ✅ NUEVO: Función global para toggle debug
    window.toggleUnifiedDebug = function() {
        const debugPanel = document.getElementById('unifiedDebugPanel');
        const stateDebug = document.getElementById('unifiedStateDebug');
        
        if (debugPanel) {
            debugPanel.classList.toggle('show');
        }
        
        if (stateDebug) {
            stateDebug.classList.toggle('show');
        }
        
        // Actualizar contenido si se está mostrando
        if (debugPanel?.classList.contains('show') || stateDebug?.classList.contains('show')) {
            window.updateDebugPanels?.();
        }
    };
    
    // ✅ NUEVO: Función para diagnosticar problemas
    window.diagnoseUnified = function() {
        console.log('🔍 === DIAGNÓSTICO COMPLETO ===');
        
        const diagnosis = {
            timestamp: new Date().toISOString(),
            system: {
                core: !!window.ytCrossMixUnified,
                coreInitialized: window.ytCrossMixUnified?.initialized,
                stateManager: !!window.unifiedStateManager,
                messageManager: !!window.unifiedMessageManager,
                loadingManager: !!window.unifiedLoadingManager
            },
            modules: {
                ui: {
                    exists: !!window.UIManager,
                    methods: window.UIManager ? {
                        switchView: typeof window.UIManager.switchView === 'function',
                        updatePlaylistsUI: typeof window.UIManager.updatePlaylistsUI === 'function',
                        toggleQueue: typeof window.UIManager.toggleQueue === 'function'
                    } : null
                },
                playlist: {
                    exists: !!window.PlaylistManager,
                    methods: window.PlaylistManager ? {
                        getQueueInfo: typeof window.PlaylistManager.getQueueInfo === 'function',
                        initializeManualPlaylist: typeof window.PlaylistManager.initializeManualPlaylist === 'function',
                        addVideoToManualPlaylist: typeof window.PlaylistManager.addVideoToManualPlaylist === 'function'
                    } : null
                },
                search: {
                    exists: !!window.SearchManager,
                    methods: window.SearchManager ? {
                        performSearch: typeof window.SearchManager.performSearch === 'function'
                    } : null
                },
                playback: {
                    exists: !!window.PlaybackController,
                    methods: window.PlaybackController ? {
                        playFirstVideo: typeof window.PlaybackController.playFirstVideo === 'function',
                        playNextVideo: typeof window.PlaybackController.playNextVideo === 'function'
                    } : null
                },
                auth: {
                    exists: !!window.authManager,
                    authenticated: window.authManager?.isAuthenticated || false
                }
            },
            dom: {
                criticalElements: {
                    botonPlay: !!document.getElementById('botonPlay'),
                    botonNext: !!document.getElementById('botonNext'),
                    queueButton: !!document.getElementById('queueButton'),
                    playlistsGrid: !!document.getElementById('playlistsGrid'),
                    player1: !!document.getElementById('player1'),
                    player2: !!document.getElementById('player2')
                },
                views: {
                    homeView: !!document.getElementById('homeView'),
                    searchView: !!document.getElementById('searchView'),
                    libraryView: !!document.getElementById('libraryView'),
                    playingView: !!document.getElementById('playingView')
                }
            },
            state: window.unifiedStateManager?.state ? {
                appState: !!window.unifiedStateManager.state.app,
                playlistState: !!window.unifiedStateManager.state.playlist,
                uiState: !!window.unifiedStateManager.state.ui,
                playersInitialized: window.unifiedStateManager.state.app?.playersInitialized,
                currentView: window.unifiedStateManager.state.ui?.currentView,
                playlistCount: window.unifiedStateManager.state.playlist?.playlistsData?.length
            } : null,
            errors: window.ytCrossMixUnified?.moduleLoader?.errors ? 
                Object.fromEntries(window.ytCrossMixUnified.moduleLoader.errors) : {},
            performance: {
                loadTime: window.YTCM_METRICS?.loadTime,
                memoryUsage: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : 'no disponible'
            }
        };
        
        console.log('🔍 Diagnóstico:', diagnosis);
        
        // Resumen ejecutivo
        const issues = [];
        if (!diagnosis.system.core) issues.push('Core no disponible');
        if (!diagnosis.system.coreInitialized) issues.push('Core no inicializado');
        if (!diagnosis.modules.ui.exists) issues.push('UIManager no disponible');
        if (!diagnosis.modules.playlist.exists) issues.push('PlaylistManager no disponible');
        if (!diagnosis.dom.criticalElements.botonPlay) issues.push('Botón Play no encontrado');
        if (!diagnosis.dom.criticalElements.botonNext) issues.push('Botón Next no encontrado');
        
        console.log('⚠️ Problemas encontrados:', issues.length > 0 ? issues : 'Ninguno');
        
        if (issues.length > 0) {
            console.log('🔧 Sugerencias:');
            if (issues.some(i => i.includes('Core'))) {
                console.log('   - Recargar página: location.reload()');
            }
            if (issues.some(i => i.includes('UIManager'))) {
                console.log('   - Reparar UI: window.YTCM_DEBUG.recovery.fixUI()');
            }
            if (issues.some(i => i.includes('PlaylistManager'))) {
                console.log('   - Reparar Playlist: window.YTCM_DEBUG.recovery.fixPlaylist()');
            }
        }
        
        return diagnosis;
    };
}

// ===== 16. MONITOREO DE RENDIMIENTO =====
if (typeof window !== 'undefined') {
    // ✅ NUEVO: Monitor de rendimiento
    window.performanceMonitor = {
        start: Date.now(),
        
        checkMemory: () => {
            if (performance.memory) {
                const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                const total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
                
                console.log(`💾 Memoria: ${used}MB usado de ${total}MB`);
                
                if (used > 100) {
                    console.warn('⚠️ Alto uso de memoria detectado');
                    window.unifiedMessageManager?.show('Alto uso de memoria', 'warning', 2000);
                }
                
                return { used, total };
            }
            return null;
        },
        
        checkLoadTimes: () => {
            const navigation = performance.getEntriesByType('navigation')[0];
            if (navigation) {
                console.log('⏱️ Tiempos de carga:', {
                    domComplete: Math.round(navigation.domComplete),
                    loadComplete: Math.round(navigation.loadEventEnd),
                    firstPaint: Math.round(navigation.responseStart)
                });
            }
        },
        
        monitor: () => {
            setInterval(() => {
                window.performanceMonitor.checkMemory();
            }, 60000); // Cada minuto
        }
    };
    
    // Iniciar monitoreo en desarrollo
    if (CONFIG.DEBUG_MODE) {
        setTimeout(() => {
            window.performanceMonitor.monitor();
        }, 5000);
    }
}

// ===== 17. CLEANUP Y REFERENCIAS GLOBALES FINALES =====
if (typeof window !== 'undefined') {
    // ✅ REFERENCIAS GLOBALES PARA DEBUG (mejoradas)
    window.debugUnified = function() {
        if (window.ytCrossMixUnified) {
            return window.ytCrossMixUnified.debug();
        } else {
            console.error('❌ Sistema unificado no disponible');
            return window.diagnoseUnified?.() || { error: 'Sistema no inicializado' };
        }
    };
    
    window.resetUnified = function() {
        if (window.ytCrossMixUnified) {
            window.ytCrossMixUnified.reset();
        } else {
            console.error('❌ Sistema unificado no disponible para reset');
            if (confirm('¿Recargar página?')) {
                location.reload();
            }
        }
    };
    
    window.statusUnified = function() {
        const status = {
            initialized: !!window.ytCrossMixUnified?.initialized,
            modules: {
                search: !!window.SearchManager,
                playback: !!window.PlaybackController,
                ui: !!window.UIManager,
                playlist: !!window.PlaylistManager
            },
            queue: window.PlaylistManager?.getQueueInfo?.() || null,
            players: window.ytCrossMixUnified?.youtubeManager?.playersReady || false
        };
        
        console.log('📊 Estado rápido:', status);
        return status;
    };
    
    // ✅ NUEVO: Recovery functions
    window.emergencyRecovery = function() {
        console.log('🆘 Ejecutando recuperación de emergencia...');
        
        try {
            // Recrear managers básicos
            if (!window.unifiedMessageManager) {
                window.unifiedMessageManager = new UnifiedMessageManager();
            }
            
            if (!window.unifiedLoadingManager) {
                window.unifiedLoadingManager = new UnifiedLoadingManager();
            }
            
            // Recrear UIManager básico
            if (!window.UIManager) {
                window.UIManager = {
                    switchView: (view) => {
                        const views = document.querySelectorAll('.content-view');
                        views.forEach(v => v.classList.remove('active'));
                        const target = document.getElementById(`${view}View`);
                        if (target) target.classList.add('active');
                    },
                    updatePlaylistsUI: () => console.log('🔄 Emergency UI update'),
                    toggleQueue: () => {
                        const queue = document.getElementById('queueSection');
                        if (queue) queue.classList.toggle('hidden');
                    }
                };
            }
            
            // Habilitar botones básicos
            const playButton = document.getElementById('botonPlay');
            const nextButton = document.getElementById('botonNext');
            
            if (playButton) {
                playButton.disabled = false;
                playButton.onclick = () => {
                    window.unifiedMessageManager.show('Función limitada en modo emergencia', 'warning');
                };
            }
            
            if (nextButton) {
                nextButton.disabled = false;
                nextButton.onclick = () => {
                    window.unifiedMessageManager.show('Función limitada en modo emergencia', 'warning');
                };
            }
            
            window.unifiedMessageManager.show('🆘 Recuperación de emergencia completada', 'warning', 5000);
            
            console.log('✅ Recuperación de emergencia completada');
            return true;
            
        } catch (recoveryError) {
            console.error('💥 Recuperación de emergencia falló:', recoveryError);
            return false;
        }
    };
}

console.log('✅ CORE.JS VERSIÓN CORREGIDA - Manejo robusto de errores de módulos');
console.log('⚡ YT CrossMix Sistema Unificado Completo - Preparado con Recovery');
console.log('📋 Configuración:', CONFIG);
console.log('🚀 Inicialización automática con retry logic en progreso...');

// ===== 18. VALIDACIONES FINALES =====
// Verificar que todas las clases están definidas correctamente
const requiredClasses = [
    'UnifiedStateManager',
    'UnifiedLoadingManager', 
    'UnifiedMessageManager',
    'UnifiedYouTubeManager',
    'UnifiedModuleLoader',
    'UnifiedYTCrossMixCore',
    'UnifiedBootstrap'
];

const missingClasses = requiredClasses.filter(className => {
    try {
        return typeof eval(className) !== 'function';
    } catch (e) {
        return true;
    }
});

if (missingClasses.length > 0) {
    console.error('❌ Clases faltantes:', missingClasses);
} else {
    console.log('✅ Todas las clases definidas correctamente');
}

// ===== 19. INFORMACIÓN DE VERSIÓN =====
const UNIFIED_SYSTEM_INFO = {
    version: '2.1.0',
    build: Date.now(),
    features: [
        'Sistema Unificado de Estados',
        'Carga de Módulos con Fallbacks',
        'Recuperación de Errores Automática',
        'Modo de Emergencia',
        'Debug Tools Avanzados',
        'Monitoreo de Rendimiento',
        'Gestión Robusta de Errores'
    ],
    compatibility: {
        es6Modules: true,
        asyncAwait: true,
        fetchAPI: true,
        promiseSupport: true
    }
};

window.UNIFIED_SYSTEM_INFO = UNIFIED_SYSTEM_INFO;

console.log('📊 Sistema Unificado Info:', UNIFIED_SYSTEM_INFO);
console.log('🎯 Sistema preparado para auto-inicialización robusta...');
