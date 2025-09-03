// functions/search-unified.js - Función de búsqueda optimizada para Sistema Unificado

const pipedInstances = [
//    "https://pipedapi.ducks.party",
    "https://api.piped.private.coffee"
];

function getRandomPipedInstance() {
    const randomIndex = Math.floor(Math.random() * pipedInstances.length);
    return pipedInstances[randomIndex];
}

async function fetchDataWithRetry(url, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔍 Intento ${attempt}/${maxRetries} para: ${url}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'YT-CrossMix-Unified/2.0',
                    'Accept': 'application/json'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`✅ Éxito en intento ${attempt}`);
            return data;
            
        } catch (error) {
            lastError = error;
            console.error(`❌ Intento ${attempt} falló:`, error.message);
            
            if (attempt < maxRetries) {
                const delay = retryDelay * attempt; // Backoff exponencial
                console.log(`⏳ Esperando ${delay}ms antes del siguiente intento...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

function validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Query requerida' };
    }
    
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
        return { valid: false, error: 'Query muy corta' };
    }
    
    if (trimmedQuery.length > 200) {
        return { valid: false, error: 'Query muy larga' };
    }
    
    // Verificar caracteres problemáticos
    const problematicChars = /[<>]/g;
    if (problematicChars.test(trimmedQuery)) {
        return { valid: false, error: 'Caracteres no permitidos' };
    }
    
    return { valid: true, query: trimmedQuery };
}

function sanitizeResults(data) {
    if (!data || !Array.isArray(data.items)) {
        return { items: [], nextpage: null };
    }
    
    const sanitizedItems = data.items
        .filter(item => {
            // Filtrar items válidos
            return item && 
                   item.title && 
                   item.url && 
                   item.thumbnail &&
                   item.uploaderName &&
                   item.duration !== undefined;
        })
        .map(item => ({
            videoId: item.url?.split('v=')[1] || item.url?.split('/').pop(),
            title: item.title.substring(0, 150), // Limitar título
            thumbnail: item.thumbnail,
            duration: typeof item.duration === 'number' ? item.duration : 0,
            uploaderName: item.uploaderName.substring(0, 50), // Limitar nombre
            url: item.url,
            views: item.views || 0,
            uploadedDate: item.uploadedDate || null
        }))
        .slice(0, 48); // Limitar resultados máximos
    
    return {
        items: sanitizedItems,
        nextpage: data.nextpage || null,
        suggestion: data.suggestion || null,
        corrected: data.corrected || false
    };
}

exports.handler = async function(event, context) {
    // Configurar CORS
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=300', // Cache 5 minutos
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
        
        const validation = validateSearchQuery(query);
        if (!validation.valid) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: 'Parámetros inválidos',
                    details: validation.error
                })
            };
        }
        
        // Intentar con múltiples instancias
        let lastError;
        const maxInstanceRetries = pipedInstances.length;
        
        for (let instanceAttempt = 0; instanceAttempt < maxInstanceRetries; instanceAttempt++) {
            try {
                const instanceUrl = getRandomPipedInstance();
                let targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(validation.query)}&filter=videos`;
                
                if (nextPageToken) {
                    targetUrl += `&nextpage=${encodeURIComponent(nextPageToken)}`;
                }
                
                console.log(`🎯 Usando instancia: ${instanceUrl}`);
                console.log(`📋 Query: "${validation.query}"`);
                console.log(`📄 NextPage: ${nextPageToken || 'N/A'}`);
                
                const data = await fetchDataWithRetry(targetUrl, 2, 800);
                const sanitizedData = sanitizeResults(data);
                
                console.log(`📊 Resultados: ${sanitizedData.items.length} items`);
                
                // Agregar metadata de respuesta
                const response = {
                    ...sanitizedData,
                    metadata: {
                        query: validation.query,
                        instance: instanceUrl,
                        timestamp: new Date().toISOString(),
                        resultsCount: sanitizedData.items.length,
                        hasNextPage: !!sanitizedData.nextpage
                    }
                };
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(response)
                };
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Instancia ${instanceAttempt + 1} falló:`, error.message);
                
                // Si no es la última instancia, continuar con la siguiente
                if (instanceAttempt < maxInstanceRetries - 1) {
                    console.log(`🔄 Probando siguiente instancia...`);
                    continue;
                }
            }
        }
        
        // Si todas las instancias fallaron
        throw lastError;
        
    } catch (error) {
        console.error('💥 Error final en search-unified:', error);
        
        const isNetworkError = error.name === 'AbortError' || 
                              error.message.includes('fetch') ||
                              error.message.includes('network');
        
        const errorResponse = {
            error: isNetworkError ? 
                'Error de conexión con el servicio de búsqueda' : 
                'Error interno del servidor',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
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


