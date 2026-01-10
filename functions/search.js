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
        
        // ✅ VALIDACIÓN DE INPUT
        if (!q || q === 'undefined' || q.trim() === '') {
            console.log("⚠️ [NETLIFY] Query vacío o inválido.");
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], continuation: null })
            };
        }

        let nextPageData = event.queryStringParameters?.nextpage;
        let result;

        console.log(`🚀 [NETLIFY] Query: "${q}"`);

        if (nextPageData) {
            console.log("📄 [NETLIFY] Paginación solicitada");
            try {
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                const tokenObject = JSON.parse(nextPageData);
                result = await youtubesearchapi.NextPage(tokenObject, true);
            } catch (e) {
                console.warn("⚠️ Error parseando token:", e.message);
                result = await youtubesearchapi.NextPage(nextPageData, true);
            }
        } else {
            console.log("🔍 [NETLIFY] Búsqueda inicial");
            // ✅ BÚSQUEDA EXACTA: Envolver en comillas dobles para música
            const exactQuery = `"${q}"`;
            console.log(`🎵 [NETLIFY] Búsqueda exacta: ${exactQuery}`);
            result = await youtubesearchapi.GetListByKeyword(exactQuery, false, 25);
        }

        // ✅ VALIDAR RESPUESTA
        if (!result || !result.items || result.items.length === 0) {
            console.log("⚠️ [NETLIFY] 0 items devueltos por la librería.");
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], continuation: null })
            };
        }

        // ✅ DEBUG: Imprimir primer item crudo
        console.log("📦 [ITEM_CRUDO_0]:", JSON.stringify(result.items[0], null, 2));

        // ✅ PROCESAMIENTO DE DATOS
        const items = result.items
            .filter(item => item.type === 'video') // Solo videos (no canales ni playlists)
            .map((item) => {
                // 1. Extractor de Thumbnail
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

                // 2. Extractor de Duración
                let dur = "0:00";
                if (item.length) {
                    if (item.length.simpleText) {
                        dur = item.length.simpleText;
                    } else if (typeof item.length === 'string') {
                        dur = item.length;
                    }
                }

                return {
                    videoId: item.id,
                    title: item.title || "Sin título",
                    thumbnail: thumb,
                    artist: item.channelTitle || item.author || "Artista Desconocido",
                    uploaderName: item.channelTitle || "Desconocido",
                    duration: dur,
                    isLive: item.isLive || false
                };
            })
            .filter(i => i.videoId); // Filtro de seguridad: solo items con videoId válido

        console.log(`✅ [NETLIFY] ${items.length} videos procesados.`);

        // ✅ RESPUESTA FINAL
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                continuation: result.nextPage ? JSON.stringify(result.nextPage) : null
            })
        };

    } catch (error) {
        console.error("❌ [ERROR FATAL]:", error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                items: [], 
                continuation: null, 
                error: error.message 
            })
        };
    }
};
