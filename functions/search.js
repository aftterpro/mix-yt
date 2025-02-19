exports.handler = async (event) => {
  const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));
  const cheerio = (...args) =>
    import('cheerio').then(({ default: cheerio }) => cheerio(...args));

  const query = event.queryStringParameters.q;

  try {
    const response = await fetch(
      `https://piped.nosebs.ru/results?search_query=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `Error fetching search results: ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = await cheerio.load(html);

    const results = [];
    $(".stream-item").each((i, element) => {
      const title = $(element).find(".stream-title").text();
      const thumbnail = $(element).find(".stream-thumbnail img").attr("src");
      const videoId = $(element)
        .find(".stream-link")
        .attr("href")
        .split("v=")[1];

      results.push({
        title,
        thumbnail,
        videoId,
      });
    });

    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error("Error scraping search results:", error);
    return {
      statusCode: 500,
      body: "Error scraping search results",
    };
  }
};
