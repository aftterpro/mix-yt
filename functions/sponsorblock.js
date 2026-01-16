const { SponsorBlock } = require('sponsorblock-api');

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-UserID',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const videoId = event.queryStringParameters?.videoId;
    const userId = event.headers['x-userid']; // Netlify convierte a minúsculas

    // ✅ VALIDACIÓN MEJORADA
    if (!videoId) {
        return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ error: 'Falta parámetro videoId' })
        };
    }
    
    // ✅ VALIDAR FORMATO DE VIDEO ID
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'videoId inválido' })
        };
    }

    if (!userId) {
        return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ error: 'Falta encabezado X-UserID' })
        };
    }

    try {
        const sponsorBlock = new SponsorBlock(userId);
        
        // ✅ TIMEOUT DE 3 SEGUNDOS
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 3000);
        });
        
        const segmentsPromise = sponsorBlock.getSegments(videoId, [
            "sponsor", 
            "intro", 
            "outro", 
            "selfpromo",
            "music_offtopic",
        ]);
        
        const segments = await Promise.race([segmentsPromise, timeoutPromise]);
        
        // ✅ VALIDAR RESPUESTA
        if (!Array.isArray(segments)) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify([])
            };
        }
        
        // ✅ FILTRAR SEGMENTOS VÁLIDOS
        const validSegments = segments.filter(s => 
            s && 
            typeof s.startTime === 'number' && 
            typeof s.endTime === 'number' &&
            s.startTime < s.endTime &&
            s.category
        );
        
        console.log(`✅ ${validSegments.length} segmentos válidos para ${videoId}`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(validSegments)
        };
        
    } catch (error) {
        // ✅ NO LOGEAR ERRORES 404 (es normal)
        if (error.message !== 'HTTP 404' && error.message !== 'Timeout') {
            console.error(`❌ Error SponsorBlock para ${videoId}:`, error.message);
        }
        
        // ✅ DEVOLVER ARRAY VACÍO EN VEZ DE ERROR
        return { 
            statusCode: 200, 
            headers,
            body: JSON.stringify([])
        };
    }
};
