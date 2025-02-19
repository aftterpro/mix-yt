// Netlify Function (ejemplo: functions/search.js)

const fetch = require('node-fetch'); // Necesitas instalar node-fetch: npm install node-fetch
const cheerio = require('cheerio'); // Necesitas instalar cheerio: npm install cheerio

exports.handler = async (event) => {
  const query = event.queryStringParameters.q; // Obtén la query del parámetro 'q'

  try {
    const response = await fetch(`https://piped.nosebs.ru/results?search_query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `Error fetching search results: ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html); // Carga el HTML en Cheerio

    const results = [];
    $('.stream-item').each((i, element) => { // Ajusta el selector '.stream-item' si es necesario
      const title = $(element).find('.stream-title').text(); // Ajusta '.stream-title'
      const thumbnail = $(element).find('.stream-thumbnail img').attr('src'); // Ajusta '.stream-thumbnail img'
      const videoId = $(element).find('.stream-link').attr('href').split('v=')[1]; // Extrae el ID

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