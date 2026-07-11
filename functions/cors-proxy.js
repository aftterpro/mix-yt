// Ejemplo basado en un manejador estándar de JavaScript Edge Runtime
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Falta el parámetro 'url'" }), { status: 400 });
    }

    try {
        // Clonamos la solicitud original o creamos una limpia limpiando cabeceras restrictivas
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        // Creamos una nueva respuesta para poder inyectar cabeceras personalizadas de caché
        const modificadaResponse = new Response(response.body, response);
        
        /* 
          Cache-Control agresivo: 
          - public: puede guardarse en proxies intermedios y CDNs.
          - max-age=1800: El navegador lo considera fresco por 30 minutos.
          - s-maxage=3600: Las CDNs del Edge lo cachearán por 1 hora completa.
        */
        modificadaResponse.headers.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
        // Aseguramos políticas CORS amplias si tu app lo requiere
        modificadaResponse.headers.set('Access-Control-Allow-Origin', '*'); 

        return modificadaResponse;
    } catch (err) {
        return new Response(JSON.stringify({ error: "Fallo en la conexión del Proxy" }), { status: 500 });
    }
}
