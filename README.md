# USED PRODUCTS Price Index

A small local web app for searching and sorting current secondhand product prices from USED PRODUCTS Romania.

## Run locally

Requires Node.js 18 or newer. No packages need to be installed.

On Windows, double-click `start.bat` for manual startup. Keep its window open while using the app, and press Ctrl+C in that window to stop it. If port 3000 is already occupied, the script reports that instead of trying to start a second server.

Alternatively, open a terminal in this project folder, run `npm start`, and open http://localhost:3000 in your browser.

Use the search field to find a product, filter by category or store, or sort by price. The header's **Price drops** menu opens the complete list of products with recorded price reductions, searchable and filterable by category. Product cards link to the original listing. The **Update prices** button checks the public feed and saves any changed prices.

## Data and refresh behavior

The app reads only the shop's public machine-readable feed at `https://usedproducts.ro/feed-ai-bot.json`. It does not crawl product pages or the site's search. The server caches feed checks for 15 minutes, shares concurrent refreshes, and serves the most recent saved snapshot if a later refresh fails. The **Update prices** button uses the same 15-minute interval.

Current products and price changes are persisted in `data/price-history.json` and survive server restarts. The app records the initial observed price and subsequent changes. The **Top price drops** section shows the biggest decline in each category compared with its highest recorded price in the last 30 days. It can take a later feed update to show price drops; no historical prices are fabricated. The local data file is ignored by Git.

Prices and availability can change; confirm details on the original product page. Product data is not persisted locally.

## Test

Run `npm test` to validate product-feed normalization and URL filtering.
