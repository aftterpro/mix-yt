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

   const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": randomUA,  
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer": "https://www.youtube.com/",  
        "Origin": "https://www.youtube.com",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-GPC": "1"
      }
    });
    
    if (response.status === 403 || response.status === 429) {
        console.error("⚠️ YouTube detectó el proxy como bot");
    }

    const body = await response.arrayBuffer();
    const newResponse = new Response(body, {
        status: response.status,
        headers: new Headers(response.headers)
    });

    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    return newResponse;
  } catch (e) {
    return new Response(JSON.stringify({ error: "Proxy Error: " + e.message }), { 
        status: 500, 
        headers: corsHeaders 
    });
  }
}
