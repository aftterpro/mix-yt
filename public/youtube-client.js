class YouTubeSimplifiedClient {
    constructor() {
       this.baseUrl = "https://sphenographic-johnie-supersensually.ngrok-free.dev/search";
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        console.log("✅ YouTube Client conectado a backend remoto:", this.baseUrl);
    }
    
    async init() {
        this.initialized = true;
        console.log(' YouTube Client inicializado');
        return true;
    }
    
async search(query) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return { items: [] };

    const url = `${this.baseUrl}?q=${encodeURIComponent(cleanQuery)}`;
    
    try {
        const data = await this.fetchWithRetry(url);
        return data;
    } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        return { items: [] };
    }
}
    
  async fetchWithRetry(url, attempt = 1) {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.warn(`⚠️ Intento ${attempt} falló:`, error.message);
            if (attempt < this.maxRetries) {
                const delay = this.retryDelay * attempt;
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchWithRetry(url, attempt + 1);
            } else {
                throw error;
            }
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
        if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
            return [];
        }

        // Verificar caché
        const cached = this.segmentosCache[videoId];
        if (cached && typeof cached === 'object' && Array.isArray(cached.segments)) {
            const cacheAge = Date.now() - (cached.timestamp || 0);
            if (cacheAge < 10 * 60 * 1000) {
                return cached.segments;
            }
        }

        const userId = 'gaDZcHFATqVfqCtNlv3xGMP6bkrNnKkEHyUd';
        const apiUrl = `https://sphenographic-johnie-supersensually.ngrok-free.dev/sponsorblock?videoId=${videoId}`;
    try {
        // ✅ PROMESA CON TIMEOUT AUMENTADO
        const fetchWithTimeout = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
        }, 5000); 
        
        fetch(apiUrl, { 
            headers: { 'X-UserID': userId }
        })
        .then(response => {
            clearTimeout(timeout);
            resolve(response);
        })
        .catch(error => {
            clearTimeout(timeout);
            reject(error);
        });
    });
            
            const response = await fetchWithTimeout;
            
            if (!response.ok) {
                if (response.status === 404) throw new Error('No segments found');
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            const segments = Array.isArray(data) 
                ? data.filter(s => s && typeof s.startTime === 'number')
                : [];
            
            this.segmentosCache[videoId] = {
                segments: segments,
                timestamp: Date.now()
            };
            
            this.saveCache();
             console.log(segments);        
            return segments;
            
        } catch (e) {
            // ✅ NO BLOQUEAR REPRODUCCIÓN
            if (e.message !== 'No segments found') {
                console.log(`⚠️ SB timeout/error (ignorado): ${e.message}`);
            }
            
            // Guardar caché vacía
            this.segmentosCache[videoId] = { 
                segments: [], 
                timestamp: Date.now() 
            };
            this.saveCache();
            return [];
        }
}
    
    checkAndSkip(player) {
        const videoId = player.getVideoData()?.video_id;
        if (!videoId) return false;
        
        const cached = this.segmentosCache[videoId];
        if (!cached || cached === 'fetching' || typeof cached !== 'object') return false;
        
        const segments = cached.segments || [];
        if (segments.length === 0) return false;

        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();

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
                const start = segment.segment?.[0] ?? segment.startTime;
                const end = segment.segment?.[1] ?? segment.endTime;
                if (Math.abs(videoDuration - end) < 5) {
                    if (start < effectiveEndTime) effectiveEndTime = start;
                }
            }
        });

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

// =============================================
// EXPORTAR INSTANCIA GLOBAL
// =============================================
window.youtubeJSClient = new YouTubeSimplifiedClient();

console.log('✅ YouTube Client cargado con mejoras');
