const youtubesearchapi = require("youtube-search-api");

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const q = event.queryStringParameters?.q;
        let nextPageData = event.queryStringParameters?.nextpage;
        let result;

        console.log(`🚀 Nueva petición. Query: "${q}", NextPage: ${!!nextPageData}`);

        if (nextPageData) {
            // -- PAGINACIÓN --
            let tokenObject;
            try {
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                tokenObject = JSON.parse(nextPageData);
            } catch (e) {
                tokenObject = nextPageData;
            }
            
            console.log("📄 Cargando página siguiente...");
            result = await youtubesearchapi.NextPage(tokenObject, true);
            
        } else {
            // -- BÚSQUEDA INICIAL --
            console.log(`🔍 Buscando "${q}"...`);
            result = await youtubesearchapi.GetListByKeyword(q, false, 25);
        }

        // --- 🔍 DEBUG: VER DATOS CRUDOS DE LA API ---
        if (result && result.items && result.items.length > 0) {
            console.log("📦 Primer item CRUDO recibido de la librería:", JSON.stringify(result.items[0], null, 2));
        } else {
            console.warn("⚠️ La librería devolvió 0 items o resultado nulo.");
        }

        // VALIDACIÓN
        if (!result || !result.items) {
             return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        // MAPEO DE DATOS
        const items = result.items.map((item, index) => {
            // LOGUEAR SI FALTA INFO CLAVE EN ALGUNOS ITEMS
            if (!item.thumbnail && index < 3) console.log(`⚠️ Item ${index} sin thumbnail directo.`);
            if (!item.length && index < 3) console.log(`⚠️ Item ${index} sin length (duración).`);

            // 1. IMAGEN
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

            // 2. DURACIÓN
            let dur = "0:00";
            if (item.length) {
                if (item.length.simpleText) dur = item.length.simpleText;
                else if (typeof item.length === 'string') dur = item.length;
            }

            // 3. ARTISTA
            const author = item.channelTitle || item.author || "Autor Desconocido";

            return {
                videoId: item.id,
                title: item.title || "Sin título",
                thumbnail: thumb,
                artist: author,
                uploaderName: author,
                duration: dur,
                isLive: item.isLive || false
            };
        }).filter(item => item.videoId);

        console.log(`✅ Procesados ${items.length} videos válidos.`);

        const nextTokenSerialized = result.nextPage ? JSON.stringify(result.nextPage) : null;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                nextpage: nextTokenSerialized
            })
        };

    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN SEARCH:", error);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                items: [], 
                nextpage: null, 
                error: "Error interno: " + error.message 
            })
        };
    }
};
