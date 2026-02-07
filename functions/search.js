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

        // ✅ MODO 1: BÚSQUEDA POR PALABRAS CLAVE
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
                        result = await youtubesearchapi.NextPage(parsed, false);
                    } else {
                        result = await youtubesearchapi.NextPage(nextPageData, false);
                    }
                } catch (e) {
                    console.warn('⚠️ Error en paginación:', e.message);
                    result = await youtubesearchapi.NextPage(nextPageData, false);
                }
            } else {
                // ✅ BÚSQUEDA (sin comillas para mejor resultado)
                result = await youtubesearchapi.GetListByKeyword(sanitizedQuery, false, 25);
            }
        } 
        // ✅ MODO 2: EXTRACCIÓN POR PLAYLIST ID
        else if (playlistId && playlistId.trim() !== '') {
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

        console.log('📦 Estructura de result:', {
            hasItems: !!result?.items,
            itemsCount: result?.items?.length || 0,
            hasMetadata: !!result?.metadata,
            hasNextPage: !!result?.nextPage,
            firstItem: result?.items?.[0]
        });

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

        // ✅ EXTRAER METADATA SOLO SI ES PLAYLIST
        if (playlistId && playlistId.trim() !== '' && result.metadata) {
            metadata = {
                title: result.metadata.title || 'Playlist',
                description: result.metadata.description || '',
                videoCount: result.metadata.videoCount || result.items.length,
                channelName: result.metadata.channelTitle || result.metadata.author || '',
                thumbnail: null
            };

            // ✅ Obtener thumbnail de la playlist
            if (result.metadata.thumbnail) {
                if (Array.isArray(result.metadata.thumbnail)) {
                    metadata.thumbnail = result.metadata.thumbnail[0]?.url || null;
                } else if (result.metadata.thumbnail.thumbnails && Array.isArray(result.metadata.thumbnail.thumbnails)) {
                    metadata.thumbnail = result.metadata.thumbnail.thumbnails[0]?.url || null;
                } else if (typeof result.metadata.thumbnail === 'string') {
                    metadata.thumbnail = result.metadata.thumbnail;
                }
            }
        }

        // ✅ PROCESAR ITEMS CON VALIDACIÓN ROBUSTA
        const items = result.items
            .filter(item => {
                // Solo videos válidos
                return item && 
                       (!item.type || item.type === 'video') && 
                       item.id && 
                       item.id.length === 11 && 
                       item.title;
            })
            .map((item, index) => {
                // ✅ THUMBNAIL con validación completa
                let thumb = 'https://static.vecteezy.com/system/resources/previews/016/771/877/non_2x/student-dj-party-icon-outline-person-club-vector.jpg';
                
                if (item.thumbnail) {
                    if (Array.isArray(item.thumbnail) && item.thumbnail.length > 0) {
                        // Array de objetos con url
                        const bestQuality = item.thumbnail[item.thumbnail.length - 1];
                        thumb = bestQuality?.url || thumb;
                    } else if (item.thumbnail.thumbnails && Array.isArray(item.thumbnail.thumbnails)) {
                        // Objeto con propiedad thumbnails
                        const bestQuality = item.thumbnail.thumbnails[item.thumbnail.thumbnails.length - 1];
                        thumb = bestQuality?.url || thumb;
                    } else if (typeof item.thumbnail === 'string') {
                        // String directo
                        thumb = item.thumbnail;
                    } else if (item.thumbnail.url) {
                        // Objeto simple con url
                        thumb = item.thumbnail.url;
                    }
                }

                // ✅ DURACIÓN con validación completa
                let dur = "0:00";
                
                if (item.length) {
                    if (item.length.simpleText) {
                        // Formato: {simpleText: "3:45"}
                        dur = item.length.simpleText;
                    } else if (typeof item.length === 'string') {
                        // String directo
                        dur = item.length;
                    } else if (typeof item.length === 'object' && item.length.text) {
                        // Formato alternativo
                        dur = item.length.text;
                    }
                }

                // ✅ CANAL/ARTISTA
                let artist = "Artista Desconocido";
                if (item.channelTitle) {
                    artist = item.channelTitle;
                } else if (item.shortBylineText?.simpleText) {
                    artist = item.shortBylineText.simpleText;
                } else if (item.longBylineText?.simpleText) {
                    artist = item.longBylineText.simpleText;
                }

                return {
                    videoId: item.id,
                    title: (item.title || 'Sin título').substring(0, 200),
                    thumbnail: thumb,
                    artist: artist.substring(0, 100),
                    uploaderName: artist.substring(0, 100),
                    duration: dur,
                    isLive: item.isLive || false,
                    index: playlistId ? (index + 1) : undefined
                };
            });

        console.log(`✅ ${items.length} videos procesados${playlistId ? ' de la playlist' : ' de búsqueda'}`);

        // ✅ LIMPIAR CONTINUATION TOKEN
        let cleanToken = null;
        if (result.nextPage) {
            // Para búsquedas: result.nextPage = {nextPageToken, nextPageContext}
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
                continuation: cleanToken,
                metadata: metadata
            })
        };

    } catch (error) {
        console.error("❌ Error en playlist/búsqueda:", error);
        
        return {
            statusCode: 200,
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
