export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Falta ?url=" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MixYT/1.0)",
        // Copiamos headers útiles si es necesario
      }
    });
    
    // Usamos arrayBuffer para no corromper imágenes o audio
    const body = await response.arrayBuffer();

    const newResponse = new Response(body, {
        status: response.status,
        headers: new Headers(response.headers)
    });

    // Inyectamos CORS
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    
    return newResponse;
  } catch (e) {
    return new Response(JSON.stringify({ error: "Proxy Error: " + e.message }), { 
        status: 500, 
        headers: corsHeaders 
    });
  }
}
