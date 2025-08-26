// app-bootstrap.js - NUEVO ARCHIVO PRINCIPAL DE INICIALIZACIÓN
// Este archivo reemplaza la lógica de inicialización dispersa

import { stateManager, AppState, PlaylistState } from './state.js';
import { domManager, safeGetElement } from './dom.js';
import { errorBoundary, wrapFunction, handleCriticalError } from './errors.js';
import { mostrarMensajeFlotante } from './messages.js';

class YTCrossMixBootstrap {
    constructor() {
        this.initialized = false;
        this.modules = new Map();
        this.criticalModules = ['YouTubeAPIManager', 'PlaylistManager', 'UIManager'];
        this.initializationSteps = [
            'setupFoundation',
            'loadCoreModules', 
            'setupDOM',
            'initializeYouTube',
            'setupEventSystem',
            'startApplication'
        ];
    }
    
    // Inicialización principal
    async initialize() {
        if (this.initialized) {
            console.warn('⚠️ Bootstrap ya inicializado');
            return this;
        }
        
        console.log('🚀 Iniciando YT CrossMix Bootstrap...');
        
        try {
            // Ejecutar pasos de inicialización en orden
            for (const step of this.initializationSteps) {
                console.log(`📋 Ejecutando: ${step}`);
                await this.executeStep(step);
            }
            
            this.initialized = true;
            console.log('✅ YT CrossMix Bootstrap completado');
            
            // Mostrar mensaje de éxito
            setTimeout(() => {
                mostrarMensajeFlotante('🎉 YT CrossMix listo para usar', 3000, 'success');
            }, 1000);
            
            return this;
            
        } catch (error) {
            handleCriticalError(error, 'bootstrap');
            throw error;
        }
    }
    
    // Ejecutar paso de inicialización
    async executeStep(stepName) {
        const step = wrapFunction(this[stepName], { 
            name: stepName,
            retries: 1,
            fallback: (error) => {
                console.error(`💥 Step ${stepName} falló:`, error);
                // Intentar continuar con otros steps no críticos
                if (!this.criticalModules.includes(stepName)) {
                    console.log(`⚠️ Continuando sin ${stepName} (no crítico)`);
                    return;
                }
                throw error;
            }
        });
        
        await step.call(this);
    }
    
    // Paso 1: Configurar foundation
    async setupFoundation() {
        console.log('🏗️ Configurando foundation...');
        
        // Verificar que el DOM esté listo
        await domManager.waitForDOM();
        
        // Configurar viewport para móviles
        this.setupMobileViewport();
        
        // Configurar referencias globales básicas
        this.setupGlobalReferences();
        
        // Configurar debugging global
        this.setupGlobalDebugging();
        
        console.log('✅ Foundation configurado');
    }
    
    // Paso 2: Cargar módulos core
    async loadCoreModules() {
        console.log('📦 Cargando módulos core...');
        
        const modulePromises = [
            this.loadModule('YouTubeAPIManager', () => import('./youtubeAPI.js')),
            this.loadModule('PlaylistManager', () => import('./playlistManager.js')),
            this.loadModule('SearchManager', () => import('./searchManager.js')),
            this.loadModule('PlaybackController', () => import('./playbackController.js')),
            this.loadModule('UIManager', () => import('./ui.js')),
            this.loadModule('Utils', () => import('./utils.js'))
        ];
        
        // Cargar módulos opcionales sin fallar
        const optionalModules = [
            this.loadModule('SponsorBlockManager', () => import('./sponsorblock.js'), false),
            this.loadModule('AudioManager', () => import('./audioManager.js'), false),
            this.loadModule('authManager', () => import('./auth.js'), false)
        ];
        
        // Esperar módulos críticos
        await Promise.all(modulePromises);
        
        // Cargar opcionales sin bloquear
        Promise.allSettled(optionalModules).then(results => {
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.warn(`⚠️ Módulo opcional falló:`, result.reason);
                }
            });
        });
        
        console.log('✅ Módulos core cargados');
    }
    
    // Paso 3: Configurar DOM
    async setupDOM() {
        console.log('🏠 Configurando DOM...');
        
        // Obtener elementos críticos
        const criticalElements = await domManager.safeGetElements({
            videoContainer: {
                selector: '#videoContainer',
                required: true,
                fallbackCreate: () => this.createVideoContainer()
            },
            player1: {
                selector: '#player1', 
                required: true,
                fallbackCreate: () => this.createPlayerElement('player1')
            },
            player2: {
                selector: '#player2',
                required: true, 
                fallbackCreate: () => this.createPlayerElement('player2')
            },
            playButton: {
                selector: '#botonPlay',
                required: true,
                fallbackCreate: () => this.createPlayButton()
            },
            nextButton: '#botonNext',
            searchInput: '#searchInput',
            searchResults: '#searchResults'
        });
        
        // Verificar elementos críticos
        const missing = Object.entries(criticalElements)
            .filter(([key, element]) => !element && ['videoContainer', 'player1', 'player2', 'playButton'].includes(key))
            .map(([key]) => key);
        
        if (missing.length > 0) {
            throw new Error(`Elementos DOM críticos faltantes: ${missing.join(', ')}`);
        }
        
        // Configurar detección de dispositivo
        this.setupDeviceDetection();
        
        console.log('✅ DOM configurado');
    }
    
    // Paso 4: Inicializar YouTube
    async initializeYouTube() {
        console.log('🎥 Inicializando YouTube...');
        
        const YouTubeAPIManager = this.modules.get('YouTubeAPIManager');
        if (!YouTubeAPIManager) {
            throw new Error('YouTubeAPIManager no disponible');
        }
        
        // Configurar callback global
        window.onYouTubeIframeAPIReady = () => {
            console.log('📺 YouTube API lista');
            YouTubeAPIManager.initializePlayers();
        };
        
        // Cargar API
        YouTubeAPIManager.loadYouTubeAPI();
        
        // Esperar que los players estén listos (con timeout)
        await this.waitForPlayers();
        
        console.log('✅ YouTube inicializado');
    }
    
    // Paso 5: Configurar sistema de eventos
    async setupEventSystem() {
        console.log('🔗 Configurando eventos...');
        
        // Setup event listeners básicos
        await this.setupBasicEventListeners();
        
        // Setup navegación
        await this.setupNavigation();
        
        // Setup controles de reproducción
        await this.setupPlaybackControls();
        
        // Setup búsqueda
        await this.setupSearch();
        
        console.log('✅ Sistema de eventos configurado');
    }
    
    // Paso 6: Iniciar aplicación
    async startApplication() {
        console.log('🎵 Iniciando aplicación...');
        
        // Inicializar UI
        const UIManager = this.modules.get('UIManager');
        if (UIManager?.updatePlaylistsUI) {
            UIManager.updatePlaylistsUI();
        }
        
        // Inicializar búsqueda
        const SearchManager = this.modules.get('SearchManager');
        if (SearchManager?.initialize) {
            SearchManager.initialize();
        }
        
        // Configurar integración mobile/desktop
        await this.initializeIntegration();
        
        // Verificar estado inicial
        this.performHealthCheck();
        
        console.log('✅ Aplicación iniciada');
    }
    
    // Helpers para creación de elementos
    createVideoContainer() {
        console.log('🔧 Creando contenedor de video...');
        
        const container = domManager.createElement('div', {
            id: 'videoContainer',
            className: 'video-container',
            styles: {
                position: 'relative',
                width: '100%',
                maxWidth: '640px',
                aspectRatio: '16/9',
                backgroundColor: '#000',
                borderRadius: '6px',
                overflow: 'hidden'
            }
        });
        
        // Añadir al DOM
        const playingView = document.getElementById('playingView');
        if (playingView) {
            const nowPlaying = playingView.querySelector('.now-playing-container');
            if (nowPlaying) {
                nowPlaying.insertBefore(container, nowPlaying.firstChild);
            }
        }
        
        return container;
    }
    
    createPlayerElement(id) {
        console.log(`🔧 Creando elemento ${id}...`);
        
        const player = domManager.createElement('div', {
            id: id,
            className: 'video-player',
            styles: {
                position: 'absolute',
                top: '0',
                left: '0', 
                width: '100%',
                height: '100%',
                backgroundColor: '#000'
            }
        });
        
        // Añadir al video container
        const videoContainer = document.getElementById('videoContainer');
        if (videoContainer) {
            videoContainer.appendChild(player);
        }
        
        return player;
    }
    
    createPlayButton() {
        console.log('🔧 Creando botón de play...');
        
        const button = domManager.createElement('button', {
            id: 'botonPlay',
            className: 'control-button primary',
            innerHTML: '<i class="fas fa-play"></i>',
            attributes: {
                disabled: 'true',
                title: 'Reproducir/Pausar'
            }
        });
        
        // Añadir al DOM
        const controls = document.querySelector('.player-controls, .control-buttons');
        if (controls) {
            controls.appendChild(button);
        }
        
        return button;
    }
    
    // Configurar viewport móvil
    setupMobileViewport() {
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
    
    // Configurar referencias globales
    setupGlobalReferences() {
        // Referencias de estado ya configuradas por state.js
        
        // Referencias de utilidades
        window.mostrarMensajeFlotante = mostrarMensajeFlotante;
        window.bootstrap = this;
        
        // Función de reinicio global
        window.resetApp = () => {
            if (confirm('¿Seguro que quieres reiniciar la aplicación?')) {
                this.restart();
            }
        };
    }
    
    // Configurar debugging global
    setupGlobalDebugging() {
        window.debugApp = () => {
            console.log('=== YT CROSSMIX DEBUG ===');
            console.log('Bootstrap:', this.getDebugInfo());
            stateManager.debug();
            domManager.debug();
            errorBoundary.debug();
            console.log('========================');
        };
    }
    
    // Detectar tipo de dispositivo
    setupDeviceDetection() {
        const isDesktop = window.innerWidth >= 1024;
        const isMobile = !isDesktop;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        
        // Actualizar estado
        stateManager.set('ui.isDesktop', isDesktop);
        stateManager.set('ui.isMobile', isMobile);
        stateManager.set('ui.isTablet', isTablet);
        
        // CSS classes
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', isMobile);
        document.body.classList.toggle('is-tablet', isTablet);
        
        // Listener para cambios
        window.addEventListener('resize', () => {
            this.setupDeviceDetection();
        });
    }
    
    // Cargar módulo individual
    async loadModule(name, importFn, required = true) {
        try {
            console.log(`📦 Cargando ${name}...`);
            const module = await importFn();
            
            // Obtener export principal
            const moduleExport = module[name] || module.default || module;
            
            if (!moduleExport && required) {
                throw new Error(`Módulo ${name} no encontrado en exports`);
            }
            
            // Guardar referencia
            this.modules.set(name, moduleExport);
            window[name] = moduleExport;
            
            console.log(`✅ ${name} cargado`);
            return moduleExport;
            
        } catch (error) {
            console.error(`💥 Error cargando ${name}:`, error);
            if (required) {
                throw error;
            }
            return null;
        }
    }
    
    // Esperar que los players estén listos
    async waitForPlayers(timeout = 10000) {
        return new Promise((resolve, reject) => {
            const checkPlayers = () => {
                if (AppState.playersInitialized) {
                    resolve();
                    return;
                }
                
                setTimeout(checkPlayers, 500);
            };
            
            checkPlayers();
            
            // Timeout
            setTimeout(() => {
                if (!AppState.playersInitialized) {
                    reject(new Error('Players no inicializados en tiempo esperado'));
                }
            }, timeout);
        });
    }
    
    // Event listeners básicos
    async setupBasicEventListeners() {
        // Click delegation para performance
        document.addEventListener('click', this.handleGlobalClick.bind(this));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));
        
        // Online/offline status
        window.addEventListener('online', () => {
            mostrarMensajeFlotante('Conexión restaurada', 2000, 'success');
        });
        
        window.addEventListener('offline', () => {
            mostrarMensajeFlotante('Sin conexión a internet', 3000, 'warning');
        });
    }
    
    // Global click handler
    handleGlobalClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        const context = target.dataset.context || 'global';
        
        console.log(`🖱️ Global click: ${action} (${context})`);
        
        // Dispatch a módulos apropiados
        this.dispatchAction(action, context, event, target);
    }
    
    // Keyboard handler
    handleKeyboard(event) {
        // Prevenir shortcuts si hay input activo
        if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
        
        switch (event.key) {
            case ' ': // Spacebar - Play/Pause
                event.preventDefault();
                this.dispatchAction('toggle-play', 'keyboard', event);
                break;
                
            case 'ArrowRight': // Next
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.dispatchAction('next-track', 'keyboard', event);
                }
                break;
                
            case 'Escape': // Close modals
                this.dispatchAction('close-modal', 'keyboard', event);
                break;
        }
    }
    
    // Dispatch action a módulos
    dispatchAction(action, context, event, target = null) {
        const actionMap = {
            'toggle-play': () => this.handlePlayToggle(),
            'next-track': () => this.handleNext(),
            'close-modal': () => this.handleCloseModal(),
            'search': (e, t) => this.handleSearch(t.value),
            'playlist-toggle': (e, t) => this.handlePlaylistToggle(t.dataset.playlistId)
        };
        
        const handler = actionMap[action];
        if (handler) {
            try {
                handler(event, target);
            } catch (error) {
                console.error(`Error en action ${action}:`, error);
            }
        }
    }
    
    // Action handlers
    handlePlayToggle() {
        const playButton = document.getElementById('botonPlay');
        if (playButton && !playButton.disabled) {
            playButton.click();
        }
    }
    
    handleNext() {
        const nextButton = document.getElementById('botonNext');
        if (nextButton) {
            nextButton.click();
        }
    }
    
    handleCloseModal() {
        // Close any open modals
        document.querySelectorAll('.modal, .mobile-context-modal').forEach(modal => {
            modal.remove();
        });
    }
    
    // Inicializar integración
    async initializeIntegration() {
        // Si integration-fix.js está disponible, usarlo
        if (window.YTCrossMixIntegration) {
            console.log('🔗 Inicializando integración existente...');
            try {
                await window.YTCrossMixIntegration.initialize();
            } catch (error) {
                console.warn('⚠️ Error en integración existente:', error);
            }
        }
    }
    
    // Health check
    performHealthCheck() {
        const health = {
            bootstrap: this.initialized,
            states: stateManager.getHealthCheck(),
            modules: this.modules.size,
            dom: document.readyState,
            youtube: AppState.playersInitialized
        };
        
        console.log('🔍 Health Check:', health);
        
        const issues = [];
        if (!health.bootstrap) issues.push('Bootstrap no inicializado');
        if (!health.states.statesInitialized) issues.push('Estados no inicializados'); 
        if (health.modules < 3) issues.push('Módulos insuficientes');
        if (!health.youtube) issues.push('YouTube no listo');
        
        if (issues.length > 0) {
            console.warn('⚠️ Issues detectados:', issues);
        } else {
            console.log('✅ Health Check: Todo OK');
        }
        
        return health;
    }
    
    // Restart aplicación
    async restart() {
        console.log('🔄 Reiniciando aplicación...');
        
        try {
            // Cleanup
            this.cleanup();
            
            // Reset estados
            stateManager.reset();
            
            // Re-inicializar
            this.initialized = false;
            await this.initialize();
            
            mostrarMensajeFlotante('Aplicación reiniciada correctamente', 3000, 'success');
            
        } catch (error) {
            handleCriticalError(error, 'restart');
        }
    }
    
    // Cleanup
    cleanup() {
        // Limpiar intervalos
        if (AppState.monitorInterval) {
            clearInterval(AppState.monitorInterval);
            AppState.monitorInterval = null;
        }
        
        if (AppState.crossfadeInterval) {
            clearInterval(AppState.crossfadeInterval);
            AppState.crossfadeInterval = null;
        }
        
        // Limpiar DOM
        domManager.cleanup();
        
        console.log('🧹 Cleanup completado');
    }
    
    // Debug info
    getDebugInfo() {
        return {
            initialized: this.initialized,
            modulesLoaded: this.modules.size,
            moduleNames: Array.from(this.modules.keys()),
            criticalModules: this.criticalModules,
            initSteps: this.initializationSteps
        };
    }
}

// Crear instancia única
export const bootstrap = new YTCrossMixBootstrap();

// Auto-inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🏁 DOM listo - Iniciando Bootstrap...');
        await bootstrap.initialize();
    } catch (error) {
        console.error('💥 Error crítico en bootstrap:', error);
        
        // Mostrar error al usuario
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: #0f0f0f; color: white; display: flex;
            align-items: center; justify-content: center;
            flex-direction: column; font-family: Arial; text-align: center;
            z-index: 10000; padding: 20px;
        `;
        errorDiv.innerHTML = `
            <h1 style="color: #ff6b35; margin-bottom: 20px;">⚠️ Error de Inicialización</h1>
            <p>YT CrossMix no pudo inicializarse correctamente.</p>
            <p style="font-size: 14px; opacity: 0.7; margin-top: 10px;">
                Error: ${error.message}
            </p>
            <button onclick="location.reload()" style="
                margin-top: 20px; padding: 12px 24px;
                background: #ff6b35; color: white; border: none;
                border-radius: 6px; cursor: pointer; font-size: 14px;
            ">
                🔄 Recargar Página
            </button>
            <button onclick="localStorage.clear(); location.reload()" style="
                margin-top: 10px; padding: 12px 24px;
                background: #444; color: white; border: none;
                border-radius: 6px; cursor: pointer; font-size: 14px;
            ">
                🗑️ Limpiar Datos y Recargar
            </button>
        `;
        document.body.appendChild(errorDiv);
    }
});

// Setup navigation básica
async function setupNavigation() {
    const navItems = document.querySelectorAll('[data-view]');
    navItems.forEach(item => {
        domManager.safeAddEventListener(item, 'click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            if (view && window.integration?.switchView) {
                window.integration.switchView(view);
            }
        });
    });
}

// Setup controles básicos
async function setupPlaybackControls() {
    // Play button
    const playButton = await safeGetElement('#botonPlay');
    if (playButton) {
        domManager.safeAddEventListener(playButton, 'click', wrapFunction(() => {
            // Lógica de play/pause será manejada por los módulos
            console.log('🎵 Play button clicked');
        }, { name: 'playButton' }));
    }
    
    // Next button  
    const nextButton = await safeGetElement('#botonNext');
    if (nextButton) {
        domManager.safeAddEventListener(nextButton, 'click', wrapFunction(() => {
            console.log('⏭️ Next button clicked');
        }, { name: 'nextButton' }));
    }
}

// Setup búsqueda básica
async function setupSearch() {
    const searchInputs = await Promise.all([
        safeGetElement('#searchInput'),
        safeGetElement('#sidebarSearchInput')
    ].filter(Boolean));
    
    searchInputs.forEach(input => {
        if (!input) return;
        
        let searchTimeout;
        domManager.safeAddEventListener(input, 'input', wrapFunction((e) => {
            const query = e.target.value.trim();
            
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (query.length > 2) {
                    console.log('🔍 Búsqueda:', query);
                    // La búsqueda será manejada por SearchManager
                }
            }, 300);
        }, { name: 'search' }));
    });
}

// Hacer disponible globalmente
window.bootstrap = bootstrap;
window.YTCrossMixBootstrap = YTCrossMixBootstrap;

// Exportar para uso en otros módulos
export { YTCrossMixBootstrap };