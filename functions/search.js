const youtubesearchapi = require("youtube-search-api");

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const q = event.queryStringParameters?.q;
        
        // ✅ VALIDACIÓN MEJORADA
        if (!q || q === 'undefined' || q.trim() === '') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Query vacío',
                    items: [], 
                    continuation: null 
                })
            };
        }

        // ✅ SANITIZAR QUERY
        const sanitizedQuery = q.trim().substring(0, 200); // Limitar longitud
        
        let nextPageData = event.queryStringParameters?.nextpage;
        let result;

        console.log(`🔍 Query: "${sanitizedQuery}"${nextPageData ? ' (paginación)' : ''}`);

        if (nextPageData) {
            try {
                // ✅ DECODIFICAR SI ES NECESARIO
                if (typeof nextPageData === 'string' && nextPageData.startsWith('%')) {
                    nextPageData = decodeURIComponent(nextPageData);
                }
                
                // ✅ PARSEAR SI ES JSON
                if (nextPageData.startsWith('{')) {
                    const parsed = JSON.parse(nextPageData);
                    result = await youtubesearchapi.NextPage(parsed, true);
                } else {
                    result = await youtubesearchapi.NextPage(nextPageData, true);
                }
            } catch (e) {
                console.warn('⚠️ Error en paginación:', e.message);
                // Reintentar sin parsear
                result = await youtubesearchapi.NextPage(nextPageData, true);
            }
        } else {
            // ✅ BÚSQUEDA EXACTA PARA MÚSICA
            const exactQuery = `"${sanitizedQuery}"`;
            result = await youtubesearchapi.GetListByKeyword(exactQuery, false, 25);
        }

        // ✅ VALIDAR RESPUESTA
        if (!result || !result.items || result.items.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ items: [], continuation: null })
            };
        }

        // ✅ PROCESAR ITEMS CON VALIDACIÓN ROBUSTA
        const items = result.items
            .filter(item => {
                // Solo videos válidos
                return item && 
                       item.type === 'video' && 
                       item.id && 
                       item.id.length === 11 && // YouTube IDs son 11 caracteres
                       item.title;
            })
            .map((item) => {
                // Thumbnail con fallback
                let thumb = './electronic.ico';
                if (item.thumbnail) {
                    if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                        thumb = item.thumbnail[0].url;
                    } else if (item.thumbnail.thumbnails && Array.isArray(item.thumbnail.thumbnails)) {
                        thumb = item.thumbnail.thumbnails[0].url;
                    } else if (typeof item.thumbnail === 'string') {
                        thumb = item.thumbnail;
                    }
                }

                // Duración con fallback
                let dur = "0:00";
                if (item.length) {
                    if (item.length.simpleText) {
                        dur = item.length.simpleText;
                    } else if (typeof item.length === 'string') {
                        dur = item.length;
                    }
                }

                return {
                    videoId: item.id,
                    title: item.title.substring(0, 200), // Limitar longitud
                    thumbnail: thumb,
                    artist: (item.channelTitle || item.author || "Artista Desconocido").substring(0, 100),
                    uploaderName: (item.channelTitle || "Desconocido").substring(0, 100),
                    duration: dur,
                    isLive: item.isLive || false
                };
            });

        console.log(`✅ ${items.length} videos procesados`);

        // ✅ LIMPIAR CONTINUATION TOKEN
        let cleanToken = null;
        if (result.nextPage) {
            try {
                cleanToken = JSON.stringify(result.nextPage);
            } catch (e) {
                console.warn('⚠️ Error serializando nextPage');
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                continuation: cleanToken
            })
        };

    } catch (error) {
        console.error("❌ Error en búsqueda:", error);
        
        return {
            statusCode: 200, // ✅ NO devolver 500, mejor respuesta vacía
            headers,
            body: JSON.stringify({ 
                items: [], 
                continuation: null, 
                error: error.message 
            })
        };
    }
};
