// src/search.js
import ytsr from 'ytsr'; // Asegúrate de que la librería sea compatible o usa una versión 'browser-compatible'

export async function handleSearch(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  try {
    const filters = await ytsr.getFilters(query);
    const filter = filters.get('Type').get('Video');
    const results = await ytsr(filter.url, { limit: 10 });
    
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
