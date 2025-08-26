// errors.js - NUEVO ARCHIVO DE ERROR BOUNDARIES Y RESILIENCE

import { mostrarMensajeFlotante } from './messages.js';

class ErrorBoundary {
    constructor() {
        this.errorLog = [];
        this.maxErrorLogSize = 50;
        this.criticalErrors = new Set();
        this.setupGlobalHandlers();
    }
    
    // Configurar manejadores globales de errores
    setupGlobalHandlers() {
        // Errores JavaScript no capturados
        window.addEventListener('error', (event) => {
            this.logError({
                type: 'javascript',
                message: event.message,
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
                error: event.error,
                timestamp: Date.now()
            });
        });
        
        // Promesas rechazadas no manejadas
        window.addEventListener('unhandledrejection', (event) => {
            this.logError({
                type: 'promise',
                message: event.reason?.message || 'Promise rejection',
                reason: event.reason,
                timestamp: Date.now()
            });
            
            // Prevenir que aparezca en consola si no es crítico
            if (!this.isCriticalError(event.reason)) {
                event.preventDefault();
            }
        });
        
        // Errores de recursos no cargados
        window.addEventListener('error', (event) => {
            if (event.target !== window && event.target.tagName) {
                this.logError({
                    type: 'resource',
                    message: `Failed to load ${event.target.tagName}: ${event.target.src || event.target.href}`,
                    element: event.target.tagName,
                    src: event.target.src || event.target.href,
                    timestamp: Date.now()
                });
            }
        }, true);
    }
    
    // Wrapper para funciones que pueden fallar
    wrap(fn, context = null, options = {}) {
        const {
            name = fn.name || 'anonymous',
            silent = false,
            fallback = null,
            retries = 0
        } = options;
        
        return async (...args) => {
            let lastError;
            
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    if (attempt > 0) {
                        console.log(`🔄 Reintento ${attempt}/${retries} para ${name}`);
                        await this.sleep(500 * attempt);
                    }
                    
                    const result = await fn.apply(context, args);
                    
                    if (attempt > 0) {
                        console.log(`✅ ${name} exitoso en intento ${attempt + 1}`);
                    }
                    
                    return result;
                    
                } catch (error) {
                    lastError = error;
                    
                    this.logError({
                        type: 'wrapped_function',
                        function: name,
                        attempt: attempt + 1,
                        message: error.message,
                        stack: error.stack,
                        timestamp: Date.now(),
                        args: args.length
                    });
                    
                    if (attempt === retries) {
                        // Último intento fallido
                        if (!silent) {
                            console.error(`💥 ${name} falló después de ${retries + 1} intentos:`, error);
                        }
                        
                        if (fallback && typeof fallback === 'function') {
                            try {
                                console.log(`🆘 Ejecutando fallback para ${name}`);
                                return await fallback(error, ...args);
                            } catch (fallbackError) {
                                console.error(`💥 Fallback también falló para ${name}:`, fallbackError);
                                throw fallbackError;
                            }
                        }
                        
                        throw error;
                    }
                }
            }
        };
    }
    
    // Ejecutar función con timeout
    async withTimeout(fn, timeout = 5000, context = null) {
        return Promise.race([
            fn.apply(context),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Timeout after ${timeout}ms`));
                }, timeout);
            })
        ]);
    }
    
    // Retry con backoff exponencial
    async withRetry(fn, options = {}) {
        const {
            maxRetries = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            backoffFactor = 2,
            context = null
        } = options;
        
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
                    console.log(`🔄 Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
                    await this.sleep(delay);
                }
                
                return await fn.apply(context);
                
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt + 1} failed:`, error.message);
            }
        }
        
        throw lastError;
    }
    
    // Manejar errores críticos
    handleCriticalError(error, context = 'unknown') {
        const errorInfo = {
            type: 'critical',
            context,
            message: error.message,
            stack: error.stack,
            timestamp: Date.now()
        };
        
        this.logError(errorInfo);
        this.criticalErrors.add(errorInfo);
        
        console.error('💀 ERROR CRÍTICO:', error);
        
        // Mostrar mensaje al usuario
        mostrarMensajeFlotante(
            `Error crítico en ${context}. La aplicación puede no funcionar correctamente.`,
            8000,
            'error'
        );
        
        // Intentar recuperación básica
        this.attemptRecovery(context);
    }
    
    // Intentar recuperación automática
    attemptRecovery(context) {
        console.log('🚑 Intentando recuperación automática...');
        
        switch (context) {
            case 'youtube_api':
                this.recoverYouTubeAPI();
                break;
            case 'playback':
                this.recoverPlayback();
                break;
            case 'auth':
                this.recoverAuth();
                break;
            default:
                this.basicRecovery();
        }
    }
    
    // Recuperación específica para YouTube API
    recoverYouTubeAPI() {
        console.log('🔧 Recuperando YouTube API...');
        
        // Reset players
        if (window.AppState) {
            window.AppState.playersInitialized = false;
            window.AppState.youtubeAPIReady = false;
        }
        
        // Reintentar carga
        setTimeout(() => {
            if (window.YouTubeAPIManager?.loadYouTubeAPI) {
                window.YouTubeAPIManager.loadYouTubeAPI();
            }
        }, 2000);
    }
    
    // Recuperación de reproducción
    recoverPlayback() {
        console.log('🔧 Recuperando reproducción...');
        
        // Detener monitoring
        if (window.PlaybackController?.stopMonitoring) {
            window.PlaybackController.stopMonitoring();
        }
        
        // Reset crossfade
        if (window.AppState) {
            window.AppState.crossfadeInProgress = false;
            window.AppState.isAudioFading = false;
            window.AppState.isTransitioning = false;
        }
        
        // Reiniciar después de un delay
        setTimeout(() => {
            if (window.PlaybackController?.startMonitoring) {
                window.PlaybackController.startMonitoring();
            }
        }, 1000);
    }
    
    // Recuperación de autenticación
    recoverAuth() {
        console.log('🔧 Recuperando autenticación...');
        
        // Limpiar token corrupto
        try {
            localStorage.removeItem('google_token');
        } catch (e) {
            console.warn('No se pudo limpiar token:', e);
        }
        
        // Mostrar mensaje informativo
        mostrarMensajeFlotante(
            'Sesión de Google limpiada. Puedes volver a conectar tu cuenta.',
            5000,
            'info'
        );
    }
    
    // Recuperación básica
    basicRecovery() {
        console.log('🔧 Recuperación básica...');
        
        // Limpiar intervalos
        this.clearAllIntervals();
        
        // Reset UI básico
        this.resetBasicUI();
    }
    
    // Limpiar todos los intervalos
    clearAllIntervals() {
        // Clear monitoring interval
        if (window.AppState?.monitorInterval) {
            clearInterval(window.AppState.monitorInterval);
            window.AppState.monitorInterval = null;
        }
        
        // Clear crossfade interval
        if (window.AppState?.crossfadeInterval) {
            clearInterval(window.AppState.crossfadeInterval);
            window.AppState.crossfadeInterval = null;
        }
        
        console.log('🧹 Intervalos limpiados');
    }
    
    // Reset UI básico
    resetBasicUI() {
        try {
            const playButton = document.getElementById('botonPlay');
            if (playButton) {
                playButton.innerHTML = '<i class="fas fa-play"></i>';
                playButton.disabled = false;
            }
            
            const miniPlayBtn = document.getElementById('miniPlayBtn');
            if (miniPlayBtn) {
                miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
            
            console.log('🎨 UI básica reseteada');
        } catch (error) {
            console.warn('Error reseteando UI:', error);
        }
    }
    
    // Verificar si es error crítico
    isCriticalError(error) {
        if (!error) return false;
        
        const criticalPatterns = [
            /youtube.*api/i,
            /player.*not.*ready/i,
            /cannot.*read.*property/i,
            /network.*error/i,
            /timeout/i
        ];
        
        const message = error.message || error.toString();
        return criticalPatterns.some(pattern => pattern.test(message));
    }
    
    // Log de errores
    logError(errorInfo) {
        // Añadir al log
        this.errorLog.push(errorInfo);
        
        // Mantener tamaño del log
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog.shift();
        }
        
        // Log en consola con formato
        const prefix = this.getErrorPrefix(errorInfo.type);
        console.error(`${prefix} [${errorInfo.type}]:`, errorInfo.message);
    }
    
    // Obtener prefijo para tipo de error
    getErrorPrefix(type) {
        const prefixes = {
            javascript: '🐛',
            promise: '❌',
            resource: '📦',
            wrapped_function: '🔧',
            critical: '💀',
            network: '🌐',
            auth: '🔐',
            playback: '🎵'
        };
        
        return prefixes[type] || '⚠️';
    }
    
    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Obtener estadísticas de errores
    getErrorStats() {
        const stats = {
            total: this.errorLog.length,
            critical: this.criticalErrors.size,
            byType: {},
            recent: this.errorLog.slice(-10)
        };
        
        // Contar por tipo
        this.errorLog.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        });
        
        return stats;
    }
    
    // Limpiar logs
    clearErrorLog() {
        this.errorLog = [];
        this.criticalErrors.clear();
        console.log('🧹 Error log limpiado');
    }
    
    // Debug info
    debug() {
        console.log('=== ERROR BOUNDARY DEBUG ===');
        console.log('Error Stats:', this.getErrorStats());
        console.log('Critical Errors:', Array.from(this.criticalErrors));
        console.log('Recent Errors:', this.errorLog.slice(-5));
        console.log('============================');
    }
}

// Instancia única global
export const errorBoundary = new ErrorBoundary();

// Funciones de conveniencia
export function wrapFunction(fn, options = {}) {
    return errorBoundary.wrap(fn, null, options);
}

export function handleCriticalError(error, context) {
    return errorBoundary.handleCriticalError(error, context);
}

export function withRetry(fn, options = {}) {
    return errorBoundary.withRetry(fn, options);
}

export function withTimeout(fn, timeout = 5000) {
    return errorBoundary.withTimeout(fn, timeout);
}

// Hacer disponible globalmente
window.errorBoundary = errorBoundary;
window.wrapFunction = wrapFunction;
window.handleCriticalError = handleCriticalError;