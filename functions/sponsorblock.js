const express = require('express');
const serverless = require('serverless-http');
const { SponsorBlock } = require('sponsorblock-api');

const app = express();
const router = express.Router();

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-UserID');
    next();
});

router.get('/segments/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    // Usar un ID genérico si no envían uno, para evitar errores
    const userId = req.headers['x-userid'] || 'gen_user_id'; 

    try {
        const sponsorBlock = new SponsorBlock(userId);
        const segments = await sponsorBlock.getSegments(videoId, [
            "sponsor", "intro", "outro", "selfpromo", "interaction", "poi", "music_offtopic"
        ]);
        
        res.json(segments || []);

    } catch (error) {
        // Silenciar errores 404 (No hay segmentos) devolviendo array vacío
        if (error.status === 404 || (error.message && error.message.includes('404'))) {
            return res.json([]); 
        }
        
        // Error real: devolver JSON de error, NO HTML
        console.error(`Error SB para ${videoId}:`, error.message);
        res.status(500).json({ error: 'Error interno', details: error.message });
    }
});

app.use('/api', router);
module.exports.handler = serverless(app);
