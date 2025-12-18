// functions/cors-proxy.js
exports.handler = async (event, context) => {
    // Obtener la URL destino del parámetro ?url=
    const targetUrl = event.queryStringParameters.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Falta el parámetro ?url=' }),
            headers: { 'Access-Control-Allow-Origin': '*' }
        };
    }

    // Configurar headers para la petición saliente
    // Es importante pasar el Content-Type original (ej: application/x-www-form-urlencoded)
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*'
    };

    if (event.headers['content-type']) {
        headers['Content-Type'] = event.headers['content-type'];
    }

    try {
        // Realizar la petición a la URL destino (Google Translate)
        // Usamos el mismo método (GET/POST) y cuerpo que recibimos
        const response = await fetch(targetUrl, {
            method: event.httpMethod,
            headers: headers,
            body: event.httpMethod === 'POST' ? event.body : undefined
        });

        const data = await response.text();

        return {
            statusCode: response.status,
            body: data,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            }
        };

    } catch (error) {
        console.error('Proxy Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
            headers: { 'Access-Control-Allow-Origin': '*' }
        };
    }
};
