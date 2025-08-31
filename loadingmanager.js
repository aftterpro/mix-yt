// ===== LOADINGMANAGER.JS - SISTEMA DE LOADING UNIFICADO =====
// Sistema centralizado para manejar todos los estados de carga

export class LoadingManager {
    constructor() {
        this.activeLoaders = new Map(); // Map<id, config>
        this.defaultConfig = {
            type: 'inline', // 'overlay', 'inline', 'append', 'small', 'large'
            message: 'Cargando...',
            showSpinner: true,
            backdrop: true,
            timeout: 30000 // 30 segundos timeout por defecto
        };
    }

    // ✅ MOSTRAR LOADING
    show(loaderId, config = {}) {
        if (this.activeLoaders.has(loaderId)) {
            console.log(`⚠️ Loading ${loaderId} ya está activo`);
            return this.activeLoaders.get(loaderId);
        }

        const finalConfig = { ...this.defaultConfig, ...config };
        
        console.log(`🔄 Mostrando loading: ${loaderId}`, finalConfig);

        const loaderElement = this.createLoader(loaderId, finalConfig);
        const loaderData = {
            id: loaderId,
            config: finalConfig,
            element: loaderElement,
            startTime: Date.now(),
            timeout: null
        };

        // Setup timeout
        if (finalConfig.timeout > 0) {
            loaderData.timeout = setTimeout(() => {
                console.warn(`⏰ Timeout loading: ${loaderId}`);
                this.hide(loaderId);
                window.unifiedMessageManager?.show('Tiempo de espera agotado', 'warning');
            }, finalConfig.timeout);
        }

        this.activeLoaders.set(loaderId, loaderData);
        return loaderElement;
    }

    // ✅ OCULTAR LOADING
    hide(loaderId) {
        const loaderData = this.activeLoaders.get(loaderId);
        if (!loaderData) {
            console.log(`⚠️ Loading ${loaderId} no está activo`);
            return;
        }

        const duration = Date.now() - loaderData.startTime;
        console.log(`✅ Ocultando loading: ${loaderId} (duración: ${duration}ms)`);

        // Limpiar timeout
        if (loaderData.timeout) {
            clearTimeout(loaderData.timeout);
        }

        // Remover elemento con animación
        this.removeLoader(loaderData.element, loaderData.config);

        // Limpiar del mapa
        this.activeLoaders.delete(loaderId);

        return duration;
    }

    // ✅ CREAR ELEMENTO DE LOADING
    createLoader(loaderId, config) {
        const { type, message, showSpinner } = config;

        let loaderElement;
        let targetContainer;

        // Determinar contenedor target
        if (config.container) {
            targetContainer = typeof config.container === 'string' 
                ? document.getElementById(config.container) || document.querySelector(config.container)
                : config.container;
        }

        // Crear elemento según tipo
        switch (type) {
            case 'overlay':
                loaderElement = this.createOverlayLoader(loaderId, config);
                targetContainer = document.body;
                break;
            
            case 'inline':
                loaderElement = this.createInlineLoader(loaderId, config);
                if (!targetContainer) {
                    console.warn(`⚠️ No hay contenedor para loading inline: ${loaderId}`);
                    return null;
                }
                break;
            
            case 'append':
                loaderElement = this.createAppendLoader(loaderId, config);
                if (!targetContainer) {
                    console.warn(`⚠️ No hay contenedor para loading append: ${loaderId}`);
                    return null;
                }
                break;
            
            case 'small':
                loaderElement = this.createSmallLoader(loaderId, config);
                break;
            
            case 'large':
                loaderElement = this.createLargeLoader(loaderId, config);
                break;
            
            default:
                loaderElement = this.createInlineLoader(loaderId, config);
        }

        if (loaderElement && targetContainer) {
            // Añadir al DOM
            if (type === 'append') {
                targetContainer.appendChild(loaderElement);
            } else if (type === 'overlay') {
                targetContainer.appendChild(loaderElement);
            } else {
                // inline, small, large - reemplazar contenido
                if (targetContainer.children.length > 0) {
                    // Guardar contenido original para restaurar después
                    loaderElement.dataset.originalContent = targetContainer.innerHTML;
                }
                targetContainer.innerHTML = '';
                targetContainer.appendChild(loaderElement);
            }

            // Animación de entrada
            requestAnimationFrame(() => {
                loaderElement.classList.add('show');
            });
        }

        return loaderElement;
    }

    // ✅ CREAR OVERLAY LOADER
    createOverlayLoader(loaderId, config) {
        const overlay = document.createElement('div');
        overlay.id = `loading-overlay-${loaderId}`;
        overlay.className = 'unified-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        const content = document.createElement('div');
        content.className = 'unified-loading-content';
        content.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 200px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        `;

        if (config.showSpinner) {
            const spinner = this.createSpinner('large');
            content.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
            message.className = 'loading-message';
            message.textContent = config.message;
            message.style.cssText = `
                margin-top: ${config.showSpinner ? '16px' : '0'};
                font-size: 14px;
                font-weight: 500;
            `;
            content.appendChild(message);
        }

        overlay.appendChild(content);
        return overlay;
    }

    // ✅ CREAR INLINE LOADER
    createInlineLoader(loaderId, config) {
        const loader = document.createElement('div');
        loader.id = `loading-inline-${loaderId}`;
        loader.className = 'unified-loading-inline';
        loader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 12px;
            padding: 20px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        if (config.showSpinner) {
            const spinner = this.createSpinner('medium');
            loader.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
            message.className = 'loading-message';
            message.textContent = config.message;
            message.style.cssText = `
                color: #666;
                font-size: 14px;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            loader.appendChild(message);
        }

        return loader;
    }

    // ✅ CREAR APPEND LOADER
    createAppendLoader(loaderId, config) {
        const loader = document.createElement('div');
        loader.id = `loading-append-${loaderId}`;
        loader.className = 'unified-loading-append';
        loader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 16px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        if (config.showSpinner) {
            const spinner = this.createSpinner('small');
            loader.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('span');
            message.textContent = config.message;
            message.style.cssText = `
                color: #666;
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            loader.appendChild(message);
        }

        return loader;
    }

    // ✅ CREAR SMALL LOADER
    createSmallLoader(loaderId, config) {
        const loader = document.createElement('div');
        loader.id = `loading-small-${loaderId}`;
        loader.className = 'unified-loading-small';
        loader.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        if (config.showSpinner) {
            const spinner = this.createSpinner('small');
            loader.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('span');
            message.textContent = config.message;
            message.style.cssText = `
                color: #666;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            loader.appendChild(message);
        }

        return loader;
    }

    // ✅ CREAR LARGE LOADER
    createLargeLoader(loaderId, config) {
        const loader = document.createElement('div');
        loader.id = `loading-large-${loaderId}`;
        loader.className = 'unified-loading-large';
        loader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
            padding: 40px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        if (config.showSpinner) {
            const spinner = this.createSpinner('large');
            loader.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
            message.className = 'loading-message';
            message.textContent = config.message;
            message.style.cssText = `
                color: #666;
                font-size: 16px;
                font-weight: 500;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            loader.appendChild(message);
        }

        return loader;
    }

    // ✅ CREAR SPINNER
    createSpinner(size = 'medium') {
        const spinner = document.createElement('div');
        spinner.className = `unified-spinner spinner-${size}`;
        
        let dimensions;
        switch (size) {
            case 'small':
                dimensions = '20px';
                break;
            case 'large':
                dimensions = '48px';
                break;
            default: // medium
                dimensions = '32px';
        }

        spinner.style.cssText = `
            width: ${dimensions};
            height: ${dimensions};
            border: 3px solid rgba(255, 107, 53, 0.2);
            border-top-color: #ff6b35;
            border-radius: 50%;
            animation: unified-spin 1s linear infinite;
        `;

        // Añadir keyframes si no existen
        if (!document.getElementById('unified-spinner-styles')) {
            const style = document.createElement('style');
            style.id = 'unified-spinner-styles';
            style.textContent = `
                @keyframes unified-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .unified-loading-overlay.show,
                .unified-loading-inline.show,
                .unified-loading-append.show,
                .unified-loading-small.show,
                .unified-loading-large.show {
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(style);
        }

        return spinner;
    }

    // ✅ REMOVER LOADER CON ANIMACIÓN
    removeLoader(element, config) {
        if (!element || !element.parentNode) return;

        // Animación de salida
        element.style.opacity = '0';

        setTimeout(() => {
            if (element.parentNode) {
                // Restaurar contenido original si existe
                if (element.dataset.originalContent && element.parentNode) {
                    element.parentNode.innerHTML = element.dataset.originalContent;
                } else {
                    element.remove();
                }
            }
        }, 300);
    }

    // ✅ ACTUALIZAR MENSAJE
    updateMessage(loaderId, newMessage) {
        const loaderData = this.activeLoaders.get(loaderId);
        if (!loaderData) return false;

        const messageElement = loaderData.element.querySelector('.loading-message');
        if (messageElement) {
            messageElement.textContent = newMessage;
            console.log(`📝 Mensaje actualizado para ${loaderId}: ${newMessage}`);
            return true;
        }

        return false;
    }

    // ✅ VERIFICAR ESTADO
    isActive(loaderId) {
        return this.activeLoaders.has(loaderId);
    }

    // ✅ OBTENER TODOS LOS LOADERS ACTIVOS
    getActiveLoaders() {
        return Array.from(this.activeLoaders.keys());
    }

    // ✅ LIMPIAR TODOS LOS LOADERS
    hideAll() {
        console.log('🧹 Limpiando todos los loaders activos...');
        
        const activeIds = this.getActiveLoaders();
        activeIds.forEach(id => this.hide(id));
        
        console.log(`✅ ${activeIds.length} loaders limpiados`);
        return activeIds.length;
    }

    // ✅ CONFIGURAR TIMEOUT GLOBAL
    setDefaultTimeout(timeout) {
        this.defaultConfig.timeout = timeout;
        console.log(`⏰ Timeout por defecto configurado: ${timeout}ms`);
    }

    // ✅ DEBUG INFO
    getDebugInfo() {
        const activeLoaders = Array.from(this.activeLoaders.entries()).map(([id, data]) => ({
            id,
            type: data.config.type,
            message: data.config.message,
            duration: Date.now() - data.startTime,
            hasTimeout: !!data.timeout
        }));

        return {
            totalActive: this.activeLoaders.size,
            activeLoaders,
            defaultConfig: this.defaultConfig,
            timestamp: Date.now()
        };
    }
}

// ✅ CREAR INSTANCIA GLOBAL
const unifiedLoadingManager = new LoadingManager();

// ✅ FUNCIONES DE CONVENIENCIA
export function showLoading(id, config) {
    return unifiedLoadingManager.show(id, config);
}

export function hideLoading(id) {
    return unifiedLoadingManager.hide(id);
}

export function updateLoadingMessage(id, message) {
    return unifiedLoadingManager.updateMessage(id, message);
}

export function isLoadingActive(id) {
    return unifiedLoadingManager.isActive(id);
}

export function hideAllLoading() {
    return unifiedLoadingManager.hideAll();
}

// ✅ AUTO-SETUP GLOBAL
if (typeof window !== 'undefined') {
    window.unifiedLoadingManager = unifiedLoadingManager;
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    window.updateLoadingMessage = updateLoadingMessage;
    window.isLoadingActive = isLoadingActive;
    window.hideAllLoading = hideAllLoading;
    
    // Debug helpers
    window.LoadingDebug = {
        showOverlay: (message = 'Test Overlay') => showLoading('test-overlay', {
            type: 'overlay',
            message,
            timeout: 5000
        }),
        showInline: (container = 'searchResults', message = 'Test Inline') => showLoading('test-inline', {
            type: 'inline',
            container,
            message,
            timeout: 5000
        }),
        showAppend: (container = 'searchResults', message = 'Cargando más...') => showLoading('test-append', {
            type: 'append',
            container,
            message,
            timeout: 5000
        }),
        getDebugInfo: () => unifiedLoadingManager.getDebugInfo(),
        hideAll: () => unifiedLoadingManager.hideAll(),
        testSequence: async () => {
            console.log('🧪 Iniciando secuencia de test...');
            
            // Test overlay
            showLoading('test-1', { type: 'overlay', message: 'Test 1: Overlay' });
            await new Promise(r => setTimeout(r, 2000));
            hideLoading('test-1');
            
            // Test inline
            showLoading('test-2', { 
                type: 'inline', 
                container: 'searchResults',
                message: 'Test 2: Inline'
            });
            await new Promise(r => setTimeout(r, 2000));
            hideLoading('test-2');
            
            // Test append
            showLoading('test-3', { 
                type: 'append',
                container: 'searchResults',
                message: 'Test 3: Append'
            });
            await new Promise(r => setTimeout(r, 2000));
            hideLoading('test-3');
            
            console.log('✅ Secuencia de test completada');
        }
    };
    
    console.log('🔧 LoadingDebug disponible: window.LoadingDebug.testSequence()');
}

// ✅ CLEANUP ON PAGE UNLOAD
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        unifiedLoadingManager.hideAll();
    });
}

export default unifiedLoadingManager;
console.log('✅ LoadingManager cargado - Sistema de Loading Unificado');
