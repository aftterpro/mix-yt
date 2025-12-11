const { SponsorBlock } = require('sponsorblock-api');

exports.handler = async function(event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-UserID', // Permitir X-UserID
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // 1. Obtener parámetros y encabezados
    const videoId = event.queryStringParameters?.videoId;
    const userId = event.headers['x-userid']; // Netlify convierte a minúsculas

    // 2. Validación (Clave para evitar el 400 Bad Request)
    if (!videoId || !userId) {
        console.error('❌ Validación fallida: Faltan videoId o X-UserID');
        return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ 
                error: 'Faltan parámetros de consulta (videoId) o encabezado (X-UserID)' 
            })
        };
    }

    try {
        // 3. Llamar a la API de SponsorBlock
        const sponsorBlock = new SponsorBlock(userId);
        
        const segments = await sponsorBlock.getSegments(videoId, [
            "sponsor", 
            "intro", 
            "outro", 
            "selfpromo",
            "music_offtopic", // Importante para tu caso de uso
        ]);
        
        console.log(`✅ Segmentos obtenidos para ${videoId}: ${segments.length}`);

        // 4. Devolver un array
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(segments || []) 
        };
        
    } catch (error) {
        console.error(`❌ Error al llamar a SponsorBlock para ${videoId}:`, error.message);
        
        // Devolver array vacío y 200 OK para no romper el cliente
        return { 
            statusCode: 200, 
            headers,
            body: JSON.stringify([]) 
        };
    }
};
