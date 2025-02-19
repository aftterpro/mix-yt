exports.handler = async (event) => {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

    const query = event.queryStringParameters?.q || "daddy"; // Valor por defecto

    try {
        console.log(`🔍 Buscando: ${query}`);

        const apiUrl = `https://pipedapi.nosebs.ru/search?q=${encodeURIComponent(query)}&filter=videos`;
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            console.error(`❌ HTTP error! Status: ${response.status}`);
            return { statusCode: response.status, body: `Error fetching search results` };
        }

        const data = await response.json();
        console.log(`✅ Datos obtenidos (${data.items.length} videos)`);

        return {
            statusCode: 200,
            body: JSON.stringify(data.items) // Enviar los resultados tal como los devuelve la API
        };
    } catch (error) {
        console.error("❌ Error en la API:", error);
        return {
            statusCode: 500,
            body: `Error fetching data: ${error.message}`,
        };
    }
};
