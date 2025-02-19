exports.handler = async (event) => {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const cheerio = (...args) => import('cheerio').then(({default: cheerio}) => cheerio(...args));

    const query = event.queryStringParameters.q;

    try {
        const response = await fetch(`https://piped.nosebs.ru/results?search_query=${encodeURIComponent(query)}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`HTTP error! status: ${response.status} - ${errorText}`);
            return {
                statusCode: response.status,
                body: `Error fetching search results: ${response.status} - ${errorText}`,
            };
        }

        const html = await response.text();

        const { load } = await import('cheerio');
        const $ = load(html);

        const results = [];
        // Selector actualizado: .stream-item-content
        $(".stream-item-content").each((i, element) => {
            try {
                // Selectores actualizados: h3.stream-title, img.stream-thumbnail, a.stream-link
                const title = $(element).find("h3.stream-title").text();
                const thumbnail = $(element).find("img.stream-thumbnail").attr("src");
                const videoId = $(element).find("a.stream-link").attr("href").split("v=")[1];

                results.push({
                    title,
                    thumbnail,
                    videoId,
                });
            } catch (innerError) {
                console.error("Error extracting data from one stream item:", innerError);
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
