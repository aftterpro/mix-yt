const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = 3000; // O el puerto que estés usando en Oracle

// Habilitar CORS para que tu frontend en Cloudflare pueda consultar este backend
app.use(cors());

// RUTA PARA EL PROXY DE LETRAS
app.get('/lyrics-proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).send('Falta el parámetro url');
    }

    console.log(`📡 Solicitando letras a: ${targetUrl}`);

    try {
        const response = await axios.get(targetUrl, {
            headers: { 
                // Usamos un User-Agent real para evitar bloqueos por WAF/Cloudflare
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/plain, */*',
                'Referer': 'https://www.google.com/'
            },
            responseType: 'arraybuffer' // Usar arraybuffer para manejar correctamente el texto o binarios
        });

        // Configurar el tipo de contenido si la API de origen lo envía
        if (response.headers['content-type']) {
            res.header("Content-Type", response.headers['content-type']);
        }

        res.send(response.data);
    } catch (error) {
        console.error('❌ Error en lyrics-proxy:', error.message);
        res.status(500).send(`Error al obtener letras: ${error.message}`);
    }
});
/*
// Ejemplo de tu ruta de búsqueda existente (si la tienes en este mismo server)
app.get('/search', async (req, res) => {
    // ... tu lógica de búsqueda actual ...
    res.json({ message: "Endpoint de búsqueda activo" });
});
*/
// INICIAR EL SERVIDOR
app.listen(port, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
    console.log(`🔗 Ruta proxy disponible en: /lyrics-proxy`);
});
