import yts from 'yt-search';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const playlistId = url.searchParams.get("id");

  // Headers para CORS (Permitir que tu frontend acceda)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  // Manejo de Preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!query && !playlistId) {
    return new Response(JSON.stringify({ error: "Falta parámetro ?q= o ?id=" }), {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    let responseData = {};

    if (playlistId) {
      // Lógica de Playlist
      const list = await yts({ listId: playlistId });
      const items = list.videos.map((v, index) => ({
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        artist: v.author?.name || "Desconocido",
        duration: v.duration?.timestamp || "0:00"
      }));
      responseData = { items, metadata: { title: list.title } };
    } else {
      // Lógica de Búsqueda
      const r = await yts(query);
      const items = r.videos.slice(0, 20).map(v => ({
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        artist: v.author?.name || "Desconocido",
        duration: v.timestamp || "0:00"
      }));
      responseData = { items };
    }

    return new Response(JSON.stringify(responseData), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
