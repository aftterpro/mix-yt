// Dependencias necesarias para este script:
// npm install crypto-js serverless-http express cors
const express = require('express');
const serverless = require('serverless-http');
const SHA256 = require('crypto-js/sha256');
const Hex = require('crypto-js/enc-hex');

const app = express();
// Middleware para parsear el cuerpo JSON de las peticiones entrantes
app.use(express.json());

// Endpoint principal para manejar la publicación de letras
app.post('/', async (req, res) => {
    console.log('📦 Solicitud POST recibida para publicar letras.');

    // 1. Validar datos básicos del cuerpo de la solicitud
    const { trackName, artistName, duration, plainLyrics, syncedLyrics } = req.body;

    if (!trackName || !artistName || !duration) {
        return res.status(400).json({ error: 'Faltan campos requeridos (trackName, artistName, duration).' });
    }

    try {
        // --- Paso 1 & 2: Obtener Challenge y Resolver Proof-of-Work ---
        
        console.log('🔐 Solicitando desafío PoW a LRCLIB...');
        const challengeResponse = await fetch('lrclib.net', {
            method: 'POST'
        });

        if (!challengeResponse.ok) {
            throw new Error('No se pudo obtener el desafío PoW de LRCLIB.');
        }

        const challengeData = await challengeResponse.json();
        const prefix = challengeData.prefix;
        const target = challengeData.target;
        
        console.log(`Prefix: ${prefix}, Target: ${target}`);

        // Función simple para resolver el PoW (implementación básica de fuerza bruta)
        const solveProofOfWork = (prefix, target) => {
            let nonce = 0;
            let token = '';
            let hash = '';
            // El target te dice cuántos ceros o qué patrón buscar. 
            // Para simplicidad, asumimos que target define el prefijo del hash deseado.
            while (!hash.startsWith(target)) {
                nonce++;
                token = `${prefix}:${nonce}`;
                hash = SHA256(token).toString(Hex);
            }
            return token;
        };

        // Esto puede tardar unos segundos dependiendo de la dificultad (target)
        const publishToken = solveProofOfWork(prefix, target);
        console.log(`✅ Token PoW resuelto: ${publishToken.substring(0, 20)}...`);

        // --- Paso 3: Publicar la Letra usando el Token ---

        const publishResponse = await fetch('lrclib.net', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Publish-Token': publishToken // Usamos el token que acabamos de resolver
            },
            body: JSON.stringify({
                trackName,
                artistName,
                albumName: req.body.albumName || '', // Campo opcional
                duration: parseFloat(duration),
                plainLyrics: plainLyrics || '',
                syncedLyrics: syncedLyrics || ''
            })
        });

        if (publishResponse.status === 201) {
            console.log('🎉 Letra publicada con éxito en LRCLIB.');
            return res.status(201).json({ message: 'Letra publicada con éxito.' });
        } else {
            const errorBody = await publishResponse.json();
            console.error('❌ Error al publicar en LRCLIB:', errorBody);
            return res.status(publishResponse.status).json({ 
                error: 'Error de la API de LRCLIB', 
                details: errorBody.message || 'Error desconocido' 
            });
        }

    } catch (error) {
        console.error('Fatal Error en la función Netlify:', error);
        res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.', details: error.message });
    }
});

// Exportar el handler para Netlify Functions
module.exports.handler = serverless(app);
