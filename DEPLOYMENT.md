# Standalone extension and online service

Version 2 of the extension requires no desktop application. It sends a product query and country to an online API, then compares the current page's identity and price locally. Current page URLs and prices are not sent to the API. Users choose country and automatic comparisons in the extension itself.

The implementation and deployment files are ready locally. **No public API has been deployed, and no browser-store submission has been made.** The supplied production preview ZIP displays “Service setup pending” until it is rebuilt with your deployed service URL. No hosting account or shopping-provider key has been supplied.

## Test without Electron

```sh
npm install
npm run api:start
```

In a second terminal:

```sh
npm run extension:dev
```

Open `edge://extensions` or `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `release/standalone-extension-dev`. Enable comparisons and choose a country. The development API runs on port 8787; this simulates a hosted service, not a desktop-app dependency. Once deployed, users only need the extension.

```sh
npm test
npm run test:extension-browser
```

The browser test launches Edge with a separate temporary profile and a real HTTP API with explicit test fixtures. It checks the actual extension service worker, popup, consent and comparison flow. It never starts Electron. It does not establish live retailer availability.

## Deploy the API

The service works with any Docker-capable host. `server/Dockerfile` uses Node 24, runs as an unprivileged user and includes only the backend's runtime files. It has no database dependency.

```sh
docker build -f server/Dockerfile -t luminatracker-api .
docker run --env-file server/.env -p 8787:8787 luminatracker-api
```

Copy `server/.env.example` to `server/.env` and fill it locally. Environment files are ignored by Git and the Docker context. Never put a provider key in the extension, its public config, or the store ZIP.

For Render, put this project in your own Git repository, create a Blueprint from `render.yaml`, and fill the prompted environment variables. The Blueprint explicitly chooses the free plan; check its current limits before deployment. Free services can sleep, so use an appropriate always-on plan before offering reliable public comparisons. See [Render Blueprints](https://render.com/docs/blueprint-spec) and [free service limitations](https://render.com/docs/free).

Set these environment variables on the server:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Reject callers outside the configured extension IDs. |
| `ALLOWED_EXTENSION_IDS` | Comma-separated Chrome/Edge extension IDs; obtain a development ID from the browser Extensions page. Add each store-assigned ID before distribution. |
| `PUBLISHER_NAME` | Your actual publisher name, shown in the public privacy page. |
| `SUPPORT_URL` or `SUPPORT_EMAIL` | Your actual HTTPS support page or email. When both are set, the URL is used. |
| `SERPAPI_KEY` | Optional server-only Google Shopping provider key for wider retailer coverage. Without it the service uses direct retailer adapters. |
| `DAILY_SEARCH_LIMIT` | Default 100 accepted comparisons per UTC day, per running server process. |
| `SEARCHES_PER_MINUTE` | Default 12 comparisons per client IP per minute. |
| `MAX_CONCURRENT_SEARCHES` | Default 4 active comparisons. |
| `TRUST_PROXY_HOPS` | Number of trusted reverse proxies. Default 0; the Render template assumes its one front proxy. Verify this against your actual hosting topology. |

Use one instance for the initial deployment. Limits and caches are in memory and reset on restart; they are not a persistent billing cap. Set the provider's account quota/spending controls. Extension-origin filtering and CORS are not authentication against arbitrary HTTP clients. Before scaling publicly, add gateway abuse protection and durable per-user quotas if your usage requires them.

`GET /health` reports whether publisher details and allowed extension IDs are configured. `GET /privacy` serves the policy with your publisher/contact details. `POST /v1/search` accepts only `{ "query": "Sony WH-1000XM5", "country": "IN" }` from allowed extension origins. There are no tracking, arbitrary URL-fetching or administration endpoints.

The service does not log request bodies or persist search histories. Review hosting/upstream logging and retention settings, then review the supplied privacy text against your actual operation before publishing. Do not put secrets in support fields or public configuration.

## Connect the production extension

After your host supplies an HTTPS origin:

```sh
npm run extension:build -- --api-url https://YOUR-ACTUAL-SERVICE-HOST
```

This creates `release/standalone-extension/` and `release/LuminaTracker-standalone-extension.zip`. The backend address is built in; users do not enter an API address or provider key. Production builds reject localhost and placeholder service domains. Developer builds are separately named and packaged.

Set `PUBLISHER_NAME`, either `SUPPORT_URL` or `SUPPORT_EMAIL`, and `LUMINA_API_URL` in your build environment, then run:

```sh
npm run extension:store
```

Store packaging checks the HTTPS service's health and public privacy page. It refuses to label an unconfigured development build as ready for submission. It does not upload or publish anything.

If you need a store-assigned extension ID first, upload a normal configured build as a draft after registering your publisher account, add that ID to the server allowlist, then rerun the store build and test it. Do not submit an unconfigured preview for review.

## Microsoft Edge Add-ons publication

The selected release target is Microsoft Edge Add-ons. The Manifest V3 extension remains compatible with Chromium browsers, but Chrome Web Store publication is not planned. Edge approval is subject to Microsoft review. See `store/EDGE-SUBMISSION.md`.

1. Register in the Microsoft Edge extension program through Partner Center. The Edge program has no registration fee. Hosting and shopping-data costs are separate.
2. Deploy and test the API, supply the actual publisher/contact details, and verify live results in the target regions.
3. Build the configured production ZIP. Prepare the listing and data disclosures using `store/STORE-LISTING.md`.
4. Capture genuine screenshots from the working production extension. Do not use the automated test's fixture results as live-price advertising.
5. Upload the ZIP, add the public privacy/support URLs, declare permissions/data handling, and provide reviewer instructions. Keep the API available during review.
6. Submit for review through your own developer account. This repository does not contain store credentials and has not been submitted.

Official instructions: [Chrome registration](https://developer.chrome.com/docs/webstore/register/), [Chrome publication](https://developer.chrome.com/docs/webstore/publish/), [Chrome data disclosures](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Edge registration](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), [Edge publication](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Remaining release work

A hosting account, deployed HTTPS URL, actual publisher/support information, browser-store developer account and real production screenshots are still needed. SerpApi is optional but direct retailer access is unreliable and must not be advertised as universal coverage. No provider key or hosting purchase is required to run the local tests. Docker image execution requires Docker; the local Node API is separately tested.

The earlier `LuminaTracker Setup 1.0.0.exe` and `LuminaTracker-browser-extension.zip` are the previous desktop/companion release. Use the version 2 standalone files described here for the new extension.
