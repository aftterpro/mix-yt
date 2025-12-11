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
        // Detectar si es una búsqueda nueva o "Cargar más" (nextpage)
        let result;
        const q = event.queryStringParameters?.q;
        const nextPageToken = event.queryStringParameters?.nextpage;

        if (nextPageToken) {
            // CARGAR MÁS RESULTADOS (Paginación)
            // nextpage viene del frontend cuando haces scroll
            result = await youtubesearchapi.NextPage(nextPageToken, true); 
        } else {
            // BÚSQUEDA NUEVA
            // GetListByKeyword(query, playlistBool, limit)
            result = await youtubesearchapi.GetListByKeyword(q, false, 20);
        }

        // Formatear respuesta
        const items = result.items.map(item => ({
            videoId: item.id,
            title: item.title,
            thumbnail: item.thumbnail && item.thumbnail[0] ? item.thumbnail[0].url : '',
            uploaderName: item.channelTitle,
            duration: item.length?.simpleText || "0:00", // Esta librería devuelve texto ej "3:45"
            isLive: item.isLive
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                // Enviamos el token para que el frontend pueda pedir la siguiente página
                nextpage: result.nextPage?.nextPageToken || null 
            })
        };

    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
