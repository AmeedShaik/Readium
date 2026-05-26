# Readium

A 100% free, no-API-key news, jobs, and live-signals dashboard.
Aggregates content from 30+ open sources into one fast, mobile-friendly,
dark-mode-aware single-page app.

> Pure HTML / CSS / vanilla JavaScript. No build tools, no framework, no backend.

## Features

- **28 topic tabs** — Programming, AI, Data Science, Tech, Startup, Design,
  Science, Health, Finance, Python, JavaScript, Security, ML, Crypto, Gaming,
  Stocks, Forex, Commodities, Education, Career, LLM, Research, Jobs, Remote
  Jobs, Entertainment, News, plus a **Saved** tab.
- **Smart aggregation per topic** — DEV.to, Hacker News, Reddit, Medium, XDA,
  freeCodeCamp, TechCrunch, The Guardian, The Verge, IGN, Ars Technica, GitHub
  trending, HuggingFace, PapersWithCode, arXiv, BBC, Al Jazeera, NPR, IMDb,
  TVMaze, RAWG, RemoteOK.
- **Live signals panel** for Crypto / Stocks / Forex / Commodities — Binance,
  CoinCap, CoinGecko, Yahoo Finance (proxied), Frankfurter, ExchangeRate,
  metals.live, Alternative.me Fear &amp; Greed.
- **Entertainment showcase** with platform tabs (IMDb · Netflix · Amazon · Disney+ Hotstar)
  via TVMaze, plus today's TV schedule, free movies on Archive.org, and top games via RAWG.
- **News scope filter** — Global / Country (15 countries) / Local (geolocation-based).
- **Search**, **sort** (newest / oldest / shortest read), **trending tags**,
  **top authors**, **reading history**.
- **Bookmarks** persisted in `localStorage` (up to 50, dedup by URL).
- **Dark mode** with persisted preference.
- **Auto-refresh** every 10 minutes; pull-to-refresh on mobile.
- **Mobile bottom-nav and slide-out drawer**, sticky tabs, skeleton loaders,
  toast notifications.

## Project structure

```
.
├── index.html          # Markup (semantic; references styles.css and app.js)
├── styles.css          # All styles (light + dark themes via CSS variables)
├── app.js              # All client-side logic (~1.6k lines, vanilla JS)
├── .nojekyll           # Disable Jekyll on GitHub Pages
├── .github/workflows/
│   └── pages.yml       # GitHub Pages deploy workflow
└── legacy/
    └── readium-v5-fixed.html   # Previous single-file version (kept for reference)
```

## Run locally

This is a fully static site. Just open `index.html` in a browser **via a local
HTTP server** (some browsers restrict `fetch` from `file://`):

```sh
# Python 3
python3 -m http.server 8000

# Or Node (no install)
npx serve .
```

Then visit <http://localhost:8000>.

## Deploy to GitHub Pages

The repository ships with a Pages workflow at
`.github/workflows/pages.yml` that auto-deploys on every push to `main`.

To enable it once:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Push to `main` (or trigger the workflow manually). The site will be live at
   `https://<owner>.github.io/Readium/`.

If you'd rather skip the workflow, you can also pick **Deploy from a branch →
main / (root)** — `index.html` and `.nojekyll` are already at the repo root.

## Data & API notes

- All endpoints are public and unauthenticated. Several feeds are proxied
  through [api.allorigins.win](https://api.allorigins.win/) and
  [api.rss2json.com](https://rss2json.com/) to bypass CORS — these are public
  community proxies and may rate-limit or be intermittently unavailable.
- Reddit and a few other endpoints can be blocked from some IPs/regions; the
  app fails gracefully and shows what's available.
- "Signals" data is **for information only — not financial advice**.

## Privacy

- No tracking, no analytics, no cookies.
- Bookmarks, reading history, and theme preference are stored in your
  browser's `localStorage` only. Clearing site data wipes them.
- The "Local News" scope uses the browser **Geolocation API** with explicit
  user permission, then performs reverse geocoding via OpenStreetMap (no
  coordinates leave your browser other than to OSM/BBC/Guardian feeds).

## Browser support

Targets evergreen browsers (Chrome, Edge, Firefox, Safari, mobile Safari,
Android Chrome). Uses modern features: `AbortSignal.timeout`, `fetch`,
`IntersectionObserver`-free layout, `prefers-color-scheme`-aware dark mode,
`localStorage`.

## License

No license file is included yet. If you intend to share or fork this, add a
`LICENSE` (e.g. MIT) to clarify reuse terms.
