import { Context } from "https://edge.netlify.com";
import yts from "https://esm.sh/yt-search@2.12.1";

export default async (request: Request, context: Context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const playlistId = url.searchParams.get("id");

  if (!query && !playlistId) {
    return new Response(
      JSON.stringify({ error: "Falta parámetro ?id= o ?q=" }), 
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    let items = [];
    let metadata = null;

    // MODO PLAYLIST
    if (playlistId) {
      console.log(`📋 Playlist ID: "${playlistId}"`);
      
      try {
        const list = await yts({ listId: playlistId });
        
        console.log(`📦 Respuesta yt-search:`, JSON.stringify(list, null, 2));
        
        if (!list) {
          console.error("❌ yt-search devolvió null/undefined");
          throw new Error("invalid_playlist");
        }
        
        // Verificar si hay videos
        if (!list.videos || !Array.isArray(list.videos) || list.videos.length === 0) {
          console.error("❌ No se encontraron videos en la playlist");
          throw new Error("no_videos_found");
        }
        
        items = list.videos.map((v, index) => ({
          videoId: v.videoId || v.videoId,
          title: v.title || "Sin título",
          thumbnail: v.thumbnail || v.image || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          artist: v.author?.name || v.author || "Desconocido",
          duration: v.timestamp || v.duration?.timestamp || "0:00",
          index: index + 1
        }));

        metadata = {
          title: list.title || "Playlist",
          videoCount: list.videos.length,
          thumbnail: list.thumbnail || (items[0]?.thumbnail),
          url: list.url || `https://www.youtube.com/playlist?list=${playlistId}`
        };
        
        console.log(`✅ Playlist cargada: ${items.length} videos`);
        
      } catch (ytError) {
        console.error("❌ Error en yt-search:", ytError);
        throw new Error("invalid_playlist");
      }
    } 
    // MODO BÚSQUEDA
    else if (query) {
      console.log(`🔍 Buscando: ${query}`);
      const r = await yts(query);
      
      if (r && r.videos) {
        items = r.videos.slice(0, 20).map(v => ({
          videoId: v.videoId,
          title: v.title || "Sin título",
          thumbnail: v.thumbnail || v.image || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          artist: v.author?.name || v.author || "Desconocido",
          duration: v.timestamp || v.duration?.timestamp || "0:00",
          isLive: false
        }));
      }
    }

    return new Response(JSON.stringify({
      items: items,
      metadata: metadata,
      continuation: null
    }), { headers: corsHeaders });

  } catch (error) {
    console.error("❌ Error en playlist/búsqueda:", error.message);
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        items: [],
        metadata: null 
      }), 
      { status: 500, headers: corsHeaders }
    );
  }
};

