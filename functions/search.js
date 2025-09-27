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

    const instanceUrl = "https://api.piped.private.coffee";
    
    try {
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YTCrossMix-Netlify/1.2',
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        };

        if (event.httpMethod === 'POST') {
            // --- PAGINACIÓN: Recibimos POST del cliente, pero enviamos GET a Piped ---
            console.log('🔄 Netlify: Paginación recibida por POST.');
            
            const body = JSON.parse(event.body);
            if (!body.nextpage || !body.query) {
                throw new Error('Para paginación se requiere "nextpage" y "query".');
            }

            // ¡CORRECCIÓN CLAVE!
            // 1. El endpoint correcto es /nextpage.
            // 2. El método es GET.
            // 3. Los datos van en la URL, no en el body.
            const params = new URLSearchParams({
                query: body.query,
                // El objeto 'nextpage' debe convertirse a string y luego ser codificado para la URL.
                nextpage: JSON.stringify(body.nextpage) 
            });
            
            targetUrl = `${instanceUrl}/nextpage?${params.toString()}`;
            fetchOptions.method = 'GET'; // Usamos GET para Piped
            
        } else if (event.httpMethod === 'GET') {
            // --- BÚSQUEDA INICIAL (esto ya funcionaba bien) ---
            const query = event.queryStringParameters?.q;
            console.log('🔍 Netlify: Primera búsqueda GET:', { query });

            if (!query) {
                throw new Error('El parámetro "q" es requerido.');
            }

            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        
        } else {
            return { 
                statusCode: 405, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: 'Método no permitido.' })
            };
        }

        console.log(`📡 Proxying ${fetchOptions.method} -> ${targetUrl.substring(0, 200)}...`); // Acortamos el log
        const response = await fetch(targetUrl, fetchOptions);
        console.log(`📊 Respuesta de Piped: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error desconocido de Piped');
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 300)}`);
        }

        const data = await response.json();
        
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
