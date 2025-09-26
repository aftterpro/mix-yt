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
            console.log(`📄 Token recibido (longitud ${nextPageToken.length}): ${nextPageToken.substring(0, 50)}...`);
            
            // LOGGING DETALLADO DEL TOKEN
            let parsedToken;
            try {
                const decoded = decodeURIComponent(nextPageToken);
                console.log(`📄 Decodificado: ${decoded.substring(0, 100)}...`);
                
                // Limpiar comillas extras si existen
                const cleaned = decoded.replace(/^"/, '').replace(/"$/, '');
                console.log(`📄 Limpiado: ${cleaned.substring(0, 100)}...`);
                
                parsedToken = JSON.parse(cleaned);
                console.log(`📄 Parseado exitosamente:`, {
                    type: typeof parsedToken,
                    keys: Object.keys(parsedToken || {}),
                    hasUrl: !!parsedToken?.url,
                    hasId: !!parsedToken?.id
                });
            } catch (parseError) {
                console.error(`❌ Error parseando token:`, parseError);
                console.error(`📄 Token problemático: ${nextPageToken}`);
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Token de paginación inválido',
                        details: parseError.message 
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
            
            console.log(`📄 POST a: ${targetUrl}`);
            console.log(`📄 Body enviado: nextpage object con keys: ${Object.keys(parsedToken || {})}`);
            
        } else {
            // Primera búsqueda
            targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(query)}&filter=videos`;
            fetchOptions.method = 'GET';
            console.log(`🔍 GET a: ${targetUrl}`);
        }
        
        // Hacer la petición con timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        fetchOptions.signal = controller.signal;
        
        const response = await fetch(targetUrl, fetchOptions);
        clearTimeout(timeoutId);
        
        console.log(`📊 Respuesta: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Error ${response.status}: ${errorText.substring(0, 200)}`);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📊 Datos recibidos:`, {
            itemsCount: data.items?.length || 0,
            hasNextpage: !!data.nextpage,
            nextpageType: typeof data.nextpage,
            nextpageKeys: data.nextpage ? Object.keys(data.nextpage) : null
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
                retryable: true
            })
        };
    }
};
