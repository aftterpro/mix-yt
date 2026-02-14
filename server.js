app.get('/lyrics-proxy', async (req, res) => {
    // 1. Obtenemos la URL del parámetro
    let targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).send('Falta el parámetro url');
    }

    try {

        const decodedUrl = decodeURIComponent(targetUrl);

        console.log(`📡 Solicitando letras a: ${decodedUrl}`);

        const response = await axios.get(decodedUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/plain, */*'
            },
            // Es vital usar este timeout por si la API de letras tarda
            timeout: 5000 
        });

        res.header("Access-Control-Allow-Origin", "*");
        res.send(response.data);

    } catch (error) {
        // Si axios devuelve 404, imprimimos la URL exacta que falló para debug
        console.error('❌ Error 404 en la URL:', error.config?.url);
        res.status(error.response?.status || 500).send(error.message);
    }
});
