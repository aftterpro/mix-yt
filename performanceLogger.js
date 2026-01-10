// =============================================
// PERFORMANCE LOGGER - Sistema de Métricas
// =============================================

class PerformanceLogger {
    constructor() {
        this.metrics = {
            crossfades: {
                total: 0,
                successful: 0,
                failed: 0,
                avgDuration: 0,
                durations: []
            },
            videoLoads: {
                total: 0,
                successful: 0,
                failed: 0,
                avgLoadTime: 0,
                loadTimes: []
            },
            apiCalls: {
                search: { total: 0, failed: 0, avgTime: 0, times: [] },
                sponsorblock: { total: 0, failed: 0, avgTime: 0, times: [] },
                youtube: { total: 0, failed: 0, avgTime: 0, times: [] }
            },
            ui: {
                viewSwitches: 0,
                avgSwitchTime: 0,
                switchTimes: []
            },
            errors: [],
            warnings: []
        };
        
        this.activeTimers = new Map();
        this.performanceMarks = new Map();
        
        // Auto-reporte cada 5 minutos
        setInterval(() => this.autoReport(), 5 * 60 * 1000);
    }

    // =============================================
    // TIMERS
    // =============================================
    
    startTimer(label) {
        this.activeTimers.set(label, performance.now());
        performance.mark(`${label}-start`);
    }
    
    endTimer(label, category = null) {
        if (!this.activeTimers.has(label)) {
            console.warn(`⚠️ Timer "${label}" no encontrado`);
            return 0;
        }
        
        const duration = performance.now() - this.activeTimers.get(label);
        this.activeTimers.delete(label);
        
        performance.mark(`${label}-end`);
        
        try {
            performance.measure(label, `${label}-start`, `${label}-end`);
        } catch (e) {
            console.warn(`⚠️ Error measuring ${label}:`, e);
        }
        
        if (category) {
            this.recordMetric(category, duration);
        }
        
        return duration;
    }
    
    // =============================================
    // MÉTRICAS
    // =============================================
    
    recordMetric(category, value, subcategory = null) {
        const path = subcategory ? `${category}.${subcategory}` : category;
        
        if (path === 'crossfades.successful') {
            this.metrics.crossfades.successful++;
            this.metrics.crossfades.total++;
            this.metrics.crossfades.durations.push(value);
            this.updateAverage('crossfades');
        } else if (path === 'crossfades.failed') {
            this.metrics.crossfades.failed++;
            this.metrics.crossfades.total++;
        } else if (path === 'videoLoads.successful') {
            this.metrics.videoLoads.successful++;
            this.metrics.videoLoads.total++;
            this.metrics.videoLoads.loadTimes.push(value);
            this.updateAverage('videoLoads');
        } else if (path === 'videoLoads.failed') {
            this.metrics.videoLoads.failed++;
            this.metrics.videoLoads.total++;
        } else if (category === 'apiCalls') {
            const api = this.metrics.apiCalls[subcategory];
            if (api) {
                api.total++;
                api.times.push(value);
                api.avgTime = api.times.reduce((a, b) => a + b, 0) / api.times.length;
                
                // Mantener solo últimas 100 mediciones
                if (api.times.length > 100) {
                    api.times.shift();
                }
            }
        } else if (category === 'ui' && subcategory === 'viewSwitch') {
            this.metrics.ui.viewSwitches++;
            this.metrics.ui.switchTimes.push(value);
            this.updateAverage('ui', 'switchTimes', 'avgSwitchTime');
        }
    }
    
    updateAverage(category, timesKey = null, avgKey = null) {
        const cat = this.metrics[category];
        if (!cat) return;
        
        if (timesKey && avgKey) {
            // UI metrics
            cat[avgKey] = cat[timesKey].reduce((a, b) => a + b, 0) / cat[timesKey].length;
            
            if (cat[timesKey].length > 100) {
                cat[timesKey].shift();
            }
        } else {
            // Crossfades y videoLoads
            const key = category === 'crossfades' ? 'durations' : 'loadTimes';
            cat.avgDuration = cat[key].reduce((a, b) => a + b, 0) / cat[key].length;
            
            if (cat[key].length > 100) {
                cat[key].shift();
            }
        }
    }
    
    recordError(error, context = '') {
        this.metrics.errors.push({
            timestamp: Date.now(),
            message: error.message || error,
            stack: error.stack || '',
            context: context
        });
        
        // Mantener solo últimos 50 errores
        if (this.metrics.errors.length > 50) {
            this.metrics.errors.shift();
        }
    }
    
    recordWarning(warning, context = '') {
        this.metrics.warnings.push({
            timestamp: Date.now(),
            message: warning,
            context: context
        });
        
        if (this.metrics.warnings.length > 50) {
            this.metrics.warnings.shift();
        }
    }
    
    // =============================================
    // ANÁLISIS Y REPORTES
    // =============================================
    
    getBottlenecks() {
        const bottlenecks = [];
        
        // Crossfades lentos
        if (this.metrics.crossfades.avgDuration > 12000) {
            bottlenecks.push({
                type: 'crossfade',
                severity: 'high',
                message: `Crossfades promedio muy lentos: ${(this.metrics.crossfades.avgDuration / 1000).toFixed(2)}s`
            });
        }
        
        // Tasa de fallos alta
        const crossfadeFailRate = this.metrics.crossfades.failed / Math.max(1, this.metrics.crossfades.total);
        if (crossfadeFailRate > 0.1) {
            bottlenecks.push({
                type: 'crossfade',
                severity: 'critical',
                message: `Alta tasa de fallos en crossfade: ${(crossfadeFailRate * 100).toFixed(1)}%`
            });
        }
        
        // Carga de videos lenta
        if (this.metrics.videoLoads.avgLoadTime > 3000) {
            bottlenecks.push({
                type: 'videoLoad',
                severity: 'medium',
                message: `Carga de videos lenta: ${(this.metrics.videoLoads.avgLoadTime / 1000).toFixed(2)}s`
            });
        }
        
        // APIs lentas
        Object.entries(this.metrics.apiCalls).forEach(([api, data]) => {
            if (data.avgTime > 5000) {
                bottlenecks.push({
                    type: 'api',
                    severity: 'medium',
                    message: `API ${api} lenta: ${(data.avgTime / 1000).toFixed(2)}s`
                });
            }
        });
        
        // Errores frecuentes
        const recentErrors = this.metrics.errors.filter(e => 
            Date.now() - e.timestamp < 60000 // Últimos 60 segundos
        );
        
        if (recentErrors.length > 5) {
            bottlenecks.push({
                type: 'errors',
                severity: 'critical',
                message: `${recentErrors.length} errores en el último minuto`
            });
        }
        
        return bottlenecks;
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                crossfades: {
                    total: this.metrics.crossfades.total,
                    successRate: `${((this.metrics.crossfades.successful / Math.max(1, this.metrics.crossfades.total)) * 100).toFixed(1)}%`,
                    avgDuration: `${(this.metrics.crossfades.avgDuration / 1000).toFixed(2)}s`
                },
                videoLoads: {
                    total: this.metrics.videoLoads.total,
                    successRate: `${((this.metrics.videoLoads.successful / Math.max(1, this.metrics.videoLoads.total)) * 100).toFixed(1)}%`,
                    avgLoadTime: `${(this.metrics.videoLoads.avgLoadTime / 1000).toFixed(2)}s`
                },
                apis: Object.entries(this.metrics.apiCalls).reduce((acc, [name, data]) => {
                    acc[name] = {
                        calls: data.total,
                        avgTime: `${(data.avgTime / 1000).toFixed(2)}s`,
                        failRate: `${((data.failed / Math.max(1, data.total)) * 100).toFixed(1)}%`
                    };
                    return acc;
                }, {}),
                ui: {
                    viewSwitches: this.metrics.ui.viewSwitches,
                    avgSwitchTime: `${this.metrics.ui.avgSwitchTime.toFixed(0)}ms`
                }
            },
            bottlenecks: this.getBottlenecks(),
            recentErrors: this.metrics.errors.slice(-10),
            recentWarnings: this.metrics.warnings.slice(-10)
        };
        
        return report;
    }
    
    autoReport() {
        const bottlenecks = this.getBottlenecks();
        
        if (bottlenecks.length > 0) {
            console.warn('⚠️ PERFORMANCE BOTTLENECKS DETECTADOS:');
            bottlenecks.forEach(b => {
                console.warn(`  [${b.severity.toUpperCase()}] ${b.message}`);
            });
        }
        
        console.log('📊 Performance Report:', this.generateReport());
    }
    
    // =============================================
    // DEBUG Y EXPORT
    // =============================================
    
    printReport() {
        const report = this.generateReport();
        console.group('📊 YT CrossMix Performance Report');
        console.log('Timestamp:', report.timestamp);
        console.log('Summary:', report.summary);
        console.log('Bottlenecks:', report.bottlenecks);
        console.log('Recent Errors:', report.recentErrors);
        console.groupEnd();
        return report;
    }
    
    exportMetrics() {
        return JSON.stringify(this.metrics, null, 2);
    }
    
    reset() {
        Object.keys(this.metrics).forEach(key => {
            if (key === 'crossfades' || key === 'videoLoads') {
                this.metrics[key] = {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    avgDuration: 0,
                    durations: []
                };
            } else if (key === 'apiCalls') {
                Object.keys(this.metrics.apiCalls).forEach(api => {
                    this.metrics.apiCalls[api] = { total: 0, failed: 0, avgTime: 0, times: [] };
                });
            } else if (key === 'ui') {
                this.metrics.ui = { viewSwitches: 0, avgSwitchTime: 0, switchTimes: [] };
            } else {
                this.metrics[key] = [];
            }
        });
        
        console.log('✅ Métricas reseteadas');
    }
}

// =============================================
// INSTANCIA GLOBAL
// =============================================
window.performanceLogger = new PerformanceLogger();

// =============================================
// HELPERS GLOBALES
// =============================================
window.getPerformanceReport = () => window.performanceLogger.printReport();
window.resetPerformanceMetrics = () => window.performanceLogger.reset();

console.log('✅ Performance Logger inicializado');
