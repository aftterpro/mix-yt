// ===== SYSTEM-FIXES.JS - CORRECCIONES CRÍTICAS DEL SISTEMA =====
// Archivo que corrige bugs conocidos y proporciona parches temporales

console.log('🔧 Cargando System Fixes...');

// ===== GLOBAL ERROR HANDLERS =====
window.addEventListener('error', function(event) {
    // Filter out extension errors
    if (event.error && event.error.message && 
        (event.error.message.includes('Extension') || 
         event.error.message.includes('chrome-extension'))) {
        return;
    }
    
    console.error('🚨 Global Error:', event.error);
    
    // Show user-friendly error
    if (window.unifiedMessageManager && !event.error.message?.includes('Script error')) {
        window.unifiedMessageManager.show(
            'Ha ocurrido un error inesperado', 
            'error', 
            5000
        );
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('🚨 Unhandled Promise Rejection:', event.reason);
    event.preventDefault();
    
    // Show user-friendly error
    if (window.unifiedMessageManager && 
        !event.reason?.message?.includes('Extension') &&
        !event.reason?.message?.includes('NetworkError')) {
        window.unifiedMessageManager.show(
            'Error de conexión o servicio', 
            'warning', 
            3000
        );
    }
});

// ===== YOUTUBE API FIXES =====
class YouTubeAPIFixes {
    static init() {
        console.log('🔧 Aplicando fixes para YouTube API...');
        
        // Fix para YouTube API no cargando
        if (!window.YT && !window.onYouTubeIframeAPIReady) {
            let attempts = 0;
            const maxAttempts = 10;
            
            const checkAPI = setInterval(() => {
                attempts++;
                
                if (window.YT && window.YT.Player) {
                    clearInterval(checkAPI);
                    console.log('✅ YouTube API disponible');
                    
                    // Trigger manual ready event
                    if (window.onYouTubeIframeAPIReady) {
                        window.onYouTubeIframeAPIReady();
                    }
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    clearInterval(checkAPI);
                    console.error('❌ YouTube API no se cargó después de', maxAttempts, 'intentos');
                    
                    // Reload YouTube API
                    YouTubeAPIFixes.forceReloadAPI();
                }
            }, 1000);
        }
    }
    
    static forceReloadAPI() {
        console.log('🔄 Forzando recarga de YouTube API...');
        
        // Remove existing script
        const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (existingScript) {
            existingScript.remove();
        }
        
        // Add new script
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onload = () => {
            console.log('✅ YouTube API script recargado');
        };
        script.onerror = () => {
            console.error('❌ Error recargando YouTube API');
            window.unifiedMessageManager?.show(
                'Error cargando reproductor de YouTube', 
                'error'
            );
        };
        
        document.head.appendChild(script);
    }
    
    static fixPlayerStates() {
        // Fix para estados inconsistentes de reproductores
        if (!window.YT || !window.YT.PlayerState) return;
        
        const playerStateNames = {
            [-1]: 'UNSTARTED',
            [0]: 'ENDED',
            [1]: 'PLAYING',
            [2]: 'PAUSED',
            [3]: 'BUFFERING',
            [5]: 'CUED'
        };
        
        // Add helper function to get state name
        window.getPlayerStateName = (state) => {
            return playerStateNames[state] || `UNKNOWN(${state})`;
        };
        
        console.log('✅ Player state helpers instalados');
    }
}

// ===== DOM FIXES =====
class DOMFixes {
    static init() {
        console.log('🔧 Aplicando fixes para DOM...');
        
        // Fix para elementos faltantes
        DOMFixes.ensureRequiredElements();
        
        // Fix para event listeners duplicados
        DOMFixes.preventDuplicateListeners();
        
        // Fix para scroll issues
        DOMFixes.fixScrollIssues();
    }
    
    static ensureRequiredElements() {
        const requiredElements = [
            { id: 'floatingMessageContainer', tag: 'div', classes: ['floating-messages'] },
            { id: 'player1', tag: 'div', classes: ['video-player'] },
            { id: 'player2', tag: 'div', classes: ['video-player', 'hidden'] },
            { id: 'searchResults', tag: 'div', classes: ['search-results'] },
            { id: 'playlistsGrid', tag: 'div', classes: ['playlists-grid'] },
            { id: 'playlistContainer', tag: 'div', classes: ['playlist-container-desktop'] },
            { id: 'queueSection', tag: 'div', classes: ['queue-section', 'hidden'] }
        ];
        
        requiredElements.forEach(({ id, tag, classes }) => {
            if (!document.getElementById(id)) {
                const element = document.createElement(tag);
                element.id = id;
                element.className = classes.join(' ');
                
                // Add to appropriate parent
                const parent = DOMFixes.findBestParent(id);
                if (parent) {
                    parent.appendChild(element);
                    console.log(`✅ Elemento faltante creado: ${id}`);
                } else {
                    document.body.appendChild(element);
                    console.warn(`⚠️ Elemento ${id} añadido a body (no se encontró padre apropiado)`);
                }
            }
        });
    }
    
    static findBestParent(elementId) {
        const parentMap = {
            'player1': '#videoContainer',
            'player2': '#videoContainer',
            'searchResults': '#searchView',
            'playlistsGrid': '#libraryView',
            'playlistContainer': '#queueSection',
            'queueSection': '.main-content'
        };
        
        const parentSelector = parentMap[elementId];
        if (parentSelector) {
            return document.querySelector(parentSelector);
        }
        
        return null;
    }
    
    static preventDuplicateListeners() {
        // Store original addEventListener
        if (!Element.prototype._originalAddEventListener) {
            Element.prototype._originalAddEventListener = Element.prototype.addEventListener;
            
            Element.prototype.addEventListener = function(type, listener, options) {
                // Create unique identifier for listener
                const listenerId = `${type}_${listener.toString().slice(0, 50)}`;
                
                if (!this._eventListeners) {
                    this._eventListeners = new Set();
                }
                
                if (this._eventListeners.has(listenerId)) {
                    console.warn(`⚠️ Duplicate event listener prevented: ${type} on`, this);
                    return;
                }
                
                this._eventListeners.add(listenerId);
                this._originalAddEventListener(type, listener, options);
            };
            
            console.log('✅ Duplicate listener prevention installed');
        }
    }
    
    static fixScrollIssues() {
        // Fix para scroll containers sin altura
        const scrollContainers = [
            '.content-view',
            '.search-results',
            '.library-container',
            '.playlist-videos-content'
        ];
        
        scrollContainers.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (element.scrollHeight === 0) {
                    element.style.minHeight = '100px';
                }
            });
        });
        
        // Fix para scroll restoration
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
    }
}

// ===== STATE MANAGEMENT FIXES =====
class StateFixes {
    static init() {
        console.log('🔧 Aplicando fixes para gestión de estado...');
        
        // Fix para estado perdido
        StateFixes.createStateBackup();
        
        // Fix para setState inconsistente
        StateFixes.fixStateManager();
        
        // Fix para memory leaks
        StateFixes.preventMemoryLeaks();
    }
    
    static createStateBackup() {
        // Backup del estado cada 30 segundos
        setInterval(() => {
            if (window.unifiedStateManager?.state) {
                try {
                    const stateBackup = JSON.stringify(window.unifiedStateManager.state);
                    sessionStorage.setItem('ytcrossmix_state_backup', stateBackup);
                } catch (error) {
                    console.warn('⚠️ No se pudo crear backup del estado:', error);
                }
            }
        }, 30000);
    }
    
    static fixStateManager() {
        // Validate state manager exists
        const checkStateManager = () => {
            if (!window.unifiedStateManager) {
                console.warn('⚠️ StateManager no encontrado, creando fallback...');
                
                // Create minimal state manager fallback
                window.unifiedStateManager = {
                    state: {
                        app: {
                            player1: null,
                            player2: null,
                            currentPlayer: 1,
                            playersInitialized: false,
                            reproduccionIniciada: false
                        },
                        playlist: {
                            playlistsData: [],
                            currentPlayingInfo: {
                                playlistId: null,
                                videoId: null,
                                flattenedIndex: -1
                            }
                        },
                        ui: {
                            currentView: 'home'
                        }
                    },
                    get: function(path) {
                        const keys = path.split('.');
                        let current = this.state;
                        for (const key of keys) {
                            if (current && typeof current === 'object' && key in current) {
                                current = current[key];
                            } else {
                                return undefined;
                            }
                        }
                        return current;
                    },
                    set: function(path, value) {
                        const keys = path.split('.');
                        const lastKey = keys.pop();
                        let current = this.state;
                        for (const key of keys) {
                            if (!(key in current)) {
                                current[key] = {};
                            }
                            current = current[key];
                        }
                        current[lastKey] = value;
                        
                        // Dispatch change event
                        window.dispatchEvent(new CustomEvent('ytcrossmix:state:changed', {
                            detail: { path, newValue: value }
                        }));
                    }
                };
                
                console.log('✅ StateManager fallback creado');
            }
        };
        
        // Check immediately and after DOM ready
        checkStateManager();
        document.addEventListener('DOMContentLoaded', checkStateManager);
    }
    
    static preventMemoryLeaks() {
        // Clear intervals on page unload
        window.addEventListener('beforeunload', () => {
            const state = window.unifiedStateManager?.state;
            if (state) {
                // Clear monitoring interval
                if (state.app.monitorInterval) {
                    clearInterval(state.app.monitorInterval);
                }
                
                // Clear crossfade interval
                if (state.app.crossfadeInterval) {
                    clearInterval(state.app.crossfadeInterval);
                }
            }
            
            // Clear all active timeouts
            let highestTimeoutId = setTimeout(() => {});
            for (let i = 0; i < highestTimeoutId; i++) {
                clearTimeout(i);
            }
            
            console.log('🧹 Memory cleanup completado');
        });
    }
}

// ===== NETWORK FIXES =====
class NetworkFixes {
    static init() {
        console.log('🔧 Aplicando fixes de red...');
        
        // Fix para timeouts de fetch
        NetworkFixes.setupFetchTimeout();
        
        // Fix para retry logic
        NetworkFixes.setupRetryLogic();
        
        // Fix para CORS issues
        NetworkFixes.setupCORSFallbacks();
    }
    
    static setupFetchTimeout() {
        const originalFetch = window.fetch;
        
        window.fetch = function(url, options = {}) {
            const timeout = options.timeout || 15000;
            
            return Promise.race([
                originalFetch(url, options),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timeout')), timeout);
                })
            ]);
        };
        
        console.log('✅ Fetch timeout configurado');
    }
    
    static setupRetryLogic() {
        window.fetchWithRetry = async function(url, options = {}, maxRetries = 3) {
            let lastError;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const response = await window.fetch(url, options);
                    if (response.ok) {
                        return response;
                    } else if (response.status >= 500 && attempt < maxRetries) {
                        // Retry on server errors
                        await NetworkFixes.delay(Math.pow(2, attempt) * 1000);
                        continue;
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                } catch (error) {
                    lastError = error;
                    
                    if (attempt < maxRetries && error.message.includes('timeout')) {
                        await NetworkFixes.delay(Math.pow(2, attempt) * 1000);
                        continue;
                    }
                    
                    if (attempt === maxRetries) {
                        throw lastError;
                    }
                }
            }
        };
        
        console.log('✅ Retry logic configurado');
    }
    
    static setupCORSFallbacks() {
        // Fallback para APIs que fallen por CORS
        window.corsProxyFallback = function(url) {
            const fallbacks = [
                `/.netlify/functions/cors-proxy/${encodeURIComponent(url)}`,
                `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
                `https://corsproxy.io/?${encodeURIComponent(url)}`
            ];
            
            return fallbacks;
        };
        
        console.log('✅ CORS fallbacks configurados');
    }
    
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== UI FIXES =====
class UIFixes {
    static init() {
        console.log('🔧 Aplicando fixes de UI...');
        
        // Fix para elementos solapados
        UIFixes.fixZIndexIssues();
        
        // Fix para responsive design
        UIFixes.fixResponsiveIssues();
        
        // Fix para accessibility
        UIFixes.fixAccessibilityIssues();
        
        // Fix para animations
        UIFixes.fixAnimationIssues();
    }
    
    static fixZIndexIssues() {
        // Ensure proper stacking order
        const zIndexMap = {
            '.bottom-nav': '100',
            '.desktop-sidebar': '200',
            '.bottom-player': '300',
            '.mobile-header': '400',
            '.queue-section': '1000',
            '.unified-loading-overlay': '2000',
            '.floating-messages': '3000',
            '#notification-container': '4000'
        };
        
        Object.entries(zIndexMap).forEach(([selector, zIndex]) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                element.style.zIndex = zIndex;
            });
        });
        
        console.log('✅ Z-index issues fixed');
    }
    
    static fixResponsiveIssues() {
        // Fix para viewport en mobile
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
            );
        }
        
        // Fix para altura en mobile
        const fixMobileHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        fixMobileHeight();
        window.addEventListener('resize', UIFixes.debounce(fixMobileHeight, 100));
        
        console.log('✅ Responsive issues fixed');
    }
    
    static fixAccessibilityIssues() {
        // Add missing ARIA labels
        const buttons = document.querySelectorAll('button:not([aria-label]):not([title])');
        buttons.forEach((button, index) => {
            if (!button.textContent.trim()) {
                button.setAttribute('aria-label', `Button ${index + 1}`);
            }
        });
        
        // Fix focus management
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });
        
        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
        
        console.log('✅ Accessibility issues fixed');
    }
    
    static fixAnimationIssues() {
        // Respect reduced motion preference
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const style = document.createElement('style');
            style.textContent = `
                *, *::before, *::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                }
            `;
            document.head.appendChild(style);
        }
        
        // Fix para animations que no terminan
        document.addEventListener('animationend', (event) => {
            if (event.target.classList.contains('fade-out')) {
                event.target.classList.add('hidden');
            }
        });
        
        console.log('✅ Animation issues fixed');
    }
    
    static debounce(func, wait) {
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

// ===== PERFORMANCE FIXES =====
class PerformanceFixes {
    static init() {
        console.log('🔧 Aplicando fixes de performance...');
        
        // Fix para memory leaks en event listeners
        PerformanceFixes.fixEventListenerLeaks();
        
        // Fix para DOM queries repetitivas
        PerformanceFixes.cacheCommonElements();
        
        // Fix para animations costosas
        PerformanceFixes.optimizeAnimations();
    }
    
    static fixEventListenerLeaks() {
        // Track event listeners for cleanup
        if (!window.eventListenerRegistry) {
            window.eventListenerRegistry = new WeakMap();
        }
        
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
        
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (!window.eventListenerRegistry.has(this)) {
                window.eventListenerRegistry.set(this, new Map());
            }
            
            const listeners = window.eventListenerRegistry.get(this);
            const key = `${type}_${options && options.capture ? 'capture' : 'bubble'}`;
            
            if (!listeners.has(key)) {
                listeners.set(key, new Set());
            }
            
            listeners.get(key).add(listener);
            originalAddEventListener.call(this, type, listener, options);
        };
        
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            const listeners = window.eventListenerRegistry.get(this);
            if (listeners) {
                const key = `${type}_${options && options.capture ? 'capture' : 'bubble'}`;
                const typeListeners = listeners.get(key);
                if (typeListeners) {
                    typeListeners.delete(listener);
                }
            }
            
            originalRemoveEventListener.call(this, type, listener, options);
        };
        
        console.log('✅ Event listener leak tracking installed');
    }
    
    static cacheCommonElements() {
        // Cache frequently accessed elements
        window.cachedElements = {
            get playButton() {
                return this._playButton || (this._playButton = document.getElementById('botonPlay'));
            },
            get searchResults() {
                return this._searchResults || (this._searchResults = document.getElementById('searchResults'));
            },
            get playlistsGrid() {
                return this._playlistsGrid || (this._playlistsGrid = document.getElementById('playlistsGrid'));
            },
            // Clear cache when DOM changes
            clearCache() {
                Object.keys(this).forEach(key => {
                    if (key.startsWith('_')) {
                        delete this[key];
                    }
                });
            }
        };
        
        // Clear cache on DOM mutations
        const observer = new MutationObserver(() => {
            window.cachedElements.clearCache();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('✅ Element caching configured');
    }
    
    static optimizeAnimations() {
        // Use requestAnimationFrame for smooth animations
        window.smoothTransition = function(element, property, from, to, duration = 300) {
            const start = performance.now();
            const initialValue = from;
            const targetValue = to;
            
            function animate(currentTime) {
                const elapsed = currentTime - start;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentValue = initialValue + (targetValue - initialValue) * easeOut;
                
                element.style[property] = currentValue + (property.includes('opacity') ? '' : 'px');
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            }
            
            requestAnimationFrame(animate);
        };
        
        console.log('✅ Animation optimization configured');
    }
}

// ===== MAIN FIXES INITIALIZER =====
class SystemFixes {
    static async init() {
        console.log('🚀 Inicializando System Fixes...');
        
        try {
            // Initialize all fix categories
            YouTubeAPIFixes.init();
            DOMFixes.init();
            StateFixes.init();
            NetworkFixes.init();
            UIFixes.init();
            PerformanceFixes.init();
            
            // Setup health monitoring
            SystemFixes.setupHealthMonitoring();
            
            // Setup debug tools
            SystemFixes.setupDebugTools();
            
            console.log('✅ System Fixes inicializados correctamente');
            
            // Dispatch ready event
            window.dispatchEvent(new CustomEvent('ytcrossmix:fixes:ready', {
                detail: {
                    timestamp: Date.now(),
                    version: '2.0.0',
                    fixes: [
                        'YouTube API',
                        'DOM',
                        'State Management', 
                        'Network',
                        'UI',
                        'Performance'
                    ]
                }
            }));
            
        } catch (error) {
            console.error('💥 Error inicializando System Fixes:', error);
            
            // Show fallback error message
            setTimeout(() => {
                if (window.unifiedMessageManager) {
                    window.unifiedMessageManager.show(
                        'Algunos componentes pueden no funcionar correctamente',
                        'warning',
                        5000
                    );
                }
            }, 2000);
        }
    }
    
    static setupHealthMonitoring() {
        // Monitor system health every 30 seconds
        setInterval(() => {
            const health = SystemFixes.checkSystemHealth();
            
            if (health.critical > 0) {
                console.warn('⚠️ System health issues detected:', health);
            }
        }, 30000);
    }
    
    static checkSystemHealth() {
        const issues = {
            critical: 0,
            warnings: 0,
            info: 0,
            details: []
        };
        
        // Check YouTube API
        if (!window.YT || !window.YT.Player) {
            issues.critical++;
            issues.details.push('YouTube API not loaded');
        }
        
        // Check state manager
        if (!window.unifiedStateManager) {
            issues.critical++;
            issues.details.push('State manager missing');
        }
        
        // Check required elements
        const requiredElements = ['player1', 'player2', 'searchResults', 'playlistsGrid'];
        requiredElements.forEach(id => {
            if (!document.getElementById(id)) {
                issues.warnings++;
                issues.details.push(`Missing element: ${id}`);
            }
        });
        
        // Check memory usage (if available)
        if (performance.memory) {
            const memoryUsage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit;
            if (memoryUsage > 0.8) {
                issues.warnings++;
                issues.details.push(`High memory usage: ${(memoryUsage * 100).toFixed(1)}%`);
            }
        }
        
        return issues;
    }
    
    static setupDebugTools() {
        // Debug tools only in development
        if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
            window.SystemDebug = {
                checkHealth: () => SystemFixes.checkSystemHealth(),
                reloadYouTubeAPI: () => YouTubeAPIFixes.forceReloadAPI(),
                clearStateBackup: () => sessionStorage.removeItem('ytcrossmix_state_backup'),
                restoreStateBackup: () => {
                    const backup = sessionStorage.getItem('ytcrossmix_state_backup');
                    if (backup && window.unifiedStateManager) {
                        try {
                            window.unifiedStateManager.state = JSON.parse(backup);
                            console.log('✅ State restored from backup');
                            return true;
                        } catch (error) {
                            console.error('❌ Error restoring state:', error);
                            return false;
                        }
                    }
                    return false;
                },
                triggerError: () => {
                    throw new Error('Test error for debugging');
                },
                getEventListeners: (element) => {
                    return window.eventListenerRegistry?.get(element);
                },
                clearElementCache: () => {
                    window.cachedElements?.clearCache();
                }
            };
            
            console.log('🔧 Debug tools available: window.SystemDebug');
        }
    }
}

// ===== AUTO-INITIALIZATION =====
// Initialize fixes as soon as possible
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SystemFixes.init());
} else {
    SystemFixes.init();
}

// Export for module systems
if (typeof window !== 'undefined') {
    window.SystemFixes = SystemFixes;
}

console.log('✅ System Fixes loaded and ready');
