export async function handleSponsorBlock(request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("id"); // O como lo obtengas
  
  const apiUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}`;
  
  const response = await fetch(apiUrl);
  const data = await response.json();

  return new Response(JSON.stringify(data), {
    headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
    }
  });
}
