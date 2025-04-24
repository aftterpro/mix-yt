const corsAnywhere = require('cors-anywhere');

const server = corsAnywhere.createServer({
  originWhitelist: [
    'https://mix-yt.netlify.app', // Reemplaza con tu dominio
  ], // Lista blanca de dominios permitidos (opcional)
  requireHeader: null, // Requiere un encabezado específico (opcional)
  removeHeaders: ['cookie', 'cookie2'] // Elimina encabezados no deseados (opcional)
});

exports.handler = async (event, context) => {
  return new Promise((resolve, reject) => {
    // Obtener la ruta a Piped desde event.rawUrl (o event.path si es necesario)
    let pipedPath = event.rawUrl.substring(event.rawUrl.indexOf('/.netlify/functions/cors-proxy/') + '/.netlify/functions/cors-proxy/'.length);

    // Construir la URL completa de Piped
    const pipedUrl = `https://pipedapi.orangenet.cc/${pipedPath}`;

    const req = {
      method: event.httpMethod,
      headers: event.headers,
      path: pipedUrl, // Usar la URL completa de Piped
      query: event.queryStringParameters,
      body: event.body,
    };

    const res = {
      writeHead: (statusCode, headers) => {
        resolve({
          statusCode,
          headers,
          body: '',
        });
      },
      end: (data) => {
        resolve({
          body: data.toString(),
        });
      },
    };

    server.emit('request', req, res);
  });
};
