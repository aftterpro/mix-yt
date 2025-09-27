exports.handler = async function(event, context) {
    // Headers para CORS
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
        let query, nextPageToken, isNextPage;

        // CORRECCIÓN: Manejar tanto GET como POST
        if (event.httpMethod === 'POST') {
            // Paginación via POST
            const body = JSON.parse(event.body || '{}');
            query = body.query;
            nextPageToken = body.nextpage;
            isNextPage = !!nextPageToken;
            
            console.log('📄 POST recibido:', { query, hasToken: !!nextPageToken });
        } else {
            // Primera búsqueda via GET
            query = event.queryStringParameters?.q;
            nextPageToken = event.queryStringParameters?.nextpage;
            isNextPage = !!nextPageToken;
            
            console.log('📡 GET recibido:', { query, hasToken: !!nextPageToken });
        }

        if (!query) {
            return { 
                statusCode: 400, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: 'El parámetro "query" es requerido.' })
            };
        }
        
        const instanceUrl = "https://api.piped.private.coffee";
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'NetlifyProxy/1.0',
                'Accept': 'application/json'
            }
        };

        if (isNextPage) {
            // CORRECCIÓN CLAVE: POST para paginación
            console.log('📄 Preparando POST para paginación...');
            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify({
                nextpage: nextPageToken, // Debe ser un objeto, no string
                query: query
            });
        } else {
            // GET para primera búsqueda
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        }
        
        console.log(`📡 Enviando ${fetchOptions.method} a: ${targetUrl}`);

        // Realizar petición a Piped
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error de Piped');
            console.error(`❌ Error de Piped ${response.status}:`, errorText);
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        console.log('✅ Respuesta de Piped exitosa:', {
            items: data.items?.length || 0,
            hasNextpage: !!data.nextpage
        });
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        console.error('💥 Error en función search:', error);
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
