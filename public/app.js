const grid = document.querySelector('#product-grid');
const messageState = document.querySelector('#message-state');
const searchInput = document.querySelector('#search-input');
const categoryFilter = document.querySelector('#category-filter');
const locationFilter = document.querySelector('#location-filter');
const sortSelect = document.querySelector('#sort-select');
const updateButton = document.querySelector('#update-button');
const loadMoreButton = document.querySelector('#load-more');
const priceDropSearch = document.querySelector('#price-drop-search');
const priceDropCategory = document.querySelector('#price-drop-category');
const allPriceDropGrid = document.querySelector('#all-price-drop-grid');
const loadMoreDropsButton = document.querySelector('#load-more-drops');
const allDropsCount = document.querySelector('#all-drops-count');
const allDropsTotal = document.querySelector('#all-drops-total');
const allDropsEmpty = document.querySelector('#all-drops-empty');
const menuDropCount = document.querySelector('#menu-drop-count');
const resultsCount = document.querySelector('#results-count');
const productCount = document.querySelector('#product-count');
const updatedAt = document.querySelector('#updated-at');
const priceDropGrid = document.querySelector('#price-drop-grid');
const dropEmpty = document.querySelector('#drop-empty');
const syncStatus = document.querySelector('#sync-status');

let products = [];
let priceDrops = [];
let visibleLimit = 48;
let visibleDropLimit = 48;
const PAGE_SIZE = 48;

const formatPrice = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function safeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setMessage(title, detail) {
  grid.replaceChildren();
  messageState.hidden = false;
  messageState.innerHTML = `<strong>${safeText(title)}</strong>${safeText(detail)}`;
}

function populateFilter(select, values, placeholder) {
  const currentValue = select.value;
  select.replaceChildren(new Option(placeholder, ''));
  values.forEach((value) => select.add(new Option(value, value)));
  if (values.includes(currentValue)) select.value = currentValue;
}

function visibleProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase('ro');
  const filtered = products.filter((product) => {
    const searchable = `${product.name} ${product.category} ${product.location} ${product.condition}`.toLocaleLowerCase('ro');
    return (!query || searchable.includes(query))
      && (!categoryFilter.value || product.category === categoryFilter.value)
      && (!locationFilter.value || product.location === locationFilter.value);
  });

  if (sortSelect.value === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  if (sortSelect.value === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  if (sortSelect.value === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  return filtered;
}

function renderProducts() {
  const shown = visibleProducts();
  const visible = shown.slice(0, visibleLimit);
  resultsCount.textContent = `Showing ${visible.length.toLocaleString('ro-RO')} of ${shown.length.toLocaleString('ro-RO')} matching products`;
  messageState.hidden = true;
  loadMoreButton.hidden = shown.length <= visibleLimit;

  if (shown.length === 0) {
    setMessage('No products found', 'Try another search or clear one of the filters.');
    return;
  }

  grid.innerHTML = visible.map((product) => `
    <article class="product-card">
      <div class="card-meta">
        <span class="category-tag">${safeText(product.category || 'Product')}</span>
        <span class="condition-tag">${safeText(product.condition)}</span>
      </div>
      <h3 class="product-name">${safeText(product.name)}</h3>
      <div class="card-bottom">
        <span class="product-price">${formatPrice.format(product.price)}<small>RON</small></span>
        <span class="location" title="${safeText(product.location)}">${safeText(product.location || 'Online')}</span>
      </div>
      <a class="open-product" href="${safeText(product.url)}" target="_blank" rel="noopener noreferrer">View product <span aria-hidden="true">↗</span></a>
    </article>
  `).join('');
}

function renderPriceDrops(drops) {
  dropEmpty.hidden = drops.length > 0;
  priceDropGrid.innerHTML = drops.map((product) => `
    <article class="drop-card">
      <p class="drop-category">${safeText(product.category)}</p>
      <span class="drop-badge">−${product.dropPercent.toFixed(1)}%</span>
      <h3 class="drop-name">${safeText(product.name)}</h3>
      <div class="drop-bottom">
        <div class="drop-prices">
          <span class="drop-old-price">${formatPrice.format(product.previousPrice)} RON</span>
          <span class="drop-new-price">${formatPrice.format(product.price)} RON</span>
        </div>
        <span class="drop-location" title="${safeText(product.location)}">${safeText(product.location || 'Online')}</span>
      </div>
      <a class="drop-link" href="${safeText(product.url)}" target="_blank" rel="noopener noreferrer">View deal <span aria-hidden="true">↗</span></a>
    </article>
  `).join('');
}

function renderAllPriceDrops() {
  const query = priceDropSearch.value.trim().toLocaleLowerCase('ro');
  const matches = priceDrops.filter((product) => {
    const searchable = `${product.name} ${product.category} ${product.location}`.toLocaleLowerCase('ro');
    return (!query || searchable.includes(query))
      && (!priceDropCategory.value || product.category === priceDropCategory.value);
  });
  const visible = matches.slice(0, visibleDropLimit);

  allDropsCount.textContent = `Showing ${visible.length.toLocaleString('ro-RO')} of ${matches.length.toLocaleString('ro-RO')} price drops`;
  allDropsEmpty.hidden = matches.length > 0;
  loadMoreDropsButton.hidden = matches.length <= visibleDropLimit;
  allPriceDropGrid.innerHTML = visible.map((product) => `
    <article class="drop-card">
      <p class="drop-category">${safeText(product.category || 'Other')}</p>
      <span class="drop-badge">−${product.dropPercent.toFixed(1)}%</span>
      <h3 class="drop-name">${safeText(product.name)}</h3>
      <div class="drop-bottom">
        <div class="drop-prices">
          <span class="drop-old-price">${formatPrice.format(product.previousPrice)} RON</span>
          <span class="drop-new-price">${formatPrice.format(product.price)} RON</span>
        </div>
        <span class="drop-location" title="${safeText(product.location)}">${safeText(product.location || 'Online')}</span>
      </div>
      <a class="drop-link" href="${safeText(product.url)}" target="_blank" rel="noopener noreferrer">View product <span aria-hidden="true">↗</span></a>
    </article>
  `).join('');
}

async function loadProducts(update = false) {
  updateButton.disabled = true;
  updateButton.classList.add('is-loading');
  syncStatus.textContent = update ? 'Checking the latest feed and recording price changes…' : 'Loading saved catalog…';
  resultsCount.textContent = 'Loading products…';
  messageState.hidden = true;
  try {
    const response = await fetch(update ? '/api/update-prices' : '/api/products', {
      method: update ? 'POST' : 'GET',
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load products.');

    products = result.products;
    priceDrops = result.priceDrops || [];
    renderPriceDrops(result.topDrops);
    menuDropCount.textContent = priceDrops.length.toLocaleString('ro-RO');
    allDropsTotal.textContent = `${priceDrops.length.toLocaleString('ro-RO')} PRICE DROPS`;
    productCount.textContent = products.length.toLocaleString('ro-RO');
    const updated = new Date(result.fetchedAt);
    updatedAt.textContent = result.stale ? 'Cached data' : updated.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    const nextUpdate = new Date(result.nextUpdateAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    syncStatus.textContent = result.stale
      ? 'Feed unavailable; showing the saved catalog.'
      : result.updated
        ? 'Prices updated and saved. Price drops are compared with the previous saved prices.'
        : update
          ? `Prices were checked recently. The next feed update is available after ${nextUpdate}.`
          : 'Saved prices and price history loaded.';
    populateFilter(categoryFilter, [...new Set(products.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), 'All categories');
    populateFilter(locationFilter, [...new Set(products.map((item) => item.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), 'All locations');
    populateFilter(priceDropCategory, [...new Set(priceDrops.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ro')), 'All categories');
    visibleDropLimit = PAGE_SIZE;
    renderAllPriceDrops();
    renderProducts();
  } catch (error) {
    productCount.textContent = '—';
    updatedAt.textContent = 'Unavailable';
    resultsCount.textContent = 'Catalog unavailable';
    syncStatus.textContent = '';
    setMessage('Could not load the catalog', `${error.message} Check your connection and try again.`);
  } finally {
    updateButton.disabled = false;
    updateButton.classList.remove('is-loading');
  }
}

[searchInput, categoryFilter, locationFilter, sortSelect].forEach((control) => {
  control.addEventListener(control === searchInput ? 'input' : 'change', () => {
    visibleLimit = PAGE_SIZE;
    renderProducts();
  });
});
loadMoreButton.addEventListener('click', () => {
  visibleLimit += PAGE_SIZE;
  renderProducts();
});
for (const control of [priceDropSearch, priceDropCategory]) {
  control.addEventListener(control === priceDropSearch ? 'input' : 'change', () => {
    visibleDropLimit = PAGE_SIZE;
    renderAllPriceDrops();
  });
}
loadMoreDropsButton.addEventListener('click', () => {
  visibleDropLimit += PAGE_SIZE;
  renderAllPriceDrops();
});
updateButton.addEventListener('click', () => loadProducts(true));
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

loadProducts();
