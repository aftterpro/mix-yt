export async function onRequest(context) {
    const { env } = context;
    // Solo enviamos el ID al navegador, la API KEY se queda en el server
    return new Response(JSON.stringify({ 
        clientId: env.GOOGLE_CLIENT_ID 
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}