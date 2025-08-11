// Ayudante de Integración - Facilita la carga e inicialización de módulos
class IntegrationHelper {
    constructor() {
        this.modules = new Map();
        this.loadingPromises = new Map();
        this.initialized = false;
    }

    // Cargar un módulo de forma asíncrona con retry
    async loadModule(name, importPath, maxRetries = 3) {
        if (this.modules.has(name)) {
            return this.modules.get(name);
        }

        if (this.loadingPromises.has(name)) {
            return this.loadingPromises.get(name);
        }

        const loadPromise = this._loadModuleWithRetry(name, importPath, maxRetries);
        this.loadingPromises.set(name, loadPromise);

        try {
            const module = await loadPromise;
            this.modules.set(name, module);
            return module;
        } catch (error) {
            this.loadingPromises.delete(name);
            throw error;
        }
    }

    async _loadModuleWithRetry(name, importPath, maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Cargando módulo ${name} (intento ${attempt}/${maxRetries})`);
                const module = await import(importPath);
                console.log(`✓ Módulo ${name} cargado correctamente`);
                return module;
            } catch (error) {
                lastError = error;
                console.error(`✗ Error cargando módulo ${name} (intento ${attempt}/${maxRetries}):`, error);
                
                if (attempt < maxRetries) {
                    // Esperar antes del siguiente intento
                    await this.sleep(500 * attempt);
                }
            }
        }
        
        throw new Error(`No se pudo cargar el módulo ${name} después de ${maxRetries} intentos: ${lastError.message}`);
    }

    // Cargar múltiples módulos en paralelo
    async loadMultipleModules(moduleConfigs) {
        const loadPromises = moduleConfigs.map(config => 
            this.loadModule(config.name, config.path, config.maxRetries || 3)
                .then(module => ({ name: config.name, module, success: true }))
                .catch(error => ({ name: config.name, error, success: false }))
        );

        const results = await Promise.all(loadPromises);
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (failed.length > 0) {
            console.warn('Algunos módulos no se pudieron cargar:', failed);
        }

        return {
            successful: successful.map(r => ({ name: r.name, module: r.module })),
            failed: failed.map(r => ({ name: r.name, error: r.error })),
            totalCount: results.length,
            successCount: successful.length,
            failedCount: failed.length
        };
    }

    // Verificar dependencias
    checkDependencies(dependencies) {
        const missing = [];
        const available = [];

        dependencies.forEach(dep => {
            if (typeof dep === 'string') {
                // Verificar variable global
                if (window[dep]) {
                    available.push(dep);
                } else {
                    missing.push(dep);
                }
            } else if (typeof dep === 'object' && dep.name && dep.check) {
                // Verificación personalizada
                if (dep.check()) {
                    available.push(dep.name);
                } else {
                    missing.push(dep.name);
                }
            }
        });

        return {
            available,
            missing,
            allAvailable: missing.length === 0
        };
    }

    // Esperar hasta que una condición se cumpla
    async waitFor(condition, timeout = 10000, checkInterval = 100) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return true;
            }
            await this.sleep(checkInterval);
        }
        
        throw new Error(`Timeout esperando condición después de ${timeout}ms`);
    }

    // Utilidad sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Verificar estado de módulos cargados
    getLoadedModules() {
        return Array.from(this.modules.keys());
    }

    // Verificar si un módulo específico está cargado
    isModuleLoaded(name) {
        return this.modules.has(name);
    }

    // Obtener un módulo cargado
    getModule(name) {
        return this.modules.get(name);
    }

    // Diagnóstico completo del sistema
    async runDiagnostics() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            browser: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                onLine: navigator.onLine,
                cookieEnabled: navigator.cookieEnabled
            },
            modules: {
                loaded: this.getLoadedModules(),
                loadingInProgress: Array.from(this.loadingPromises.keys())
            },
            dom: {
                ready: document.readyState,
                hasJQuery: typeof $ !== 'undefined',
                hasYouTubeAPI: typeof YT !== 'undefined' && typeof YT.Player !== 'undefined'
            },
            storage: {
                localStorage: this.checkStorageAvailability('localStorage'),
                sessionStorage: this.checkStorageAvailability('sessionStorage')
            },
            apis: {
                fetch: typeof fetch !== 'undefined',
                gapi: typeof gapi !== 'undefined',
                google: typeof google !== 'undefined'
            }
        };

        // Verificar elementos DOM críticos
        const criticalElements = [
            'botonPlay', 'botonNext', 'player1', 'player2', 
            'searchInput', 'playlistContainer', 'results'
        ];
        
        diagnostics.dom.criticalElements = {};
        criticalElements.forEach(id => {
            diagnostics.dom.criticalElements[id] = !!document.getElementById(id);
        });

        return diagnostics;
    }

    // Verificar disponibilidad de storage
    checkStorageAvailability(storageType) {
        try {
            const storage = window[storageType];
            const testKey = '__storage_test__';
            storage.setItem(testKey, 'test');
            storage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Mostrar diagnósticos en consola de forma bonita
    printDiagnostics(diagnostics) {
        console.log('%c=== DIAGNÓSTICO DEL SISTEMA ===', 'color: #2196F3; font-weight: bold; font-size: 14px');
        
        console.log('%cNavegador:', 'color: #4CAF50; font-weight: bold');
        console.table(diagnostics.browser);
        
        console.log('%cMódulos:', 'color: #4CAF50; font-weight: bold');
        console.log('Cargados:', diagnostics.modules.loaded);
        console.log('Cargando:', diagnostics.modules.loadingInProgress);
        
        console.log('%cDOM:', 'color: #4CAF50; font-weight: bold');
        console.table(diagnostics.dom);
        
        console.log('%cAPIs Disponibles:', 'color: #4CAF50; font-weight: bold');
        console.table(diagnostics.apis);
        
        console.log('%c================================', 'color: #2196F3; font-weight: bold');
    }
}

// Crear instancia global
const integrationHelper = new IntegrationHelper();

// Función de conveniencia para inicialización completa
async function initializeYTCrossMix() {
    try {
        console.log('🚀 Iniciando YT CrossMix con IntegrationHelper...');
        
        // Verificar diagnósticos iniciales
        const diagnostics = await integrationHelper.runDiagnostics();
        console.log('📊 Diagnósticos iniciales:', diagnostics);
        
        // Configuración de módulos a cargar
        const moduleConfigs = [
            { name: 'config', path: './config.js' },
            { name: 'utils', path: './utils.js' },
            { name: 'ui', path: './ui.js' },
            { name: 'auth', path: './auth.js' },
            { name: 'playlistManager', path: './playlistManager.js' }
        ];

        // Cargar módulos opcionales (que pueden no existir)
        const optionalModules = [
            { name: 'searchManager', path: './searchManager.js' },
            { name: 'playbackController', path: './playbackController.js' },
            { name: 'sponsorBlockManager', path: './sponsorblock.js' },
            { name: 'youtubeAPI', path: './youtubeAPI.js' }
        ];

        // Cargar módulos principales
        console.log('📦 Cargando módulos principales...');
        const mainResults = await integrationHelper.loadMultipleModules(moduleConfigs);
        
        if (mainResults.failedCount > 0) {
            console.warn('⚠️ Algunos módulos principales fallaron:', mainResults.failed);
        } else {
            console.log('✅ Todos los módulos principales cargados correctamente');
        }

        // Cargar módulos opcionales
        console.log('📦 Cargando módulos opcionales...');
        const optionalResults = await integrationHelper.loadMultipleModules(optionalModules);
        console.log(`📊 Módulos opcionales: ${optionalResults.successCount}/${optionalResults.totalCount} cargados`);

        // Inicializar autenticación si está disponible
        if (integrationHelper.isModuleLoaded('auth')) {
            const authModule = integrationHelper.getModule('auth');
            if (authModule.authManager) {
                console.log('🔐 Inicializando autenticación...');
                await authModule.authManager.initialize();
                console.log('✅ Autenticación inicializada');
            }
        }

        console.log('🎉 YT CrossMix inicializado correctamente con IntegrationHelper');
        return true;
        
    } catch (error) {
        console.error('💥 Error crítico inicializando YT CrossMix:', error);
        return false;
    }
}

// Exportar para uso global
window.integrationHelper = integrationHelper;
window.initializeYTCrossMix = initializeYTCrossMix;

export { IntegrationHelper, integrationHelper, initializeYTCrossMix };
