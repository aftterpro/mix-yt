// functions/sponsorblock.js
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!videoId) {
    return new Response(JSON.stringify({ error: "Falta videoId" }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  try {
    const sbUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","intro","outro","interaction","selfpromo","music_offtopic","preview"]`;
    
    console.log('📡 Consultando SponsorBlock:', sbUrl);
    
    const response = await fetch(sbUrl, {
      headers: { "User-Agent": "YT-CrossMix/1.0" }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('ℹ️ Video sin segmentos:', videoId);
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }
      throw new Error(`SponsorBlock API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ ${data.length} segmentos para ${videoId}`);
    
    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Error SponsorBlock:', error);
    return new Response(JSON.stringify([]), { headers: corsHeaders });
  }
}
