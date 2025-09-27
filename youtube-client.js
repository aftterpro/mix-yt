// youtube-client.js - Sistema con proxy CORS para Piped
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

        console.log(`🔍 Búsqueda: "${query}"${continuation ? ' (cargando página siguiente)' : ''}`);

        try {
            // **Paso 1: Intentar la búsqueda a través de nuestro proxy de Netlify.**
            return await this.searchViaCorsProxy(query, continuation);
        } catch (error) {
            console.warn('⚠️ Error con el proxy de Netlify:', error.message);
            
            // **Paso 2: Fallback a un intento de conexión directa.**
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
    console.log('📊 Normalizando respuesta de Piped:', {
        itemsCount: data.items?.length || 0,
        hasNextpage: !!data.nextpage,
        firstItem: data.items?.[0] // Debug del primer item
    });

    const items = (data.items || []).map((item, index) => {
        // CORRECCIÓN: Debug detallado para cada item
        console.log(`📋 Procesando item ${index}:`, {
            title: item.title?.substring(0, 50),
            url: item.url,
            hasUrl: !!item.url,
            hasThumbnail: !!item.thumbnail
        });

        // Extraer videoId del campo url
        const videoId = item.videoId || this.extractVideoId(item.url);
        
        if (!videoId) {
            console.warn(`❌ Item ${index} descartado - no se pudo extraer videoId:`, {
                url: item.url,
                title: item.title?.substring(0, 30)
            });
            return null;
        }

        // Validar otros campos requeridos
        if (!item.title || !item.thumbnail) {
            console.warn(`❌ Item ${index} descartado - faltan datos:`, {
                hasTitle: !!item.title,
                hasThumbnail: !!item.thumbnail,
                videoId
            });
            return null;
        }

        const normalizedItem = {
            videoId: videoId,
            title: item.title.trim(),
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : this.parseDurationString(item.duration),
            uploaderName: item.uploaderName?.trim() || 'Desconocido',
        };

        console.log(`✅ Item ${index} procesado:`, {
            videoId: normalizedItem.videoId,
            title: normalizedItem.title.substring(0, 30),
            duration: normalizedItem.duration
        });

        return normalizedItem;
    }).filter(item => item !== null); // Filtrar items inválidos

    console.log(`✅ Normalización completada: ${items.length} items válidos de ${data.items?.length || 0} total`);

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
