const youtubesearchapi = require("youtube-search-api");

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Manejo de preflight request (CORS)
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const q = event.queryStringParameters?.q;
        
        // --- 🛡️ FIX 1: VALIDACIÓN DE INPUT ---
        // Si el query es 'undefined' (texto), nulo o vacío, devolvemos vacío y salimos.
        if (!q || q === 'undefined' || q.trim() === '') {
            console.log("⚠️ [NETLIFY] Petición cancelada: Query vacío o inválido.");
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        let nextPageData = event.queryStringParameters?.nextpage;
        let result;

        console.log(`🚀 [NETLIFY] Nueva petición. Query: "${q}"`);

        if (nextPageData) {
            console.log("📄 [NETLIFY] Paginación solicitada");
            try {
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                const tokenObject = JSON.parse(nextPageData);
                result = await youtubesearchapi.NextPage(tokenObject, true);
            } catch (e) {
                console.warn("⚠️ Error parseando token, usando raw:", e.message);
                result = await youtubesearchapi.NextPage(nextPageData, true);
            }
        } else {
            console.log("🔍 [NETLIFY] Búsqueda inicial");
            result = await youtubesearchapi.GetListByKeyword(q, false, 25);
        }

        // --- 🔍 DEBUG: IMPRIMIR EL PRIMER ITEM CRUDO ---
        if (result && result.items && result.items.length > 0) {
            console.log("📦 [ITEM_CRUDO_0]:", JSON.stringify(result.items[0], null, 2));
        } else {
            console.log("⚠️ [NETLIFY] La librería devolvió 0 items.");
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        // Procesamiento de datos
        const items = result.items
            // --- 🛡️ FIX 2: FILTRAR SOLO VIDEOS ---
            // Esto elimina canales (que causan el error de 'Desconocido') y playlists.
            .filter(item => item.type === 'video') 
            .map((item, index) => {
                
                // 1. EXTRACTOR DE IMAGEN (Inteligente)
                let thumb = './electronic.ico';
                if (item.thumbnail) {
                    if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                        thumb = item.thumbnail[0].url; 
                    } else if (item.thumbnail.thumbnails && Array.isArray(item.thumbnail.thumbnails)) {
                        thumb = item.thumbnail.thumbnails[0].url; 
                    } else if (typeof item.thumbnail === 'string') {
                        thumb = item.thumbnail; 
                    }
                }

                // 2. EXTRACTOR DE DURACIÓN
                let dur = "0:00";
                if (item.length) {
                    if (item.length.simpleText) dur = item.length.simpleText; 
                    else if (typeof item.length === 'string') dur = item.length;
                }

                return {
                    videoId: item.id,
                    title: item.title || "Sin título",
                    thumbnail: thumb,
                    // channelTitle suele ser más fiable que author en esta librería
                    artist: item.channelTitle || item.author || "Artista Desconocido", 
                    uploaderName: item.channelTitle || "Desconocido",
                    duration: dur,
                    isLive: item.isLive || false
                };
            })
            .filter(i => i.videoId); // Filtro de seguridad final por si falta ID

        console.log(`✅ [NETLIFY] Respondiendo con ${items.length} videos procesados.`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                nextpage: result.nextPage ? JSON.stringify(result.nextPage) : null
            })
        };

    } catch (error) {
        console.error("❌ [ERROR FATAL]:", error);
        return {
            statusCode: 200, 
            headers,
            body: JSON.stringify({ items: [], nextpage: null, error: error.message })
        };
    }
};
