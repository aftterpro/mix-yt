// ============================================================================
// 1. CONFIGURACIÓN GLOBAL Y CACHÉ
// ============================================================================
const CACHE_EXPIRATION_TIME = 1000 * 60 * 10; // 10 minutos en ms

// Función independiente para buscar videos usando el almacenamiento local
async function buscarVideosConCache(termino) {
    if (!termino) return [];
    
    const cacheKey = `search_cache_${termino.trim().toLowerCase()}`;
    const cacheGuardada = localStorage.getItem(cacheKey);
    
    if (cacheGuardada) {
        try {
            const dataParsed = JSON.parse(cacheGuardada);
            if (Date.now() - dataParsed.timestamp < CACHE_EXPIRATION_TIME) {
                console.log("🚀 [YT CrossMix] Cargando desde caché local...");
                return dataParsed.resultados;
            }
        } catch (e) {
            console.error("Error leyendo caché, se ignorará:", e);
        }
    }
    
    try {
        const respuesta = await fetch(`/api/search?q=${encodeURIComponent(termino)}`);
        const resultados = await respuesta.json();
        
        const objetoCache = {
            timestamp: Date.now(),
            resultados: resultados
        };
        localStorage.setItem(cacheKey, JSON.stringify(objetoCache));
        
        return resultados;
    } catch (error) {
        console.error("Error en buscarVideosConCache:", error);
        return [];
    }
}

// ============================================================================
// 2. CLIENTE DE YOUTUBE SIMPLIFICADO
// ============================================================================
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
            const response = await fetch(url, { headers });
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

// ============================================================================
// 3. FUNCIONES DE RENDIMIENTO DE INTERFAZ (DOM)
// ============================================================================
function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

const inputBusqueda = document.getElementById('search-input');
if (inputBusqueda) {
    inputBusqueda.addEventListener('input', debounce((e) => {
        if (typeof ejecutarBusquedaAPI === 'function') {
            ejecutarBusquedaAPI(e.target.value);
        }
    }, 400));
}

function renderizarResultadosVideo(videos, contenedorId) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;
    
    contenedor.innerHTML = ''; 
    const fragmento = document.createDocumentFragment();
    
    videos.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <div class="thumbnail-wrapper">
                <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
            </div>
            <div class="video-info">
                <h3>${video.title}</h3>
                <p>${video.channelTitle}</p>
            </div>
        `;
        fragmento.appendChild(card);
    });
    
    contenedor.appendChild(fragmento);
}

function inicializarLazyCards() {
    const opciones = {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.01
    };

    const observador = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const cardInner = entry.target.querySelector('.card-content-delayed');
            if (entry.isIntersecting) {
                if (cardInner) cardInner.style.display = 'block';
            } else {
                if (cardInner) cardInner.style.display = 'none';
            }
        });
    }, opciones);

    document.querySelectorAll('.video-card').forEach(card => observador.observe(card));
}

// ============================================================================
// 4. SPONSORBLOCK - DETECCIÓN Y SALTO
// ============================================================================
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

        if (Math.abs(currentTime - this.lastSkipTime) < 1.5) return false;

        for (const seg of segments) {
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
                
                if (Math.abs(videoDuration - end) < 5) {
                    if (start < effectiveEndTime) {
                        effectiveEndTime = start;
                    }
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

window.sponsorBlockManager = new SponsorBlockManager();
setInterval(() => {
    window.sponsorBlockManager?.cleanup();
}, 5 * 60 * 1000);

// ============================================================================
// 5. UTILIDADES Y PROVEDORES DE LETRAS (LYRICS)
// ============================================================================
window.testSponsorBlock = async function(videoId) {
    console.log('🧪 === TEST SPONSORBLOCK ===');
    const segments = await window.sponsorBlockManager.cargarSegmentos(videoId);
    console.log('Segmentos cargados:', segments);
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
        const cleaned = durationStr.trim();
        if (cleaned === '') return 0;
        const parts = cleaned.split(':').map(Number);
        if (parts.some(isNaN)) return 0;
        if (parts.length === 2) return (parts[0] * 60) + parts[1];
        if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        const num = parseInt(cleaned);
        return isNaN(num) ? 0 : num;
    },
    isValidVideoId: (videoId) => {
        if (!videoId || typeof videoId !== 'string') return false;
        return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
    },
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

window.initializePlayers = function() {};

// Servicios de Letras de Canciones
window.lyricsService = {
    cache: new Map(),

    async getOrFetchLyrics(clean, cacheKey) {
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        try {
            const data = await Promise.any([this.fetchFromOracle(clean), this.fetchFromLrclib(clean)]);
            if (data) this.cache.set(cacheKey, data);
            return data;
        } catch { throw new Error('Todos los proveedores fallaron'); }
    },

    async fetchFromOracle(clean) {
        // Obtenemos dinámicamente el reproductor activo desde el contexto de la app
        const activePlayer = window.currentPlayer === 1 ? window.player1 : window.player2;
        let videoId = null;
        try { videoId = activePlayer?.getVideoData()?.video_id; } catch {}
        if (!videoId) throw new Error('Sin videoId');

        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 65000);

        // ✅ Corregido el uso de 'id' por 'videoId' para evitar el ReferenceError
        const urlLetras = encodeURIComponent(`https://lyric.sys-lab.app/get-lyrics?id=${videoId}`);
        
        try {
            const res = await fetch(`/cors-proxy?url=${urlLetras}`, { signal: ctrl.signal });
            clearTimeout(timeoutId);
            const data = await res.json();
            
            if (data.status !== 'success' || !data.data) throw new Error('Oracle: no encontrado');
            return { 
                syncedLyrics: data.data, 
                plainLyrics: data.data.replace(/\[.*?\]/g, ''), 
                provider: 'YT-Subtitles' 
            };
        } catch (e) {
            clearTimeout(timeoutId);
            throw e;
        }
    },

    async fetchFromLrclib(clean) {
        const q = encodeURIComponent(`${clean.artist} ${clean.title}`);
        const res = await fetch(`https://lrclib.net/api/search?q=${q}`);
        const data = await res.json();
        if (!data?.length) throw new Error('LRCLIB: no encontrado');
        return { syncedLyrics: data[0].syncedLyrics, plainLyrics: data[0].plainLyrics, provider: 'LRCLib' };
    }
};

// ============================================================================
// 6. EXPORTAR INSTANCIA GLOBAL
// ============================================================================
window.youtubeJSClient = new YouTubeSimplifiedClient();
console.log('YouTube Client cargado con mejoras y sin errores de sintaxis');
