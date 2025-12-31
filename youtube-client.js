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
const searchCache = new Map();
let isLoadingMore = false; // Prevenir múltiples cargas simultáneas
    
    async search(query, continuation = null) {
        if (!query?.trim()) {
        console.error('❌ Query vacío');
        return { items: [], nextPageToken: null };
    }

    const cacheKey = `${query}_${nextPageToken || 'first'}`;
    
    // Verificar caché
    if (searchCache.has(cacheKey)) {
        console.log(`💾 Resultado cacheado: ${cacheKey} (Total: ${searchCache.size}/50)`);
        return searchCache.get(cacheKey);
    }

    // PREVENIR CARGA MÚLTIPLE
    if (isLoadingMore && nextPageToken) {
        console.log('⏳ Ya hay una carga en progreso...');
        return { items: [], nextPageToken: null };
    }

    console.log(`🔍 Buscando: "${query}"${nextPageToken ? ' (Pág. siguiente)' : ''}`);
    
    const params = new URLSearchParams({ q: query });
    if (nextPageToken) {
        params.append('nextpage', nextPageToken);
    }

    const url = `https://mix-yt.netlify.app/.netlify/functions/search?${params}`;
    console.log(`📡 Llamando a: ${url}`);

    isLoadingMore = true; // BLOQUEAR NUEVAS CARGAS

    try {
        const response = await fetchWithRetry(url);
        const data = await response.json();

        if (!data?.items?.length) {
            console.warn('⚠️ Sin resultados');
            isLoadingMore = false;
            return { items: [], nextPageToken: null };
        }

        console.log(`✅ ${data.items.length} resultados encontrados`);

        const result = {
            items: data.items,
            nextPageToken: data.nextPageToken || null
        };

        searchCache.set(cacheKey, result);

        if (searchCache.size > 50) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }

        isLoadingMore = false; // DESBLOQUEAR
        return result;

    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        isLoadingMore = false;
        return { items: [], nextPageToken: null };
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
   
    if (this.requestCache.size >= this.maxCacheSize) {
        // Eliminar la entrada más antigua
        const firstKey = this.requestCache.keys().next().value;
        this.requestCache.delete(firstKey);
        console.log(`🗑️ Caché llena, eliminando: ${firstKey}`);
    }
    
    this.requestCache.set(key, {
        data,
        timestamp: Date.now()
    });
    
    console.log(`💾 Resultado cacheado: ${key} (Total: ${this.requestCache.size}/${this.maxCacheSize})`);
}

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
// SPONSORBLOCK - Sistema de Detección y Salto
// =============================================

class SponsorBlockManager {
    constructor() {
        this.segmentosCache = {};
        this.lastSkipTime = 0;
        this.nombresCategorias = {
            'sponsor': 'Patrocinio',
            'intro': 'Intro',
            'outro': 'Créditos',
            'interaction': 'Interacción',
            'selfpromo': 'Autopromo',
            'music_offtopic': 'Intro no musical'
        };
        
        // Cargar caché de sesión si existe
        this.loadCache();
    }

    loadCache() {
        try {
            const saved = sessionStorage.getItem('ytcm_sponsor_cache');
            if (saved) {
                this.segmentosCache = JSON.parse(saved);
                console.log('📦 Cache de SponsorBlock restaurada');
            }
        } catch (e) {
            console.warn('⚠️ Error cargando caché SponsorBlock');
        }
    }

    saveCache() {
        try {
            sessionStorage.setItem('ytcm_sponsor_cache', JSON.stringify(this.segmentosCache));
        } catch (e) {
            console.warn('⚠️ Error guardando caché SponsorBlock');
        }
    }

    async cargarSegmentos(videoId) {
        // Verificar caché
        const cached = this.segmentosCache[videoId];
        if (cached && typeof cached === 'object' && cached.segments) {
            const cacheAge = Date.now() - (cached.timestamp || 0);
            if (cacheAge < 10 * 60 * 1000) { // 10 minutos
                console.log(`✅ SB: Usando caché para ${videoId}`);
                return cached.segments;
            }
        }

        const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd';
        const apiUrl = `https://mix-yt.netlify.app/.netlify/functions/sponsorblock?videoId=${videoId}`;
        
        this.segmentosCache[videoId] = 'fetching';

        try {
            const response = await fetch(apiUrl, { 
                headers: { 'X-UserID': userId } 
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            const segments = Array.isArray(data) 
                ? data.filter(s => s.startTime < s.endTime)
                : [];
            
            this.segmentosCache[videoId] = {
                segments: segments,
                timestamp: Date.now()
            };
            
            this.saveCache();
            console.log(`✅ SB: ${segments.length} segmentos para ${videoId}`);
            return segments;
            
        } catch (e) {
            console.warn(`⚠️ SB Error ${videoId}:`, e.message);
            this.segmentosCache[videoId] = { 
                segments: [], 
                timestamp: Date.now() 
            };
            return [];
        }
    }

    checkAndSkip(player) {
        const videoId = player.getVideoData()?.video_id;
        if (!videoId) return false;
        
        const cached = this.segmentosCache[videoId];
        
        if (!cached || cached === 'fetching' || typeof cached !== 'object') {
            return false;
        }
        
        const segments = cached.segments || [];
        if (segments.length === 0) return false;

        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();

        // Evitar saltos repetitivos
        if (Math.abs(currentTime - this.lastSkipTime) < 1.5) return false;

        for (const seg of segments) {
            if (currentTime >= seg.startTime && currentTime < seg.endTime) {
                const nombreCat = this.nombresCategorias[seg.category] || seg.category;

                if (seg.endTime >= (duration - 2)) {
                    console.log("🎬 SponsorBlock: Outro detectado");
                    this.mostrarAviso(`🎬 Final saltado`, player.getIframe().parentElement);
                    player.seekTo(duration, true);
                } else {
                    console.log(`⏩ SponsorBlock: Saltando ${nombreCat}`);
                    this.mostrarAviso(`⏩ Saltado: ${nombreCat}`, player.getIframe().parentElement);
                    player.seekTo(seg.endTime, true);
                }

                this.lastSkipTime = seg.endTime;
                return true;
            }
        }
        
        return false;
    }

    mostrarAviso(mensaje, container) {
        // Limpiar avisos anteriores
        const oldToasts = document.querySelectorAll('.sb-toast');
        oldToasts.forEach(toast => toast.remove());
        
        let toast = document.createElement('div');
        toast.className = 'sb-toast';
        toast.textContent = mensaje;
        
        toast.style.cssText = `
            position: absolute;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 100;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        (container || document.body).appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    calculateCrossfadeTriggerTime(videoDuration, videoId, crossfadeDuration = 10) {
        const SAFETY_MARGIN = 0.5;
        
        if (!videoId || !this.segmentosCache[videoId] || 
            !Array.isArray(this.segmentosCache[videoId].segments)) {
            return videoDuration - crossfadeDuration - SAFETY_MARGIN;
        }

        let effectiveEndTime = videoDuration;
        
        const endCategories = ['outro', 'selfpromo', 'interaction', 'music_offtopic', 'preview'];
        
        this.segmentosCache[videoId].segments.forEach(segment => {
            if (endCategories.includes(segment.category)) {
                const start = segment.segment?.[0] ?? segment.startTime;
                const end = segment.segment?.[1] ?? segment.endTime;
                
                if (Math.abs(videoDuration - end) < 5) {
                    if (start < effectiveEndTime) {
                        effectiveEndTime = start;
                    }
                }
            }
        });

        console.log(`⏱️ Video: ${videoDuration}s | Final Efectivo: ${effectiveEndTime}s | Trigger: ${effectiveEndTime - crossfadeDuration}s`);

        return effectiveEndTime - crossfadeDuration - SAFETY_MARGIN;
    }

    cleanup() {
        const MAX_AGE = 10 * 60 * 1000;
        const MAX_ENTRIES = 100;
        const now = Date.now();
        
        const entries = Object.entries(this.segmentosCache);
        const validEntries = entries.filter(([videoId, data]) => {
            if (!data.timestamp) return false;
            return (now - data.timestamp) < MAX_AGE;
        });
        
        if (validEntries.length > MAX_ENTRIES) {
            validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
            validEntries.splice(MAX_ENTRIES);
        }
        
        this.segmentosCache = Object.fromEntries(validEntries);
        this.saveCache();
    }
}

// Instancia global
window.sponsorBlockManager = new SponsorBlockManager();

// Limpieza automática cada 5 minutos
setInterval(() => {
    window.sponsorBlockManager?.cleanup();
}, 5 * 60 * 1000);
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
