# LuminaTracker standalone browser extension (v2)

The extension now connects directly to an online deal service. It does not use Electron, a localhost companion or desktop pairing. It has its own country and consent settings.

Build with `npm run extension:build` at the project root. Load the generated `release/standalone-extension` directory in Chrome/Edge; this source directory is not the installable bundle. Until a deployed API URL is configured, the preview explicitly displays Service setup pending.

For a local test with no desktop app, run `npm run api:start`, then `npm run extension:dev`, and load `release/standalone-extension-dev` in the browser. Enable comparisons and choose a country. The local Node API represents the online service for development.

For production deployment, service configuration, privacy disclosures and browser-store submission steps, read `DEPLOYMENT.md` at the project root and `store/STORE-LISTING.md`.

Automatic comparisons are optional and request only supported retailer-site permissions. Device-region/manual country selection is available by default; IP-based detection needs a separate opt-in. Only the query and selected country are sent to the deal service. Current product URL, identity, price and shipping are compared locally. Provider credentials stay on the server.

Retailers can block direct requests. The hosted service can use a server-side SerpApi key for wider coverage. Public hosting and browser-store publication have not yet been completed.
