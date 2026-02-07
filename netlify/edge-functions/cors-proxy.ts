import { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  // ✅ HEADERS CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };

  // ✅ MANEJO DE PREFLIGHT (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // ✅ OBTENER URL DESTINO DESDE QUERY PARAMETERS
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = urlParams.get("url");

  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: "Falta el parámetro ?url=" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log("🔗 Edge Proxy request to:", targetUrl);

  try {
    // Clonar las cabeceras de la petición original (opcional)
    // O usar cabeceras personalizadas para evitar bloqueos
    const fetchHeaders = new Headers({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
    });

    // ✅ REALIZAR PETICIÓN AL DESTINO
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: fetchHeaders,
      // Si es POST o PUT, pasar el cuerpo
      body: request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : null,
    });

    // Obtener los datos como un stream o arrayBuffer para no corromper archivos binarios (imágenes, etc.)
    const body = await response.arrayBuffer();

    // Reenviar la respuesta con los headers de CORS
    return new Response(body, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=3600", // Opcional: Cachear resultados
      },
    });

  } catch (error) {
    console.error("❌ Edge Proxy Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
