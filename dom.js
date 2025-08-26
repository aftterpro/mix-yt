// dom.js - NUEVO ARCHIVO PARA MANEJO SEGURO DEL DOM

class DOMManager {
    constructor() {
        this.elements = new Map();
        this.eventListeners = new WeakMap();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 500;
    }
    
    // Obtener elemento de manera segura con reintentos
    async safeGetElement(selector, options = {}) {
        const { 
            required = false, 
            timeout = 5000,
            fallbackCreate = null,
            parent = document
        } = options;
        
        // Check cache primero
        if (this.elements.has(selector)) {
            const cached = this.elements.get(selector);
            if (cached && parent.contains(cached)) {
                return cached;
            } else {
                this.elements.delete(selector);
            }
        }
        
        // Intentar obtener elemento
        let element = parent.querySelector(selector);
        
        if (element) {
            this.elements.set(selector, element);
            return element;
        }
        
        // Si no se encuentra y es requerido, intentar crear o esperar
        if (required || fallbackCreate) {
            console.warn(`⚠️ Elemento requerido no encontrado: ${selector}`);
            
            if (fallbackCreate && typeof fallbackCreate === 'function') {
                try {
                    element = fallbackCreate();
                    if (element) {
                        console.log(`✅ Elemento creado via fallback: ${selector}`);
                        this.elements.set(selector, element);
                        return element;
                    }
                } catch (error) {
                    console.error(`Error creando elemento ${selector}:`, error);
                }
            }
            
            // Retry logic
            const retryKey = selector;
            const currentAttempts = this.retryAttempts.get(retryKey) || 0;
            
            if (currentAttempts < this.maxRetries) {
                this.retryAttempts.set(retryKey, currentAttempts + 1);
                console.log(`🔄 Reintentando buscar ${selector} (${currentAttempts + 1}/${this.maxRetries})`);
                
                return new Promise((resolve) => {
                    setTimeout(async () => {
                        const retryResult = await this.safeGetElement(selector, options);
                        resolve(retryResult);
                    }, this.retryDelay * (currentAttempts + 1));
                });
            } else {
                console.error(`❌ Elemento ${selector} no encontrado después de ${this.maxRetries} intentos`);
                this.retryAttempts.delete(retryKey);
            }
        }
        
        return null;
    }
    
    // Obtener múltiples elementos de manera segura
    async safeGetElements(selectors) {
        const results = {};
        
        await Promise.all(
            Object.entries(selectors).map(async ([key, config]) => {
                if (typeof config === 'string') {
                    config = { selector: config };
                }
                
                const element = await this.safeGetElement(config.selector, config);
                results[key] = element;
            })
        );
        
        return results;
    }
    
    // Event listener seguro que previene duplicados
    safeAddEventListener(element, event, handler, options = {}) {
        if (!element) {
            console.warn('⚠️ Intentando añadir listener a elemento null');
            return null;
        }
        
        // Verificar si ya existe un listener
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, new Map());
        }
        
        const elementListeners = this.eventListeners.get(element);
        const listenerKey = `${event}-${handler.name || 'anonymous'}`;
        
        // Remover listener existente si existe
        if (elementListeners.has(listenerKey)) {
            const oldHandler = elementListeners.get(listenerKey);
            element.removeEventListener(event, oldHandler, options);
        }
        
        // Añadir nuevo listener
        element.addEventListener(event, handler, options);
        elementListeners.set(listenerKey, handler);
        
        console.log(`🔗 Event listener añadido: ${element.tagName}#${element.id} -> ${event}`);
        
        // Retornar función de cleanup
        return () => {
            element.removeEventListener(event, handler, options);
            elementListeners.delete(listenerKey);
        };
    }
    
    // Remover todos los listeners de un elemento
    removeAllEventListeners(element) {
        if (!element || !this.eventListeners.has(element)) return;
        
        const elementListeners = this.eventListeners.get(element);
        elementListeners.clear();
        this.eventListeners.delete(element);
        
        console.log(`🗑️ Todos los listeners removidos para: ${element.tagName}#${element.id}`);
    }
    
    // Crear elemento de manera segura
    createElement(tag, options = {}) {
        const {
            id,
            className,
            innerHTML,
            textContent,
            attributes = {},
            styles = {},
            parent = null
        } = options;
        
        const element = document.createElement(tag);
        
        if (id) element.id = id;
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        if (textContent) element.textContent = textContent;
        
        // Añadir atributos
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        
        // Añadir estilos
        Object.assign(element.style, styles);
        
        // Añadir al parent si se especifica
        if (parent) {
            parent.appendChild(element);
        }
        
        return element;
    }
    
    // Verificar si un elemento está visible
    isElementVisible(element) {
        if (!element) return false;
        
        const rect = element.getBoundingClientRect();
        const viewHeight = window.innerHeight || document.documentElement.clientHeight;
        const viewWidth = window.innerWidth || document.documentElement.clientWidth;
        
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= viewHeight &&
            rect.right <= viewWidth &&
            rect.width > 0 &&
            rect.height > 0
        );
    }
    
    // Scroll seguro a elemento
    safeScrollTo(element, options = {}) {
        if (!element) return;
        
        const defaultOptions = {
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        };
        
        try {
            element.scrollIntoView({ ...defaultOptions, ...options });
        } catch (error) {
            console.warn('Error en scrollIntoView, usando fallback:', error);
            // Fallback manual
            element.scrollTop = element.offsetTop;
        }
    }
    
    // Esperar a que el DOM esté listo
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', resolve, { once: true });
            } else {
                resolve();
            }
        });
    }
    
    // Esperar a que un elemento aparezca
    waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // Timeout
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Elemento ${selector} no apareció en ${timeout}ms`));
            }, timeout);
        });
    }
    
    // Toggle clase de manera segura
    safeToggleClass(element, className, force) {
        if (!element) return false;
        
        try {
            if (force !== undefined) {
                element.classList.toggle(className, force);
                return force;
            } else {
                element.classList.toggle(className);
                return element.classList.contains(className);
            }
        } catch (error) {
            console.warn('Error toggle class:', error);
            return false;
        }
    }
    
    // Obtener datos del elemento de manera segura
    safeGetData(element, attribute) {
        if (!element) return null;
        
        try {
            return element.dataset[attribute] || element.getAttribute(`data-${attribute}`);
        } catch (error) {
            console.warn('Error obteniendo data attribute:', error);
            return null;
        }
    }
    
    // Cleanup completo
    cleanup() {
        // Limpiar cache de elementos
        this.elements.clear();
        
        // Remover todos los event listeners
        for (const [element, listeners] of this.eventListeners.entries()) {
            if (element && element.parentNode) {
                listeners.clear();
            }
        }
        this.eventListeners = new WeakMap();
        
        // Reset retry attempts
        this.retryAttempts.clear();
        
        console.log('🧹 DOM Manager limpiado');
    }
    
    // Debug info
    debug() {
        console.log('=== DOM MANAGER DEBUG ===');
        console.log('Elements cached:', this.elements.size);
        console.log('Retry attempts:', Array.from(this.retryAttempts.entries()));
        console.log('Event listeners active:', this.eventListeners);
        console.log('Document ready state:', document.readyState);
        console.log('========================');
    }
}

// Instancia única global
export const domManager = new DOMManager();

// Funciones de conveniencia
export function safeGetElement(selector, options) {
    return domManager.safeGetElement(selector, options);
}

export function safeAddEventListener(element, event, handler, options) {
    return domManager.safeAddEventListener(element, event, handler, options);
}

export function createElement(tag, options) {
    return domManager.createElement(tag, options);
}

export function waitForElement(selector, timeout) {
    return domManager.waitForElement(selector, timeout);
}

// Hacer disponible globalmente
window.domManager = domManager;
window.safeGetElement = safeGetElement;