exports.handler = async function(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'public, max-age=60',
        'Content-Type': 'application/json'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }
    
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Método no permitido' })
        };
    }
    
    try {
        const query = event.queryStringParameters?.q;
        const nextPageToken = event.queryStringParameters?.nextpage;
        
        if (!query) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Parámetro q requerido' })
            };
        }
        
        console.log(`🔍 Búsqueda: "${query}"${nextPageToken ? ' (paginación)' : ''}`);
        
        const instanceUrl = "https://api.piped.private.coffee";
        let targetUrl;
        let fetchOptions = {
            headers: {
                'User-Agent': 'YT-CrossMix-Search/2.0',
                'Accept': 'application/json'
            }
        };
        
        if (nextPageToken) {
            console.log(`📄 Token raw recibido (${nextPageToken.length} chars): ${nextPageToken.substring(0, 100)}...`);
            
            let parsedToken;
            try {
                const decoded = decodeURIComponent(nextPageToken);
                console.log(`📄 Token decodificado: ${decoded.substring(0, 100)}...`);
                
                parsedToken = JSON.parse(decoded);
                console.log(`📄 Token parseado:`, {
                    type: typeof parsedToken,
                    keys: Object.keys(parsedToken || {}),
                    valid: !!(parsedToken?.url && parsedToken?.id)
                });
                
                if (!parsedToken?.url || !parsedToken?.id) {
                    throw new Error('Token incompleto - falta url o id');
                }
                
            } catch (parseError) {
                console.error(`❌ Error parseando token:`, parseError.message);
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Token de paginación inválido',
                        details: parseError.message,
                        debug: {
                            tokenLength: nextPageToken.length,
                            tokenStart: nextPageToken.substring(0, 50),
                            decodedStart: decodeURIComponent(nextPageToken).substring(0, 50)
                        }
                    })
                };
            }
            
            // Usar POST para paginación
            targetUrl = `${instanceUrl}/nextpage/search`;
            fetchOptions.method = 'POST';
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify({
                nextpage: parsedToken,
                query: query
            });
            
            console.log(`📄 POST a: ${targetUrl} con token válido`);
            
        } else {
            // Primera búsqueda
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
            console.log(`🔍 GET a: ${targetUrl}`);
        }
        
        // Hacer la petición
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        fetchOptions.signal = controller.signal;
        
        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);
        
        console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error ${response.status}: ${errorText.substring(0, 500)}`);
            
            // Específico para error 404 en paginación
            if (response.status === 404 && nextPageToken) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        error: 'Token de paginación expirado o inválido',
                        details: 'El token de paginación ya no es válido',
                        retryable: false
                    })
                };
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📊 Datos recibidos:`, {
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            nextpageType: typeof data.nextpage
        });
        
        // Normalizar respuesta
        const items = data.items || [];
        const validItems = items.filter(item => 
            item && 
            item.title && 
            (item.url || item.videoId) &&
            item.thumbnail &&
            !item.url?.includes('/channel/') &&
            !item.url?.includes('/playlist/')
        ).map(item => ({
            videoId: item.videoId || item.url?.split('v=')[1] || item.url?.split('/').pop(),
            title: item.title.trim(),
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : 0,
            uploaderName: item.uploaderName?.trim() || 'Unknown',
            url: item.url,
            views: item.views || 0,
            uploadedDate: item.uploadedDate || null
        }));
        
        console.log(`✅ ${validItems.length} videos válidos procesados`);
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                items: validItems,
                nextpage: data.nextpage || null,
                suggestion: data.suggestion || null,
                corrected: data.corrected || false,
                metadata: {
                    query: query,
                    instance: instanceUrl,
                    timestamp: new Date().toISOString(),
                    resultsCount: validItems.length,
                    hasNextPage: !!data.nextpage,
                    isNextPageRequest: !!nextPageToken
                }
            })
        };
        
    } catch (error) {
        console.error('💥 Error final:', error);
        
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                error: 'Error procesando búsqueda',
                details: error.message,
                timestamp: new Date().toISOString(),
                retryable: !error.message.includes('Token')
            })
        };
    }
};
