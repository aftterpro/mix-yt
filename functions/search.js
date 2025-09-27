exports.handler = async function(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    console.log('🔍 Search function invocada:', {
        method: event.httpMethod,
        query: event.queryStringParameters?.q,
        body: event.body ? 'Present' : 'None'
    });

    try {
        let query, nextPageToken, isNextPage;

        if (event.httpMethod === 'POST') {
            // Paginación via POST
            const body = JSON.parse(event.body || '{}');
            query = body.query;
            nextPageToken = body.nextpage;
            isNextPage = !!nextPageToken;
            
            console.log('📄 POST paginación:', { 
                query, 
                hasToken: !!nextPageToken,
                tokenType: typeof nextPageToken 
            });
        } else {
            // Primera búsqueda via GET
            query = event.queryStringParameters?.q;
            isNextPage = false;
            
            console.log('📡 GET primera búsqueda:', { query });
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
                'User-Agent': 'YTCrossMix/1.0',
                'Accept': 'application/json'
            }
        };

        if (isNextPage) {
            // POST para paginación
            console.log('📄 Configurando POST para paginación...');
            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';
            
            // CORRECCIÓN: Enviar datos según API de Piped
            fetchOptions.body = JSON.stringify({
                nextpage: nextPageToken, // Como objeto/string según lo que venga
                query: query
            });
            
            console.log('📤 Body del POST:', fetchOptions.body.substring(0, 200) + '...');
        } else {
            // GET para primera búsqueda - CORRECCIÓN: agregar filter=videos
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        }
        
        console.log(`📡 ${fetchOptions.method} -> ${targetUrl}`);

        // Petición con timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        fetchOptions.signal = controller.signal;

        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);

        console.log(`📊 Respuesta Piped: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error desconocido');
            console.error(`❌ Error ${response.status} de Piped:`, errorText.substring(0, 500));
            
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        console.log('✅ Datos de Piped recibidos:', {
            items: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            firstItemUrl: data.items?.[0]?.url
        });
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        console.error('💥 Error en search function:', error);
        
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error interno del proxy.',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
