console.log('🎵 Cargando YouTube Client con proxy CORS...');

class YouTubeSimplifiedClient {
    constructor() {
        this.initialized = false;
        // La función de Netlify actúa como nuestro proxy seguro para evitar problemas de CORS y formato.
        this.netlifyFunction = '/.netlify/functions/search';
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

    console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (paginación)' : ''}`);

    try {
        if (!continuation) {
            // PRIMERA BÚSQUEDA: Usar función Netlify
            return await this.searchViaCorsProxy(query, null);
        } else {
            // PAGINACIÓN: Ir directamente a Piped
            return await this.searchDirectPagination(query, continuation);
        }
    } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        return this.searchFallback(query, continuation);
    }
}

// NUEVO MÉTODO: Paginación directa a Piped
async searchDirectPagination(query, continuation) {
    console.log('📄 Paginación directa a Piped...');
    
    const instanceUrl = this.getCurrentInstance();
    const targetUrl = `${instanceUrl}/nextpage/search`;
    
    const fetchOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            nextpage: continuation,
            query: query
        }),
        signal: AbortSignal.timeout(12000)
    };

    console.log('📡 POST directo a Piped:', targetUrl);
    console.log('📤 Body:', JSON.stringify({
        query: query,
        nextpage: typeof continuation === 'string' ? continuation.substring(0, 100) + '...' : continuation
    }));

    const response = await fetch(targetUrl, fetchOptions);

    if (!response.ok) {
        this.rotateInstance();
        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return this.normalizeResponse(data, query, continuation);
}

async searchViaCorsProxy(query, continuation) {
    console.log('📡 Usando la función de Netlify como proxy.');
    
    let targetUrl;
    let fetchOptions = {
        headers: { 
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (continuation) {
        // CORRECCIÓN: Para paginación, usar POST como espera Piped
        console.log('📄 Preparando petición POST para paginación...');
        
        targetUrl = this.netlifyFunction;
        fetchOptions.method = 'POST';
        fetchOptions.body = JSON.stringify({
            query: query,
            nextpage: continuation // Enviar como objeto, no como string
        });
    } else {
        // Para la primera búsqueda, mantener GET
        targetUrl = `${this.netlifyFunction}?q=${encodeURIComponent(query)}`;
        fetchOptions.method = 'GET';
    }

    console.log(`📡 ${fetchOptions.method} a proxy:`, targetUrl.substring(0, 100));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
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
            // CORRECCIÓN: Asegurar que el token JSON se codifique para la URL.
            const encodedQuery = encodeURIComponent(query);
            const encodedToken = encodeURIComponent(JSON.stringify(continuation)); // <-- ¡ESTO ES CORRECTO!
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
    
normalizeResponse(data, query, continuation) {
    console.log('📊 Normalizando respuesta:', {
        source: continuation ? 'paginación' : 'primera búsqueda',
        itemsCount: data.items?.length || 0,
        hasNextpage: !!data.nextpage
    });

    const items = (data.items || []).map((item, index) => {
        const videoId = item.videoId || this.extractVideoId(item.url);
        
        if (!videoId || !item.title || !item.thumbnail) {
            return null;
        }

        return {
            videoId: videoId,
            title: item.title.trim(),
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : this.parseDurationString(item.duration),
            uploaderName: item.uploaderName?.trim() || 'Desconocido',
        };
    }).filter(item => item !== null);

    console.log(`✅ ${items.length} videos válidos procesados`);

    return {
        items: items,
        nextpage: data.nextpage || null,
        suggestion: data.suggestion || null,
    };
}

extractVideoId(url) {
    if (!url) return null;
    
    console.log('🔍 Extrayendo videoId de URL:', url);
    
    // CORRECCIÓN CRÍTICA: Manejar URLs relativas de Piped
    const patterns = [
        // URL relativa de Piped: "/watch?v=..."
        /^\/watch\?v=([a-zA-Z0-9_-]{11})/,
        // URL completa con watch?v=
        /[?&]v=([a-zA-Z0-9_-]{11})/,
        // URL de youtu.be
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        // URL de embed
        /embed\/([a-zA-Z0-9_-]{11})/,
        // Solo el ID (11 caracteres)
        /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[1] !== 'undefined') {
            console.log('✅ VideoId extraído:', match[1]);
            return match[1];
        }
    }
    
    console.warn('❌ No se pudo extraer videoId de:', url);
    return null;
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
