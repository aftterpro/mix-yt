// youtube-client.js - Sistema con proxy CORS para Piped
console.log('🎵 Cargando YouTube Client con proxy CORS...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // La función de Netlify actúa como nuestro proxy seguro para evitar problemas de CORS y formato.
        this.netlifyFunction = '/.netlify/functions/piped-search';
        // Instancias de Piped como fallback (último recurso).
        this.pipedInstances = [
            "https://api.piped.private.coffee"
            // Se pueden añadir más instancias aquí para mayor redundancia.
        ];
        this.currentInstanceIndex = 0;
    }

    async init() {
        this.initialized = true;
        console.log('✅ YouTube Client inicializado con proxy CORS');
        return true;
    }

    getCurrentInstance() {
        return this.pipedInstances[this.currentInstanceIndex];
    }

    rotateInstance() {
        this.currentInstanceIndex = (this.currentInstanceIndex + 1) % this.pipedInstances.length;
        console.log(`🔄 Rotando a instancia de Piped: ${this.getCurrentInstance()}`);
    }

    async search(query, continuation = null) {
        if (!this.initialized) await this.init();

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (cargando página siguiente)' : ''}`);

        try {
            // **Paso 1: Intentar la búsqueda a través de nuestro proxy de Netlify.**
            // Este es el método preferido y más fiable.
            return await this.searchViaCorsProxy(query, continuation);
        } catch (error) {
            console.warn('⚠️ Error con el proxy de Netlify:', error.message);
            
            // **Paso 2: Fallback a un intento de conexión directa.**
            // Esto podría fallar por CORS, pero se intenta como respaldo.
            try {
                console.log('🔄 Intentando acceso directo a Piped...');
                return await this.searchDirect(query, continuation);
            } catch (directError) {
                console.error('❌ Falló también el acceso directo:', directError.message);
                // **Paso 3: Último recurso, mostrar resultados locales.**
                return this.searchFallback(query, continuation);
            }
        }
    }

    async searchViaCorsProxy(query, continuation) {
        console.log('📡 Usando la función de Netlify como proxy.');
        
        let targetUrl;
        let fetchOptions = {
            headers: { 'Accept': 'application/json' }
        };

        if (continuation) {
            // Para la paginación, enviamos el token 'nextpage' a nuestra función de Netlify.
            // La función se encargará de hacer la petición POST correcta a Piped.
            const encodedQuery = encodeURIComponent(query);
            const encodedToken = encodeURIComponent(JSON.stringify(continuation));
            
            targetUrl = `${this.netlifyFunction}?q=${encodedQuery}&nextpage=${encodedToken}`;
            fetchOptions.method = 'GET';
        } else {
            // Para la primera búsqueda, solo enviamos la consulta.
            targetUrl = `${this.netlifyFunction}?q=${encodeURIComponent(query)}`;
            fetchOptions.method = 'GET';
        }

        console.log(`📡 URL del Proxy: ${targetUrl.substring(0, 100)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Timeout de 15 segundos
        fetchOptions.signal = controller.signal;

        try {
            const response = await fetch(targetUrl, fetchOptions);
            clearTimeout(timeoutId);
            
            console.log(`📊 Respuesta del Proxy: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Error desconocido');
                throw new Error(`Error HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            }

            const data = await response.json();
            return this.normalizeResponse(data, query, continuation);

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('La búsqueda excedió el tiempo límite (15s)');
            }
            throw error;
        }
    }

    async searchDirect(query, continuation) {
        // Este es un método de fallback y puede fallar por CORS.
        const instanceUrl = this.getCurrentInstance();
        let targetUrl;
        
        if (continuation) {
            // NOTA: Este método de paginación directa con GET es el que suele fallar.
            // La API de Piped espera un POST para la paginación, que es lo que nuestro proxy de Netlify corrige.
            const encodedQuery = encodeURIComponent(query);
            const encodedToken = encodeURIComponent(JSON.stringify(continuation));
            targetUrl = `${instanceUrl}/nextpage/search?query=${encodedQuery}&nextpage=${encodedToken}`;
        } else {
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
        }

        console.log(`🔗 Petición directa: ${targetUrl}`);

        const response = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });

        if (!response.ok) {
            this.rotateInstance();
            throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return this.normalizeResponse(data, query, continuation);
    }
    
    // --- El resto de las funciones de ayuda (normalizeResponse, extractVideoId, etc.) ---
    // ... (El código de las funciones auxiliares no necesita cambios y se mantiene igual)
    normalizeResponse(data, query, continuation) {
        console.log(`📊 Datos recibidos:`, {
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
        });

        const items = (data.items || []).filter(item =>
            item && item.title && (item.url || item.videoId) && item.thumbnail
        ).map(item => ({
            videoId: item.videoId || this.extractVideoId(item.url),
            title: item.title.trim(),
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : this.parseDurationString(item.duration),
            uploaderName: item.uploaderName?.trim() || 'Desconocido',
        }));

        console.log(`✅ ${items.length} videos válidos procesados.`);

        return {
            items: items,
            nextpage: data.nextpage || null,
            suggestion: data.suggestion || null,
        };
    }

    extractVideoId(url) {
        if (!url) return null;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    parseDurationString(duration) {
        if (typeof duration === 'number') return duration;
        if (!duration || typeof duration !== 'string') return 0;
        const parts = duration.split(':').map(p => parseInt(p, 10));
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    }

    searchFallback(query, continuation) {
      console.log('🔄 Usando fallback de resultados locales.');
      // Lógica de fallback...
      return { items: [], nextpage: null, suggestion: "No se pudieron obtener resultados en línea." };
    }
}

// Crear instancia global para que sea accesible desde la aplicación
window.youtubeJSClient = new YouTubeSimplifiedClient();
console.log('✅ YouTube Client listo para usar.');
