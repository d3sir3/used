# Workspace guidance

- This app reads only USED PRODUCTS Romania's public `/feed-ai-bot.json` feed; do not crawl product pages or disallowed paths.
- Keep feed caching at 15 minutes and do not persist or republish scraped content beyond the app's local display.
- Use Node.js built-ins where practical; the project requires Node.js 18 or newer.
