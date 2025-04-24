//Instancias api
const pipedInstances = [
  "https://pipedapi.orangenet.cc",
  "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party"
   // "https://piapi.ggtyler.dev" carga lenta imagenes
];
function getRandomPipedInstance() {
  const randomIndex = Math.floor(Math.random() * pipedInstances.length);
  return pipedInstances[randomIndex];
}

async function fetchDataWithRetry(url, maxRetries = 3, retryDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${url}, retry ${retries + 1}:`, error);
      retries++;
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Lanza el error después de todos los reintentos
      }
    }
  }
}
exports.handler = async function (event, context) {
  const query = event.queryStringParameters.q;
  const nextPageToken = event.queryStringParameters.nextpage;
  const instanceUrl = getRandomPipedInstance();
  let targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(
    query
  )}&filter=videos`; // Añadir el parámetro filter
  console.log("Netlify Function: Target URL:", targetUrl); // Log URL
  

  try {
    const data = await fetchDataWithRetry(targetUrl);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (error) {

    console.error("!!! Netlify Function Error during search !!!");
    console.error("Query:", query);
    console.error("NextPage Token:", nextPageToken);
    console.error("Target URL attempted:", targetUrl);
    console.error("Error details:", error); 
    console.error("Error message:", error.message);

    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
          error: "Error al contactar el servicio de búsqueda externo (Piped).", 
          details: error.message, // Incluir mensaje de error real
          failedUrl: targetUrl // Informar qué URL falló
      }),
    };
  }
};
