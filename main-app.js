// main-app.js - ARCHIVO PRINCIPAL CORREGIDO PARA YT CROSSMIX
// Este archivo coordina la inicialización completa de la aplicación

// ===== CONFIGURACIÓN DE DEPURACIÓN GLOBAL =====
window.DEBUG = true;
const log = (message, ...args) => {
    if (window.DEBUG) {
        console.log(`[YT-CROSSMIX] ${message}`, ...args);
    }
};

// ===== GESTIÓN DE ESTADOS GLOBALES =====
class AppStateManager {
    constructor() {
        this.initialized = false;
        this.modules = new Map();
        this.currentView = 'home';
        this.isLoading = false;
        this.errors = [];
        
        // Estados críticos
        this.states = {
            domReady: false,
            bootstrapReady: false,
            integrationReady: false,
            playersReady: false
        };
        
        this.setupGlobalErrorHandling();
    }
    
    setupGlobalErrorHandling() {
        window.addEventListener('error', (e) => {
            this.logError('JavaScript Error', e.error);
        });
        
        window.addEventListener('unhandledrejection', (e) => {
            this.logError('Unhandled Promise Rejection', e.reason);
            e.preventDefault(); // Prevenir que aparezca en consola
        });
    }
    
    logError(type, error) {
        const errorInfo = {
            type,
            message: error?.message || error,
            stack: error?.stack,
            timestamp: Date.now()
        };
        
        this.errors.push(errorInfo);
        console.error(`❌ ${type}:`, error);
        
        // Mostrar mensaje al usuario solo para errores críticos
        if (this.isCriticalError(error)) {
            this.showUserError(`Error ${type}: ${errorInfo.message}`);
        }
    }
    
    isCriticalError(error) {
        if (!error) return false;
        const message = error.message || error.toString();
        const criticalPatterns = [
            /bootstrap/i,
            /integration/i,
            /modules.*not.*found/i,
            /cannot.*read.*property.*of.*null/i
        ];
        return criticalPatterns.some(pattern => pattern.test(message));
    }
    
    showUserError(message) {
        // Mostrar mensaje flotante si la función existe
        if (window.mostrarMensajeFlotante) {
            window.mostrarMensajeFlotante(message, 5000, 'error');
        } else {
            // Fallback básico
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed; top: 20px; right: 20px; 
                background: #f44336; color: white; 
                padding: 12px 20px; border-radius: 6px; 
                z-index: 10000; max-width: 300px;
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
        }
    }
    
    setState(key, value) {
        this.states[key] = value;
        log(`Estado actualizado: ${key} = ${value}`);
        
        // Verificar si todos los estados críticos están listos
        if (this.areAllStatesReady() && !this.initialized) {
            this.completeInitialization();
        }
    }
    
    areAllStatesReady() {
        return this.states.domReady && 
               this.states.bootstrapReady && 
               this.states.integrationReady;
    }
    
    completeInitialization() {
        log('🎉 Inicialización completa de YT CrossMix');
        this.initialized = true;
        
        // Disparar evento global
        window.dispatchEvent(new CustomEvent('ytcrossmix:ready', {
            detail: { 
                timestamp: Date.now(),
                states: this.states 
            }
        }));
    }
    
    getDebugInfo() {
        return {
            initialized: this.initialized,
            currentView: this.currentView,
            states: this.states,
            modulesLoaded: this.modules.size,
            errorCount: this.errors.length,
            lastError: this.errors[this.errors.length - 1]
        };
    }
}

// ===== INICIALIZACIÓN PRINCIPAL =====
class YTCrossMixApp {
    constructor() {
        this.appState = new AppStateManager();
        this.initializationSteps = [
            { name: 'waitForDOM', critical: true },
            { name: 'loadBootstrap', critical: true },
            { name: 'loadIntegration', critical: true },
            { name: 'initializeUI', critical: false },
            { name: 'setupEventListeners', critical: true },
            { name: 'finalizeSetup', critical: false }
        ];
        
        this.currentStep = 0;
        this.startTime = Date.now();
        
        log('🚀 Iniciando YT CrossMix App...');
        this.initialize();
    }
    
    async initialize() {
        try {
            for (const step of this.initializationSteps) {
                await this.executeStep(step);
            }
            
            const totalTime = Date.now() - this.startTime;
            log(`✅ Inicialización completada en ${totalTime}ms`);
            
        } catch (error) {
            console.error('💥 Error crítico en inicialización:', error);
            this.appState.logError('Initialization Failed', error);
            this.handleInitializationFailure(error);
        }
    }
    
    async executeStep(step) {
        log(`📋 Ejecutando paso: ${step.name}`);
        
        try {
            await this[step.name]();
            log(`✅ ${step.name} completado`);
            
        } catch (error) {
            log(`❌ ${step.name} falló:`, error);
            
            if (step.critical) {
                throw new Error(`Paso crítico falló: ${step.name} - ${error.message}`);
            } else {
                log(`⚠️ Continuando sin ${step.name} (no crítico)`);
            }
        }
    }
    
    // ===== PASOS DE INICIALIZACIÓN =====
    
    async waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.appState.setState('domReady', true);
                    resolve();
                }, { once: true });
            } else {
                this.appState.setState('domReady', true);
                resolve();
            }
        });
    }
    
    async loadBootstrap() {
        try {
            // Cargar módulo de bootstrap
            const bootstrapModule = await import('./app-bootstrap.js');
            
            if (bootstrapModule.bootstrap) {
                log('Bootstrap module cargado, inicializando...');
                await bootstrapModule.bootstrap.initialize();
                this.appState.modules.set('bootstrap', bootstrapModule.bootstrap);
                this.appState.setState('bootstrapReady', true);
            } else {
                throw new Error('Bootstrap module no exporta bootstrap');
            }
            
        } catch (error) {
            log('⚠️ Error cargando bootstrap, usando fallback');
            await this.createFallbackBootstrap();
            this.appState.setState('bootstrapReady', true);
        }
    }
    
    async loadIntegration() {
        try {
            // Cargar módulo de integración
            const integrationModule = await import('./integration-fix.js');
            
            if (integrationModule.integration) {
                log('Integration module cargado, inicializando...');
                await integrationModule.integration.initialize();
                
                // Hacer disponible globalmente
                window.integration = integrationModule.integration;
                this.appState.modules.set('integration', integrationModule.integration);
                this.appState.setState('integrationReady', true);
                
            } else {
                throw new Error('Integration module no exporta integration');
            }
            
        } catch (error) {
            log('⚠️ Error cargando integration, usando fallback');
            await this.createFallbackIntegration();
            this.appState.setState('integrationReady', true);
        }
    }
    
    async initializeUI() {
        // Configurar viewport móvil
        this.setupMobileViewport();
        
        // Configurar tema
        this.setupTheme();
        
        // Configurar navegación básica
        this.setupBasicNavigation();
        
        log('UI básica configurada');
    }
    
    async setupEventListeners() {
        // Event listeners globales críticos
        this.setupGlobalEventListeners();
        
        // Event listeners de navegación
        this.setupNavigationEventListeners();
        
        // Event listeners de controles
        this.setupControlEventListeners();
        
        log('Event listeners configurados');
    }
    
    async finalizeSetup() {
        // Configurar debugging global
        this.setupGlobalDebugging();
        
        // Verificar integridad del sistema
        this.performSystemCheck();
        
        // Mostrar mensaje de bienvenida
        setTimeout(() => {
            if (window.mostrarMensajeFlotante) {
                window.mostrarMensajeFlotante('🎵 YT CrossMix cargado correctamente', 3000, 'success');
            }
        }, 500);
        
        log('Setup finalizado');
    }
    
    // ===== FALLBACKS DE EMERGENCIA =====
    
    async createFallbackBootstrap() {
        log('🆘 Creando bootstrap fallback');
        
        // Verificar elementos críticos del DOM
        this.ensureCriticalElements();
        
        // Configurar estados básicos
        this.setupBasicStates();
        
        // Configurar referencias globales mínimas
        window.AppState = window.AppState || {};
        window.PlaylistState = window.PlaylistState || { playlistsData: [] };
        window.SearchState = window.SearchState || {};
    }
    
    async createFallbackIntegration() {
        log('🆘 Creando integration fallback');
        
        // Crear objeto de integración mínimo
        window.integration = {
            currentView: 'home',
            isInitialized: true,
            switchView: this.fallbackSwitchView.bind(this),
            updateCurrentTrack: () => {},
            showMessage: (msg) => console.log('Message:', msg)
        };
        
        // Configurar navegación básica
        this.setupFallbackNavigation();
    }
    
    // ===== CONFIGURACIONES BÁSICAS =====
    
    setupMobileViewport() {
        // Configurar viewport height variable
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
        });
    }
    
    setupTheme() {
        // Aplicar tema oscuro por defecto
        document.body.classList.add('dark-theme');
        
        // Detectar preferencia del sistema
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('system-dark');
        }
    }
    
    setupBasicNavigation() {
        // Detectar tipo de dispositivo
        const isDesktop = window.innerWidth >= 1024;
        const isMobile = window.innerWidth < 1024;
        
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', isMobile);
        
        // Mostrar/ocultar elementos según dispositivo
        this.updateLayoutForDevice(isDesktop);
    }
    
    updateLayoutForDevice(isDesktop) {
        // Elementos desktop
        const desktopElements = document.querySelectorAll('.desktop-sidebar, .bottom-player');
        desktopElements.forEach(el => {
            el.style.display = isDesktop ? (el.classList.contains('bottom-player') ? 'flex' : 'block') : 'none';
        });
        
        // Elementos mobile
        const mobileElements = document.querySelectorAll('.mobile-header, .bottom-nav, .mini-player');
        mobileElements.forEach(el => {
            el.style.display = isDesktop ? 'none' : (el.classList.contains('bottom-nav') || el.classList.contains('mini-player') ? 'flex' : 'block');
        });
    }
    
    // ===== EVENT LISTENERS SEGUROS =====
    
    setupGlobalEventListeners() {
        // Online/Offline status
        window.addEventListener('online', () => {
            log('🌐 Conexión restaurada');
            if (window.mostrarMensajeFlotante) {
                window.mostrarMensajeFlotante('Conexión restaurada', 2000, 'success');
            }
        });
        
        window.addEventListener('offline', () => {
            log('🌐 Sin conexión');
            if (window.mostrarMensajeFlotante) {
                window.mostrarMensajeFlotante('Sin conexión a internet', 3000, 'warning');
            }
        });
        
        // Resize con debounce
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
        
        // Shortcuts de teclado
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }
    
    setupNavigationEventListeners() {
        // Event delegation para navegación
        document.addEventListener('click', (e) => {
            const navElement = e.target.closest('[data-view]');
            if (navElement) {
                e.preventDefault();
                const view = navElement.dataset.view;
                this.safeViewSwitch(view);
            }
        });
        
        // Navegación mobile específica
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) {
            bottomNav.addEventListener('click', (e) => {
                const navTab = e.target.closest('.nav-tab');
                if (navTab && navTab.dataset.view) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.safeViewSwitch(navTab.dataset.view);
                }
            });
        }
    }
    
    setupControlEventListeners() {
        // Botones de control básicos
        const buttons = {
            '#botonPlay': () => this.handlePlayPause(),
            '#botonNext': () => this.handleNext(),
            '#debugButton': () => this.showDebugInfo(),
            '#resetButton': () => this.handleReset()
        };
        
        Object.entries(buttons).forEach(([selector, handler]) => {
            const element = document.querySelector(selector);
            if (element) {
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.safeExecute(handler, `Button ${selector}`);
                });
            }
        });
    }
    
    // ===== NAVEGACIÓN SEGURA =====
    
    safeViewSwitch(newView) {
        log(`🔄 Cambiando vista a: ${newView}`);
        
        try {
            // Verificar si la vista existe
            const targetView = document.getElementById(`${newView}View`);
            if (!targetView) {
                log(`⚠️ Vista ${newView} no encontrada`);
                return;
            }
            
            // Usar integration si está disponible
            if (window.integration && typeof window.integration.switchView === 'function') {
                window.integration.switchView(newView);
            } else {
                // Fallback manual
                this.fallbackSwitchView(newView);
            }
            
            this.appState.currentView = newView;
            log(`✅ Vista cambiada a: ${newView}`);
            
        } catch (error) {
            log(`❌ Error cambiando vista: ${error.message}`);
            this.appState.logError('View Switch Failed', error);
        }
    }
    
    fallbackSwitchView(newView) {
        // Ocultar todas las vistas
        document.querySelectorAll('.content-view').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });
        
        // Mostrar vista objetivo
        const targetView = document.getElementById(`${newView}View`);
        if (targetView) {
            targetView.classList.add('active');
            targetView.style.display = 'flex';
        }
        
        // Actualizar navegación
        document.querySelectorAll('.nav-tab, .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        document.querySelectorAll(`[data-view="${newView}"]`).forEach(item => {
            item.classList.add('active');
        });
        
        // Scroll al top
        if (targetView) {
            targetView.scrollTop = 0;
        }
    }
    
    setupFallbackNavigation() {
        // Configurar navegación mínima funcional
        document.querySelectorAll('[data-view]').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                const view = element.dataset.view;
                this.fallbackSwitchView(view);
            });
        });
    }
    
    // ===== HANDLERS DE EVENTOS =====
    
    handleResize() {
        const isDesktop = window.innerWidth >= 1024;
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', !isDesktop);
        
        this.updateLayoutForDevice(isDesktop);
        
        // Notificar a integration si existe
        if (window.integration && typeof window.integration.handleResize === 'function') {
            window.integration.handleResize();
        }
    }
    
    handleKeyboardShortcuts(e) {
        // Solo procesar si no hay input activo
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        
        switch (e.key) {
            case ' ': // Spacebar - Play/Pause
                e.preventDefault();
                this.handlePlayPause();
                break;
                
            case 'ArrowRight': // Next (Ctrl + →)
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.handleNext();
                }
                break;
                
            case 'Escape': // Close modals
                this.handleEscape();
                break;
                
            case 'F12': // Debug info
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.showDebugInfo();
                }
                break;
        }
    }
    
    handlePlayPause() {
        log('🎵 Play/Pause solicitado');
        
        const playButton = document.getElementById('botonPlay');
        if (playButton && !playButton.disabled) {
            // Si hay controlador de reproducción, usarlo
            if (window.PlaybackController && typeof window.PlaybackController.playFirstVideo === 'function') {
                if (window.AppState?.reproduccionIniciada) {
                    // Toggle pause/play
                    this.togglePlayback();
                } else {
                    // Iniciar reproducción
                    window.PlaybackController.playFirstVideo();
                }
            } else {
                // Feedback básico
                this.showMessage('Sistema de reproducción no disponible');
            }
        } else {
            this.showMessage('No hay música disponible para reproducir');
        }
    }
    
    handleNext() {
        log('⏭️ Siguiente canción solicitada');
        
        if (window.PlaybackController && typeof window.PlaybackController.playNextVideo === 'function') {
            window.PlaybackController.playNextVideo();
        } else {
            this.showMessage('Función siguiente no disponible');
        }
    }
    
    handleEscape() {
        // Cerrar modales y menús
        document.querySelectorAll('.modal, .mobile-context-modal, .delete-menu-content').forEach(modal => {
            if (modal.style.display !== 'none') {
                modal.remove();
            }
        });
    }
    
    handleReset() {
        if (confirm('¿Seguro que quieres reiniciar la aplicación?')) {
            log('🔄 Reiniciando aplicación...');
            
            try {
                // Limpiar estados
                if (window.stateManager && typeof window.stateManager.reset === 'function') {
                    window.stateManager.reset();
                }
                
                // Limpiar intervalos
                if (window.AppState) {
                    if (window.AppState.monitorInterval) {
                        clearInterval(window.AppState.monitorInterval);
                        window.AppState.monitorInterval = null;
                    }
                    if (window.AppState.crossfadeInterval) {
                        clearInterval(window.AppState.crossfadeInterval);
                        window.AppState.crossfadeInterval = null;
                    }
                }
                
                // Volver a vista inicial
                this.safeViewSwitch('home');
                
                this.showMessage('Aplicación reiniciada', 'success');
                
            } catch (error) {
                log('Error en reset:', error);
                this.showMessage('Error reiniciando aplicación', 'error');
            }
        }
    }
    
    togglePlayback() {
        const activePlayer = window.AppState?.currentPlayer === 1 ? 
                           window.AppState.player1 : window.AppState.player2;
        
        if (activePlayer && typeof activePlayer.getPlayerState === 'function') {
            const state = activePlayer.getPlayerState();
            
            if (state === YT?.PlayerState?.PLAYING) {
                activePlayer.pauseVideo();
                document.getElementById('botonPlay').innerHTML = '<i class="fas fa-play"></i>';
            } else if (state === YT?.PlayerState?.PAUSED) {
                activePlayer.playVideo();
                document.getElementById('botonPlay').innerHTML = '<i class="fas fa-pause"></i>';
            }
        }
    }
    
    // ===== UTILIDADES =====
    
    safeExecute(fn, context = 'Unknown') {
        try {
            if (typeof fn === 'function') {
                return fn();
            } else {
                log(`⚠️ ${context}: No es una función`);
            }
        } catch (error) {
            log(`❌ Error en ${context}:`, error);
            this.appState.logError(context, error);
        }
    }
    
    showMessage(message, type = 'info') {
        if (window.mostrarMensajeFlotante) {
            window.mostrarMensajeFlotante(message, 3000, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
    
    ensureCriticalElements() {
        const requiredElements = [
            { id: 'botonPlay', tag: 'button', className: 'control-button primary' },
            { id: 'botonNext', tag: 'button', className: 'control-button' },
            { id: 'player1', tag: 'div', className: 'video-player' },
            { id: 'player2', tag: 'div', className: 'video-player hidden' },
            { id: 'videoContainer', tag: 'div', className: 'video-container' }
        ];
        
        requiredElements.forEach(({ id, tag, className }) => {
            if (!document.getElementById(id)) {
                const element = document.createElement(tag);
                element.id = id;
                element.className = className;
                
                if (id === 'botonPlay') {
                    element.innerHTML = '<i class="fas fa-play"></i>';
                    element.disabled = true;
                }
                
                // Añadir al DOM en ubicación apropiada
                const container = document.querySelector('.player-controls, .video-container, body');
                if (container) {
                    container.appendChild(element);
                }
                
                log(`🔧 Elemento ${id} creado automáticamente`);
            }
        });
    }
    
    setupBasicStates() {
        // Estados básicos mínimos para funcionamiento
        window.AppState = Object.assign(window.AppState || {}, {
            player1: null,
            player2: null,
            currentPlayer: 1,
            playersInitialized: false,
            reproduccionIniciada: false,
            isTransitioning: false,
            monitorInterval: null
        });
        
        window.PlaylistState = Object.assign(window.PlaylistState || {}, {
            playlistsData: [],
            currentPlayingInfo: {
                playlistId: null,
                videoId: null,
                flattenedIndex: -1
            }
        });
    }
    
    setupGlobalDebugging() {
        // Funciones de debugging globales
        window.debugYTCrossMix = () => this.showDebugInfo();
        window.resetYTCrossMix = () => this.handleReset();
        
        // Información del sistema
        window.ytCrossMixInfo = () => ({
            version: '4.0.0',
            initialized: this.appState.initialized,
            currentView: this.appState.currentView,
            errors: this.appState.errors.length,
            modules: Array.from(this.appState.modules.keys())
        });
    }
    
    showDebugInfo() {
        const info = this.appState.getDebugInfo();
        const systemInfo = window.ytCrossMixInfo();
        
        console.group('🐛 YT CrossMix Debug Info');
        console.log('📊 App State:', info);
        console.log('🔧 System Info:', systemInfo);
        console.log('🌐 Window Objects:', {
            integration: !!window.integration,
            bootstrap: !!window.bootstrap,
            AppState: !!window.AppState,
            PlaylistState: !!window.PlaylistState,
            YT: !!window.YT
        });
        console.log('📱 Device Info:', {
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            devicePixelRatio: window.devicePixelRatio
        });
        
        if (this.appState.errors.length > 0) {
            console.log('❌ Recent Errors:', this.appState.errors.slice(-5));
        }
        
        console.groupEnd();
        
        // Mostrar también en UI
        this.showMessage(`Debug: ${info.states.domReady ? '✅' : '❌'} DOM | ${info.states.bootstrapReady ? '✅' : '❌'} Bootstrap | ${info.states.integrationReady ? '✅' : '❌'} Integration`);
    }
    
    performSystemCheck() {
        const checks = {
            'DOM Elements': this.checkDOMElements(),
            'Module Availability': this.checkModules(),
            'Event Listeners': this.checkEventListeners(),
            'CSS Styles': this.checkCSS()
        };
        
        log('🔍 System Check Results:', checks);
        
        const failedChecks = Object.entries(checks)
            .filter(([, result]) => !result.passed)
            .map(([name]) => name);
        
        if (failedChecks.length > 0) {
            log(`⚠️ Failed checks: ${failedChecks.join(', ')}`);
        } else {
            log('✅ All system checks passed');
        }
    }
    
    checkDOMElements() {
        const critical = ['botonPlay', 'botonNext', 'videoContainer'];
        const found = critical.filter(id => document.getElementById(id));
        
        return {
            passed: found.length === critical.length,
            details: `${found.length}/${critical.length} critical elements found`
        };
    }
    
    checkModules() {
        const expected = ['bootstrap', 'integration'];
        const available = expected.filter(name => this.appState.modules.has(name));
        
        return {
            passed: available.length >= 1,
            details: `${available.length}/${expected.length} modules loaded`
        };
    }
    
    checkEventListeners() {
        // Verificar que los event listeners principales estén funcionando
        const hasNavigationListeners = document.querySelectorAll('[data-view]').length > 0;
        const hasControlListeners = !!document.getElementById('botonPlay');
        
        return {
            passed: hasNavigationListeners && hasControlListeners,
            details: `Navigation: ${hasNavigationListeners}, Controls: ${hasControlListeners}`
        };
    }
    
    checkCSS() {
        // Verificar que los estilos críticos estén cargados
        const testElement = document.createElement('div');
        testElement.className = 'content-view';
        document.body.appendChild(testElement);
        
        const styles = window.getComputedStyle(testElement);
        const hasStyles = styles.display !== '';
        
        testElement.remove();
        
        return {
            passed: hasStyles,
            details: `CSS styles ${hasStyles ? 'loaded' : 'missing'}`
        };
    }
    
    handleInitializationFailure(error) {
        log('💥 Initialization failed, attempting recovery...');
        
        // Intentar recuperación mínima
        try {
            this.ensureCriticalElements();
            this.setupBasicStates();
            this.setupFallbackNavigation();
            
            // Vista de error
            this.showErrorView(error);
            
        } catch (recoveryError) {
            log('💀 Recovery also failed:', recoveryError);
            this.showCriticalErrorView(error, recoveryError);
        }
    }
    
    showErrorView(error) {
        const errorView = document.createElement('div');
        errorView.className = 'error-view';
        errorView.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Error de Inicialización</h2>
                <p>YT CrossMix encontró un problema al cargar:</p>
                <code>${error.message}</code>
                <div class="error-actions">
                    <button onclick="location.reload()" class="btn-retry">Reintentar</button>
                    <button onclick="window.debugYTCrossMix?.()" class="btn-debug">Debug</button>
                </div>
            </div>
        `;
        
        errorView.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--primary-bg, #0f0f0f); color: var(--text-primary, white);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; font-family: 'Roboto', sans-serif;
        `;
        
        document.body.appendChild(errorView);
    }
    
    showCriticalErrorView(initError, recoveryError) {
        document.body.innerHTML = `
            <div style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: #1a1a1a; color: white; padding: 40px;
                display: flex; align-items: center; justify-content: center;
                font-family: monospace; text-align: center;
            ">
                <div>
                    <h1>💀 YT CrossMix - Critical Error</h1>
                    <p>La aplicación no pudo inicializarse correctamente.</p>
                    <details style="margin: 20px 0; text-align: left;">
                        <summary>Detalles del error</summary>
                        <pre style="background: #333; padding: 10px; border-radius: 4px; margin-top: 10px;">
Init Error: ${initError.message}
Recovery Error: ${recoveryError.message}
                        </pre>
                    </details>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin: 10px;
                    ">Recargar Página</button>
                </div>
            </div>
        `;
    }
}

// ===== INICIALIZACIÓN SEGURA DE LA APLICACIÓN =====

// Función principal de inicialización
async function initializeYTCrossMix() {
    log('🎵 Iniciando YT CrossMix...');
    
    try {
        // Crear instancia principal de la aplicación
        window.ytCrossMixApp = new YTCrossMixApp();
        
        // Configurar referencias globales para compatibilidad
        window.YTCrossMixApp = YTCrossMixApp;
        
        // Event listener para cuando todo esté listo
        window.addEventListener('ytcrossmix:ready', (e) => {
            log('🎉 YT CrossMix completamente cargado:', e.detail);
        });
        
    } catch (error) {
        console.error('💥 Error crítico iniciando YT CrossMix:', error);
        
        // Mostrar error básico en la página
        document.body.innerHTML = `
            <div style="
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; background: #0f0f0f; color: white;
                font-family: 'Roboto', sans-serif; text-align: center; padding: 20px;
            ">
                <div>
                    <h1>❌ Error Fatal</h1>
                    <p>YT CrossMix no pudo cargar correctamente.</p>
                    <button onclick="location.reload()" style="
                        background: #ff6b35; color: white; border: none;
                        padding: 12px 24px; border-radius: 6px; cursor: pointer;
                        font-size: 16px; margin-top: 20px;
                    ">Recargar Página</button>
                </div>
            </div>
        `;
    }
}

// ===== CORRECCIÓN DE PROBLEMAS ESPECÍFICOS =====

// Función para solucionar el problema de cambio de pestañas
function fixTabSwitchingIssues() {
    log('🔧 Aplicando correcciones para cambio de pestañas...');
    
    // Interceptar todos los clicks en elementos de navegación
    document.addEventListener('click', function(e) {
        const navElement = e.target.closest('[data-view], .nav-tab, .nav-item');
        if (navElement) {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            const view = navElement.dataset.view;
            if (view) {
                log(`🔄 Interceptando cambio a vista: ${view}`);
                
                // Usar timeout para evitar conflictos
                setTimeout(() => {
                    try {
                        if (window.ytCrossMixApp) {
                            window.ytCrossMixApp.safeViewSwitch(view);
                        } else if (window.integration?.switchView) {
                            window.integration.switchView(view);
                        }
                    } catch (error) {
                        log('❌ Error en cambio de vista:', error);
                    }
                }, 10);
            }
        }
    }, true); // Usar capture phase para interceptar antes que otros handlers
    
    // Prevenir múltiples clicks rápidos
    let lastClickTime = 0;
    const clickDelay = 300; // 300ms entre clicks
    
    document.addEventListener('click', function(e) {
        const now = Date.now();
        if (now - lastClickTime < clickDelay) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return false;
        }
        lastClickTime = now;
    }, true);
}

// Función para arreglar problemas de CSS y layout
function fixLayoutIssues() {
    log('🎨 Aplicando correcciones de layout...');
    
    // Asegurar que las vistas de contenido tengan la estructura correcta
    const views = ['home', 'search', 'library', 'playing'];
    views.forEach(viewName => {
        const view = document.getElementById(`${viewName}View`);
        if (view) {
            // Asegurar classes correctas
            view.classList.add('content-view');
            
            // Asegurar que solo una vista esté activa
            if (viewName === 'home' && !document.querySelector('.content-view.active')) {
                view.classList.add('active');
                view.style.display = 'flex';
            } else if (viewName !== 'home') {
                view.classList.remove('active');
                view.style.display = 'none';
            }
        }
    });
    
    // Fix para viewport height en móviles
    function setRealViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setRealViewportHeight();
    window.addEventListener('resize', setRealViewportHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(setRealViewportHeight, 100);
    });
}

// Función para prevenir errores comunes
function preventCommonErrors() {
    log('🛡️ Configurando prevención de errores...');
    
    // Wrapper seguro para funciones que pueden fallar
    window.safeCall = function(fn, context = 'Unknown', ...args) {
        try {
            if (typeof fn === 'function') {
                return fn.apply(this, args);
            } else {
                log(`⚠️ safeCall: ${context} no es una función`);
                return null;
            }
        } catch (error) {
            log(`❌ safeCall error en ${context}:`, error);
            return null;
        }
    };
    
    // Prevenir errores de null/undefined en accesos a propiedades
    window.safeGet = function(obj, path, defaultValue = null) {
        try {
            return path.split('.').reduce((current, key) => {
                return current && current[key] !== undefined ? current[key] : defaultValue;
            }, obj);
        } catch (error) {
            return defaultValue;
        }
    };
    
    // Override console.error para capturar errores silenciosos
    const originalError = console.error;
    console.error = function(...args) {
        // Filtrar errores conocidos que no son críticos
        const message = args[0]?.toString() || '';
        const ignoredErrors = [
            'Extension context invalidated',
            'Non-Error promise rejection captured',
            'ResizeObserver loop limit exceeded'
        ];
        
        const shouldIgnore = ignoredErrors.some(ignored => message.includes(ignored));
        
        if (!shouldIgnore) {
            originalError.apply(console, args);
        }
    };
}

// ===== INICIALIZACIÓN AUTOMÁTICA =====

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

function startApp() {
    log('📱 DOM listo, iniciando aplicación...');
    
    // Aplicar correcciones inmediatas
    fixTabSwitchingIssues();
    fixLayoutIssues();
    preventCommonErrors();
    
    // Inicializar la aplicación principal
    initializeYTCrossMix();
    
    // Mostrar información de carga en desarrollo
    if (window.DEBUG) {
        setTimeout(() => {
            log('📊 Estado inicial de la aplicación:');
            log('- DOM:', document.readyState);
            log('- Viewport:', `${window.innerWidth}x${window.innerHeight}`);
            log('- User Agent:', navigator.userAgent.slice(0, 50) + '...');
            log('- Available modules:', Object.keys(window).filter(key => 
                ['bootstrap', 'integration', 'ytCrossMixApp'].includes(key)
            ));
        }, 1000);
    }
}

// ===== EXPORTS PARA MÓDULOS =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { YTCrossMixApp, initializeYTCrossMix };
}

// ===== CLEANUP AL CERRAR =====
window.addEventListener('beforeunload', () => {
    log('👋 Limpiando antes de cerrar...');
    
    // Limpiar intervalos
    if (window.AppState) {
        if (window.AppState.monitorInterval) {
            clearInterval(window.AppState.monitorInterval);
        }
        if (window.AppState.crossfadeInterval) {
            clearInterval(window.AppState.crossfadeInterval);
        }
    }
    
    // Pausar reproductores
    try {
        if (window.AppState?.player1?.pauseVideo) {
            window.AppState.player1.pauseVideo();
        }
        if (window.AppState?.player2?.pauseVideo) {
            window.AppState.player2.pauseVideo();
        }
    } catch (error) {
        // Ignorar errores de cleanup
    }
});

log('🎵 main-app.js cargado correctamente');
