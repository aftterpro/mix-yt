import fetch from 'node-fetch';

exports.handler = async (event, context) => {
    // 1. Extraer la URL destino de la ruta
    // La ruta viene como /.netlify/functions/cors-proxy/HTTPS://TARGET...
    let path = event.path.replace(/^\/\.netlify\/functions\/cors-proxy\//, '');
    
    // Decodificar si viene con %20, etc.
    let targetUrl = decodeURIComponent(path);

    // Corrección si falta el protocolo por la decodificación
    if (!targetUrl.startsWith('http')) {
        // A veces el split corta el protocolo
        targetUrl = event.path.split('/cors-proxy/')[1];
    }

    if (!targetUrl) {
        return { statusCode: 400, body: "URL destino no proporcionada" };
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
                "Content-Type": "application/json; charset=utf-8" // Forzamos JSON/Texto
            },
            body: data
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
