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

    // Wait for the selectors to load
    await Promise.all([
      page.waitForSelector('.ArcaneMod_name__QFfJZ'),
      page.waitForSelector('.Mod_name__cGR4B')
    ]);

    // Extract text from all matching elements of the selectors
    const [arcaneModElements, modElements] = await Promise.all([
      page.$$('.ArcaneMod_name__QFfJZ'),
      page.$$('.Mod_name__cGR4B')
    ]);

    const arcanes = await Promise.all(arcaneModElements.map(async (element) => {
      return (await element.getProperty('textContent')).jsonValue();
    }));

    const mods = await Promise.all(modElements.map(async (element) => {
      return (await element.getProperty('textContent')).jsonValue();
    }));

    // Close the browser and readline interface
    await browser.close();
    rl.close();

    // Initialize counters for mods and arcanes
    let modTotal = 0;
    let arcaneTotal = 0;

    // Fetch prices for each mod and arcane concurrently
    const fetchPromises = [...mods, ...arcanes].map(async (item) => {
      try {
        const order = await fetchWarframeMarketPrices(item);
        console.log(`${item}   price: ${order[0]} platinum`);
        // Update the respective total based on the item type
        if (mods.includes(item)) {
          modTotal += order[0];
        } else {
          arcaneTotal += order[0];
        }
        return order[0];
      } catch (error) {
        console.log(`${item} is untradeable`);
        return 0;
      }
    });

    const prices = await Promise.all(fetchPromises);
    console.log('------------------------------------------');
    console.log(`Total mod price: ${modTotal} platinum`);
    console.log(`Total arcane price: ${arcaneTotal} platinum`);
  } catch (error) {
    console.error('An error occurred:', error);
  }
})();
