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
        let result;
        const q = event.queryStringParameters?.q;
        let nextPageData = event.queryStringParameters?.nextpage;

        if (nextPageData) {
            // CARGAR MÁS RESULTADOS (Paginación)
            let tokenObject;
            try {
                // Decodificar por si viene codificado como URL (%7B...)
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                tokenObject = JSON.parse(nextPageData);
            } catch (e) {
                console.warn("Fallo al parsear token JSON, usando raw:", e);
                tokenObject = nextPageData;
            }
            
            // Llamada segura a la librería
            result = await youtubesearchapi.NextPage(tokenObject, true);
            
        } else {
            // BÚSQUEDA NUEVA (20 resultados)
            result = await youtubesearchapi.GetListByKeyword(q, false, 20);
        }

        // VALIDACIÓN DE SEGURIDAD
        if (!result || !result.items) {
             return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        // MAPEO DE DATOS (Arregla fotos y artistas)
        const items = result.items.map(item => {
            // 1. Obtener mejor imagen
            let thumb = './electronic.ico';
            if (item.thumbnail) {
                if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                    thumb = item.thumbnail[0].url;
                } else if (typeof item.thumbnail === 'string') {
                    thumb = item.thumbnail;
                }
            }

            // 2. Obtener duración (youtube-search-api la devuelve en 'length.simpleText')
            let dur = "0:00";
            if (item.length && item.length.simpleText) {
                dur = item.length.simpleText;
            } else if (typeof item.length === 'string') {
                dur = item.length; // A veces viene directo
            }

            return {
                videoId: item.id,
                title: item.title || "Sin título",
                thumbnail: thumb,
                // ✅ IMPORTANTE: Enviar 'artist' explícitamente para core.js
                artist: item.channelTitle || "Autor Desconocido",
                uploaderName: item.channelTitle || "Autor Desconocido",
                duration: dur,
                isLive: item.isLive || false
            };
        }).filter(item => item.videoId); 

        // Preparar token para la siguiente página
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
        console.error("Error CRITICO en function search:", error);
        // Devolver JSON vacío en vez de error 500 para que la app no muestre alertas rojas
        return {
            statusCode: 200, 
            headers,
            body: JSON.stringify({ items: [], nextpage: null, error: error.message })
        };
    }
};
