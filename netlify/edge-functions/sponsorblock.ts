import { Context } from "https://edge.netlify.com";

export default async (request: Request, context: Context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-UserID",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId") || url.searchParams.get("id");
  const userId = request.headers.get("x-userid") || "anon";

  if (!videoId) {
    return new Response(JSON.stringify({ error: "Falta videoId" }), { status: 400, headers: corsHeaders });
  }

  try {
    // Categorías oficiales
    const categories = ["sponsor", "intro", "outro", "selfpromo", "music_offtopic", "interaction"];
    const targetUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${JSON.stringify(categories)}`;

    // Timeout de 2.5 segundos para no colgar la Edge Function
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(id);

    if (response.status === 404) {
      return new Response("[]", { headers: corsHeaders }); // No hay segmentos, array vacío
    }

    if (!response.ok) {
      throw new Error(`Error API: ${response.status}`);
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } catch (error) {
    // Si falla o timeout, devolvemos array vacío para no romper la app
    return new Response("[]", { headers: corsHeaders });
  }
};