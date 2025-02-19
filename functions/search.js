exports.handler = async (event) => {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const cheerio = await import('cheerio');

    const query = event.queryStringParameters?.q || "daddy";

    try {
        console.log(`🔍 Buscando: ${query}`);

        const response = await fetch(`https://piped.nosebs.ru/results?search_query=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://piped.nosebs.ru/',
            }
        });

        if (!response.ok) {
            console.error(`❌ HTTP error! Status: ${response.status}`);
            return { statusCode: response.status, body: `Error fetching search results` };
        }

        const html = await response.text();
        console.log(`✅ HTML recibido (${html.length} caracteres)`);
        console.log(`🔎 Primeros 1000 caracteres:\n${html.substring(0, 1000)}`);

        const $ = cheerio.load(html);
        const results = [];

        $(".video-grid .flex.flex-col.flex-justify-between").each((i, element) => {
            try {
                const linkElement = $(element).find("a.link");
                const videoId = linkElement.attr("href")?.split("v=")[1] || "UNKNOWN";

                const title = linkElement.find("p").text().trim();
                const thumbnail = $(element).find("img.aspect-video").attr("src") || "NO IMAGE";

                console.log(`🎥 Video encontrado: ${title}, ID: ${videoId}, IMG: ${thumbnail}`);

                results.push({ title, thumbnail, videoId });
            } catch (err) {
                console.error("⚠️ Error al extraer datos:", err);
            }
        });

        console.log(`🔹 Videos encontrados: ${results.length}`);
        return { statusCode: 200, body: JSON.stringify(results) };
    } catch (error) {
        console.error("❌ Error scraping:", error);
        return { statusCode: 500, body: `Error scraping search results: ${error.message}` };
    }
};
