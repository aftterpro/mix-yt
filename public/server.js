const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());

// --- RUTA DE BÚSQUEDA (YOUTUBE) ---
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).send({ error: "Falta parámetro q" });

    try {
        console.log(`🔍 Buscando en YouTube: ${query}`);
        // Usamos la URL de búsqueda de YouTube (scraping básico como en tu search.js original)
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const ytRes = await axios.get(searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });

        const html = ytRes.data;
        const match = html.match(/ytInitialData\s*=\s*({.+?});/);
        
        if (match && match[1]) {
            const json = JSON.parse(match[1]);
            const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
            const itemSection = contents?.find(c => c.itemSectionRenderer)?.itemSectionRenderer?.contents;
            
            const items = itemSection ? itemSection.filter(i => i.videoRenderer).map(i => {
                const v = i.videoRenderer;
                return {
                    videoId: v.videoId,
                    title: v.title?.runs[0]?.text || "Sin título",
                    thumbnail: v.thumbnail?.thumbnails[0]?.url,
                    artist: v.ownerText?.runs[0]?.text || "Desconocido",
                    duration: v.lengthText?.simpleText || "0:00"
                };
            }) : [];
            
            res.json({ items });
        } else {
            res.json({ items: [] });
        }
    } catch (error) {
        console.error("❌ Error en búsqueda:", error.message);
        res.status(500).send({ error: error.message });
    }
});
// --- RUTA PARA SPONSORBLOCK ---
app.get('/sponsorblock', async (req, res) => {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).send({ error: "Falta videoId" });

    try {
        console.log(`🛡️ Buscando segmentos SponsorBlock para: ${videoId}`);
        // Llamada a la API oficial de SponsorBlock
        const sbUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","intro","outro","interaction","selfpromo","music_offtopic","preview"]`;
        
        const response = await axios.get(sbUrl, { timeout: 5000 });
        
        // SponsorBlock devuelve 200 si hay segmentos, 404 si no hay ninguno
        res.json(response.data);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.log(`ℹ️ No hay segmentos para el video: ${videoId}`);
            return res.json([]); // Devolvemos lista vacía si no hay segmentos
        }
        console.error('❌ Error en SponsorBlock:', error.message);
        res.status(500).send({ error: "Error al conectar con SponsorBlock" });
    }
});
// --- RUTA DE PROXY DE LETRAS ---
app.get('/lyrics-proxy', async (req, res) => {
    const fullUrl = req.url.substring(req.url.indexOf('url=') + 4);
    if (!fullUrl) return res.status(400).send('Falta el parámetro url');

    try {
        const decodedUrl = decodeURIComponent(fullUrl);
        console.log(`📡 Letras: ${decodedUrl}`);
        const response = await axios.get(decodedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 5000 
        });
        res.header("Access-Control-Allow-Origin", "*");
        res.send(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`🚀 API unificada en puerto ${port}`);
});
