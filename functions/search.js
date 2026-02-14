export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const playlistId = url.searchParams.get("id");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let items = [];

    // CASO 1: Búsqueda de Playlist
    if (playlistId) {
      // Usamos el endpoint AJAX de YouTube que es ligero y devuelve JSON
      const res = await fetch(`https://www.youtube.com/list_ajax?style=json&action_get_list=1&list=${playlistId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      
      if (!res.ok) throw new Error("Error fetching playlist");
      
      const data = await res.json();
      
      if (data.video) {
        items = data.video.map(v => ({
          videoId: v.encrypted_id,
          title: v.title,
          thumbnail: `https://i.ytimg.com/vi/${v.encrypted_id}/mqdefault.jpg`,
          artist: v.author,
          duration: v.length_seconds
        }));
      }
    } 
    // CASO 2: Búsqueda normal por palabras
    else if (query) {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept-Language": "es-ES,es;q=0.9"
        }
      });
      
      const html = await res.text();
      
      // Extraemos el JSON incrustado en el HTML (ytInitialData)
      // Esta regex busca el objeto JSON que contiene los resultados
      const match = html.match(/ytInitialData\s*=\s*({.+?});/);
      
      if (match && match[1]) {
        const json = JSON.parse(match[1]);
        
        // Navegamos por la estructura profunda de YouTube
        const contents = json.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
        const itemSection = contents?.find(c => c.itemSectionRenderer)?.itemSectionRenderer?.contents;
        
        if (itemSection) {
          items = itemSection
            .filter(i => i.videoRenderer)
            .map(i => {
              const v = i.videoRenderer;
              return {
                videoId: v.videoId,
                title: v.title?.runs[0]?.text || "Sin título",
                thumbnail: v.thumbnail?.thumbnails[0]?.url,
                artist: v.ownerText?.runs[0]?.text || "Desconocido",
                duration: v.lengthText?.simpleText || "0:00"
              };
            });
        }
      }
    }

    return new Response(JSON.stringify({ items }), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
