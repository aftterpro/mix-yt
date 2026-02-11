export async function handleCorsProxy(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) return new Response("Missing URL", { status: 400 });

  // Preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Cloudflare-Worker/1.0)",
    },
  });

  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  return newResponse;
}
