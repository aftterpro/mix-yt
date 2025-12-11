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

    // El videoId vendrá en el queryStringParameters
    const videoId = event.queryStringParameters.videoId;
    const userId = event.headers['x-userid'];

    if (!videoId || !userId) {
        return { 
            statusCode: 400, 
            headers, 
            body: JSON.stringify({ error: 'Faltan videoId o X-UserID' })
        };
    }

    try {
        const sponsorBlock = new SponsorBlock(userId);
        const segments = await sponsorBlock.getSegments(videoId, [
            "sponsor", "intro", "outro", "music_offtopic", // Categorías necesarias
        ]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(segments || []) // Debe devolver un array
        };
        
    } catch (error) {
        console.error(`Error SB para ${videoId}:`, error);
        return { 
            statusCode: 200, // Devolver 200 para no fallar el cliente
            headers,
            body: JSON.stringify([]) // Devolver array vacío en caso de error
        };
    }
};
