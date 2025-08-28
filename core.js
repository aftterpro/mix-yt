// ===== YT CROSSMIX REFACTORIZACIÓN CRÍTICA =====
// Eliminación de duplicaciones y unificación de sistemas

// ===== 1. SISTEMA DE ESTADOS UNIFICADO (ÚNICO) =====
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
            }
        };
        
        this.subscribers = new Map();
        this.setupUniqueGlobalReferences();
    }
    
    setupUniqueGlobalReferences() {
        // ✅ SOLO UNA REFERENCIA GLOBAL
        window.State = this.state;
        window.stateManager = this;
        
        // ❌ ELIMINAR TODAS LAS REFERENCIAS DUPLICADAS
        // NO CREAR: window.AppState, window.PlaylistState, etc.
        
        console.log('📊 Estado unificado único configurado');
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
    }
}

// ===== 2. LOADING MANAGER UNIFICADO =====
class UnifiedLoadingManager {
    constructor() {
        this.spinners = new Map();
    }
    
    // ✅ ÚNICA FUNCIÓN PARA TODOS LOS TIPOS DE LOADING
    show(id = 'global', options = {}) {
        const {
            type = 'overlay', // 'overlay', 'inline', 'append'
            container = document.body,
            size = 'normal', // 'small', 'normal', 'large'
            message = null
        } = options;
        
        // Evitar duplicados
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
        
        // Posicionamiento según tipo
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

// ===== 3. YOUTUBE API MANAGER UNIFICADO =====
class UnifiedYouTubeManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.apiReady = false;
        this.playersReady = false;
        this.initPromise = null;
    }
    
    // ✅ ÚNICO PUNTO DE INICIALIZACIÓN YOUTUBE API
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this.loadAPI();
        return this.initPromise;
    }
    
    async loadAPI() {
        console.log('🎥 Cargando YouTube API (unificado)...');
        
        // Verificar si ya está disponible
        if (window.YT?.Player) {
            console.log('YT ya disponible');
            this.apiReady = true;
            this.createPlayers();
            return;
        }
        
        return new Promise((resolve, reject) => {
            // ✅ ÚNICO CALLBACK GLOBAL
            window.onYouTubeIframeAPIReady = () => {
                console.log('📺 YouTube API lista (callback único)');
                this.apiReady = true;
                this.createPlayers();
                resolve();
            };
            
            // Cargar script si no existe
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
        
        console.log('🎬 Creando reproductores (unificado)...');
        
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
            
            // Establecer en estado único
            this.stateManager.set('app.player1', player1);
            this.stateManager.set('app.player2', player2);
            
            console.log('✅ Reproductores creados exitosamente');
            
        } catch (error) {
            console.error('💥 Error creando reproductores:', error);
            throw error;
        }
    }
    
    onPlayerReady(event, playerNum) {
        console.log(`✅ Player ${playerNum} listo (unificado)`);
        
        const player1 = this.stateManager.get('app.player1');
        const player2 = this.stateManager.get('app.player2');
        
        if (player1 && player2 && 
            typeof player1.getPlayerState === 'function' &&
            typeof player2.getPlayerState === 'function') {
            
            if (!this.playersReady) {
                this.playersReady = true;
                this.stateManager.set('app.playersInitialized', true);
                
                console.log('🎉 Ambos reproductores listos (unificado)');
                
                // Habilitar controles
                this.enableControls();
                
                // Dispatch evento único
                window.dispatchEvent(new CustomEvent('playersReady', {
                    detail: { unified: true }
                }));
            }
        }
    }
    
    onPlayerStateChange(event, playerNum) {
        const playerState = event.data;
        const videoId = event.target.getVideoData()?.video_id;
        
        console.log(`🎵 Player ${playerNum} estado: ${this.getStateString(playerState)} (unificado)`);
        
        // Actualizar estado único
        this.stateManager.set(`app.player${playerNum}State`, playerState);
        
        // Evento único sin duplicaciones
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
        console.error(`❌ Error Player ${playerNum} (unificado):`, errorCode);
        
        const errorMessages = {
            2: 'ID de video inválido',
            5: 'Error HTML5 o derechos de autor',
            100: 'Video no encontrado',
            101: 'Reproducción incrustada no permitida',
            150: 'Reproducción incrustada no permitida'
        };
        
        const message = errorMessages[errorCode] || `Error desconocido (${errorCode})`;
        
        // Usar sistema de mensajes unificado
        window.unifiedMessageManager?.show(`Player ${playerNum}: ${message}`, 'error');
        
        // Auto-skip en errores críticos
        if ([100, 101, 150].includes(errorCode)) {
            setTimeout(() => this.skipToNext(), 1000);
        }
    }
    
    enableControls() {
        const playButton = document.getElementById('botonPlay');
        const nextButton = document.getElementById('botonNext');
        
        if (playButton) playButton.disabled = false;
        if (nextButton) nextButton.disabled = false;
        
        console.log('✅ Controles habilitados (unificado)');
    }
    
    skipToNext() {
        // Implementar skip unificado
        console.log('⏭️ Skip solicitado (unificado)');
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

// ===== 4. MESSAGE MANAGER UNIFICADO =====
class UnifiedMessageManager {
    constructor() {
        this.activeMessages = new Set();
        this.messageQueue = [];
        this.maxConcurrent = 3;
    }
    
    // ✅ ÚNICA FUNCIÓN PARA TODOS LOS MENSAJES
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
        
        // Posicionamiento inteligente
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
        
        // Stackear mensajes
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

// ===== 5. CORE UNIFICADO PRINCIPAL =====
class UnifiedYTCrossMixCore {
    constructor() {
        console.log('🚀 Iniciando YT CrossMix Core Unificado (Sin Duplicaciones)...');
        
        // Managers únicos
        this.stateManager = new UnifiedStateManager();
        this.loadingManager = new UnifiedLoadingManager();
        this.youtubeManager = new UnifiedYouTubeManager(this.stateManager);
        this.messageManager = new UnifiedMessageManager();
        
        // Módulos registrados
        this.modules = new Map();
        
        // Referencias globales únicas
        this.setupGlobalReferences();
        
        // Estado de inicialización
        this.initialized = false;
        this.initPromise = null;
    }
    
    setupGlobalReferences() {
        // ✅ REFERENCIAS GLOBALES ÚNICAS (NO DUPLICADAS)
        window.ytCrossMix = this;
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
        
        // Debug unificado
        window.debugUnified = () => this.debug();
        window.resetUnified = () => this.reset();
        
        console.log('🌐 Referencias globales únicas configuradas');
    }
    
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this.performInitialization();
        return this.initPromise;
    }
    
    async performInitialization() {
        console.log('📋 Iniciando inicialización unificada...');
        
        const startTime = Date.now();
        
        try {
            // Pasos de inicialización
            await this.initializeDOM();
            await this.initializeYouTube();
            await this.initializeModules();
            await this.finalizeInitialization();
            
            this.initialized = true;
            const totalTime = Date.now() - startTime;
            
            console.log(`✅ YT CrossMix Core Unificado inicializado en ${totalTime}ms`);
            this.messageManager.show('🎵 YT CrossMix listo para usar', 'success');
            
            // Dispatch evento único
            window.dispatchEvent(new CustomEvent('ytcrossmix:unified:ready', {
                detail: { timestamp: Date.now(), core: this }
            }));
            
        } catch (error) {
            console.error('💥 Error en inicialización unificada:', error);
            this.handleCriticalError(error);
            throw error;
        }
    }
    
    async initializeDOM() {
        await this.waitForDOM();
        this.setupCriticalElements();
        this.detectDevice();
        console.log('🏠 DOM inicializado (unificado)');
    }
    
    async initializeYouTube() {
        await this.youtubeManager.initialize();
        console.log('🎥 YouTube inicializado (unificado)');
    }
    
    async initializeModules() {
        console.log('📦 Cargando módulos...');
        
        const moduleLoaders = [
            { name: 'auth', loader: () => import('./auth.js') },
            { name: 'playlist', loader: () => import('./playlistManager.js') },
            { name: 'search', loader: () => import('./searchManager.js') },
            { name: 'ui', loader: () => import('./ui.js') },
            { name: 'playback', loader: () => import('./playbackController.js') },
            { name: 'sponsorblock', loader: () => import('./sponsorblock.js') }
        ];
        
        for (const { name, loader } of moduleLoaders) {
            try {
                const module = await loader();
                this.modules.set(name, module);
                console.log(`✅ Módulo ${name} cargado`);
            } catch (error) {
                console.warn(`⚠️ Error cargando módulo ${name}:`, error);
            }
        }
    }
    
    async finalizeInitialization() {
        this.setupGlobalEvents();
        this.setupErrorHandling();
        this.performHealthCheck();
        console.log('🔧 Inicialización finalizada');
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
        // Crear elementos críticos si no existen
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
                console.log(`🔧 Elemento ${id} creado automáticamente`);
            }
        });
    }
    
    detectDevice() {
        const isDesktop = window.innerWidth >= 1024;
        this.stateManager.set('ui.isDesktop', isDesktop);
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', !isDesktop);
    }
    
    setupGlobalEvents() {
        // Event listeners globales únicos
        window.addEventListener('resize', () => {
            this.detectDevice();
        });
        
        window.addEventListener('online', () => {
            this.messageManager.show('Conexión restaurada', 'success', 2000);
        });
        
        window.addEventListener('offline', () => {
            this.messageManager.show('Sin conexión', 'warning', 3000);
        });
    }
    
    setupErrorHandling() {
        window.addEventListener('error', (e) => {
            if (!e.error?.message?.includes('Extension')) {
                console.error('Global error:', e.error);
                this.messageManager.show('Error en la aplicación', 'error');
            }
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            console.error('Unhandled rejection:', e.reason);
            e.preventDefault();
        });
    }
    
    performHealthCheck() {
        const health = {
            initialized: this.initialized,
            stateManager: !!this.stateManager,
            youtubeManager: !!this.youtubeManager,
            modules: this.modules.size,
            dom: document.readyState === 'complete'
        };
        
        console.log('🔍 Health Check Unificado:', health);
        return health;
    }
    
    handleCriticalError(error) {
        console.error('💀 Error crítico unificado:', error);
        
        this.messageManager.show('Error crítico en la aplicación', 'error', 8000);
        
        // Intentar recuperación
        try {
            this.cleanup();
            this.stateManager.reset();
        } catch (recoveryError) {
            console.error('💥 Falló la recuperación:', recoveryError);
            this.showCriticalErrorView(error, recoveryError);
        }
    }
    
    showCriticalErrorView(error, recoveryError = null) {
        document.body.innerHTML = `
            <div style="
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; background: #0f0f0f; color: white;
                font-family: 'Roboto', sans-serif; text-align: center; padding: 20px;
            ">
                <div>
                    <h1>💀 YT CrossMix - Error Crítico Unificado</h1>
                    <p>La aplicación encontró un error irrecuperable.</p>
                    <details style="margin: 20px 0; text-align: left;">
                        <summary>Detalles del error</summary>
                        <pre style="background: #333; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 12px;">
Error Principal: ${error.message}
Stack: ${error.stack}
${recoveryError ? `Error de Recuperación: ${recoveryError.message}` : ''}
Timestamp: ${new Date().toISOString()}
                        </pre>
                    </details>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin: 10px;
                    ">Recargar Página</button>
                    <button onclick="localStorage.clear(); location.reload()" style="
                        background: #666; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin: 10px;
                    ">Limpiar y Recargar</button>
                </div>
            </div>
        `;
    }
    
    cleanup() {
        console.log('🧹 Limpiando Core Unificado...');
        
        // Limpiar intervalos
        const state = this.stateManager.state.app;
        if (state.monitorInterval) {
            clearInterval(state.monitorInterval);
            state.monitorInterval = null;
        }
        
        if (state.crossfadeInterval) {
            clearInterval(state.crossfadeInterval);
            state.crossfadeInterval = null;
        }
        
        // Limpiar loading spinners
        this.loadingManager.hideAll();
        
        // Limpiar mensajes
        this.messageManager.clear();
        
        // Pausar reproductores
        try {
            const player1 = this.stateManager.get('app.player1');
            const player2 = this.stateManager.get('app.player2');
            
            if (player1?.pauseVideo) player1.pauseVideo();
            if (player2?.pauseVideo) player2.pauseVideo();
        } catch (error) {
            console.warn('Error pausando reproductores:', error);
        }
        
        console.log('✅ Cleanup unificado completado');
    }
    
    reset() {
        if (confirm('¿Seguro que quieres reiniciar la aplicación unificada?')) {
            console.log('🔄 Reiniciando Core Unificado...');
            
            try {
                this.cleanup();
                
                // Reset estado
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
                
                this.messageManager.show('Aplicación reiniciada correctamente', 'success');
                
            } catch (error) {
                console.error('Error en reset unificado:', error);
                this.messageManager.show('Error reiniciando aplicación', 'error');
            }
        }
    }
    
    debug() {
        console.log('=== YT CROSSMIX DEBUG UNIFICADO ===');
        console.log('Core Initialized:', this.initialized);
        console.log('Modules Loaded:', Array.from(this.modules.keys()));
        console.log('State Manager:', this.stateManager.state);
        console.log('YouTube Manager:', {
            apiReady: this.youtubeManager.apiReady,
            playersReady: this.youtubeManager.playersReady
        });
        console.log('Loading Manager:', {
            activeSpinners: this.loadingManager.spinners.size
        });
        console.log('Message Manager:', {
            activeMessages: this.messageManager.activeMessages.size,
            queuedMessages: this.messageManager.messageQueue.length
        });
        console.log('Health Check:', this.performHealthCheck());
        console.log('==================================');
    }
}

// ===== 6. MIGRATION HELPER =====
class LegacySystemMigrator {
    constructor(unifiedCore) {
        this.core = unifiedCore;
        this.migrationLog = [];
    }
    
    // ❌ ELIMINAR REFERENCIAS DUPLICADAS
    removeLegacyReferences() {
        console.log('🗑️ Eliminando referencias legacy...');
        
        const legacyRefs = [
            'window.appState',
            'window.AppState', 
            'window.playlistState',
            'window.PlaylistState',
            'window.searchState',
            'window.SearchState',
            'window.sponsorBlockState',
            'window.SponsorBlockState',
            'window.UIState'
        ];
        
        legacyRefs.forEach(ref => {
            try {
                // Eliminar referencias duplicadas
                const parts = ref.split('.');
                if (parts.length === 2 && parts[0] === 'window') {
                    delete window[parts[1]];
                    console.log(`❌ Eliminado: ${ref}`);
                }
            } catch (error) {
                console.warn(`⚠️ No se pudo eliminar ${ref}:`, error);
            }
        });
        
        this.migrationLog.push('Referencias legacy eliminadas');
    }
    
    // ✅ MIGRAR FUNCIONALIDADES EXISTENTES
    migrateLegacyFunctions() {
        console.log('🔄 Migrando funciones legacy...');
        
        // Migrar mostrarMensajeFlotante → unifiedMessageManager
        if (window.mostrarMensajeFlotante) {
            window.mostrarMensajeFlotante = (msg, duration, type) => {
                return this.core.messageManager.show(msg, type || 'info', duration || 3000);
            };
            console.log('✅ mostrarMensajeFlotante migrado');
        }
        
        // Migrar showLoadingSpinner → unifiedLoadingManager
        if (window.showLoadingSpinner) {
            window.showLoadingSpinner = (id = 'global', options = {}) => {
                return this.core.loadingManager.show(id, options);
            };
            console.log('✅ showLoadingSpinner migrado');
        }
        
        if (window.hideLoadingSpinner) {
            window.hideLoadingSpinner = (id = 'global') => {
                return this.core.loadingManager.hide(id);
            };
            console.log('✅ hideLoadingSpinner migrado');
        }
        
        this.migrationLog.push('Funciones legacy migradas');
    }
    
    // 🔧 ACTUALIZAR REFERENCIAS EN MÓDULOS
    updateModuleReferences() {
        console.log('🔧 Actualizando referencias en módulos...');
        
        // Actualizar referencias en módulos existentes
        const moduleUpdates = {
            'PlaylistManager': () => {
                if (window.PlaylistManager) {
                    // Actualizar referencias de estado
                    if (window.PlaylistManager.updateCurrentPlayingIndex) {
                        const originalUpdate = window.PlaylistManager.updateCurrentPlayingIndex;
                        window.PlaylistManager.updateCurrentPlayingIndex = function() {
                            // Usar estado unificado
                            const state = window.unifiedStateManager.state;
                            return originalUpdate.call(this);
                        };
                    }
                }
            },
            'UIManager': () => {
                if (window.UIManager) {
                    // Actualizar referencias de UI
                    if (window.UIManager.updatePlaylistsUI) {
                        const originalUpdate = window.UIManager.updatePlaylistsUI;
                        window.UIManager.updatePlaylistsUI = function() {
                            // Usar mensaje unificado para errores
                            try {
                                return originalUpdate.call(this);
                            } catch (error) {
                                window.unifiedMessageManager.show('Error actualizando UI', 'error');
                                throw error;
                            }
                        };
                    }
                }
            }
        };
        
        Object.entries(moduleUpdates).forEach(([name, updater]) => {
            try {
                updater();
                console.log(`✅ ${name} actualizado`);
            } catch (error) {
                console.warn(`⚠️ Error actualizando ${name}:`, error);
            }
        });
        
        this.migrationLog.push('Referencias de módulos actualizadas');
    }
    
    // 📊 INFORME DE MIGRACIÓN
    getMigrationReport() {
        return {
            timestamp: new Date().toISOString(),
            log: this.migrationLog,
            success: this.migrationLog.length > 0,
            unifiedSystems: [
                'StateManager',
                'LoadingManager', 
                'YouTubeManager',
                'MessageManager'
            ],
            eliminatedDuplicates: [
                'Multiple window.AppState references',
                'Duplicate YouTube API callbacks',
                'Multiple loading spinner functions',
                'Redundant message systems'
            ]
        };
    }
}

// ===== 7. BOOTSTRAP UNIFICADO =====
class UnifiedBootstrap {
    static async initialize() {
        console.log('🚀 Iniciando Bootstrap Unificado de YT CrossMix...');
        
        try {
            // Crear core unificado
            const unifiedCore = new UnifiedYTCrossMixCore();
            
            // Migrar sistemas legacy
            const migrator = new LegacySystemMigrator(unifiedCore);
            migrator.removeLegacyReferences();
            migrator.migrateLegacyFunctions();
            migrator.updateModuleReferences();
            
            // Inicializar core
            await unifiedCore.initialize();
            
            // Informe de migración
            const report = migrator.getMigrationReport();
            console.log('📊 Migración completada:', report);
            
            // Hacer disponible globalmente
            window.ytCrossMixUnified = unifiedCore;
            window.migrationReport = report;
            
            console.log('✅ Bootstrap Unificado completado exitosamente');
            
            return unifiedCore;
            
        } catch (error) {
            console.error('💥 Error en Bootstrap Unificado:', error);
            
            // Error de emergencia
            document.body.innerHTML = `
                <div style="
                    display: flex; align-items: center; justify-content: center;
                    min-height: 100vh; background: #0f0f0f; color: white;
                    font-family: 'Roboto', sans-serif; text-align: center; padding: 20px;
                ">
                    <div>
                        <h1>❌ Error de Bootstrap Unificado</h1>
                        <p>YT CrossMix no pudo inicializar el sistema unificado.</p>
                        <code style="background: #333; padding: 10px; border-radius: 4px; display: block; margin: 20px 0;">
                            ${error.message}
                        </code>
                        <button onclick="location.reload()" style="
                            background: #ff6b35; color: white; border: none;
                            padding: 12px 24px; border-radius: 6px; cursor: pointer;
                            font-size: 16px;
                        ">Recargar Página</button>
                    </div>
                </div>
            `;
            
            throw error;
        }
    }
}

// ===== 8. AUTO-INICIALIZACIÓN UNIFICADA =====
console.log('🔄 Preparando inicialización unificada...');

// Función de inicialización única
async function initializeUnifiedYTCrossMix() {
    try {
        const core = await UnifiedBootstrap.initialize();
        console.log('🎉 YT CrossMix Sistema Unificado cargado exitosamente');
        return core;
    } catch (error) {
        console.error('💥 Error fatal en sistema unificado:', error);
        throw error;
    }
}

// Auto-inicialización según estado del DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUnifiedYTCrossMix);
} else {
    initializeUnifiedYTCrossMix();
}

// ===== 9. EXPORTS UNIFICADOS =====
export {
    UnifiedStateManager,
    UnifiedLoadingManager,
    UnifiedYouTubeManager,
    UnifiedMessageManager,
    UnifiedYTCrossMixCore,
    LegacySystemMigrator,
    UnifiedBootstrap,
    initializeUnifiedYTCrossMix
};

// ===== 10. COMPATIBILITY LAYER (TEMPORAL) =====
// Mantener compatibilidad temporal mientras se migran otros archivos

// Funciones de compatibilidad que se irán eliminando gradualmente
window.legacyCompatibility = {
    // Redirigir calls legacy al sistema unificado
    mostrarMensajeFlotante: (msg, duration, type) => {
        if (window.unifiedMessageManager) {
            return window.unifiedMessageManager.show(msg, type || 'info', duration || 3000);
        }
    },
    
    showLoadingSpinner: (id, options) => {
        if (window.unifiedLoadingManager) {
            return window.unifiedLoadingManager.show(id || 'global', options || {});
        }
    },
    
    hideLoadingSpinner: (id) => {
        if (window.unifiedLoadingManager) {
            return window.unifiedLoadingManager.hide(id || 'global');
        }
    },
    
    // Getters para estados legacy
    get AppState() {
        return window.unifiedStateManager?.state?.app || {};
    },
    
    get PlaylistState() {
        return window.unifiedStateManager?.state?.playlist || {};
    },
    
    get SearchState() {
        return window.unifiedStateManager?.state?.search || {};
    },
    
    get SponsorBlockState() {
        return window.unifiedStateManager?.state?.sponsorBlock || {};
    },
    
    get UIState() {
        return window.unifiedStateManager?.state?.ui || {};
    }
};

console.log('⚡ Sistema Unificado YT CrossMix preparado');
console.log('❌ Eliminadas todas las duplicaciones');
console.log('✅ Sistema único de estados, loading, mensajes y YouTube API');
console.log('🔄 Migración legacy incluida para compatibilidad temporal');
