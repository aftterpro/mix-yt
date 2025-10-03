console.log('🎵 Cargando YouTube Client con procesamiento backend...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // La función de Netlify procesa los datos en el backend
        this.netlifyFunction = '/.netlify/functions/search';
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado con procesamiento backend');
        return true;
    }

    /**
     * Método principal para buscar
     * Los datos ya vienen procesados del backend
     */
    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (paginación)' : ''}`);

        try {
            return await this.searchViaCorsProxy(query, continuation);
        } catch (error) {
            console.error("❌ Error en búsqueda:", error);
            return { items: [], nextpage: null, suggestion: "Error al buscar resultados." };
        }
    }

    /**
     * Realiza la llamada al proxy de Netlify
     * Backend procesa y limpia los datos automáticamente
     */
    async searchViaCorsProxy(query, continuation) {
        console.log('📡 Usando la función de Netlify (con procesamiento backend)');
        
        let targetUrl = this.netlifyFunction;
        const fetchOptions = {
            headers: {    
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        };

        if (continuation) {
            // PAGINACIÓN: POST
            console.log('📄 Petición POST para paginación...');
            fetchOptions.method = 'POST';
            fetchOptions.body = JSON.stringify({
                query: query,
                nextpage: continuation
            });
        } else {
            // BÚSQUEDA INICIAL: GET
            console.log('📄 Petición GET para primera búsqueda...');
            fetchOptions.method = 'GET';
            targetUrl = `${this.netlifyFunction}?q=${encodeURIComponent(query)}`;
        }

        console.log(`📡 ${fetchOptions.method} a:`, targetUrl);

        try {
            const response = await fetch(targetUrl, fetchOptions);
            
            console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    details: 'Respuesta de error no es JSON' 
                }));
                throw new Error(`Error ${response.status}: ${errorData.details || errorData.error}`);
            }

            const data = await response.json();
            
            // Los datos YA vienen procesados del backend
            // Solo necesitamos validación final
            return this.validateResponse(data, query, continuation);

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('La búsqueda excedió el tiempo límite (15s)');
            }
            throw error;
        }
    }

    /**
     * Validar respuesta del backend
     * El backend ya procesó los títulos, solo verificamos estructura
     */
    validateResponse(data, query, continuation) {
        console.log('📊 Validando respuesta del backend:', {
            source: continuation ? 'paginación' : 'primera búsqueda',
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            backendProcessed: data.items?.[0]?.artist ? 'Yes' : 'No'
        });

        // Verificar que los items tengan la estructura esperada
        const validItems = (data.items || []).filter(item => {
            // Validación básica
            if (!item.videoId || !item.title) {
                console.warn('⚠️ Item sin videoId o title:', item);
                return false;
            }

            // Validar videoId (11 caracteres)
            if (!/^[a-zA-Z0-9_-]{11}$/.test(item.videoId)) {
                console.warn('⚠️ VideoId inválido:', item.videoId);
                return false;
            }

            return true;
        });

        if (validItems.length < data.items?.length) {
            console.warn(`⚠️ ${data.items.length - validItems.length} items descartados por validación`);
        }

        console.log(`✅ ${validItems.length} videos válidos`);

        return {
            items: validItems,
            nextpage: data.nextpage || null,
            suggestion: data.suggestion || null,
            metadata: {
                source: 'piped',
                backendProcessed: true,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Extraer videoId de URL (por si acaso, ya no debería ser necesario)
     * @deprecated - El backend ya proporciona videoId limpio
     */
    extractVideoId(url) {
        if (!url) return null;
        
        // Si ya es un videoId válido
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
        
        const patterns = [
            /^\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /[?&]v=([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /embed\/([a-zA-Z0-9_-]{11})/,
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        console.warn('❌ No se pudo extraer videoId de:', url);
        return null;
    }

    /**
     * Parsear duración (backup, el backend debería normalizarla)
     * @deprecated - El backend normaliza duraciones
     */
    parseDurationString(duration) {
        if (typeof duration === 'number') return duration;
        if (!duration || typeof duration !== 'string') return 0;

        const parts = duration.split(':').map(p => parseInt(p, 10));
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }

    /**
     * NUEVO: Método para obtener trending (opcional)
     */
    async getTrending(region = 'US') {
        console.log(`🔥 Obteniendo trending para región: ${region}`);
        
        try {
            const pipedUrl = `https://api.piped.private.coffee/trending?region=${region}`;
            const response = await fetch(pipedUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            return {
                items: data || [],
                region: region,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo trending:', error);
            return { items: [], region, error: error.message };
        }
    }

    /**
     * NUEVO: Método para obtener info de un video específico
     */
    async getVideoInfo(videoId) {
        console.log(`📹 Obteniendo info para video: ${videoId}`);
        
        try {
            const pipedUrl = `https://api.piped.private.coffee/streams/${videoId}`;
            const response = await fetch(pipedUrl, {
                headers: {
                    'Accept': 'application/json'
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            return {
                videoId: videoId,
                title: data.title,
                description: data.description,
                duration: data.duration,
                views: data.views,
                likes: data.likes,
                uploader: data.uploader,
                uploaderUrl: data.uploaderUrl,
                thumbnail: data.thumbnailUrl,
                category: data.category,
                uploadDate: data.uploadDate
            };
            
        } catch (error) {
            console.error(`❌ Error obteniendo info de video ${videoId}:`, error);
            return null;
        }
    }
}

// =============================================
// FUNCIONES AUXILIARES Y UTILIDADES
// =============================================

/**
 * Formatear duración a MM:SS o HH:MM:SS
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validar estructura de video
 */
function isValidVideoStructure(video) {
    return (
        video &&
        typeof video === 'object' &&
        video.videoId &&
        video.title &&
        typeof video.videoId === 'string' &&
        typeof video.title === 'string' &&
        /^[a-zA-Z0-9_-]{11}$/.test(video.videoId)
    );
}

/**
 * Sanitizar texto para HTML
 */
function sanitizeForHTML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =============================================
// EXPORTAR INSTANCIA GLOBAL
// =============================================

// Crear instancia global
window.youtubeJSClient = new YouTubeSimplifiedClient();

// Exponer utilidades
window.youtubeClientUtils = {
    formatDuration,
    isValidVideoStructure,
    sanitizeForHTML
};

console.log('✅ YouTube Client listo con procesamiento backend.');
console.log('📝 Características:');
console.log('  ✅ Títulos procesados en backend');
console.log('  ✅ Artista y título separados');
console.log('  ✅ Validación de videoId');
console.log('  ✅ Normalización de duraciones');
console.log('  ✅ Limpieza de patrones comunes');
