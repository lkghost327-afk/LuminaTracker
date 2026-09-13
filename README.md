# LuminaTracker

A local desktop app for regional shopping search, price tracking, bundle comparisons and optional browser-extension comparisons. React + Vite render the interface; Electron runs the backend and keeps settings and observations on your computer.

## Run and build

Requires Node.js 22.12+ or a newer supported LTS, and npm.

```sh
npm install
npm run electron:dev
```

For browser development using the same real backend: `npm run dev`, then open http://localhost:5173. Browser data is separate from desktop data. Desktop tracking notifications and secure desktop API-key storage require Electron. The version 2 browser extension is independent.

```sh
npm run electron:build
```

The Windows installer is created in `release/`, with the browser extension bundled alongside the installed application. To launch the production build without an installer: `npm run build`, then `npm run electron:start`.

## Standalone Edge extension

Publishing target: **Microsoft Edge Add-ons**. See [Edge submission status](store/EDGE-SUBMISSION.md). Chrome Web Store publication is not planned.

Version 2 is standalone: users do not need to install or run the desktop app. It has independent country/consent preferences and calls an online deal API. Automatic shopping-site offers are optional; current page URLs and prices are compared locally.

See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting, local testing and release steps, and [the store listing draft](store/STORE-LISTING.md) for publication preparation. No public API or store listing has been deployed yet. The generated preview displays Service setup pending until it is rebuilt with an actual HTTPS API URL.

```sh
npm run api:start
npm run extension:dev
```

Load `release/standalone-extension-dev` in Chrome/Edge for development. A production build uses `npm run extension:build -- --api-url https://YOUR-ACTUAL-SERVICE-HOST`. Users will receive the configured address in the published extension; no desktop pairing or user provider key is required.

The old 1.0 installer/extension artifacts are the previous companion release. New standalone packages are named `LuminaTracker-standalone-extension.zip`.
## Regional prices and live sources

- Automatic country detection uses ipapi.co, with device-region fallback. VPNs can affect detection. Choose a country in Settings to override it.
- The country selects storefronts and the native currency. Prices from different currencies are never silently mixed or converted.
- Direct adapters cover Amazon in 18 countries, eBay in 8, Flipkart/Meesho in India, and Walmart/Best Buy in the US. These are best-effort parsers, not guaranteed access. Retailers may block requests, require JavaScript, omit prices or change their markup.
- Live source status and retrieval timestamps are shown. Partial results appear while other stores respond. A two-minute cache limits repeated requests; **Refresh prices** bypasses it.
- No simulated prices, DummyJSON listings, random ratings or fabricated history are used.
- Missing delivery remains unknown. Confirm model, size, capacity, condition, seller, taxes and final charges at checkout.

For wider regional coverage, select **Google Shopping via SerpApi** in desktop Settings and enter your own API key. Keys are encrypted with operating-system storage and are not returned to the interface. Searches use your provider quota and country selection. Some results link to Google product-comparison pages and are labelled **View offer**. No key is bundled, and this path requires a valid provider account. See the [provider documentation](https://serpapi.com/google-shopping-api).

## Tracking and bundles

Track a result for an exact listing, or enter a precise model search. Exact Amazon trackers read the product page; other direct stores use structured offers where available. Search monitors require all meaningful query terms and reject obvious model, capacity and accessory mismatches. Each tracker retains its original country and currency when the browsing region changes.

Checks run every 5, 15, 30 or 60 minutes while the app is running and online. Closing minimizes to the tray; Quit stops it. These are periodic observations, not retailer push notifications. Target alerts require known item-plus-shipping totals. Unknown shipping records item-price-only history without triggering an alert. Repeated alerts are suppressed until a further drop or a new threshold crossing. Failed checks preserve the last observation.

Bundles find the cheapest matching listing per item and store. Missing products or unknown shipping leave the bundle incomplete. Combined delivery, coupons and checkout discounts are not assumed. Deal grades compare matching titles or GTINs in the same currency and condition with known shipping; they do not claim all-time lows.

## Local data and migration

Desktop data is `luminatracker_db.json` in Electron's user-data directory (normally `%APPDATA%/luminatracker` in development). Browser development uses `.lumina-dev/data.json`. Writes use temporary-file replacement and a `.bak` backup; unreadable originals are preserved.

Legacy data could mix currencies or contain simulated observations. Migration preserves a `.v1-backup`, marks old trackers for review and excludes uncertain history. Re-add those trackers with a country and target.

Searches contact selected stores or the provider. Automatic country detection contacts ipapi.co; product images and fonts load from their sources. There is no LuminaTracker cloud account.

## Validation

```sh
npm test
npm run test:desktop
npm run test:live -- IN Sony WH-1000XM5
npm audit
```

Tests cover parser regressions, currency isolation, model matching, unknown shipping, partial failures/timeouts, caching, bundles, migration, alert deduplication, extension extraction, service-worker messaging and companion authentication. Fixtures are explicit test data and never enter normal app searches. The desktop smoke test uses an isolated profile under `tmp/`.

Live diagnostics write `tmp/live-check-COUNTRY.json`; exit code 2 indicates no usable live listings. Successful test fixtures do not establish retailer availability or provider access. Verify the unpacked extension in the target browser before public distribution.

## Structure

- `shared/`: market routing, currency handling, matching and comparisons.
- `electron/scraper/`: bounded transport, HTML/structured-data parsing and search orchestration.
- `electron/database.cjs`, `electron/service.cjs`: local storage, settings and tracking.
- `electron/main.cjs`, `electron/preload.cjs`: desktop lifecycle and validated IPC.
- `electron/companion.cjs`: authenticated, loopback-only browser comparisons.
- `electron/dev-api.cjs`: localhost development API using the same service.
- `src/`: interface. `extension/`: browser extension. `tests/`: regression tests.

Register additional country-specific storefronts in `shared/markets.cjs`, add a parser in `electron/scraper/parsers.cjs`, and add representative regression fixtures. Preserve source currency and use `null` for unknown shipping.

The `GITHUB/` directory is an older duplicate snapshot. The runnable, updated implementation is at this project root.

MIT License — see LICENSE.
