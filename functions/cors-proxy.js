const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    let targetUrl = '';

    // 1. INTENTAR SACAR URL DE QUERY PARAM (?url=...)
    if (event.queryStringParameters && event.queryStringParameters.url) {
        targetUrl = event.queryStringParameters.url;
        
        // RECONSTRUCCIÓN ROBUSTA (Para el problema de la API de letras):
        // Si el cliente envió "?url=...&artist=..." sin codificar el "&", Netlify lo separa.
        // Aquí recuperamos esos parámetros perdidos.
        const params = event.queryStringParameters;
        const extras = Object.keys(params)
            .filter(key => key !== 'url')
            .map(key => `${key}=${params[key]}`)
            .join('&');

        if (extras) {
            // Pegamos lo que se cortó (ej: &artist=Fool's Garden)
            targetUrl += (targetUrl.includes('?') ? '&' : '?') + extras;
        }
    } 
    // 2. INTENTAR SACAR URL DEL PATH (/cors-proxy/https://...)
    else {
        const pathPrefix = '/.netlify/functions/cors-proxy/';
        let rawPath = event.path; 
        
        if (rawPath.startsWith(pathPrefix)) {
            targetUrl = rawPath.substring(pathPrefix.length);
            if (event.rawQuery) {
                targetUrl += '?' + event.rawQuery;
            }
        }
    }

    // 3. LIMPIEZA
    if (targetUrl.startsWith('http%3A')) {
        targetUrl = decodeURIComponent(targetUrl);
    }

    // 4. 🔥 CORRECCIÓN ESPACIOS: Codificar URL para que "Lemon Tree" sea "Lemon%20Tree"
    // Esto es vital para node-fetch
    try {
        targetUrl = encodeURI(targetUrl); 
    } catch(e) {}

    // Validación básica
    if (!targetUrl || !targetUrl.startsWith('http')) {
        return { statusCode: 400, body: "URL inválida" };
    }

    console.log(`Proxying to: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        const data = await response.text();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "text/plain; charset=utf-8" // LRC es texto plano
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
