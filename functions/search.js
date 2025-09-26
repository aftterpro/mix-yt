// functions/piped-search.js - Función específica para búsquedas de Piped
exports.handler = async function(event, context) {
    // Headers CORS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'public, max-age=60',
        'Content-Type': 'application/json'
    };
    
    // Manejar OPTIONS para CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    
    // Solo permitir GET y POST
    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Método no permitido' })
        };
    }
    
    try {
        const query = event.queryStringParameters?.q;
        const nextPageToken = event.queryStringParameters?.nextpage;
        const isNextPage = !!nextPageToken;
        
        console.log(`🔍 Piped Search: "${query}"${isNextPage ? ' (paginación)' : ''}`);
        
        // Instancias de Piped para rotar
        const pipedInstances = [
            "https://api.piped.private.coffee",
         //   "https://pipedapi.orangenet.cc",
           // "https://api.piped.adminforge.de"
        ];
        
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YT-CrossMix-Search/2.0',
                'Accept': 'application/json'
            }
        };
        
        // Seleccionar instancia (rotar si hay error)
        const instanceUrl = pipedInstances[0]; // Usar la primera por defecto
        
        if (isNextPage) {
            console.log('📄 Configurando paginación...');
            
            // Decodificar el token de paginación
            let decodedToken;
            try {
                decodedToken = decodeURIComponent(nextPageToken);
                console.log('📄 Token decodificado:', decodedToken.substring(0, 100) + '...');
                
                // Si el token viene como string JSON, parsearlo
                if (decodedToken.startsWith('"') && decodedToken.endsWith('"')) {
                    decodedToken = JSON.parse(decodedToken);
                }
                
                // Si es un string que representa JSON, parsearlo de nuevo
                if (typeof decodedToken === 'string' && decodedToken.startsWith('{')) {
                    decodedToken = JSON.parse(decodedToken);
                }
                
            } catch (parseError) {
                console.error('❌ Error parseando token:', parseError);
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Token de paginación inválido',
                        details: parseError.message
                    })
                };
            }
            
            // Usar POST para paginación según la documentación de Piped
            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify({
                nextpage: decodedToken,
                query: query
            });
            
            console.log(`📄 POST paginación: ${targetUrl}`);
            
        } else {
            // Primera búsqueda
            if (!query) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Parámetro q requerido' })
                };
            }
            
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
            console.log(`🔍 GET inicial: ${targetUrl}`);
        }
        
        // Hacer la petición con timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        fetchOptions.signal = controller.signal;
        
        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);
        
        console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`❌ Error ${response.status}: ${errorText.substring(0, 200)}`);
            
            // Intentar con otra instancia si es error de servidor
            if (response.status >= 500 && pipedInstances.length > 1) {
                console.log('🔄 Intentando con segunda instancia...');
                
                const fallbackUrl = targetUrl.replace(instanceUrl, pipedInstances[1]);
                
                try {
                    const fallbackResponse = await fetch(fallbackUrl, fetchOptions);
                    if (fallbackResponse.ok) {
                        const fallbackData = await fallbackResponse.json();
                        console.log('✅ Éxito con instancia de respaldo');
                        return {
                            statusCode: 200,
                            headers: corsHeaders,
                            body: JSON.stringify(fallbackData)
                        };
                    }
                } catch (fallbackError) {
                    console.error('❌ Error con instancia de respaldo:', fallbackError);
                }
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        console.log(`📊 Datos recibidos:`, {
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            nextpageType: typeof data.nextpage
        });
        
        // Validar que tenemos datos útiles
        if (!data.items) {
            console.warn('⚠️ Respuesta sin items');
            data.items = [];
        }
        
        // Agregar metadatos útiles
        data.metadata = {
            query: query,
            instance: instanceUrl,
            timestamp: new Date().toISOString(),
            resultsCount: data.items.length,
            hasNextPage: !!data.nextpage,
            isNextPageRequest: isNextPage
        };
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(data)
        };
        
    } catch (error) {
        console.error('💥 Error final:', error);
        
        // Determinar tipo de error
        let statusCode = 500;
        let errorMessage = 'Error procesando búsqueda';
        
        if (error.name === 'AbortError') {
            statusCode = 408;
            errorMessage = 'Timeout de búsqueda';
        } else if (error.message.includes('400')) {
            statusCode = 400;
            errorMessage = 'Solicitud inválida';
        } else if (error.message.includes('404')) {
            statusCode = 404;
            errorMessage = 'Recurso no encontrado';
        } else if (error.message.includes('Token')) {
            statusCode = 400;
            errorMessage = 'Token de paginación inválido';
        }
        
        return {
            statusCode: statusCode,
            headers: corsHeaders,
            body: JSON.stringify({
                error: errorMessage,
                details: error.message,
                timestamp: new Date().toISOString(),
                retryable: statusCode >= 500
            })
        };
    }
};
