const puppeteer = require('puppeteer');
const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to get user input for the URL
function getInput() {
  return new Promise((resolve) => {
    const askUrl = () => {
      rl.question('Enter the URL to scrape (overframe.gg/build link): ', (url) => {
        // Use a regular expression to check if the URL matches the expected pattern
        const urlPattern = /^https:\/\/overframe\.gg\/build\/.+/;
        if (urlPattern.test(url)) {
          resolve(url);
        } else {
          console.log('Invalid URL. Please provide a valid overframe.gg/build link.');
          askUrl(); // Ask again for a valid URL
        }
      });
    };
    askUrl(); // Start asking for a valid URL
  });
}

// Function to fetch prices from warframe.market API
async function fetchWarframeMarketPrices(item) {
  try {
    // Replace spaces with underscores and make lowercase
    const formattedItem = item.replace(/\s/g, '_').toLowerCase();
    
    // Make a GET request to the warframe.market API
    const response = await axios.get(`https://api.warframe.market/v1/items/${formattedItem}/orders`, {
      params: {
        'include': 'item',
      },
      headers: {
        'accept': 'application/json',
        'Platform': 'pc',
      },
    });
    
    // Filter orders on user.status = "ingame" and order_type = "sell"
    const filteredOrders = response.data.payload.orders.filter(order => order.user.status === "ingame" && order.order_type === "sell");
    
    // Sort the filtered orders by mod_rank and platinum
    filteredOrders.sort((a, b) => b.mod_rank - a.mod_rank || a.platinum - b.platinum);
    
    const bestOrder = filteredOrders[0];
    if (!bestOrder) {
      throw new Error('No sell orders found');
    }

    return [bestOrder.platinum, bestOrder.user.ingame_name];
  } catch (error) {
    throw error;
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  try {
    // Get the URL from the command line input
    const url = await getInput();

    // Navigate to the specified URL
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('------------------------------------------');
    // Wait for the page to load
    await page.waitForSelector('.Mod_name__cGR4B', { timeout: 3000 });
    try {
      await page.waitForSelector('.ArcaneMod_name__QFfJZ', { timeout: 3000 });
    } catch (error) {
      console.log('No arcanes found');
      console.log('------------------------------------------');
    }

    // Initialize counters for mods and arcanes
    let modTotal = 0;
    let arcaneTotal = 0;

    // Extract text from matching elements of the selectors if they exist
    const arcaneModElements = await page.$$('.ArcaneMod_name__QFfJZ');
    const modElements = await page.$$('.Mod_name__cGR4B');

    if (arcaneModElements.length > 0) {
      const arcanes = await Promise.all(arcaneModElements.map(async (element) => {
        return (await element.getProperty('textContent')).jsonValue();
      }));
      
      // Fetch prices for each arcane concurrently
      const fetchArcanePromises = arcanes.map(async (item) => {
        try {
          const order = await fetchWarframeMarketPrices(item);
          console.log(`${item}   price: ${order[0]} platinum`);
          arcaneTotal += order[0];
          return order[0];
        } catch (error) {
          console.log(`${item} is untradeable`);
          return 0;
        }
      });

      await Promise.all(fetchArcanePromises);
      console.log('------------------------------------------');
    }

    if (modElements.length > 0) {
      const mods = await Promise.all(modElements.map(async (element) => {
        return (await element.getProperty('textContent')).jsonValue();
      }));

      // Fetch prices for each mod concurrently
      const fetchModPromises = mods.map(async (item) => {
        try {
          const order = await fetchWarframeMarketPrices(item);
          console.log(`${item}   price: ${order[0]} platinum`);
          modTotal += order[0];
          return order[0];
        } catch (error) {
          console.log(`${item} is untradeable`);
          return 0;
        }
      });

      await Promise.all(fetchModPromises);
    }

    // Close the browser and readline interface
    await browser.close();
    rl.close();
    if( arcaneTotal > 0) {
    console.log('------------------------------------------');
    console.log(`Total arcane price: ${arcaneTotal} platinum`);
    console.log(`Total mod price: ${modTotal} platinum`);
    console.log('------------------------------------------');
    console.log(`Total price: ${modTotal + arcaneTotal} platinum`);
    } else {
    console.log('------------------------------------------');
    console.log(`Total price: ${modTotal} platinum`);
    console.log('------------------------------------------');
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
