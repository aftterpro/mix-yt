import { Router } from 'itty-router';
import { handleCorsProxy } from './cors-proxy.js';
import { handleSponsorBlock } from './sponsorblock.js';
// Importa tus otras funciones...

const router = Router();

// Define tus rutas equivalentes a las de Netlify
router.get('/cors-proxy', handleCorsProxy);
router.get('/sponsorblock', handleSponsorBlock);
router.get('/search', async (req) => {
    // Tu lógica de búsqueda aquí o importada
    return new Response("Search logic here");
});

// Ruta por defecto (404)
router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx).then(json).catch(error)
};

// Helper para respuestas JSON si lo necesitas
const json = (data) => {
    if (data instanceof Response) return data;
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });
};
const error = (e) => new Response(e.message || 'Server Error', { status: 500 });
