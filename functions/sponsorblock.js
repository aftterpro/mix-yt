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
        const userId = process.env.SPONSORBLOCK_USER_ID; //Obtener userID desde la variable de entorno ***

        // Verificar que la variable de entorno esté configurada en Netlify
        if (!userId) {
            console.error('Function Error: La variable de entorno SPONSORBLOCK_USER_ID no está configurada en Netlify.');
            // Usar 500 Internal Server Error porque es un problema de configuración del backend
            return res.status(500).json({ error: 'Error de configuración interna del servidor.' });
        }

        // Ya no se necesita el encabezado 'X-UserID' de la solicitud
        const sponsorBlock = new SponsorBlock(userId);
        // console.log(`Function: Usando userID del entorno para SponsorBlock.`); // Evita loguear el ID real

        const segments = await sponsorBlock.getSegments(videoId, [
            "sponsor", "intro", "outro", "selfpromo",
            "interaction", "poi", "music_offtopic",
            // Añade o quita categorías según necesites
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

// Montar el router en /api (para que coincida con la llamada del frontend)
app.use('/api', router);
module.exports.handler = serverless(app);
