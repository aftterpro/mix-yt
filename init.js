// ===== INIT.JS - INICIALIZADOR PRINCIPAL UNIFICADO =====
// Archivo que coordina la carga de todos los módulos del sistema unificado

console.log('🚀 YT CrossMix - Inicializador Principal Unificado');

// ===== VERIFICACIONES PREVIAS =====
function performPreflightChecks() {
    const checks = {
        dom: document.readyState !== 'loading',
        core: !!window.ytCrossMixUnified,
        stateManager: !!window.unifiedStateManager,
        messageManager: !!window.unifiedMessageManager,
        loadingManager: !!window.unifiedLoadingManager,
        youtubeManager: !!window.unifiedYouTubeManager
    };
    
    console.log('🔍 Preflight checks:', checks);
    
    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    
    console.log(`✅ Preflight: ${passed}/${total} checks passed`);
    
    return { checks, passed, total, success: passed >= 4 }; // Mínimo 4/6 para continuar
}

// ===== CARGADOR DE MÓDULOS SECUENCIAL =====
class UnifiedModuleLoader {
    constructor() {
        this.modules = new Map();
        this.loadOrder = [
            'messages',
            'ui', 
            'auth',
            'playlistManager',
            'searchManager', 
            'playbackController',
            'sponsorblock',
            'utils'
        ];
        this.loaded = new Set();
        this.errors = new Map();
    }
    
    async loadAll() {
        console.log('📦 Cargando módulos en orden...');
        const startTime = Date.now();
        
        for (const moduleName of this.loadOrder) {
            await this.loadModule(moduleName);
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`✅ Todos los módulos cargados en ${totalTime}ms`);
        
        return this.getLoadResults();
    }
    
    async loadModule(moduleName) {
        if (this.loaded.has(moduleName)) {
            console.log(`⚠️ Módulo ${moduleName} ya cargado, saltando...`);
            return;
        }
        
        console.log(`🔄 Cargando módulo: ${moduleName}`);
        
        try {
            let module;
            
            switch (moduleName) {
                case 'messages':
                    module = await import('./messages.js');
                    break;
                case 'ui':
                    module = await import('./ui.js');
                    break;
                case 'auth':
                    module = await import('./auth.js');
                    break;
                case 'playlistManager':
                    module = await import('./playlistManager.js');
                    break;
                case 'searchManager':
                    module = await import('./searchManager.js');
                    break;
                case 'playbackController':
                    module = await import('./playbackController.js');
                    break;
                case 'sponsorblock':
                    module = await import('./sponsorblock.js');
                    break;
                case 'utils':
                    module = await import('./utils.js');
                    break;
                default:
                    throw new Error(`Módulo desconocido: ${moduleName}`);
            }
            
            this.modules.set(moduleName, module);
            this.loaded.add(moduleName);
            
            console.log(`✅ Módulo ${moduleName} cargado exitosamente`);
            
            // Post-load setup
            await this.setupModule(moduleName, module);
            
        } catch (error) {
            console.error(`💥 Error cargando módulo ${moduleName}:`, error);
            this.errors.set(moduleName, error);
            
            // Algunos módulos son críticos, otros opcionales
            if (this.isCriticalModule(moduleName)) {
                throw new Error(`Módulo crítico ${moduleName} falló: ${error.message}`);
            }
        }
    }
    
    async setupModule(moduleName, module) {
        switch (moduleName) {
            case 'ui':
                // Setup UI Manager
                if (module.UIManager && typeof module.UIManager.initialize === 'function') {
                    try {
                        await module.UIManager.initialize();
                        console.log(`🎨 UIManager inicializado`);
                    } catch (error) {
                        console.error('Error inicializando UIManager:', error);
                    }
                }
                break;
                
            case 'searchManager':
                // Setup Search Manager
                if (module.SearchManager && typeof module.SearchManager.initialize === 'function') {
                    try {
                        module.SearchManager.initialize();
                        console.log(`🔍 SearchManager inicializado`);
                    } catch (error) {
                        console.error('Error inicializando SearchManager:', error);
                    }
                }
                break;
                
            case 'auth':
                // Setup Auth Manager
                if (module.authManager) {
                    try {
                        // Auth se inicializa automáticamente
                        console.log(`🔐 AuthManager disponible`);
                    } catch (error) {
                        console.error('Error con AuthManager:', error);
                    }
                }
                break;
                
            default:
                // Módulos que no requieren setup especial
                break;
        }
    }
    
    isCriticalModule(moduleName) {
        const criticalModules = ['ui', 'messages'];
        return criticalModules.includes(moduleName);
    }
    
    getLoadResults() {
        return {
            loaded: Array.from(this.loaded),
            errors: Object.fromEntries(this.errors),
            total: this.loadOrder.length,
            success: this.loaded.size,
            failed: this.errors.size
        };
    }
    
    getModule(moduleName) {
        return this.modules.get(moduleName);
    }
}

// ===== COORDINADOR PRINCIPAL =====
class UnifiedSystemCoordinator {
    constructor() {
        this.moduleLoader = new UnifiedModuleLoader();
        this.initialized = false;
        this.initPromise = null;
    }
    
    async initialize() {
        if (this.initPromise) {
            return this.initPromise;
        }
        
        this.initPromise = this.performInitialization();
        return this.initPromise;
    }
    
    async performInitialization() {
        console.log('🎯 Iniciando coordinación del sistema unificado...');
        const startTime = Date.now();
        
        try {
            // 1. Verificar prerequisites
            const preflight = performPreflightChecks();
            if (!preflight.success) {
                throw new Error(`Preflight failed: ${preflight.passed}/${preflight.total} checks passed`);
            }
            
            // 2. Esperar a que el core esté completamente listo
            await this.waitForCore();
            
            // 3. Cargar todos los módulos
            const loadResults = await this.moduleLoader.loadAll();
            console.log('📊 Resultados de carga de módulos:', loadResults);
            
            // 4. Configurar integraciones
            await this.setupIntegrations();
            
            // 5. Configurar event listeners globales
            this.setupGlobalEvents();
            
            // 6. Finalizar inicialización
            await this.finalize();
            
            const totalTime = Date.now() - startTime;
            this.initialized = true;
            
            console.log(`🎉 Sistema unificado completamente inicializado en ${totalTime}ms`);
            
            // Dispatch evento final
            window.dispatchEvent(new CustomEvent('ytcrossmix:system:ready', {
                detail: {
                    timestamp: Date.now(),
                    totalTime,
                    modules: loadResults,
                    coordinator: this
                }
            }));
            
            return { success: true, totalTime, modules: loadResults };
            
        } catch (error) {
            console.error('💥 Error crítico en coordinador:', error);
            this.handleCriticalError(error);
            throw error;
        }
    }
    
    async waitForCore() {
        console.log('⏳ Esperando al core unificado...');
        
        const maxWait = 10000; // 10 segundos
        const checkInterval = 100;
        let elapsed = 0;
        
        while (elapsed < maxWait) {
            if (window.ytCrossMixUnified?.initialized) {
                console.log('✅ Core unificado listo');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            elapsed += checkInterval;
        }
        
        throw new Error('Timeout esperando al core unificado');
    }
    
    async setupIntegrations() {
        console.log('🔗 Configurando integraciones...');
        
        try {
            // Integración UI <-> Estado
            this.setupUIStateIntegration();
            
            // Integración Búsqueda <-> UI
            this.setupSearchUIIntegration();
            
            // Integración Reproducción <-> UI
            this.setupPlaybackUIIntegration();
            
            // Integración Auth <-> Playlists
            this.setupAuthPlaylistIntegration();
            
            console.log('✅ Integraciones configuradas');
            
        } catch (error) {
            console.error('⚠️ Error en integraciones:', error);
            // No es crítico, continuar
        }
    }
    
    setupUIStateIntegration() {
        // Escuchar cambios de estado y actualizar UI automáticamente
        if (window.unifiedStateManager) {
            window.unifiedStateManager.subscribe('playlist.playlistsData', () => {
                if (window.UIManager?.updatePlaylistsUI) {
                    window.UIManager.updatePlaylistsUI();
                }
            });
            
            window.unifiedStateManager.subscribe('ui.currentView', (newView) => {
                console.log(`🔄 Vista cambiada a: ${newView}`);
            });
        }
    }
    
    setupSearchUIIntegration() {
        // Integrar búsqueda con cambio de vista automático
        document.addEventListener('search-started', (e) => {
            if (window.UIManager?.switchView) {
                window.UIManager.switchView('search');
            }
        });
    }
    
    setupPlaybackUIIntegration() {
        // Actualizar UI cuando cambie el estado de reproducción
        document.addEventListener('unifiedPlayerStateChanged', (e) => {
            const { playerNum, state: playerState, videoId } = e.detail;
            
            // Actualizar botones de control
            this.updatePlaybackControls(playerState);
            
            // Actualizar mini player si está en mobile
            if (window.innerWidth <= 768) {
                this.updateMobilePlayer(videoId, playerState);
            }
        });
    }
    
    setupAuthPlaylistIntegration() {
        // Cargar playlists automáticamente después del login
        document.addEventListener('playlistsFetched', (e) => {
            console.log('📚 Playlists recibidas, actualizando UI...');
            if (window.UIManager?.updatePlaylistsUI) {
                setTimeout(() => {
                    window.UIManager.updatePlaylistsUI();
                }, 100);
            }
        });
        
        // Limpiar playlists después del logout
        document.addEventListener('userLoggedOut', () => {
            console.log('👤 Usuario deslogueado, limpiando estado...');
            if (window.unifiedStateManager) {
                window.unifiedStateManager.set('playlist.playlistsData', []);
            }
        });
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
            // Encontrar información del video actual
            const state = window.unifiedStateManager?.state;
            if (state) {
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
    }
    
    setupGlobalEvents() {
        console.log('🌐 Configurando eventos globales...');
        
        // Error handling global
        window.addEventListener('error', (e) => {
            if (!e.error?.message?.includes('Extension')) {
                console.error('🚨 Error global capturado:', e.error);
                this.handleGlobalError(e.error);
            }
        });
        
        // Unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            console.error('🚨 Promise rejection:', e.reason);
            this.handlePromiseRejection(e.reason);
            e.preventDefault();
        });
        
        // Visibility change (tab focus/blur)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('👁️ Tab visible - verificando estado...');
                this.performHealthCheck();
            }
        });
        
        // Online/offline status
        window.addEventListener('online', () => {
            console.log('🌐 Conexión restaurada');
            if (window.unifiedMessageManager) {
                window.unifiedMessageManager.show('Conexión restaurada', 'success', 2000);
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Sin conexión');
            if (window.unifiedMessageManager) {
                window.unifiedMessageManager.show('Sin conexión a internet', 'warning', 3000);
            }
        });
        
        // Resize handling
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
        
        console.log('✅ Eventos globales configurados');
    }
    
    handleResize() {
        const isDesktop = window.innerWidth >= 1024;
        
        if (window.unifiedStateManager) {
            window.unifiedStateManager.set('ui.isDesktop', isDesktop);
        }
        
        // Actualizar clases del body
        document.body.classList.toggle('is-desktop', isDesktop);
        document.body.classList.toggle('is-mobile', !isDesktop);
        
        // Ocultar/mostrar elementos según el dispositivo
        const mobileElements = document.querySelectorAll('.mobile-header, .bottom-nav, .mini-player');
        const desktopElements = document.querySelectorAll('.desktop-sidebar, .bottom-player');
        
        mobileElements.forEach(el => {
            el.style.display = isDesktop ? 'none' : '';
        });
        
        desktopElements.forEach(el => {
            el.style.display = isDesktop ? '' : 'none';
        });
        
        console.log(`📱 Resize manejado: ${isDesktop ? 'Desktop' : 'Mobile'}`);
    }
    
    async finalize() {
        console.log('🏁 Finalizando inicialización...');
        
        // Cleanup de elementos temporales
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            loadingSpinner.classList.add('hidden');
        }
        
        // Habilitar todos los elementos unified-ready
        const elementsToEnable = document.querySelectorAll('[data-requires-unified]');
        elementsToEnable.forEach(el => {
            el.classList.add('unified-ready');
        });
        
        // Remover clase de carga del body
        document.body.classList.remove('unified-loading');
        
        // Configurar viewport height fix para mobile
        this.setupViewportFix();
        
        // Realizar health check inicial
        setTimeout(() => {
            this.performHealthCheck();
        }, 2000);
        
        console.log('✅ Finalización completada');
    }
    
    setupViewportFix() {
        // Fix para viewport height en mobile
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
            core: !!window.ytCrossMixUnified?.initialized,
            modules: this.moduleLoader.loaded.size,
            state: !!window.unifiedStateManager?.state,
            youtube: !!window.unifiedYouTubeManager?.apiReady,
            players: !!window.unifiedYouTubeManager?.playersReady,
            ui: !!window.UIManager,
            online: navigator.onLine,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                isDesktop: window.innerWidth >= 1024
            }
        };
        
        console.log('🔍 Health Check:', health);
        
        // Reportar problemas críticos
        const criticalIssues = [];
        if (!health.core) criticalIssues.push('Core no inicializado');
        if (!health.state) criticalIssues.push('State Manager no disponible');
        if (!health.ui) criticalIssues.push('UI Manager no disponible');
        
        if (criticalIssues.length > 0) {
            console.warn('⚠️ Problemas críticos detectados:', criticalIssues);
            this.handleHealthIssues(criticalIssues);
        }
        
        return health;
    }
    
    handleHealthIssues(issues) {
        if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show(`Problemas detectados: ${issues.join(', ')}`, 'warning', 5000);
        }
        
        // Intentar auto-recuperación para problemas conocidos
        issues.forEach(issue => {
            if (issue.includes('UI Manager')) {
                this.attemptUIRecovery();
            }
        });
    }
    
    attemptUIRecovery() {
        console.log('🔧 Intentando recuperar UI Manager...');
        
        try {
            if (this.moduleLoader.getModule('ui')?.UIManager) {
                const UIManager = this.moduleLoader.getModule('ui').UIManager;
                if (typeof UIManager.initialize === 'function') {
                    UIManager.initialize();
                    console.log('✅ UI Manager recuperado');
                }
            }
        } catch (error) {
            console.error('💥 Fallo en recuperación de UI:', error);
        }
    }
    
    handleGlobalError(error) {
        console.error('🚨 Error global:', error);
        
        if (window.errorBoundary?.handleCriticalError) {
            window.errorBoundary.handleCriticalError(error, 'global');
        } else if (window.unifiedMessageManager) {
            window.unifiedMessageManager.show('Error en la aplicación', 'error');
        }
    }
    
    handlePromiseRejection(reason) {
        console.error('🚨 Promise rejection:', reason);
        
        // Solo mostrar mensaje si es un error significativo
        if (reason instanceof Error && !reason.message.includes('Extension')) {
            if (window.unifiedMessageManager) {
                window.unifiedMessageManager.show('Error en operación asíncrona', 'error', 3000);
            }
        }
    }
    
    handleCriticalError(error) {
        console.error('💀 Error crítico en coordinador:', error);
        
        // Mostrar error crítico al usuario
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
                <button onclick="location.reload()" style="
                    background: #ff6b35; color: white; border: none;
                    padding: 12px 24px; border-radius: 6px; cursor: pointer;
                    font-size: 16px; margin-top: 20px;
                ">Recargar Página</button>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
    }
    
    // ===== API PÚBLICA =====
    
    getStatus() {
        return {
            initialized: this.initialized,
            modules: {
                loaded: Array.from(this.moduleLoader.loaded),
                errors: Object.fromEntries(this.moduleLoader.errors),
                total: this.moduleLoader.loadOrder.length
            },
            health: this.performHealthCheck()
        };
    }
    
    async restart() {
        console.log('🔄 Reiniciando coordinador...');
        
        this.initialized = false;
        this.initPromise = null;
        
        // Limpiar módulos
        this.moduleLoader = new UnifiedModuleLoader();
        
        // Reinicializar
        return this.initialize();
    }
}

// ===== INICIALIZACIÓN AUTOMÁTICA =====
let coordinator;

async function initializeUnifiedSystem() {
    console.log('🎯 Iniciando sistema completo...');
    
    try {
        coordinator = new UnifiedSystemCoordinator();
        const result = await coordinator.initialize();
        
        console.log('🎉 Sistema completamente inicializado:', result);
        
        // Hacer disponible globalmente
        window.unifiedCoordinator = coordinator;
        
        return result;
        
    } catch (error) {
        console.error('💥 Fallo crítico en inicialización:', error);
        throw error;
    }
}

// Auto-inicialización
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUnifiedSystem);
} else {
    // DOM ya cargado
    setTimeout(initializeUnifiedSystem, 100);
}

// ===== EXPORTS =====
export { UnifiedSystemCoordinator, performPreflightChecks, UnifiedModuleLoader };
export default initializeUnifiedSystem;

console.log('✅ Inicializador principal unificado cargado');
