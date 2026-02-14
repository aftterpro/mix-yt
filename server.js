const axios = require('axios'); // Asegúrate de tener axios o usa fetch

app.get('/lyrics-proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Falta url');

    try {
        const response = await axios.get(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' 
            },
            responseType: 'arraybuffer' // Para no corromper datos
        });

        // Reenviar headers CORS
        res.header("Access-Control-Allow-Origin", "*");
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error.message);
    }
});
