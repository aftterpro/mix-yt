class YouTubeSimplifiedClient {
constructor() {
        this.baseUrl = "/search";  
        this.maxRetries = 3;
        this.retryDelay = 2000;  
        console.log("✅ YouTube Client activo con mitigación de bloqueos");
    }
    
   async init() {
        this.initialized = true;
        return true;
    }
    
async search(query) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return { items: [] };

        const token = localStorage.getItem('yt_access_token');
    const headers = { "Content-Type": "application/json" };
    
     if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}?q=${encodeURIComponent(cleanQuery)}`;
    
    try {
        const response = await fetch(url, { headers }); // Enviamos las cabeceras
        if (!response.ok) throw new Error("Error en la respuesta del servidor");
        return await response.json();
    } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        return { items: [] };
    }
}
    
async fetchWithRetry(url, attempt = 1) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); 

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'  
                }
            });

            clearTimeout(timeout);

            if (response.status === 429) {
                throw new Error("Demasiadas peticiones (Bot detection)");
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            return await response.json();

        } catch (error) {
            if (attempt >= this.maxRetries) throw error;
            
            const delay = this.retryDelay * attempt;
            console.warn(`⚠️ YouTube bloqueó la petición. Reintentando en ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
            return this.fetchWithRetry(url, attempt + 1);
        }
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
            'music_offtopic': 'No musical',
            'preview': 'Preview'
        };
        this.loadCache();
    }

    loadCache() {
        try {
            const saved = sessionStorage.getItem('ytcm_sponsor_cache');
            if (saved) this.segmentosCache = JSON.parse(saved);
        } catch (e) {}
    }

    saveCache() {
        try {
            sessionStorage.setItem('ytcm_sponsor_cache', JSON.stringify(this.segmentosCache));
        } catch (e) {}
    }

async cargarSegmentos(videoId) {
    if (!videoId || videoId.length !== 11) return [];

    const cached = this.segmentosCache[videoId];

    if (cached && Date.now() - cached.timestamp < 600000) {
        return cached.segments;
    }

    try {
        const response = await fetch(`/sponsorblock?videoId=${videoId}`);

        if (!response.ok) {
            if (response.status === 404) return [];
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        const segments = (Array.isArray(data) ? data : [])
            .filter(s => Array.isArray(s.segment))
            .map(s => ({
                startTime: s.segment[0],
                endTime: s.segment[1],
                category: s.category
            }));

        this.segmentosCache[videoId] = {
            segments,
            timestamp: Date.now()
        };

        this.saveCache();

        return segments;

    } catch (err) {
        console.warn("SponsorBlock error:", err.message);
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

    // Cooldown para evitar saltos repetidos
    if (Math.abs(currentTime - this.lastSkipTime) < 1.5) return false;

    for (const seg of segments) {
        // ✅ Soportar ambos formatos: startTime/endTime y segment[0]/segment[1]
        const start = seg.startTime ?? seg.segment?.[0];
        const end = seg.endTime ?? seg.segment?.[1];
        
        if (start === undefined || end === undefined) {
            console.warn('⚠️ Segmento con formato inválido:', seg);
            continue;
        }
        
        if (currentTime >= start && currentTime < end) {
            const nombreCat = this.nombresCategorias[seg.category] || seg.category;
            console.log(`⏩ SALTANDO ${nombreCat} en ${currentTime.toFixed(1)}s (${start.toFixed(1)} → ${end.toFixed(1)})`);

            if (end >= (duration - 2)) {
                console.log("🎬 Es un outro/final - saltando al final del video");
                this.mostrarAviso(`🎬 Final saltado`, player.getIframe().parentElement);
                player.seekTo(duration, true);
            } else {
                this.mostrarAviso(`⏩ Saltado: ${nombreCat}`, player.getIframe().parentElement);
                player.seekTo(end, true);
            }

            this.lastSkipTime = end;
            return true;
        }
    }
    return false;
}

    mostrarAviso(mensaje, container) {
        const oldToasts = document.querySelectorAll('.sb-toast');
        oldToasts.forEach(toast => toast.remove());
        
        let toast = document.createElement('div');
        toast.className = 'sb-toast';
        toast.textContent = mensaje;
        toast.style.cssText = `
            position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9); color: white; padding: 8px 16px;
            border-radius: 20px; font-size: 12px; z-index: 100; pointer-events: none;
            opacity: 0; transition: opacity 0.3s ease;
        `;
        
        (container || document.body).appendChild(toast);
        requestAnimationFrame(() => toast.style.opacity = '1');
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

calculateCrossfadeTriggerTime(videoDuration, videoId, crossfadeDuration = 10) {
    const SAFETY_MARGIN = 0.5;
    
    if (!videoId || !this.segmentosCache[videoId] || !Array.isArray(this.segmentosCache[videoId].segments)) {
        return videoDuration - crossfadeDuration - SAFETY_MARGIN;
    }

    let effectiveEndTime = videoDuration;
    const endCategories = ['outro', 'selfpromo', 'interaction', 'music_offtopic', 'preview'];
    
    this.segmentosCache[videoId].segments.forEach(segment => {
        if (endCategories.includes(segment.category)) {
            const start = segment.startTime ?? segment.segment?.[0];
            const end = segment.endTime ?? segment.segment?.[1];
            
            if (start === undefined || end === undefined) return;
            
            // Si el segmento está al final del video
            if (Math.abs(videoDuration - end) < 5) {
                if (start < effectiveEndTime) {
                    effectiveEndTime = start;
                }
            }
        }
    });

    // El log se hace ahora una sola vez desde app.js cuando se guarda en el cache
    return effectiveEndTime - crossfadeDuration - SAFETY_MARGIN;
}

    cleanup() {
        const MAX_AGE = 10 * 60 * 1000;
        const MAX_ENTRIES = 100;
        const now = Date.now();
        const entries = Object.entries(this.segmentosCache);
        const validEntries = entries.filter(([_, data]) => (now - data.timestamp) < MAX_AGE);
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
window.testSponsorBlock = async function(videoId) {
    console.log('🧪 === TEST SPONSORBLOCK ===');
    console.log('Video ID:', videoId);
    
    const segments = await window.sponsorBlockManager.cargarSegmentos(videoId);
    console.log('Segmentos cargados:', segments);
    
    if (segments.length > 0) {
        console.log('✅ SEGMENTOS ENCONTRADOS:');
        segments.forEach((seg, i) => {
            console.log(`  ${i+1}. ${seg.category}: ${seg.startTime}s - ${seg.endTime}s`);
        });
    } else {
        console.log('❌ NO SE ENCONTRARON SEGMENTOS');
    }
    
    console.log('Caché actual:', window.sponsorBlockManager.segmentosCache[videoId]);
    console.log('🧪 === FIN TEST ===');
};

window.youtubeClientUtils = {
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
// La inicialización de players se maneja en app.js (initializePlayers)
// Esta función es un puente para que onYouTubeIframeAPIReady la llame correctamente
window.initializePlayers = function() {
    // app.js define la función real 'initializePlayers' (no en window)
    // La llamada directa funciona porque app.js se carga primero
};
// =============================================
// EXPORTAR INSTANCIA GLOBAL
// =============================================
window.youtubeJSClient = new YouTubeSimplifiedClient();

console.log('YouTube Client cargado con mejoras');
