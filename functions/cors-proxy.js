const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // 1. Extraer la URL destino de la ruta
    // La ruta viene como /.netlify/functions/cors-proxy/HTTPS://TARGET...
    let path = event.path.replace(/^\/\.netlify\/functions\/cors-proxy\//, '');
    
    // Decodificar si viene con %20, etc.
    let targetUrl = decodeURIComponent(path);

    // Corrección si falta el protocolo por la decodificación o el split
    if (!targetUrl.startsWith('http')) {
        // Fallback: intentar dividir por la ruta de la función
        const splitParts = event.path.split('/cors-proxy/');
        if (splitParts.length > 1) {
            targetUrl = splitParts[1];
        }
    }

    // Validación final de URL
    if (!targetUrl || !targetUrl.startsWith('http')) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ error: "URL destino inválida o no proporcionada" }) 
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

        // ✅ CRÍTICO: Usar .text() aquí hace que Node-fetch descomprima el GZIP automáticamente
        // y nos devuelva el texto limpio, solucionando el problema del archivo "descarga" binario.
        const data = await response.text();

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Content-Type": "application/json; charset=utf-8" // Forzamos que el navegador sepa que es texto
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
