# Full-stack runtime (CloudPrism / RosettaStone)

This repository ships a **static SPA** plus an **Express API**, **PostgreSQL**, **Redis**, and a **background worker** for CSV catalog imports and change tracking.

## Architecture

| Layer | Role |
|--------|------|
| **web** | Nginx serves the repo root (`index.html`, `src/`, assets) on port **8080**. Config: [`infra/nginx/default.conf`](infra/nginx/default.conf) sets **`client_max_body_size 100m`** (mounted in Compose). Raise this if you upload very large pricing CSVs through the UI. |
| **api** | Express on port **3001**: health, auth, read APIs, CSV upload → queue. |
| **worker** | Node process: BullMQ consumer; parses CSVs, writes Postgres, enqueues follow-up work. |
| **db** | PostgreSQL 16; catalog and auth tables (see below). |
| **redis** | BullMQ job queue and coordination. |

The browser loads data via `fetch` to the API (Admin → backend URL defaults to `http://localhost:3001`) and can persist a **local snapshot** of catalogs in `localStorage` for offline-ish reload. Snapshots **do not** include multi-month **`catalogHistoryByMonth`** (would exceed quota for large catalogs). The **Catalog Changes** tab loads **`GET /pricing/changes`** on first visit after an API catalog load (lazy), not during the main pricing fetch.

## Dependencies (runtime)

| Component | Purpose |
|-----------|---------|
| **nginx** (Docker `web`) | Static file hosting only. |
| **Node.js** (`api` / `worker` images) | Express, worker scripts. |
| **express**, **cors**, **multer** | HTTP API, CORS, multipart uploads. |
| **pg** | PostgreSQL client. |
| **bullmq**, **ioredis** | Job queue backed by Redis. |
| **csv-parse** | CSV ingestion in the worker. |
| **bcrypt**, **jsonwebtoken** | User passwords and JWT for `/api/login` / `requireAuth`. |

Frontend scripts are plain ES modules / IIFEs loaded from `index.html` (e.g. Chart.js from CDN where used). No bundler is required for the static site.

## Start (Docker Compose)

```powershell
docker compose up --build
```

- UI: **http://localhost:8080**
- API: **http://localhost:3001**
- Postgres: **localhost:5432** (user/db/password `cloudprism` in default compose)
- Redis: **localhost:6379**

Override secrets in production (at minimum **`JWT_SECRET`** in the `api` service).

## API endpoints

### Health

- **`GET /health`** — DB connectivity check; returns `{ ok, service }`.

### Auth

- **`POST /api/login`** — Body: credentials; returns JWT for authenticated calls.
- **`POST /api/users`** — **`requireAuth("admin")`** — create/update users.

### Imports (see server comments for security posture)

- **`POST /api/import`** — Multipart: `file`, `csp`, `importMonth` (`YYYY-MM`), `fileType` (`pricing` \| `parent` \| `exceptions`).
- **`POST /api/import/batch`** — Multipart: `files[]`, `importMonth`, optional `manifest` JSON (filename → `{ csp, fileType }`).
- **`GET /api/import/status/:importId`** — Import row from `catalog_import`.

> **Security note:** Import routes are **intentionally unauthenticated** in code for trusted-network / local batch flows. Restrict network access or re-enable `requireAuth` before any internet-facing deployment.

### Read APIs (catalogs)

Shared query parameters where supported:

- **`limit`**, **`offset`** — Pagination (defaults and caps set via `CATALOG_API_DEFAULT_LIMIT` / `CATALOG_API_MAX_LIMIT`).

| Method | Path | Query (examples) |
|--------|------|------------------|
| `GET` | `/imports` | — (last 200 imports) |
| `GET` | `/pricing` | `csp`, `q`, `focus_category`, **`import_month`** (`YYYY-MM`, optional — narrows rows to that pricing import month), `limit`, `offset` — rows include **`import_month`**, **`imported_at`**, **`import_source_file`** (from `catalog_import`). |
| `GET` | **`/pricing/changes`** | **`from`**, **`to`** (required `YYYY-MM`, distinct) — month-over-month diff over `pricing_item` + `catalog_import` (`schema_name = 'pricing'`). Optional: **`csp`**, **`change_type`** (`added` \| `removed` \| `updated`), **`limit`**, **`offset`**. Response: **`{ meta, rows }`** where **`meta`** has **`month_from`**, **`month_to`**, **`imported_at_from`**, **`imported_at_to`**, **`total`**, **`limit`**, **`offset`**; each row matches client diff shape (`change_type`, `csp`, `catalogitemnumber`, `title`, `cust_delta`, `cust_delta_pct`, `comm_delta`, `comm_delta_pct`, `month_from`, `month_to`). Uses latest `imported_at` per SKU within each month (`DISTINCT ON`). |
| `GET` | `/exceptions` | `csp`, `status`, `impact_level`, `service`, `limit`, `offset` — same import provenance fields as pricing. |
| `GET` | `/parent-services` | `csp`, `limit`, `offset` — same import provenance fields as pricing. |
| `GET` | `/changes` | `csp` (limit 1000) |
| `GET` | `/exception-changes` | `csp` (limit 1000) |

The **Exceptions** tab in the UI applies **additional client-side filters** after load (CSP toggle buttons aligned with Pricing, multi-select **Status** and **Impact**, service select, search). Server `/exceptions` filters remain optional for API consumers.

## Database tables

| Table | Purpose |
|--------|---------|
| `catalog_import` | Import audit: month, CSP, schema, checksum, status, row counts. |
| `pricing_item` | Pricing catalog rows (FOCUS-oriented columns, JWCC fields). |
| `parent_service` | Parent / mapping catalog (categories, impact, comparison subcategory, etc.). |
| `exception_item` | Exception library rows. |
| `exception_change_log` | Field-level exception diffs per import. |
| `change_log` | Pricing deltas between import months. |
| `users` | Local auth users (`password_hash`, roles). |

Schema source: `infra/db/init.sql`.

## Frontend layout (high level)

- **`index.html`** — Shell, styles, inline app logic (navigation, Services, Pricing, Admin, calculator, shared multi-select state).
- **`src/app/exceptions.js`** — Exceptions table, charts, CSV/PDF export, `renderExceptions` / `initExceptionsPage`.
- **`src/app/changes.js`** — Catalog change views where applicable.
- **`src/app/reports.js`** — **Reports** menu in the nav: runs built-in reports and opens a **print** window (user chooses **Save as PDF** in the browser), using the same pattern as Exceptions PDF export. Entry points: **`window.runCloudPrismReport(id)`**, extensibility via **`window.CLOUDPRISM_REPORTS_REGISTRY`**. **Exceptions library** delegates to **`exportExceptionsPdf`**. **Catalog changes summary** builds Chart.js figures from **`window.catalogChanges`** / **`window.catalogChangesMeta`** only (for API-backed changes, charts reflect the **current paginated page**, not the full multi-hundred-thousand-row diff).
- **`src/data/*.js`** — Taxonomy / inference helpers loaded as scripts.

Shared UI patterns:

- **Pricing** CSP filter: `priceFilters` + `pf-aws` … `pf-oracle` buttons.
- **Exceptions** CSP filter: `excCspFilters` + `exc-pf-*` buttons (same visual pattern, separate state so tabs do not clash).
- **Reports** dropdown (nav): on-demand reports; the browser must allow pop-ups for the print / Save as PDF flow.

## Environment variables (API / worker)

| Variable | Purpose |
|----------|---------|
| `PORT` | API listen port (default `3001`). |
| `DATABASE_URL` | Postgres connection string. |
| `REDIS_URL` | Redis for BullMQ. |
| `JWT_SECRET` | Sign JWTs (set a long random value in production). |
| `UPLOAD_DIR` | Writable directory for uploaded CSVs (default under `/tmp/...` in container). |
| `UPLOAD_MAX_FILE_MB` | Per-file upload size cap. |
| `CATALOG_API_DEFAULT_LIMIT` / `CATALOG_API_MAX_LIMIT` | Page size bounds for catalog GET endpoints. |
| `PRICING_CHANGES_DEFAULT_LIMIT` / `PRICING_CHANGES_MAX_LIMIT` | Page size bounds for **`GET /pricing/changes`** (defaults **1000** / **5000**). |
| `PRICING_INSERT_BATCH_SIZE` | Worker: rows per batched `INSERT` for pricing CSV (default **1000**, max 5000). |

## Intranet deployment

For an internal network, typical controls are: **firewall** or **private VPC** so only trusted clients reach `:8080` / `:3001`, **TLS termination** at a reverse proxy if needed, **rotated `JWT_SECRET`**, and **Postgres/Redis** not exposed publicly. Treat unauthenticated import endpoints as **sensitive**: segment them to admin subnets or protect with auth/network policy if the API is reachable beyond operators.

## Local development without Docker

You can run the API and worker from `backend/` with Node, point `DATABASE_URL` / `REDIS_URL` at local services, and open `index.html` via the static server of your choice—or serve the repo root with any static file server—while setting the UI’s backend URL to match.
