import { Context } from "https://edge.netlify.com";
import yts from "npm:yt-search";

export default async (request: Request, context: Context) => {
  // Cabeceras CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const playlistId = url.searchParams.get("id"); // Tu app usa ?id= para playlists

  // Validación
  if (!query && !playlistId) {
    return new Response(JSON.stringify({ error: "Falta parámetro ?id= o ?q=" }), { status: 400, headers: corsHeaders });
  }

  try {
    let items = [];
    let metadata = null;

    // --- MODO PLAYLIST ---
    if (playlistId) {
      console.log(`📋 Buscando Playlist: ${playlistId}`);
      const list = await yts({ listId: playlistId });
      
      if (list && list.videos) {
        items = list.videos.map((v, index) => ({
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          artist: v.author?.name || "Desconocido",
          duration: v.timestamp || "0:00",
          index: index + 1
        }));

        metadata = {
          title: list.title,
          videoCount: list.videos.length,
          thumbnail: list.thumbnail,
          url: list.url
        };
      }
    } 
    // --- MODO BÚSQUEDA ---
    else if (query) {
      console.log(`🔍 Buscando: ${query}`);
      const r = await yts(query);
      
      if (r && r.videos) {
        items = r.videos.map(v => ({
          videoId: v.videoId,
          title: v.title,
          thumbnail: v.thumbnail,
          artist: v.author?.name || "Desconocido",
          duration: v.timestamp || "0:00",
          isLive: false // yt-search separa 'live' de 'videos'
        }));
      }
    }

    // Respuesta limpia
    return new Response(JSON.stringify({
      items: items,
      metadata: metadata,
      continuation: null // yt-search maneja la paginación internamente diferente, por ahora devolvemos null para simplificar
    }), { headers: corsHeaders });

  } catch (error) {
    console.error("Error Search:", error);
    return new Response(JSON.stringify({ error: error.message, items: [] }), { headers: corsHeaders });
  }
};