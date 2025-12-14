const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Manejar preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Extraer la URL target del path
        const path = event.path.replace('/.netlify/functions/cors-proxy/', '');
        
        if (!path) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No se proporcionó URL de destino' })
            };
        }

        console.log(`🔄 [CORS-PROXY] Redirigiendo a: ${path}`);

        // Hacer la petición al servicio externo
        const response = await fetch(path);
        
        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: await response.text()
            };
        }

        const data = await response.text();

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': response.headers.get('content-type') || 'text/plain'
            },
            body: data
        };

    } catch (error) {
        console.error('❌ [CORS-PROXY] Error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Error en proxy CORS',
                message: error.message
            })
        };
    }
};
