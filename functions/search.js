exports.handler = async function(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    // SOLO MANEJAR GET - NO POST para paginación
    if (event.httpMethod !== 'GET') {
        return { 
            statusCode: 405, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: 'Método no permitido. Solo GET.' })
        };
    }

    console.log('🔍 Netlify Search - Primera búsqueda:', {
        query: event.queryStringParameters?.q
    });

    try {
        const query = event.queryStringParameters?.q;

        if (!query) {
            return { 
                statusCode: 400, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: 'El parámetro "query" es requerido.' })
            };
        }
        
        // SOLO primera búsqueda a Piped
        const instanceUrl = "https://api.piped.private.coffee";
        const targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
        
        const fetchOptions = {
            method: 'GET',
            headers: {
                'User-Agent': 'YTCrossMix-Netlify/1.0',
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        };
        
        console.log(`📡 GET -> ${targetUrl}`);

        const response = await fetch(targetUrl, fetchOptions);

        console.log(`📊 Respuesta Piped: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error desconocido');
            console.error(`❌ Error ${response.status} de Piped:`, errorText.substring(0, 300));
            
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        console.log('✅ Primera búsqueda exitosa:', {
            items: data.items?.length || 0,
            hasNextpage: !!data.nextpage
        });
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        console.error('💥 Error en primera búsqueda:', error);
        
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
