const express = require('express');
const serverless = require('serverless-http');
const { SponsorBlock } = require('sponsorblock-api');


const app = express();
const router = express.Router();

// Middleware para configurar los encabezados CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-UserID');
    next();
});

router.get('/segments/:videoId', async (req, res) => {
    console.log(' Solicitud GET recibida para:', req.params.videoId);
    const videoId = req.params.videoId;
    console.log('Video ID:', videoId);

    try {
        // Obtener el userID del encabezado de la solicitud
        const userId = req.headers['x-userid'];

        // Verificar si se proporcionó el userID
        if (!userId) {
        console.error('❌ userID es requerido:', userId);
            return res.status(400).json({ error: 'userID es requerido.' });
        }

        // Crear una instancia de SponsorBlock con el userID recibido
        const sponsorBlock = new SponsorBlock(userId);

        const segments = await sponsorBlock.getSegments(videoId, [
            "sponsor",
            "intro",
            "outro",
            "selfpromo",
            "interaction",
            "poi",
            "music_offtopic", 
        ]);
        console.log(`Function: Segmentos obtenidos para ${videoId}: ${segments.length}`);
        // Asegúrate de devolver un array vacío si no se encontraron segmentos (manejo de 404)
        res.json(segments || []); // Devolver segmentos o array vacío

    } catch (error) {
        console.error(`Function Error procesando ${videoId}:`, error);

        // Mejorar manejo de error 404 de la librería sponsorblock-api
        if (error.status === 404 || (error.message && error.message.includes('404'))) {
            console.log(`Function: No se encontraron segmentos SB para ${videoId}. Devolviendo array vacío.`);
            return res.json([]); // Devolver array vacío para 404
        }

        // Otros errores
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ error: 'Error al obtener segmentos de SponsorBlock', details: error.message });
    }
});

app.use('/api', router);

module.exports.handler = serverless(app);
