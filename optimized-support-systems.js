// ===== SISTEMAS DE SOPORTE OPTIMIZADOS =====
// Unifica messages.js y loadingmanager.js eliminando duplicaciones

// ===== UNIFIED MESSAGE MANAGER =====
class UnifiedMessageManager {
    constructor() {
        this.activeMessages = new Map();
        this.container = null;
        this.maxMessages = 5;
        this.defaultDuration = 3000;
        
        this.initializeContainer();
    }

    initializeContainer() {
        // Create or find container
        this.container = document.getElementById('floatingMessageContainer') || 
                        document.querySelector('.floating-messages');
        
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'floatingMessageContainer';
            this.container.className = 'floating-messages';
            document.body.appendChild(this.container);
        }
        
        console.log('✅ Message container inicializado');
    }

    show(message, type = 'info', duration = null) {
        const finalDuration = duration || this.defaultDuration;
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        console.log(`💬 Mensaje [${type}]: ${message}`);
        
        // Limit active messages
        if (this.activeMessages.size >= this.maxMessages) {
            const oldestId = this.activeMessages.keys().next().value;
            this.hide(oldestId);
        }
        
        const messageElement = this.createMessageElement(messageId, message, type);
        this.container.appendChild(messageElement);
        
        // Store reference
        this.activeMessages.set(messageId, {
            element: messageElement,
            type,
            message,
            createdAt: Date.now(),
            duration: finalDuration
        });
        
        // Show with animation
        requestAnimationFrame(() => {
            messageElement.classList.add('show');
        });
        
        // Auto-hide
        setTimeout(() => this.hide(messageId), finalDuration);
        
        // Click to dismiss
        messageElement.addEventListener('click', () => this.hide(messageId), { once: true });
        
        return messageElement;
    }

    createMessageElement(messageId, message, type) {
        const element = document.createElement('div');
        element.id = messageId;
        element.className = `floating-message ${type}`;
        element.textContent = message;
        
        // Base styles
        element.style.cssText = `
            background: var(--background-elevated);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px 16px;
            color: var(--text-primary);
            font-size: 14px;
            text-align: center;
            box-shadow: var(--shadow-medium);
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            cursor: pointer;
            max-width: 400px;
            word-wrap: break-word;
            margin-bottom: 8px;
            font-family: 'Roboto', sans-serif;
            font-weight: 500;
        `;
        
        // Type-specific styling
        const typeStyles = {
            success: 'background: rgba(76, 175, 80, 0.9); border-color: #4caf50; color: white;',
            error: 'background: rgba(244, 67, 54, 0.9); border-color: #f44336; color: white;',
            warning: 'background: rgba(255, 193, 7, 0.9); border-color: #ffc107; color: black;',
            info: 'background: rgba(33, 150, 243, 0.9); border-color: #2196f3; color: white;'
        };
        
        if (typeStyles[type]) {
            element.style.cssText += typeStyles[type];
        }
        
        return element;
    }

    hide(messageId) {
        const messageData = this.activeMessages.get(messageId);
        if (!messageData) return;
        
        const element = messageData.element;
        
        // Hide with animation
        element.style.opacity = '0';
        element.style.transform = 'translateY(-20px) scale(0.9)';
        
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
            this.activeMessages.delete(messageId);
        }, 300);
    }

    hideAll() {
        console.log('🧹 Limpiando todos los mensajes...');
        
        const messageIds = Array.from(this.activeMessages.keys());
        messageIds.forEach(id => this.hide(id));
        
        return messageIds.length;
    }

    getActiveMessages() {
        return Array.from(this.activeMessages.values()).map(data => ({
            id: data.element.id,
            type: data.type,
            message: data.message,
            age: Date.now() - data.createdAt
        }));
    }
}

// ===== UNIFIED LOADING MANAGER =====
class UnifiedLoadingManager {
    constructor() {
        this.activeLoaders = new Map();
        this.defaultConfig = {
            type: 'inline',
            message: 'Cargando...',
            showSpinner: true,
            timeout: 30000
        };
        
        this.setupStyles();
    }

    setupStyles() {
        if (!document.getElementById('unified-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'unified-loading-styles';
            style.textContent = `
                @keyframes unified-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .unified-loading-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 2000;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(10px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .unified-loading-overlay.show {
                    opacity: 1;
                }
                
                .unified-loading-content {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 12px;
                    padding: 24px;
                    text-align: center;
                    color: white;
                    min-width: 200px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                }
                
                .unified-spinner {
                    border: 3px solid rgba(255, 107, 53, 0.2);
                    border-top-color: #ff6b35;
                    border-radius: 50%;
                    animation: unified-spin 1s linear infinite;
                    margin: 0 auto 16px auto;
                }
                
                .unified-spinner.small { width: 20px; height: 20px; border-width: 2px; }
                .unified-spinner.medium { width: 32px; height: 32px; }
                .unified-spinner.large { width: 48px; height: 48px; border-width: 4px; }
                
                .unified-loading-inline {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                    gap: 12px;
                    padding: 20px;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .unified-loading-inline.show { opacity: 1; }
            `;
            document.head.appendChild(style);
        }
    }

    show(loaderId, config = {}) {
        if (this.activeLoaders.has(loaderId)) {
            console.log(`⚠️ Loading ${loaderId} ya activo`);
            return this.activeLoaders.get(loaderId).element;
        }

        const finalConfig = { ...this.defaultConfig, ...config };
        const loaderElement = this.createLoader(loaderId, finalConfig);
        
        if (!loaderElement) return null;
        
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
        
        console.log(`🔄 Loading mostrado: ${loaderId} (${finalConfig.type})`);
        return loaderElement;
    }

    hide(loaderId) {
        const loaderData = this.activeLoaders.get(loaderId);
        if (!loaderData) return 0;

        const duration = Date.now() - loaderData.startTime;
        
        // Clear timeout
        if (loaderData.timeout) {
            clearTimeout(loaderData.timeout);
        }

        // Remove with animation
        this.removeLoader(loaderData.element);
        this.activeLoaders.delete(loaderId);
        
        console.log(`✅ Loading ocultado: ${loaderId} (${duration}ms)`);
        return duration;
    }

    createLoader(loaderId, config) {
        const { type, message, showSpinner } = config;
        let loaderElement;
        let targetContainer;

        // Determine target container
        if (config.container) {
            targetContainer = typeof config.container === 'string' 
                ? document.getElementById(config.container) || document.querySelector(config.container)
                : config.container;
        }

        switch (type) {
            case 'overlay':
                loaderElement = this.createOverlayLoader(loaderId, config);
                document.body.appendChild(loaderElement);
                break;
            
            case 'inline':
                loaderElement = this.createInlineLoader(loaderId, config);
                if (targetContainer) {
                    targetContainer.innerHTML = '';
                    targetContainer.appendChild(loaderElement);
                }
                break;
            
            default:
                loaderElement = this.createInlineLoader(loaderId, config);
                if (targetContainer) {
                    targetContainer.innerHTML = '';
                    targetContainer.appendChild(loaderElement);
                }
        }

        // Show with animation
        if (loaderElement) {
            requestAnimationFrame(() => {
                loaderElement.classList.add('show');
            });
        }

        return loaderElement;
    }

    createOverlayLoader(loaderId, config) {
        const overlay = document.createElement('div');
        overlay.className = 'unified-loading-overlay';
        overlay.id = `loading-overlay-${loaderId}`;

        const content = document.createElement('div');
        content.className = 'unified-loading-content';

        if (config.showSpinner) {
            const spinner = document.createElement('div');
            spinner.className = 'unified-spinner large';
            content.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
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

    createInlineLoader(loaderId, config) {
        const loader = document.createElement('div');
        loader.className = 'unified-loading-inline';
        loader.id = `loading-inline-${loaderId}`;

        if (config.showSpinner) {
            const spinner = document.createElement('div');
            spinner.className = 'unified-spinner medium';
            loader.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
            message.textContent = config.message;
            message.style.cssText = `
                color: var(--text-secondary);
                font-size: 14px;
                text-align: center;
                margin-top: ${config.showSpinner ? '12px' : '0'};
            `;
            loader.appendChild(message);
        }

        return loader;
    }

    removeLoader(element) {
        if (!element || !element.parentNode) return;

        element.style.opacity = '0';
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
        }, 300);
    }

    updateMessage(loaderId, newMessage) {
        const loaderData = this.activeLoaders.get(loaderId);
        if (!loaderData) return false;

        const messageElement = loaderData.element.querySelector('div:last-child');
        if (messageElement && !messageElement.classList.contains('unified-spinner')) {
            messageElement.textContent = newMessage;
            return true;
        }

        return false;
    }

    hideAll() {
        const activeIds = Array.from(this.activeLoaders.keys());
        activeIds.forEach(id => this.hide(id));
        console.log(`🧹 ${activeIds.length} loaders limpiados`);
        return activeIds.length;
    }

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
            containerExists: !!this.container,
            timestamp: Date.now()
        };
    }
}

// ===== MESSAGE SYSTEM MIGRATOR OPTIMIZADO =====
class MessageSystemMigrator {
    static migrate() {
        console.log('🔄 Migrando sistema de mensajes...');
        
        // Create unified manager if it doesn't exist
        if (!window.unifiedMessageManager) {
            window.unifiedMessageManager = new UnifiedMessageManager();
        }
        
        // Override legacy function
        window.mostrarMensajeFlotante = function(mensaje, duracion, tipo) {
            return window.unifiedMessageManager.show(mensaje, tipo || 'info', duracion || 3000);
        };
        
        console.log('✅ Migración de mensajes completada');
    }
    
    static checkStatus() {
        return {
            unifiedManagerAvailable: !!window.unifiedMessageManager,
            legacyFunctionExists: typeof window.mostrarMensajeFlotante === 'function',
            containerExists: !!document.querySelector('.floating-messages, #floatingMessageContainer')
        };
    }
}

// ===== UNIFIED LOADING MANAGER SIMPLIFIED =====
class SimpleLoadingManager {
    constructor() {
        this.activeLoaders = new Set();
    }

    show(loaderId, config = {}) {
        if (this.activeLoaders.has(loaderId)) return;
        
        const type = config.type || 'inline';
        const message = config.message || 'Cargando...';
        const container = config.container;
        
        let targetElement;
        
        if (container) {
            targetElement = typeof container === 'string' ? 
                          document.getElementById(container) || document.querySelector(container) :
                          container;
        }
        
        if (type === 'overlay') {
            targetElement = document.body;
        }
        
        if (!targetElement) {
            console.warn(`⚠️ No se encontró contenedor para loading: ${loaderId}`);
            return;
        }
        
        const loadingHTML = type === 'overlay' ? 
            this.createOverlayHTML(loaderId, message) :
            this.createInlineHTML(loaderId, message);
        
        if (type === 'overlay') {
            targetElement.insertAdjacentHTML('beforeend', loadingHTML);
        } else {
            targetElement.innerHTML = loadingHTML;
        }
        
        this.activeLoaders.add(loaderId);
        
        // Auto-hide with timeout
        if (config.timeout !== false) {
            setTimeout(() => this.hide(loaderId), config.timeout || 30000);
        }
        
        console.log(`🔄 Loading simple mostrado: ${loaderId}`);
    }

    hide(loaderId) {
        if (!this.activeLoaders.has(loaderId)) return;
        
        const element = document.getElementById(`simple-loading-${loaderId}`);
        if (element) {
            element.style.opacity = '0';
            setTimeout(() =>
                }
    }
}
