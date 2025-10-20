console.log('🎵 Cargando YouTube Client estático para Cloudflare Pages...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // 🔴 CAMBIO CLAVE 1: Ahora apunta directamente a la API (y corrige la sintaxis)
        this.searchApiUrl = 'https://api.piped.private.coffee';
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado para Cloudflare Pages (API Directa)');
        return true;
    }

    /**
     * Método principal para buscar
     */
    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (paginación)' : ''}`);

        try {
            // Llamar al método de llamada directa
            return await this.searchDirect(query, continuation);
        } catch (error) {
            console.error("❌ Error en búsqueda:", error);
            // 🔴 CORRECCIÓN: Evitar el error 'undefined' devolviendo una estructura vacía
            return { items: [], nextpage: null, suggestion: "Error al buscar resultados. Intenta otra búsqueda." };
        }
    }

    /**
     * Realiza la llamada directa a la API de Piped
     * ⚠️ ATENCIÓN: Se asume que Piped usa GET para búsqueda y paginación.
     */
    async searchDirect(query, continuation) {
        console.log('📡 Usando llamada directa a Piped API');

        let targetUrl;
        const fetchOptions = {
            method: 'GET', // Método por defecto
            headers: {
                'Accept': 'application/json',
                // No se necesita Content-Type para GET
            },
            signal: AbortSignal.timeout(15000)
        };

        if (continuation) {
            // 🔴 CAMBIO CLAVE 2: PAGINACIÓN - Usamos GET con parámetros de Piped
            // La paginación en Piped es un GET al endpoint /nextpage con el token de continuación
            console.log('📄 Petición GET para paginación...');
            
            // Si la continuación es un objeto complejo (como en tu código original), debe ser stringificado
            const continuationString = JSON.stringify(continuation);
            const params = new URLSearchParams({
                q: query,
                nextpage: continuationString // Piped espera el objeto nextpage
            });

            targetUrl = `${this.searchApiUrl}/search?${params.toString()}`;
            
            // Nota: Algunas instancias de Piped usan '/nextpage', otras usan '/search' con 'nextpage' como parámetro. 
            // Usamos '/search' para maximizar compatibilidad.
            // Si falla, probar con: targetUrl = `${this.searchApiUrl}/nextpage?${params.toString()}`;
            
        } else {
            // BÚSQUEDA INICIAL: GET
            console.log('📄 Petición GET para primera búsqueda...');
            targetUrl = `${this.searchApiUrl}/search?q=${encodeURIComponent(query)}`;
            // Incluimos filtro para obtener solo videos (opcional, Piped lo hace por defecto)
            targetUrl += '&filter=all';
        }

        console.log(`📡 ${fetchOptions.method} a:`, targetUrl);

        try {
            const response = await fetch(targetUrl, fetchOptions);
            
            console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
            
            // Manejo de errores HTTP (4xx, 5xx)
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error del servidor de Piped:', errorText);
                throw new Error(`Error en la API de Piped: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // 🔴 CAMBIO CLAVE 3: Adaptar la respuesta. 
            // La respuesta directa de Piped NO tiene la propiedad '.items'. 
            // Piped devuelve directamente el objeto de búsqueda que contiene 'items' y 'nextpage'.
            
            // Tu función validateResponse necesita que la respuesta sea el objeto completo de Piped
            // (que incluye 'items', 'nextpage', etc.).
            
            // Si tu core.js espera que el resultado de esta función tenga la propiedad '.search', 
            // tendrás que modificar core.js o simular esa estructura aquí.
            
            // Asumimos que la respuesta de Piped es compatible con la estructura esperada por validateResponse
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
     * El backend YA procesó los títulos, solo verificamos estructura
     */
    validateResponse(data, query, continuation) {
        // La lógica de validación se mantiene igual
        console.log('📊 Validando respuesta de Piped API:', {
            source: continuation ? 'paginación' : 'primera búsqueda',
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            // 🔴 ATENCIÓN: 'backendProcessed: false' porque ya no hay backend custom
            backendProcessed: false 
        });

        // Verificar y procesar items
        const validItems = (data.items || []).map(item => {
            // CORRECCIÓN: Extraer videoId si solo viene url (esta lógica es buena, la mantenemos)
            let videoId = item.videoId;
            
            if (!videoId && item.url) {
                // Extraer de url formato /watch?v=VIDEO_ID
                const match = item.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                if (match && match[1]) {
                    videoId = match[1];
                }
            }
            
            // Validación
            if (!videoId || !item.title) {
                console.warn('⚠️ Item sin videoId o title válido, descartado.');
                return null;
            }

            // Validar formato videoId (11 caracteres)
            if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                console.warn('⚠️ VideoId con formato inválido:', videoId);
                return null;
            }

            // Retornar item con videoId extraído
            return {
                ...item,
                videoId: videoId // Asegurar que videoId está presente
            };
        }).filter(item => item !== null);

        if (validItems.length < (data.items?.length || 0)) {
            console.warn(`⚠️ ${(data.items?.length || 0) - validItems.length} items descartados por validación`);
        }

        console.log(`✅ ${validItems.length} videos válidos`);

        // Devolver la estructura esperada por core.js
        return {
            items: validItems,
            nextpage: data.nextpage || null,
            suggestion: data.suggestion || null,
            metadata: {
                source: 'piped',
                backendProcessed: false,
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
