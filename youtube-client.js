// =============================================
// CORRECCIÓN: Cliente de YouTube en youtube-client.js
// Reemplazar clase completa con mejor manejo de errores
// =============================================

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        this.searchApiUrl = 'https://mix-yt.netlify.app/.netlify/functions/search';
        this.requestCache = new Map();
        this.maxCacheSize = 50;
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutos
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado');
        return true;
    }

    // ✅ CORRECCIÓN: Búsqueda con caché y retry
    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        // Validar query
        if (!query || typeof query !== 'string' || query.trim() === '') {
            console.error('❌ Query inválido:', query);
            return { items: [], nextpage: null, error: 'Query inválido' };
        }

        const trimmedQuery = query.trim();
        console.log(`🔍 Buscando: "${trimmedQuery}"${continuation ? ' (Pág. siguiente)' : ''}`);

        // ✅ CACHÉ: Verificar si ya tenemos estos resultados
        const cacheKey = `${trimmedQuery}_${continuation || 'first'}`;
        const cached = this.getCachedResult(cacheKey);
        if (cached) {
            console.log('✅ Usando resultados cacheados');
            return cached;
        }

        try {
            // Construir URL
            const params = new URLSearchParams({ q: trimmedQuery });
            if (continuation) {
                params.append('nextpage', continuation);
            }

            const targetUrl = `${this.searchApiUrl}?${params.toString()}`;
            console.log(`📡 Llamando a: ${targetUrl}`);

            // ✅ CORRECCIÓN: Fetch con timeout y retry
            const response = await this.fetchWithRetry(targetUrl, 3);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
            }

            const data = await response.json();

            // ✅ CORRECCIÓN: Validar estructura de respuesta
            if (!data || typeof data !== 'object') {
                throw new Error('Respuesta inválida del servidor');
            }

            const result = {
                items: Array.isArray(data.items) ? data.items : [],
                nextpage: data.nextpage || null,
                suggestion: data.suggestion || null,
                metadata: {
                    source: 'youtube-search-api',
                    timestamp: Date.now(),
                    query: trimmedQuery,
                    resultCount: data.items?.length || 0
                }
            };

            // Guardar en caché
            this.cacheResult(cacheKey, result);

            console.log(`✅ ${result.items.length} resultados encontrados`);
            return result;

        } catch (error) {
            console.error('❌ Error en búsqueda:', error);
            
            // ✅ CORRECCIÓN: Devolver estructura válida en caso de error
            return {
                items: [],
                nextpage: null,
                error: error.message,
                metadata: {
                    source: 'error',
                    timestamp: Date.now(),
                    query: trimmedQuery
                }
            };
        }
    }

    // ✅ NUEVA FUNCIÓN: Fetch con reintentos
    async fetchWithRetry(url, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📡 Intento ${attempt}/${maxRetries}`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
                
                const response = await fetch(url, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                return response;
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Intento ${attempt} falló:`, error.message);
                
                if (attempt < maxRetries) {
                    console.log(`🔄 Reintentando en ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                }
            }
        }
        
        throw lastError;
    }

    // ✅ NUEVA FUNCIÓN: Sistema de caché
    getCachedResult(key) {
        const cached = this.requestCache.get(key);
        if (!cached) return null;
        
        // Verificar expiración
        if (Date.now() - cached.timestamp > this.cacheExpiry) {
            this.requestCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    cacheResult(key, data) {
        // Limpiar caché si está llena
        if (this.requestCache.size >= this.maxCacheSize) {
            const firstKey = this.requestCache.keys().next().value;
            this.requestCache.delete(firstKey);
        }
        
        this.requestCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // ✅ CORRECCIÓN: Trending con fallback
    async getTrending(region = 'US') {
        console.log(`🔥 Cargando trending (${region})...`);
        
        try {
            const pipedInstances = [
                'https://api.piped.private.coffee',
                'https://pipedapi.kavin.rocks',
                'https://piped-api.garudalinux.org'
            ];
            
            // Intentar con cada instancia
            for (const instance of pipedInstances) {
                try {
                    const response = await fetch(
                        `${instance}/trending?region=${region}`,
                        { signal: AbortSignal.timeout(5000) }
                    );
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`✅ Trending cargado desde ${instance}`);
                        return { items: data, region, source: instance };
                    }
                } catch (e) {
                    console.warn(`⚠️ Instancia ${instance} falló`);
                    continue;
                }
            }
            
            throw new Error('Todas las instancias fallaron');
            
        } catch (error) {
            console.error('❌ Error en trending:', error);
            return { items: [], error: error.message };
        }
    }

    // ✅ CORRECCIÓN: Obtener info de video con fallback
    async getVideoInfo(videoId) {
        if (!videoId || videoId === 'undefined') {
            console.error('❌ VideoId inválido');
            return null;
        }

        try {
            const pipedInstances = [
                'https://api.piped.private.coffee'
                //'https://pipedapi.kavin.rocks',
               // 'https://piped-api.garudalinux.org'
            ];
            
            // Intentar con cada instancia
            for (const instance of pipedInstances) {
                try {
                    const response = await fetch(
                        `${instance}/streams/${videoId}`,
                        { signal: AbortSignal.timeout(5000) }
                    );
                    
                    if (!response.ok) continue;
                    
                    const data = await response.json();
                    
                    return {
                        videoId: videoId,
                        title: data.title,
                        description: data.description,
                        duration: data.duration,
                        uploader: data.uploader,
                        thumbnail: data.thumbnailUrl,
                        relatedStreams: data.relatedStreams || [],
                        source: instance
                    };
                    
                } catch (e) {
                    console.warn(`⚠️ Instancia ${instance} falló para ${videoId}`);
                    continue;
                }
            }
            
            console.warn(`❌ No se pudo obtener info de ${videoId}`);
            return null;
            
        } catch (error) {
            console.error(`❌ Error obteniendo info de ${videoId}:`, error);
            return null;
        }
    }

    // ✅ NUEVA FUNCIÓN: Limpiar caché manualmente
    clearCache() {
        this.requestCache.clear();
        console.log('🧹 Caché limpiada');
    }

    // ✅ NUEVA FUNCIÓN: Obtener estadísticas
    getStats() {
        return {
            initialized: this.initialized,
            cacheSize: this.requestCache.size,
            maxCacheSize: this.maxCacheSize,
            apiUrl: this.searchApiUrl
        };
    }
}

// =============================================
// UTILIDADES MEJORADAS
// =============================================

window.youtubeClientUtils = {
    // ✅ CORRECCIÓN: Formatear duración con validación
    formatDuration: (seconds) => {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }
        return `${m}:${s.toString().padStart(2,'0')}`;
    },
    
    // ✅ CORRECCIÓN: Parsear duración con mejor validación
    parseDurationString: (durationStr) => {
        if (!durationStr || typeof durationStr !== 'string') return 0;
        
        // Limpiar string
        const cleaned = durationStr.trim();
        if (cleaned === '') return 0;
        
        const parts = cleaned.split(':').map(Number);
        
        // Validar que todos los números sean válidos
        if (parts.some(isNaN)) return 0;
        
        if (parts.length === 2) {
            // Formato MM:SS
            return (parts[0] * 60) + parts[1];
        } else if (parts.length === 3) {
            // Formato HH:MM:SS
            return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        }
        
        // Intentar parsear como número directo
        const num = parseInt(cleaned);
        return isNaN(num) ? 0 : num;
    },
    
    // ✅ NUEVA FUNCIÓN: Validar videoId
    isValidVideoId: (videoId) => {
        if (!videoId || typeof videoId !== 'string') return false;
        // YouTube video IDs son exactamente 11 caracteres
        return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
    },
    
    // ✅ NUEVA FUNCIÓN: Extraer videoId de URL
    extractVideoId: (url) => {
        if (!url) return null;
        
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        
        return null;
    }
};

// =============================================
// EXPORTAR INSTANCIA GLOBAL
// =============================================
window.youtubeJSClient = new YouTubeSimplifiedClient();

console.log('✅ YouTube Client cargado con mejoras');
