// netlify/functions/search.js
//Instancias api
const pipedInstances = [
  "https://pipedapi.orangenet.cc",
  "https://api.piped.private.coffee",
    "https://pipedapi.reallyaweso.me",
    "https://pipedapi.ducks.party",
    "https://piapi.ggtyler.dev"
  // Agrega otras instancias aquí
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
  const instanceUrl =  getRandomPipedInstance(); // Usar las instancias
  const targetUrl = `${instanceUrl}/search?q=${encodeURIComponent(
    query
  )}&filter=videos`; // Añadir el parámetro filter
console.log("La url formada: ", targetUrl);
  
  try {
    const data = await fetchDataWithRetry(targetUrl);
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error("Error en la búsqueda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error en la búsqueda." }),
    };
  }
};
