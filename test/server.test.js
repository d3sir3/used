const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  getPriceDrop,
  getAllPriceDrops,
  getTopDrops,
  loadStore,
  mergeProducts,
  normalizeProducts,
  saveStore,
} = require('../server');

test('normalizes valid product rows and chooses a category fallback', () => {
  const [product] = normalizeProducts([{
    id: 'item-1',
    name: 'Used phone',
    price: '1250.5000',
    url: 'https://usedproducts.ro/used-phone',
    condition: 'Folosit',
    location: 'Cluj-Napoca',
    category: 'Phones',
  }]);

  assert.deepEqual(product, {
    id: 'item-1',
    name: 'Used phone',
    price: 1250.5,
    condition: 'Folosit',
    location: 'Cluj-Napoca',
    category: 'Phones',
    url: 'https://usedproducts.ro/used-phone',
  });
});

test('drops rows with invalid prices or non-store links', () => {
  const products = normalizeProducts([
    { name: 'Bad price', price: 'free', url: 'https://usedproducts.ro/item' },
    { name: 'Other host', price: 100, url: 'https://example.com/item' },
    { name: 'HTTP link', price: 100, url: 'http://usedproducts.ro/item' },
    { name: 'Valid item', price: 100, url: 'https://usedproducts.ro/item' },
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Valid item');
});

test('rejects a feed that is not an array', () => {
  assert.throws(() => normalizeProducts({ products: [] }), /JSON array/);
});

test('persists product data and price history across loads', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'usedproducts-index-'));
  const filePath = path.join(directory, 'price-history.json');
  const store = { version: 1, lastFetchedAt: 123, products: [{ id: 'item-1', price: 90 }] };

  try {
    await saveStore(store, filePath);
    assert.deepEqual(await loadStore(filePath), store);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('records price changes and calculates the 30-day drop', () => {
  const initial = mergeProducts([], [{ id: 'item-1', name: 'Phone', price: 100, category: 'Phones' }], 1_000);
  const updated = mergeProducts(initial, [{ id: 'item-1', name: 'Phone', price: 80, category: 'Phones' }], 2_000);

  assert.equal(updated[0].priceHistory.length, 2);
  assert.deepEqual(getPriceDrop(updated[0], 2_000), {
    previousPrice: 100,
    dropAmount: 20,
    dropPercent: 20,
  });
});

test('does not count duplicate feed rows from one snapshot as a price drop', () => {
  const sameSnapshot = mergeProducts([], [
    { id: 'item-1', name: 'Phone', price: 100, category: 'Phones' },
    { id: 'item-1', name: 'Phone', price: 80, category: 'Phones' },
  ], 1_000);

  assert.equal(sameSnapshot.length, 1);
  assert.equal(sameSnapshot[0].price, 80);
  assert.equal(getPriceDrop(sameSnapshot[0], 1_000), null);
});

test('shows only the largest drop for each category and ignores expired highs', () => {
  const now = Date.now();
  const products = [
    { id: 'a', name: 'A', category: 'Phones', price: 80, priceHistory: [{ price: 100, observedAt: now - 1_000 }, { price: 80, observedAt: now }] },
    { id: 'b', name: 'B', category: 'Phones', price: 70, priceHistory: [{ price: 90, observedAt: now - 2_000 }, { price: 70, observedAt: now }] },
    { id: 'c', name: 'C', category: 'Laptops', price: 50, priceHistory: [{ price: 100, observedAt: now - 31 * 24 * 60 * 60 * 1000 }, { price: 50, observedAt: now }] },
  ];
  const drops = getTopDrops(products, now);
  const allDrops = getAllPriceDrops(products, now);

  assert.equal(drops.length, 1);
  assert.equal(drops[0].id, 'b');
  assert.equal(drops[0].dropPercent, (20 / 90) * 100);
  assert.deepEqual(allDrops.map((product) => product.id), ['b', 'a']);
});
