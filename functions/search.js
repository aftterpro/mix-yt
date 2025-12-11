const YouTube = require("youtube-sr").default;

exports.handler = async function(event, context) {
    // Headers CORS para permitir peticiones desde tu web
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
        
        if (!q) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el parámetro 'q'" }) };
        }

        // Buscamos 50 videos de una vez (SafeSearch desactivado para música)
        // youtube-sr hace el scraping internamente
        const videos = await YouTube.search(q, { 
            limit: 50,
            type: 'video',
            safeSearch: false 
        });

        // Formateamos los datos para que tu frontend (core.js) los entienda
        // Mapeamos a la estructura que espera tu app
        const items = videos.map(v => ({
            videoId: v.id,
            title: v.title,
            thumbnail: v.thumbnail?.url || v.thumbnail,
            uploaderName: v.channel?.name || "Desconocido",
            duration: v.duration / 1000, // youtube-sr devuelve ms, tu app suele usar segundos
            url: v.url
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                // youtube-sr no da token, así que enviamos null para que el frontend sepa que no hay "página 2" real
                // Opcional: podrías implementar lógica para devolver "nextpage" simulado si guardaras esto en caché
                nextpage: null 
            })
        };

    } catch (error) {
        console.error("Error en búsqueda:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Error interno en la búsqueda", details: error.message })
        };
    }
};
