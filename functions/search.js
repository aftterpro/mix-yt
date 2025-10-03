exports.handler = async function(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const instanceUrl = "https://api.piped.private.coffee";
    
    try {
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YTCrossMix-Netlify/1.3',
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        };

        if (event.httpMethod === 'POST') {
            // PAGINACIÓN
            console.log('🔄 Netlify: Paginación recibida por POST.');
            
            const body = JSON.parse(event.body);
            if (!body.nextpage || !body.query) {
                throw new Error('Para paginación se requiere "nextpage" y "query".');
            }

            const params = new URLSearchParams({
                query: body.query,
                nextpage: JSON.stringify(body.nextpage) 
            });
            
            targetUrl = `${instanceUrl}/nextpage?${params.toString()}`;
            fetchOptions.method = 'GET';
            
        } else if (event.httpMethod === 'GET') {
            // BÚSQUEDA INICIAL
            const query = event.queryStringParameters?.q;
            console.log('🔍 Netlify: Primera búsqueda GET:', { query });

            if (!query) {
                throw new Error('El parámetro "q" es requerido.');
            }

            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        
        } else {
            return { 
                statusCode: 405, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: 'Método no permitido.' })
            };
        }

        console.log(`📡 Proxying ${fetchOptions.method} -> ${targetUrl.substring(0, 200)}...`);
        const response = await fetch(targetUrl, fetchOptions);
        console.log(`📊 Respuesta de Piped: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error desconocido de Piped');
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 300)}`);
        }

        const data = await response.json();
        
        // =============================================
        // PROCESAR Y LIMPIAR DATOS AQUÍ
        // =============================================
        const processedData = processSearchResults(data);
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(processedData)
        };
        
    } catch (error) {
        console.error('💥 Error en la función de Netlify:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error interno del proxy.',
                details: error.message
            })
        };
    }
};

// =============================================
// FUNCIONES DE PROCESAMIENTO
// =============================================

/**
 * Procesar resultados de búsqueda
 */
function processSearchResults(data) {
    if (!data || !data.items || !Array.isArray(data.items)) {
        return data;
    }

    const processedItems = data.items.map(item => {
        if (!item || !item.title) return item;

        // Extraer artista y título
        const { artist, title } = extractArtistAndTitle(item.title);
        
        // Limpiar título
        const cleanedTitle = cleanVideoTitle(title);

        return {
            ...item,
            title: cleanedTitle,
            originalTitle: item.title, // Guardar original por si acaso
            artist: artist,
            uploaderName: artist || item.uploaderName || 'Desconocido'
        };
    });

    return {
        ...data,
        items: processedItems
    };
}

/**
 * Extraer artista y título del título completo
 */
function extractArtistAndTitle(fullTitle) {
    if (!fullTitle) return { artist: 'Desconocido', title: 'Título Desconocido' };
    
    let cleanTitle = fullTitle;
    
    // Eliminar patrones comunes de videos
    const patternsToRemove = [
        /\(Videoclip Oficial\)/gi,
        /\(Video Oficial\)/gi,
        /\| Video Oficial/gi,
        /\[Video Oficial\]/gi,
        /\(Official Video\)/gi,
        /\[Official Video\]/gi,
        /\(Official Music Video\)/gi,
        /\[Official Music Video\]/gi,
        /\(Lyric Video\)/gi,
        /\[Lyric Video\]/gi,
        /\(Audio Oficial\)/gi,
        /\[Audio Oficial\]/gi,
        /\(Lyrics\)/gi,
        /\[Lyrics\]/gi,
        /\(HD\)/gi,
        /\[HD\]/gi,
        /\(4K\)/gi,
        /\[4K\]/gi,
        /\(HQ\)/gi,
        /\[HQ\]/gi,
    ];
    
    patternsToRemove.forEach(pattern => {
        cleanTitle = cleanTitle.replace(pattern, '');
    });
    
    // Intentar extraer artista y título: "Artista - Título"
    const separatorPatterns = [
        /^(.+?)\s*[-–—]\s*(.+?)$/,  // Guión
        /^(.+?)\s*:\s*(.+?)$/,       // Dos puntos
        /^(.+?)\s*\|\s*(.+?)$/,      // Pipe
        /^(.+?)\s*•\s*(.+?)$/        // Punto medio
    ];
    
    for (const pattern of separatorPatterns) {
        const match = cleanTitle.match(pattern);
        if (match && match[1] && match[2]) {
            let artist = match[1].trim();
            let title = match[2].trim();
            
            // Extraer features si están en el título
            const featureMatch = title.match(/\(feat\.?\s*([^)]+)\)|\(ft\.?\s*([^)]+)\)|featuring\s+([^)]+)/i);
            let featuredArtist = '';
            
            if (featureMatch) {
                featuredArtist = (featureMatch[1] || featureMatch[2] || featureMatch[3] || '').trim();
                // Limpiar features del título
                title = title
                    .replace(/\s*\(feat\..*?\)/gi, '')
                    .replace(/\s*\[feat\..*?\]/gi, '')
                    .replace(/\s*\(ft\..*?\)/gi, '')
                    .replace(/\s*\[ft\..*?\]/gi, '')
                    .replace(/\s*featuring.*$/gi, '');
            }
            
            // Limpiar remixes del título
            title = title
                .replace(/\s*\(Remix\)/gi, '')
                .replace(/\s*\[Remix\]/gi, '')
                .replace(/\s*-\s*Remix$/gi, '');
            
            // Limpiar espacios múltiples
            artist = artist.replace(/\s+/g, ' ').trim();
            title = title.replace(/\s+/g, ' ').trim();
            
            // Construir artista completo con features
            if (featuredArtist && !artist.toLowerCase().includes(featuredArtist.toLowerCase())) {
                artist = `${artist} feat. ${featuredArtist}`;
            }
            
            return { artist, title };
        }
    }
    
    // Si no se encuentra separador, intentar extraer antes del primer paréntesis
    const beforeParenthesis = cleanTitle.split(/[\(\[]/)[0].trim();
    if (beforeParenthesis && beforeParenthesis.length < cleanTitle.length) {
        const remainingTitle = cleanTitle
            .replace(beforeParenthesis, '')
            .replace(/^[\s\-–—:\|\•\(\[]+/, '')
            .replace(/[\)\]]+$/, '')
            .trim();
        
        return { 
            artist: beforeParenthesis, 
            title: remainingTitle || beforeParenthesis
        };
    }
    
    // Fallback: retornar título completo limpio
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
    return { artist: 'YouTube', title: cleanTitle };
}

/**
 * Limpiar título de video (eliminar patrones adicionales)
 */
function cleanVideoTitle(title) {
    if (!title) return "Título Desconocido";
    
    let cleaned = title;
    
    // Patrones adicionales a eliminar
    const additionalPatterns = [
        /\(Vídeo musical\)/gi,
        /\[Vídeo musical\]/gi,
        /\(Music Video\)/gi,
        /\[Music Video\]/gi,
        /\(Videoclip\)/gi,
        /\[Videoclip\]/gi,
        /\(Audio\)/gi,
        /\[Audio\]/gi,
        /\(Visualizer\)/gi,
        /\[Visualizer\]/gi,
        /\(Letra\)/gi,
        /\[Letra\]/gi,
        /VEVO$/gi,
    ];
    
    additionalPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });
    
    // Limpiar espacios múltiples y trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Eliminar guiones o pipes al inicio/final si quedaron
    cleaned = cleaned.replace(/^[\s\-–—:\|\•]+/, '').replace(/[\s\-–—:\|\•]+$/, '');
    
    return cleaned || title;
}

/**
 * OPCIONAL: Función para detectar idioma del título
 * Útil para futuros features de filtrado
 */
function detectLanguage(title) {
    const spanishPatterns = /\b(feat\.|con|y|el|la|los|las|de|del|al)\b/i;
    const englishPatterns = /\b(feat\.|featuring|with|the|and|of|from)\b/i;
    
    if (spanishPatterns.test(title)) return 'es';
    if (englishPatterns.test(title)) return 'en';
    return 'unknown';
}

/**
 * OPCIONAL: Normalizar duración a segundos
 */
function normalizeDuration(duration) {
    if (typeof duration === 'number') return duration;
    if (!duration || typeof duration !== 'string') return 0;

    // Si es formato MM:SS o HH:MM:SS
    const parts = duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // Si es número directo
    const directNumber = parseInt(duration, 10);
    if (!isNaN(directNumber)) return directNumber;

    return 0;
}

/**
 * OPCIONAL: Validar videoId
 */
function isValidVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') return false;
    // YouTube video IDs son 11 caracteres alfanuméricos
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

// =============================================
// LOGS Y DEBUG
// =============================================

/**
 * Log de procesamiento (solo en desarrollo)
 */
function logProcessing(originalCount, processedCount) {
    console.log('🎵 Procesamiento completado:', {
        original: originalCount,
        processed: processedCount,
        timestamp: new Date().toISOString()
    });
}
