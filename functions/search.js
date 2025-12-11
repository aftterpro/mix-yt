const youtubesearchapi = require("youtube-search-api");

exports.handler = async function(event, context) {
    // Headers para permitir que tu web acceda a la función
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Responder a pre-flight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const q = event.queryStringParameters?.q;
        let nextPageData = event.queryStringParameters?.nextpage;
        let result;

        // --- LÓGICA DE BÚSQUEDA ---
        if (nextPageData) {
            // -- PAGINACIÓN --
            let tokenObject;
            try {
                // Intentar limpiar y parsear el token
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                tokenObject = JSON.parse(nextPageData);
            } catch (e) {
                // Si no es JSON válido, intentar usarlo como string raw (fallback)
                tokenObject = nextPageData;
            }
            
            // Llamar a la librería con el token
            result = await youtubesearchapi.NextPage(tokenObject, true);
        } else {
            // -- BÚSQUEDA INICIAL --
            // Pedir 25 resultados para intentar llenar la pantalla y evitar scroll loop
            result = await youtubesearchapi.GetListByKeyword(q, false, 25);
        }

        // --- VALIDACIÓN DE RESPUESTA ---
        // Si la librería falla o no devuelve nada, enviar array vacío (NO ERROR 500)
        if (!result || !result.items) {
             return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        // --- MAPEO DE DATOS (Arreglo de Fotos, Duración y Artista) ---
        const items = result.items.map(item => {
            // 1. IMAGEN: Buscar en array o propiedad directa
            let thumb = './electronic.ico'; // Fallback
            if (item.thumbnail) {
                if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                    thumb = item.thumbnail[0].url;
                } else if (item.thumbnail.thumbnails && Array.isArray(item.thumbnail.thumbnails)) {
                    thumb = item.thumbnail.thumbnails[0].url;
                } else if (typeof item.thumbnail === 'string') {
                    thumb = item.thumbnail;
                }
            }

            // 2. DURACIÓN: Buscar en simpleText o texto directo
            let dur = "0:00";
            if (item.length) {
                if (item.length.simpleText) dur = item.length.simpleText;
                else if (typeof item.length === 'string') dur = item.length;
            }

            // 3. ARTISTA: Buscar en channelTitle o author
            const author = item.channelTitle || item.author || "Autor Desconocido";

            return {
                videoId: item.id,
                title: item.title || "Sin título",
                thumbnail: thumb,
                artist: author,       // Campo explícito para core.js
                uploaderName: author, // Campo de respaldo
                duration: dur,
                isLive: item.isLive || false
            };
        }).filter(item => item.videoId); // Eliminar si no tiene ID

        // Serializar token para la próxima página
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
        console.error("Error controlado en search.js:", error);
        // IMPORTANTE: Devolver 200 con array vacío en vez de 500
        // Esto evita que el frontend muestre "SyntaxError" y rompa el scroll
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                items: [], 
                nextpage: null, 
                error: "Sin resultados o error temporal" 
            })
        };
    }
};
