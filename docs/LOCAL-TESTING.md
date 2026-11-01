# Local frontend testing with the WordPress API mock

This development-only mock serves the existing `public/prerender-properties.json` and `public/prerender-taxonomies.json` files. It uses Node's built-in HTTP server, binds only to `127.0.0.1:18765`, and makes no outgoing network requests.

## Start the mock API

Open the first VS Code terminal at the repository root:

```sh
cd ~/Documents/CasaPronto-Audit-2026-10-27/v1-rest-pagination
node scripts/local-mock-wordpress-api.mjs
```

Optional loading delay for testing loading indicators:

```sh
MOCK_DELAY_MS=700 node scripts/local-mock-wordpress-api.mjs
```

## Start Vite

Open a second VS Code terminal at the repository root and run:

```sh
cd ~/Documents/CasaPronto-Audit-2026-10-27/v1-rest-pagination
VITE_API_BASE_URL=http://127.0.0.1:18765/wp-json/casapronto/v1 npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open the local Vite URL, usually `http://127.0.0.1:5173`. The mock accepts browser origins `http://127.0.0.1:5173` and `http://localhost:5173` and exposes `X-WP-Total` and `X-WP-TotalPages` to JavaScript.

## Keep browser traffic local

The checked-in fixture contains production-hosted image URLs, and existing shared UI code contains a production-hosted logo and a hard-coded contact API. Before opening the local app, use the browser's DevTools **Network request blocking** panel and enable these patterns:

```text
*://casapronto.ro/*
*://*.casapronto.ro/*
```

This prevents the browser from sending those requests while leaving the Vite and mock loopback origins available. Images hosted on that domain will be blocked during the test. Do not submit contact forms or use other actions that target external services. The mock server itself has no outbound request code.

## Pagination and filtering checks

- **Initial 60 properties:** open the properties listing and confirm the initial request is `GET /anunturi?limit=60`. It returns the first 60 fixture records.
- **Full catalog pagination:** the frontend requests `per_page=200` and page 1, then requests each remaining page sequentially. With the current 4,904-property fixture this is 25 pages; pages 1–24 contain 200 records and page 25 contains 104. The paginated responses include `X-WP-Total: 4904` and `X-WP-TotalPages: 25` (values are calculated from the fixture at startup).
- **Search and filters:** wait for full-catalog loading to complete, then search for a term or use the category, zone, and status controls. The frontend should search across all loaded fixture records, including properties beyond the initial 60.
- **Out-of-range page:** a paginated request beyond the last page returns `[]` with the fixture's actual total headers. An empty fixture catalog would return `[]`, total `0`, and total pages `0`.
- **Input validation:** conflicting `limit` with `per_page` or `page`, malformed values, and duplicate pagination parameters return HTTP 400. `per_page` is capped at 200; `limit` remains capped at 100.

## Simulate a failed page and retry

Stop the mock with `Ctrl+C`, then restart it in the first terminal with:

```sh
MOCK_FAIL_PAGE=2 node scripts/local-mock-wordpress-api.mjs
```

Page 2 of `/anunturi?per_page=200&page=2` returns HTTP 500. The frontend should display its full-catalog error state while keeping the initial properties available. To verify recovery, stop the mock, restart it without `MOCK_FAIL_PAGE`, wait for it to be ready, then use the frontend's retry action.

`MOCK_DELAY_MS` may be combined with the failure flag, for example:

```sh
MOCK_FAIL_PAGE=2 MOCK_DELAY_MS=700 node scripts/local-mock-wordpress-api.mjs
```

The mock logs each request path and HTTP status to its terminal. It does not log credentials or request headers.

## Scope

This mock tests the frontend's JSON, pagination-header, and error-handling contract against the checked-in local fixtures. It does not execute or validate the proposed WordPress PHP callback, WordPress query behavior, hosting CORS behavior, or production data. The mock server is separate from the build, SSG, prefetch, and deployment scripts; do not point a production build or deployment process at it.
