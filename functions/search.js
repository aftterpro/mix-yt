
exports.handler = async function(event, context) {
    // Configurar CORS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=60', // Cache reducido a 1 minuto
        'Content-Type': 'application/json'
    };
    
    // Manejar preflight OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    // Solo permitir GET
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Método no permitido',
                allowedMethods: ['GET']
            })
        };
    }
    
    try {
        // Validar parámetros
        const query = event.queryStringParameters?.q;
        const nextPageToken = event.queryStringParameters?.nextpage;
        
        if (!query || typeof query !== 'string' || query.trim().length < 1) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: 'Parámetro q (query) requerido y debe ser válido'
                })
            };
        }
        
        const trimmedQuery = query.trim();
        console.log(`🔍 Búsqueda: "${trimmedQuery}"${nextPageToken ? ' (paginación)' : ''}`);
        
        // Lista de instancias Piped actualizadas
        const pipedInstances = [
            "https://api.piped.private.coffee"
       //     "https://pipedapi.ducks.party",
         //   "https://api-piped.shimul.me"
        ];
        
        function getRandomPipedInstance() {
            const randomIndex = Math.floor(Math.random() * pipedInstances.length);
            return pipedInstances[randomIndex];
        }
        
        // Intentar con múltiples instancias
        let lastError;
        const maxInstanceRetries = pipedInstances.length;
        
        for (let instanceAttempt = 0; instanceAttempt < maxInstanceRetries; instanceAttempt++) {
            try {
                const instanceUrl = getRandomPipedInstance();
                
                // CONSTRUIR URL CORRECTAMENTE PARA PAGINACIÓN
                let targetUrl;
                
                if (nextPageToken) {
                    // Para páginas siguientes, usar el endpoint de nextpage
                    targetUrl = `${instanceUrl}/nextpage/search`;
                    console.log(`📄 Usando nextpage endpoint: ${targetUrl}`);
                } else {
                    // Para primera búsqueda
                    targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(trimmedQuery)}&filter=videos`;
                    console.log(`🔍 Primera búsqueda: ${targetUrl}`);
                }
                
                // Configurar la request
                let fetchOptions = {
                    headers: {
                        'User-Agent': 'YT-CrossMix-Search/2.0',
                        'Accept': 'application/json'
                    }
                };
                
                // Si es paginación, enviar nextpage como POST body
                if (nextPageToken) {
                    fetchOptions.method = 'POST';
                    fetchOptions.headers['Content-Type'] = 'application/json';
                    fetchOptions.body = JSON.stringify({
                        query: trimmedQuery,
                        nextpage: nextPageToken
                    });
                    
                    console.log(`📄 Enviando nextpage token (longitud: ${nextPageToken.length})`);
                } else {
                    fetchOptions.method = 'GET';
                }
                
                console.log(`🎯 Usando instancia: ${instanceUrl}`);
                
                // Realizar request con timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
                
                fetchOptions.signal = controller.signal;
                
                const response = await fetch(targetUrl, fetchOptions);
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // VALIDAR ESTRUCTURA DE RESPUESTA
                if (!data || (!data.items && !Array.isArray(data))) {
                    throw new Error('Estructura de respuesta inválida');
                }
                
                // Normalizar respuesta (algunas instancias devuelven array directo)
                const items = Array.isArray(data) ? data : (data.items || []);
                const nextpage = data.nextpage || null;
                
                // Filtrar solo videos válidos
                const validItems = items.filter(item => {
                    return item && 
                           item.title && 
                           (item.url || item.videoId) &&
                           item.thumbnail &&
                           item.uploaderName &&
                           item.duration !== undefined &&
                           !item.url?.includes('/channel/') && // Excluir canales
                           !item.url?.includes('/playlist/'); // Excluir playlists
                });
                
                // Normalizar formato de items
                const normalizedItems = validItems.map(item => {
                    const videoId = item.videoId || item.url?.split('v=')[1] || item.url?.split('/').pop();
                    
                    return {
                        videoId: videoId,
                        title: item.title.trim(),
                        thumbnail: item.thumbnail,
                        duration: typeof item.duration === 'number' ? item.duration : 0,
                        uploaderName: item.uploaderName?.trim() || 'Unknown',
                        url: item.url,
                        views: item.views || 0,
                        uploadedDate: item.uploadedDate || null
                    };
                }).filter(item => item.videoId && item.videoId.length === 11); // Solo IDs válidos de YouTube
                
                console.log(`✅ ${normalizedItems.length} videos válidos obtenidos de ${items.length} items`);
                
                // Preparar respuesta final
                const response_data = {
                    items: normalizedItems,
                    nextpage: nextpage,
                    suggestion: data.suggestion || null,
                    corrected: data.corrected || false,
                    metadata: {
                        query: trimmedQuery,
                        instance: instanceUrl,
                        timestamp: new Date().toISOString(),
                        resultsCount: normalizedItems.length,
                        hasNextPage: !!nextpage,
                        isNextPageRequest: !!nextPageToken
                    }
                };
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(response_data)
                };
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Instancia ${instanceAttempt + 1} falló:`, error.message);
                
                // Si no es la última instancia, continuar con la siguiente
                if (instanceAttempt < maxInstanceRetries - 1) {
                    console.log(`🔄 Probando siguiente instancia...`);
                    await new Promise(resolve => setTimeout(resolve, 500)); // Pequeño delay
                    continue;
                }
            }
        }
        
        // Si todas las instancias fallaron
        throw lastError;
        
    } catch (error) {
        console.error('💥 Error final en search:', error);
        
        const isNetworkError = error.name === 'AbortError' || 
                              error.message.includes('fetch') ||
                              error.message.includes('network') ||
                              error.message.includes('timeout');
        
        const errorResponse = {
            error: isNetworkError ? 
                'Error de conexión con el servicio de búsqueda' : 
                'Error procesando búsqueda',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Inténtalo de nuevo',
            timestamp: new Date().toISOString(),
            retryable: isNetworkError
        };
        
        return {
            statusCode: isNetworkError ? 502 : 500,
            headers: corsHeaders,
            body: JSON.stringify(errorResponse)
        };
    }
};
