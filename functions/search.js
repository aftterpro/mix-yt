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

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let items = [];

    // Si es una Playlist, usamos este endpoint oficial (sin API KEY)
    if (playlistId) {
      const res = await fetch(`https://www.youtube.com/list_ajax?style=json&action_get_list=1&list=${playlistId}`);
      const data = await res.json();
      
      items = data.video.map(v => ({
        videoId: v.encrypted_id,
        title: v.title,
        thumbnail: `https://i.ytimg.com/vi/${v.encrypted_id}/mqdefault.jpg`,
        artist: v.author,
        duration: v.length_seconds
      }));
    } 
    // Si es búsqueda normal
    else if (query) {
      const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&pbj=1`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Apple..." }
      });
      const text = await res.text();
      
      // Extraemos los datos del JSON que YouTube inyecta en la página
      const regex = /ytInitialData\s*=\s*({.+?});/;
      const match = text.match(regex);
      if (match) {
        const json = JSON.parse(match[1]);
        const results = json.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
        
        items = results
          .filter(i => i.videoRenderer)
          .map(i => {
            const v = i.videoRenderer;
            return {
              videoId: v.videoId,
              title: v.title.runs[0].text,
              thumbnail: v.thumbnail.thumbnails[0].url,
              artist: v.ownerText.runs[0].text,
              duration: v.lengthText?.simpleText || "0:00"
            };
          });
      }
    }

    return new Response(JSON.stringify({ items }), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Error en servidor", details: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
