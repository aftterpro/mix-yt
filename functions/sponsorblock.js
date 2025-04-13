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
            "music_offtopic", // OJO a esto
        ]);

        console.log('Segmentos obtenidos:', segments);

        res.json(segments);
    } catch (error) {

        // Verificar si el error es un 404 (Not Found)
        if (error.status === 404) {
        console.log('No se encontraron segmentos para este video. Devolviendo un array vacío.');
        return res.json([]); // *** CORRECCIÓN: Devolver array JSON vacío explícito ***
}
        // Si es otro tipo de error, devolverlo
        return res.status(500).json({ error: 'Error al obtener segmentos de SponsorBlock', details: error.message });
    }
});

app.use('/api', router);

module.exports.handler = serverless(app);
