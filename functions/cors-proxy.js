const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    let targetUrl = '';

    // CASO 1: URL pasada como parámetro query (?url=https://...)
    if (event.queryStringParameters && event.queryStringParameters.url) {
        targetUrl = event.queryStringParameters.url;
    } 
    // CASO 2: URL pasada como parte del path (/cors-proxy/https://...)
    else {
        // Extraer todo lo que viene después de /cors-proxy/
        const pathPrefix = '/.netlify/functions/cors-proxy/';
        const rawPath = event.path; // ej: /.netlify/functions/cors-proxy/https://api.com...
        
        if (rawPath.startsWith(pathPrefix)) {
            targetUrl = rawPath.substring(pathPrefix.length);
            
            // Si hay query params adicionales, pegarlos de nuevo
            // (ej: ?name=Lemon en la url original)
            if (event.rawQuery) {
                targetUrl += '?' + event.rawQuery;
            }
        }
    }

    // Decodificar por si acaso vino codificada doble
    if (targetUrl.startsWith('http%3A')) {
        targetUrl = decodeURIComponent(targetUrl);
    }

    // Validación final
    if (!targetUrl || !targetUrl.startsWith('http')) {
        return { 
            statusCode: 400, 
            body: "URL destino inválida. Usa ?url=https://tu-api.com" 
        };
    }

    console.log(`Proxying to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        // Obtener texto (soportando tanto JSON como LRC plano)
        const data = await response.text();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                // Devolvemos text/plain porque LRC no es JSON
                "Content-Type": "text/plain; charset=utf-8" 
            },
            body: data
        };

    } catch (error) {
        console.error('Proxy Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
