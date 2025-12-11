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
        const nextPageData = event.queryStringParameters?.nextpage;

        if (nextPageData) {
            // CARGAR MÁS RESULTADOS (Paginación)
            // Intentamos parsear el token porque ahora enviamos un objeto JSON completo
            let tokenObject;
            try {
                tokenObject = JSON.parse(nextPageData);
            } catch (e) {
                // Si falla el parseo, asumimos que es un string antiguo (intento de fallback)
                tokenObject = nextPageData;
            }
            
            // Pasamos el objeto completo a la librería
            result = await youtubesearchapi.NextPage(tokenObject, true);
            
        } else {
            // BÚSQUEDA NUEVA
            // GetListByKeyword(query, playlistBool, limit, options)
            result = await youtubesearchapi.GetListByKeyword(q, false, 20);
        }

        // VALIDACIÓN: Si la librería no devuelve items, devolver array vacío para no romper el frontend
        if (!result || !result.items) {
             return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], nextpage: null })
            };
        }

        // MAPEO ROBUSTO DE DATOS
        const items = result.items.map(item => {
            // Intentar obtener la mejor imagen disponible
            let thumb = './electronic.ico';
            if (item.thumbnail) {
                if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                    thumb = item.thumbnail[0].url;
                } else if (typeof item.thumbnail === 'string') {
                    thumb = item.thumbnail;
                }
            }

            return {
                videoId: item.id,
                title: item.title || "Sin título",
                // Manejo seguro de imagen
                thumbnail: thumb,
                // Manejo seguro de autor
                uploaderName: item.channelTitle || "Autor Desconocido", 
                // Manejo seguro de duración
                duration: item.length?.simpleText || "0:00", 
                isLive: item.isLive || false
            };
        }).filter(item => item.videoId); // Filtrar resultados sin ID

        // PREPARAR TOKEN DE SIGUIENTE PÁGINA
        // Serializamos todo el objeto nextPage (token + contexto) si existe
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
        console.error("Error en function search:", error);
        return {
            statusCode: 500, // Cambiar a 200 con error vacío para que la UI no muestre alerta roja fea
            headers,
            body: JSON.stringify({ items: [], nextpage: null, error: error.message })
        };
    }
};
