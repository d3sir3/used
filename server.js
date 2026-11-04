const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const FEED_URL = 'https://usedproducts.ro/feed-ai-bot.json';
const CACHE_TTL_MS = 15 * 60 * 1000;
const PRICE_DROP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORE_FILE = path.join(__dirname, 'data', 'price-history.json');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let pendingFetch = null;
let storePromise = loadStore();

function emptyStore() {
  return { version: 1, lastFetchedAt: 0, products: [] };
}

async function loadStore(filePath = STORE_FILE) {
  try {
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.products)) return emptyStore();
    return {
      version: 1,
      lastFetchedAt: Number(data.lastFetchedAt) || 0,
      products: data.products,
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read price history: ${error.message}`);
    return emptyStore();
  }
}

async function saveStore(data, filePath = STORE_FILE) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temporaryPath, JSON.stringify(data), 'utf8');
  await fsp.rename(temporaryPath, filePath);
}

function normalizeProducts(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('The product feed did not contain a JSON array.');
  }

  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];

    const name = String(row.name || '').trim();
    const price = Number(row.price);
    let productUrl;

    try {
      productUrl = new URL(String(row.url || ''));
    } catch {
      return [];
    }

    const allowedHost = productUrl.hostname === 'usedproducts.ro'
      || productUrl.hostname.endsWith('.usedproducts.ro');
    if (!name || !Number.isFinite(price) || !allowedHost || productUrl.protocol !== 'https:') {
      return [];
    }

    return [{
      id: String(row.id || productUrl.pathname),
      name,
      price,
      condition: String(row.condition || row.aesthetic_condition || '').trim(),
      location: String(row.location || '').trim(),
      category: String(row.category_main || row.category || '').trim(),
      url: productUrl.href,
    }];
  });
}

function mergeProducts(existingProducts, feedProducts, observedAt) {
  const byId = new Map(existingProducts.map((product) => [product.id, { ...product, active: false }]));

  const uniqueFeedProducts = new Map(feedProducts.map((product) => [product.id, product]));
  for (const product of uniqueFeedProducts.values()) {
    const previous = byId.get(product.id);
    const historyByTime = new Map();
    for (const entry of previous?.priceHistory || []) {
      if (Number.isFinite(Number(entry.price)) && Number.isFinite(Number(entry.observedAt))) {
        historyByTime.set(Number(entry.observedAt), { price: Number(entry.price), observedAt: Number(entry.observedAt) });
      }
    }
    const priceHistory = [...historyByTime.values()];
    if (!priceHistory.length || Number(priceHistory.at(-1).price) !== product.price) {
      priceHistory.push({ price: product.price, observedAt });
    }

    byId.set(product.id, {
      ...previous,
      ...product,
      active: true,
      firstSeenAt: previous?.firstSeenAt || observedAt,
      lastSeenAt: observedAt,
      priceHistory: priceHistory.slice(-100),
    });
  }

  return [...byId.values()];
}

function getPriceDrop(product, now = Date.now()) {
  const cutoff = now - PRICE_DROP_WINDOW_MS;
  const currentObservationAt = Number(product.lastSeenAt) || now;
  const previousHigh = (product.priceHistory || [])
    .filter((entry) => Number(entry.observedAt) >= cutoff
      && Number(entry.observedAt) < currentObservationAt
      && Number(entry.observedAt) <= now)
    .reduce((high, entry) => Math.max(high, Number(entry.price)), 0);

  if (previousHigh <= product.price) return null;
  const dropAmount = previousHigh - product.price;
  return {
    previousPrice: previousHigh,
    dropAmount,
    dropPercent: (dropAmount / previousHigh) * 100,
  };
}

function getTopDrops(products, now = Date.now()) {
  const bestByCategory = new Map();
  for (const product of getAllPriceDrops(products, now)) {
    const category = product.category || 'Other';
    const currentBest = bestByCategory.get(category);
    if (!currentBest || product.dropPercent > currentBest.dropPercent) {
      bestByCategory.set(category, product);
    }
  }

  return [...bestByCategory.values()].sort((a, b) => b.dropPercent - a.dropPercent);
}

function getAllPriceDrops(products, now = Date.now()) {
  return products.flatMap((product) => {
    const drop = getPriceDrop(product, now);
    if (!drop) return [];

    const { priceHistory, active, ...publicProduct } = product;
    return [{ ...publicProduct, ...drop }];
  }).sort((a, b) => b.dropPercent - a.dropPercent);
}

function formatCatalog(store, stale = false, updated = false) {
  const activeProducts = store.products.filter((product) => product.active);
  return {
    products: activeProducts.map(({ priceHistory, active, ...product }) => product),
    priceDrops: getAllPriceDrops(activeProducts),
    topDrops: getTopDrops(activeProducts),
    fetchedAt: store.lastFetchedAt,
    nextUpdateAt: store.lastFetchedAt + CACHE_TTL_MS,
    stale,
    updated,
  };
}

async function getProducts() {
  let store = await storePromise;
  if (store.lastFetchedAt && Date.now() - store.lastFetchedAt < CACHE_TTL_MS) {
    return formatCatalog(store);
  }
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    try {
      const response = await fetch(FEED_URL, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'UsedProductsPriceIndex/1.0 (public-feed reader)',
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Product feed returned HTTP ${response.status}.`);

      const observedAt = Date.now();
      const feedProducts = normalizeProducts(await response.json());
      const nextStore = {
        version: 1,
        lastFetchedAt: observedAt,
        products: mergeProducts(store.products, feedProducts, observedAt),
      };
      await saveStore(nextStore);
      store = nextStore;
      storePromise = Promise.resolve(store);
      return formatCatalog(store, false, true);
    } catch (error) {
      const savedStore = await storePromise;
      if (savedStore.products.some((product) => product.active)) return formatCatalog(savedStore, true);
      throw error;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

function serveStatic(requestPath, response) {
  const relativePath = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath.slice(1));
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Unable to read file');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/api/products' && request.method === 'GET') {
    try {
      const result = await getProducts();
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 502, {
        error: 'Could not load the public product feed. Please try again later.',
        detail: error.message,
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/update-prices' && request.method === 'POST') {
    try {
      const result = await getProducts();
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 502, {
        error: 'Could not update prices from the public product feed. Please try again later.',
        detail: error.message,
      });
    }
    return;
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      response.writeHead(405, { Allow: 'GET, POST' });
      response.end('Method not allowed');
      return;
    }
    sendJson(response, 404, { error: 'API route not found.' });
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Method not allowed');
    return;
  }

  serveStatic(requestUrl.pathname, response);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`USED PRODUCTS Price Index is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  getPriceDrop,
  getAllPriceDrops,
  getTopDrops,
  loadStore,
  mergeProducts,
  normalizeProducts,
  saveStore,
  server,
};
