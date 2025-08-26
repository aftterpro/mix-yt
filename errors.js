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
        
        for (let attempt = 0; attempt <= max