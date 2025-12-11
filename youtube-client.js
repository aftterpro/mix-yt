console.log('🎵 Cargando YouTube Client (Conectado a Netlify Functions)...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // Ahora apuntamos a TU función en Netlify, no a Piped
        this.searchApiUrl = '/.netlify/functions/search'; 
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado (Backend Propio)');
        return true;
    }

    /**
     * Método principal para buscar
     */
    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Buscando: "${query}"${continuation ? ' (Página siguiente)' : ''}`);

        try {
            // Construir la URL para tu función Netlify
            const params = new URLSearchParams({
                q: query
            });

            // Si hay token de continuación (nextpage), lo añadimos
            if (continuation) {
                params.append('nextpage', continuation);
            }

            const targetUrl = `${this.searchApiUrl}?${params.toString()}`;
            console.log(`📡 Llamando a: ${targetUrl}`);

            const response = await fetch(targetUrl);

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            const data = await response.json();

            // La función de Netlify ya devuelve los datos limpios y formateados,
            // así que solo necesitamos asegurarnos de que la estructura sea correcta.
            return {
                items: data.items || [],
                nextpage: data.nextpage || null,
                suggestion: null, // Tu función actual no devuelve sugerencias, pero no es crítico
                metadata: {
                    source: 'youtube-search-api',
                    timestamp: Date.now()
                }
            };

        } catch (error) {
            console.error("❌ Error en búsqueda:", error);
            // Devolver estructura vacía para no romper la UI
            return { items: [], nextpage: null, error: error.message };
        }
    }

    /**
     * Obtener trending (Opcional - Mantenemos compatibilidad o usas Piped como fallback)
     * Si tu función search.js no soporta trending, podemos dejar esto apuntando a Piped
     * o devolver una lista vacía por ahora.
     */
    async getTrending(region = 'US') {
        console.log('⚠️ Trending no implementado en función local, usando fallback Piped...');
        // Fallback a una instancia pública de Piped solo para trending
        try {
            const response = await fetch(`https://pipedapi.kavin.rocks/trending?region=${region}`);
            return { items: await response.json(), region };
        } catch (e) {
            return { items: [], error: 'Trending no disponible' };
        }
    }

    /**
     * Obtener info de un video específico
     * Se mantiene apuntando a Piped porque tu función de búsqueda solo busca.
     * Si Piped falla mucho, habría que crear otra función "video-info.js".
     */
    async getVideoInfo(videoId) {
        try {
            // Usamos una instancia pública rotativa o fija estable
            const response = await fetch(`https://pipedapi.kavin.rocks/streams/${videoId}`);
            if (!response.ok) throw new Error('Video info error');
            const data = await response.json();
            
            return {
                videoId: videoId,
                title: data.title,
                description: data.description,
                duration: data.duration,
                uploader: data.uploader,
                thumbnail: data.thumbnailUrl,
                relatedStreams: data.relatedStreams || []
            };
        } catch (error) {
            console.warn(`❌ Error obteniendo info video ${videoId}, usando datos básicos.`);
            return null;
        }
    }

}

// =============================================
// EXPORTAR INSTANCIA GLOBAL
// =============================================

window.youtubeJSClient = new YouTubeSimplifiedClient();

// Utilidades de formato (mantenidas para compatibilidad con core.js)
window.youtubeClientUtils = {
    formatDuration: (seconds) => {
        if (!seconds) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`;
    }
};
