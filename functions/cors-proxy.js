// USAR REQUIRE (Versión compatible con Netlify Functions standard)
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // 1. Extraer la URL base del path
    let path = event.path.replace(/^\/\.netlify\/functions\/cors-proxy\//, '');
    
    // 2.  CRÍTICO: Recuperar los parámetros de la consulta (query string)
    // Netlify los separa, así que debemos volver a pegarlos.
    const queryString = event.rawQuery; 
    
    let targetUrl = decodeURIComponent(path);

    // 3. Pegar los parámetros a la URL destino
    if (queryString) {
        targetUrl += '?' + queryString;
    }

    // Corrección de protocolo por si el split falló
    if (!targetUrl.startsWith('http')) {
        const splitParts = event.path.split('/cors-proxy/');
        if (splitParts.length > 1) {
            targetUrl = splitParts[1];
            if (queryString) targetUrl += '?' + queryString;
        }
    }

    if (!targetUrl || !targetUrl.startsWith('http')) {
        return { statusCode: 400, body: "URL destino inválida" };
    }

    console.log(`Proxying to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        // ✅ Obtener texto decodificado (evita problemas de binarios/gzip)
        const data = await response.text();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "text/plain; charset=utf-8" // Cambiado a text/plain para LRC
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
