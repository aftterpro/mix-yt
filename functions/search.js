
exports.handler = async function(event, context) {
    // Headers para permitir el acceso desde cualquier origen (CORS)
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        const query = event.queryStringParameters?.q;
        const nextPageToken = event.queryStringParameters?.nextpage;
        const isNextPage = !!nextPageToken;
        
        // Usamos una instancia de Piped como destino
        const instanceUrl = "https://api.piped.private.coffee";
        
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'NetlifyProxy/1.0',
                'Accept': 'application/json'
            }
        };

        if (isNextPage) {
            // --- ESTA ES LA CORRECCIÓN CLAVE ---
            // Si es una petición de paginación (contiene 'nextpage').
            console.log('📄 Paginación detectada. Preparando petición POST...');

            // 1. La API de Piped requiere un POST para la paginación.
            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';

            // 2. Decodificamos y parseamos el token que viene del cliente.
            let decodedToken;
            try {
                // El token viene como una cadena JSON codificada, la revertimos a un objeto.
                decodedToken = JSON.parse(decodeURIComponent(nextPageToken));
            } catch (e) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Token de paginación inválido.' })};
            }

            // 3. Construimos el cuerpo del POST con el formato que Piped espera.
            fetchOptions.body = JSON.stringify({
                nextpage: decodedToken, // El token como objeto
                query: query             // La consulta original
            });
            
            console.log(`📡 Enviando POST a: ${targetUrl}`);

        } else {
            // Si es una primera búsqueda, es un simple GET.
            if (!query) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'El parámetro de búsqueda "q" es requerido.' })};
            }
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
            console.log(`📡 Enviando GET a: ${targetUrl}`);
        }
        
        // Realizamos la petición a la API de Piped con un timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error de la API de Piped');
            throw new Error(`Error de Piped ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        // Devolvemos la respuesta de Piped al cliente del navegador.
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        console.error('💥 Error en la función de Netlify:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error interno del proxy.',
                details: error.message
            })
        };
    }
};
