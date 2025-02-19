exports.handler = async (event) => {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const cheerio = (...args) => import('cheerio').then(({ default: cheerio }) => cheerio(...args));

    const query = event.queryStringParameters?.q || "daddy";

    try {
        const response = await fetch(`https://piped.nosebs.ru/results?search_query=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP error! status: ${response.status} - ${errorText}`);
            return { statusCode: response.status, body: `Error fetching search results: ${response.status} - ${errorText}` };
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const results = [];

        $(".video-grid .flex.flex-col.flex-justify-between").each((i, element) => {
            try {
                const linkElement = $(element).find("a.link");
                const videoId = linkElement.attr("href")?.split("v=")[1];

                if (!videoId) return; // Filtrar solo los videos

                const title = linkElement.find("p.link").attr("title");
                const thumbnail = $(element).find("img.aspect-video").attr("src");

                if (title && thumbnail && videoId) {
                    results.push({ title, thumbnail, videoId });
                }
            } catch (innerError) {
                console.error("Error extracting data from one video item:", innerError);
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify(results),
        };
    } catch (error) {
        console.error("Outer error scraping search results:", error);
        return {
            statusCode: 500,
            body: `Error scraping search results: ${error.message}`,
        };
    }
};
