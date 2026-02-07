const youtubesearchapi = require("youtube-search-api");

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const playlistId = event.queryStringParameters?.id;
        const query = event.queryStringParameters?.q;
        
        // ✅ VALIDACIÓN: Debe tener ID o QUERY
        if ((!playlistId || playlistId === 'undefined' || playlistId.trim() === '') && 
            (!query || query === 'undefined' || query.trim() === '')) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Falta el parámetro ?id= (playlist) o ?q= (búsqueda)',
                    items: [], 
                    continuation: null 
                })
            };
        }

        let nextPageData = event.queryStringParameters?.nextpage;
        let result;
        let metadata = null;

        // ✅ MODO 1: BÚSQUEDA POR PALABRAS CLAVE (como search.js)
        if (query && query.trim() !== '') {
            const sanitizedQuery = query.trim().substring(0, 200);
            
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
                    result = await youtubesearchapi.NextPage(nextPageData, true);
                }
            } else {
                // ✅ BÚSQUEDA EXACTA PARA MÚSICA
                const exactQuery = `"${sanitizedQuery}"`;
                result = await youtubesearchapi.GetListByKeyword(exactQuery, false, 25);
            }
        } 
        // ✅ MODO 2: EXTRACCIÓN POR PLAYLIST ID
        else if (playlistId && playlistId.trim() !== '') {
            // ✅ VALIDAR FORMATO DE PLAYLIST ID
            // Las playlists de YouTube pueden tener diferentes formatos:
            // - PL... (playlists normales)
            // - RD... (radio/mix automático)
            // - UU... (uploads de un canal)
            const sanitizedId = playlistId.trim();
            
            console.log(`📋 Playlist ID: "${sanitizedId}"${nextPageData ? ' (paginación)' : ''}`);

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
                    result = await youtubesearchapi.NextPage(nextPageData, true);
                }
            } else {
                // ✅ OBTENER ITEMS DE LA PLAYLIST
                result = await youtubesearchapi.GetPlaylistData(sanitizedId, 50);
            }
        }

        // ✅ VALIDAR RESPUESTA
        if (!result || !result.items || result.items.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    items: [], 
                    continuation: null,
                    metadata: null
                })
            };
        }

        // ✅ EXTRAER METADATA SOLO SI ES PLAYLIST (no en búsquedas)
        if (playlistId && playlistId.trim() !== '') {
            metadata = {
                title: result.metadata?.title || 'Playlist',
                description: result.metadata?.description || '',
                videoCount: result.metadata?.videoCount || result.items.length,
                channelName: result.metadata?.channelName || result.metadata?.author || '',
                thumbnail: null
            };

            // Obtener thumbnail de la playlist
            if (result.metadata?.thumbnails && Array.isArray(result.metadata.thumbnails)) {
                metadata.thumbnail = result.metadata.thumbnails[0]?.url || null;
            } else if (result.metadata?.thumbnail) {
                if (Array.isArray(result.metadata.thumbnail)) {
                    metadata.thumbnail = result.metadata.thumbnail[0]?.url || null;
                } else if (typeof result.metadata.thumbnail === 'string') {
                    metadata.thumbnail = result.metadata.thumbnail;
                }
            }
        }

        // ✅ PROCESAR ITEMS CON VALIDACIÓN ROBUSTA
        const items = result.items
            .filter(item => {
                // Solo videos válidos (para búsquedas verificar type, para playlists no siempre viene)
                return item && 
                       (!item.type || item.type === 'video') && // Permitir items sin type (playlists)
                       item.id && 
                       item.id.length === 11 && // YouTube IDs son 11 caracteres
                       item.title;
            })
            .map((item, index) => {
                // Thumbnail con fallback
                let thumb = './electronic.ico';
                if (item.thumbnail) {
                    if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                        thumb = item.thumbnail[item.thumbnail.length - 1].url; // Usar mejor calidad
                    } else if (item.thumbnail.thumbnails && Array.isArray(item.thumbnail.thumbnails)) {
                        thumb = item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1].url;
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
                    isLive: item.isLive || false,
                    index: item.index || (playlistId ? index + 1 : undefined) // Solo para playlists
                };
            });

        console.log(`✅ ${items.length} videos procesados${playlistId ? ' de la playlist' : ' de búsqueda'}`);

        // ✅ LIMPIAR CONTINUATION TOKEN
        let cleanToken = null;
        if (result.continuation || result.nextPage) {
            try {
                cleanToken = JSON.stringify(result.continuation || result.nextPage);
            } catch (e) {
                console.warn('⚠️ Error serializando continuation/nextPage');
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                items: items,
                continuation: cleanToken,
                metadata: metadata
            })
        };

    } catch (error) {
        console.error("❌ Error en playlist/búsqueda:", error);
        
        return {
            statusCode: 200, // ✅ NO devolver 500, mejor respuesta vacía
            headers,
            body: JSON.stringify({ 
                items: [], 
                continuation: null,
                metadata: null,
                error: error.message 
            })
        };
    }
};
