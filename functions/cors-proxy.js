exports.handler = async (event, context) => {
    // ✅ HEADERS CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // ✅ PREFLIGHT
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // ✅ OBTENER URL DESTINO
    const targetUrl = event.queryStringParameters?.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Falta el parámetro ?url=' }),
            headers
        };
    }

    console.log('🔗 Proxy request to:', targetUrl);

    try {
        // ✅ REALIZAR PETICIÓN
        const response = await fetch(targetUrl, {
            method: event.httpMethod,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*'
            }
        });

        const data = await response.text();

        return {
            statusCode: response.status,
            body: data,
            headers: {
                ...headers,
                'Content-Type': response.headers.get('content-type') || 'text/plain'
            }
        };

    } catch (error) {
        console.error('❌ Proxy Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
            headers
        };
    }
};
