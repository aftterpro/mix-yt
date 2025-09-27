// /.netlify/functions/search.js

// Importa 'fetch' si usas una versión de Node que no lo tiene globalmente.
// En Netlify, 'fetch' ya suele estar disponible.
// const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*', // O sé más específico: 'https://mix-yt.netlify.app'
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', // ¡Añadimos POST!
        'Content-Type': 'application/json'
    };

    // Manejo de la petición pre-vuelo (preflight) OPTIONS que hace el navegador
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const instanceUrl = "https://api.piped.private.coffee";
    
    try {
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YTCrossMix-Netlify/1.1',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(15000)
        };

        // --- LÓGICA PARA DISTINGUIR BÚSQUEDA INICIAL Y PAGINACIÓN ---

        if (event.httpMethod === 'POST') {
            // PAGINACIÓN: Se recibe por POST con un body
            console.log('🔄 Netlify Search - Paginación:', event.body);
            
            const body = JSON.parse(event.body);
            if (!body.nextpage || !body.query) {
                throw new Error('Para paginación se requiere "nextpage" y "query" en el body.');
            }

            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.body = JSON.stringify({
                nextpage: body.nextpage,
                query: body.query
            });

        } else if (event.httpMethod === 'GET') {
            // BÚSQUEDA INICIAL: Se recibe por GET con un query param
            const query = event.queryStringParameters?.q;
            console.log('🔍 Netlify Search - Primera búsqueda:', { query });

            if (!query) {
                throw new Error('El parámetro "q" es requerido para la búsqueda inicial.');
            }

            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
        
        } else {
            // Método no soportado
            return { 
                statusCode: 405, 
                headers: corsHeaders, 
                body: JSON.stringify({ error: 'Método no permitido.' })
            };
        }

        console.log(`📡 Proxying ${fetchOptions.method} -> ${targetUrl}`);
        const response = await fetch(targetUrl, fetchOptions);
        console.log(`📊 Respuesta de Piped: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Error desconocido');
            throw new Error(`Error de Piped ${response.status}: ${errorText.substring(0, 200)}`);
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
