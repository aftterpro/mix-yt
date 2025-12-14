const https = require('https');
const http = require('http');
const { URL } = require('url');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
    };

    // Manejar preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // Extraer la URL completa después del proxy
        const proxyPath = '/.netlify/functions/cors-proxy/';
        const fullPath = event.path + (event.queryStringParameters ? '?' + new URLSearchParams(event.queryStringParameters).toString() : '');
        const targetUrl = fullPath.replace(proxyPath, '');
        
        if (!targetUrl || !targetUrl.startsWith('http')) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'URL inválida',
                    received: targetUrl,
                    hint: 'Usa: /.netlify/functions/cors-proxy/https://ejemplo.com'
                })
            };
        }

        console.log(`🔄 [CORS-PROXY] Redirigiendo a: ${targetUrl}`);

        // Hacer la petición usando https nativo
        const data = await makeRequest(targetUrl);

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'text/plain; charset=utf-8'
            },
            body: data
        };

    } catch (error) {
        console.error('❌ [CORS-PROXY] Error:', error.message);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Error en proxy CORS',
                message: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};

// Función helper para hacer peticiones con https nativo
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
        };

        const req = protocol.request(options, (res) => {
            let data = '';

            // Manejar diferentes encodings
            if (res.headers['content-encoding'] === 'gzip') {
                const zlib = require('zlib');
                const gunzip = zlib.createGunzip();
                res.pipe(gunzip);
                
                gunzip.on('data', (chunk) => {
                    data += chunk.toString('utf8');
                });
                
                gunzip.on('end', () => {
                    resolve(data);
                });
                
                gunzip.on('error', reject);
            } else {
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            }
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}
