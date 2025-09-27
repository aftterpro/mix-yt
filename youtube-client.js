console.log('🎵 Cargando YouTube Client con proxy CORS...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // La función de Netlify es nuestro ÚNICO punto de entrada para las búsquedas.
        this.netlifyFunction = '/.netlify/functions/search';
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado con proxy CORS');
        return true;
    }

    /**
     * Método principal para buscar. Se encarga de decidir si es una
     * búsqueda inicial o una paginación y siempre usa el proxy.
     */
    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (paginación)' : ''}`);

        try {
            // ¡SIEMPRE usamos el proxy de Netlify para todo!
            return await this.searchViaCorsProxy(query, continuation);
        } catch (error) {
            console.error("❌ Error en búsqueda:", error);
            // Devolvemos un objeto de fallback para que la UI no se rompa.
            return { items: [], nextpage: null, suggestion: "Error al buscar resultados." };
        }
    }

    /**
     * Realiza la llamada a nuestra función de Netlify, que actúa como proxy.
     * Usa GET para la primera búsqueda y POST para la paginación.
     */
    async searchViaCorsProxy(query, continuation) {
        console.log('📡 Usando la función de Netlify como proxy para todo.');
        
        let targetUrl = this.netlifyFunction; // La URL base siempre es la misma
        const fetchOptions = {
            headers: {    
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(15000) // Timeout de 15 segundos
        };

        if (continuation) {
            // --- PAGINACIÓN: Usamos POST con un cuerpo JSON ---
            console.log('📄 Preparando petición POST para paginación vía proxy...');
            fetchOptions.method = 'POST';
            fetchOptions.body = JSON.stringify({
                query: query,
                nextpage: continuation // La función de Netlify espera esto en el body
            });
        } else {
            // --- BÚSQUEDA INICIAL: Usamos GET con un parámetro en la URL ---
            console.log('📄 Preparando petición GET para primera búsqueda vía proxy...');
            fetchOptions.method = 'GET';
            // Para GET, la URL debe llevar el parámetro
            targetUrl = `${this.netlifyFunction}?q=${encodeURIComponent(query)}`;
        }

        console.log(`📡 ${fetchOptions.method} a proxy:`, targetUrl);

        try {
            const response = await fetch(targetUrl, fetchOptions);
            
            console.log(`📊 Respuesta del Proxy: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                // Intentamos leer el error como JSON, si falla, mostramos texto genérico.
                const errorData = await response.json().catch(() => ({ details: 'Respuesta de error no es JSON' }));
                throw new Error(`Error del Proxy ${response.status}: ${errorData.details || errorData.error}`);
            }

            const data = await response.json();
            return this.normalizeResponse(data, query, continuation);

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('La búsqueda excedió el tiempo límite (15s)');
            }
            throw error; // Propagamos otros errores para que sean capturados por el método search()
        }
    }

    // --- MÉTODOS DE AYUDA (HELPER METHODS) ---

    /**
     * Unifica el formato de la respuesta recibida desde la API.
     */
    normalizeResponse(data, query, continuation) {
        console.log('📊 Normalizando respuesta:', {
            source: continuation ? 'paginación' : 'primera búsqueda',
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage
        });

        const items = (data.items || []).map(item => {
            const videoId = item.videoId || this.extractVideoId(item.url);
            
            if (!videoId || !item.title || !item.thumbnail) {
                console.warn('❌ Item descartado por falta de datos:', item);
                return null;
            }

            return {
                videoId: videoId,
                title: item.title.trim(),
                thumbnail: item.thumbnail,
                duration: typeof item.duration === 'number' ? item.duration : this.parseDurationString(item.duration),
                uploaderName: item.uploaderName?.trim() || 'Desconocido',
            };
        }).filter(item => item !== null); // Filtramos los items nulos

        console.log(`✅ ${items.length} videos válidos procesados`);

        return {
            items: items,
            nextpage: data.nextpage || null,
            suggestion: data.suggestion || null,
        };
    }

    /**
     * Extrae el ID de un video de diferentes formatos de URL de YouTube.
     */
    extractVideoId(url) {
        if (!url) return null;
        
        const patterns = [
            /^\/watch\?v=([a-zA-Z0-9_-]{11})/,   // URL relativa de Piped: "/watch?v=..."
            /[?&]v=([a-zA-Z0-9_-]{11})/,        // URL completa con watch?v=
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,   // URL de youtu.be
            /embed\/([a-zA-Z0-9_-]{11})/,       // URL de embed
            /^([a-zA-Z0-9_-]{11})$/             // Solo el ID
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
     * Convierte una duración en formato "HH:MM:SS" a segundos.
     */
    parseDurationString(duration) {
        if (typeof duration === 'number') return duration;
        if (!duration || typeof duration !== 'string') return 0;

        const parts = duration.split(':').map(p => parseInt(p, 10));
        if (parts.length === 2) { // MM:SS
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3) { // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }
}

// Crear instancia global para que sea accesible desde la aplicación
window.youtubeJSClient = new YouTubeSimplifiedClient();
console.log('✅ YouTube Client listo para usar.');
