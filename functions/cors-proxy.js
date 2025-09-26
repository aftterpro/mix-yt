const corsAnywhere = require('cors-anywhere');

const server = corsAnywhere.createServer({
  originWhitelist: [
    'https://mix-yt.netlify.app', // Tu dominio de producción
    'http://localhost:3000',      // Desarrollo local
    'http://localhost:8080',      // Desarrollo local alternativo
    'http://127.0.0.1:3000',      // Desarrollo local IP
    'http://127.0.0.1:8080'       // Desarrollo local IP alternativo
  ],
  requireHeader: null,
  removeHeaders: ['cookie', 'cookie2']
});

exports.handler = async (event, context) => {
  return new Promise((resolve, reject) => {
    console.log('🔍 CORS Proxy request:', {
      method: event.httpMethod,
      path: event.path,
      rawUrl: event.rawUrl,
      queryParams: event.queryStringParameters,
      headers: Object.keys(event.headers || {})
    });

    // Extraer la ruta después de /.netlify/functions/cors-proxy/
    const basePath = '/.netlify/functions/cors-proxy/';
    let pipedPath = event.rawUrl.substring(event.rawUrl.indexOf(basePath) + basePath.length);
    
    // Si no hay path después del proxy, usar path de event
    if (!pipedPath) {
      pipedPath = event.path.replace(/^\/\.netlify\/functions\/cors-proxy\/?/, '');
    }

    console.log('📄 Extracted Piped path:', pipedPath);

    // Construir la URL completa de Piped
    const pipedBaseUrl = 'https://api.piped.private.coffee';
    let pipedUrl = `${pipedBaseUrl}/${pipedPath}`;

    // Si hay query parameters, agregarlos
    if (event.queryStringParameters) {
      const queryParams = new URLSearchParams(event.queryStringParameters).toString();
      if (queryParams) {
        const separator = pipedUrl.includes('?') ? '&' : '?';
        pipedUrl = `${pipedUrl}${separator}${queryParams}`;
      }
    }

    console.log('🎯 Final Piped URL:', pipedUrl);

    // Crear objetos req y res para cors-anywhere
    const req = {
      method: event.httpMethod,
      headers: {
        ...event.headers,
        'host': 'api.piped.private.coffee',
        'origin': event.headers.origin || 'https://mix-yt.netlify.app'
      },
      url: pipedUrl,
      query: event.queryStringParameters || {},
      body: event.body || null
    };

    let responseBody = '';
    let statusCode = 200;
    let responseHeaders = {};

    const res = {
      writeHead: (code, headers) => {
        statusCode = code;
        responseHeaders = {
          ...headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        };
      },
      write: (chunk) => {
        responseBody += chunk.toString();
      },
      end: (data) => {
        if (data) {
          responseBody += data.toString();
        }
        
        console.log('✅ CORS Proxy response:', {
          statusCode,
          bodyLength: responseBody.length,
          headers: Object.keys(responseHeaders)
        });

        resolve({
          statusCode: statusCode,
          headers: responseHeaders,
          body: responseBody
        });
      },
      setHeader: (name, value) => {
        responseHeaders[name] = value;
      }
    };

    // Manejar OPTIONS para CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      resolve({
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        },
        body: ''
      });
      return;
    }

    try {
      // Emitir request a cors-anywhere
      server.emit('request', req, res);
    } catch (error) {
      console.error('❌ CORS Proxy error:', error);
      resolve({
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'CORS Proxy Error',
          message: error.message
        })
      });
    }
  });
};
