const yts = require('yt-search');

exports.handler = async (event, context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  // Manejo de preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const query = event.queryStringParameters.q;
  const playlistId = event.queryStringParameters.id;

  if (!query && !playlistId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Falta parámetro ?id= o ?q=" })
    };
  }

  try {
    let items = [];
    let metadata = null;

    // MODO PLAYLIST
    if (playlistId) {
      console.log(`📋 Playlist ID: "${playlistId}"`);
      const list = await yts({ listId: playlistId });
      
      if (!list || !list.videos || list.videos.length === 0) {
        throw new Error("no_videos_found");
      }
      
      items = list.videos.map((v, index) => ({
        videoId: v.videoId,
        title: v.title || "Sin título",
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
        artist: v.author?.name || "Desconocido",
        duration: v.duration?.timestamp || "0:00",
        index: index + 1
      }));

      metadata = {
        title: list.title || "Playlist",
        videoCount: list.videos.length,
        thumbnail: list.thumbnail || items[0]?.thumbnail,
        url: list.url
      };
    } 
    // MODO BÚSQUEDA
    else if (query) {
      console.log(`🔍 Buscando: ${query}`);
      const r = await yts(query);
      
      if (r && r.videos) {
        items = r.videos.slice(0, 20).map(v => ({
          videoId: v.videoId,
          title: v.title || "Sin título",
          thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          artist: v.author?.name || "Desconocido",
          duration: v.timestamp || "0:00",
          isLive: false
        }));
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        items: items,
        metadata: metadata,
        continuation: null
      })
    };

  } catch (error) {
    console.error("❌ Error:", error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message, items: [] })
    };
  }
};
