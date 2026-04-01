# CloudPrism (RosettaStone)

Proof-of-concept **FinOps / JWCC-style catalog browser**: compare **cloud service offerings**, **pricing** (JWCC + commercial list), and **exceptions** across **AWS, Azure, GCP, and Oracle**, with optional **PostgreSQL-backed** imports and **month-over-month catalog change** reporting.

## How it fits together

The app is a **static single-page UI** served by Nginx, talking to a **Node/Express API**. CSV uploads are processed by a **background worker** using **BullMQ** and **Redis**; canonical data lives in **PostgreSQL**.

```mermaid
flowchart LR
  subgraph browser [Browser]
    UI[SPA index.html]
  end
  subgraph compose [Docker Compose]
    web[web nginx :8080]
    api[api Express :3001]
    worker[worker]
    pg[(Postgres)]
    rq[(Redis)]
  end

  UI -->|static files| web
  UI -->|REST JSON| api
  api --> pg
  api --> rq
  worker --> rq
  worker --> pg
```

### Import path (CSV to database)

```mermaid
flowchart TD
  up[POST /api/import or batch] --> ci[Insert catalog_import row]
  ci --> enq[Enqueue job in Redis]
  enq --> w[Worker picks job]
  w --> parse[Parse CSV]
  parse --> ins[Insert pricing_item parent_service or exception_item]
  ins --> done[Update catalog_import status]
```

### Typical UI data path

```mermaid
flowchart TD
  load[Reload from API Admin] --> fetch[GET /pricing /exceptions /parent-services per CSP]
  fetch --> mem[In-memory catalogs]
  mem --> views[Services Pricing Exceptions Calculator]

  tab[Open Catalog Changes tab] --> imp[GET /imports last pricing months]
  imp --> chg[GET /pricing/changes paginated]
  chg --> chgView[Render deltas JWCC and commercial]
```

## Quick start

```powershell
docker compose up --build
```

| URL | Purpose |
|-----|---------|
| http://localhost:8080 | Web UI (static site) |
| http://localhost:3001 | API (`GET /health` to verify) |

Default DB user/database/password in Compose: `cloudprism`. Set a strong **`JWT_SECRET`** for anything beyond local use.

## Repository layout

| Path | Role |
|------|------|
| [`index.html`](index.html) | App shell, styles, main inline logic |
| [`src/app/`](src/app/) | Exceptions, catalog changes, reports modules |
| [`src/data/`](src/data/) | Taxonomy / diff / inference helpers |
| [`backend/`](backend/) | Express API, auth, worker entry |
| [`infra/`](infra/) | Nginx config, Postgres `init.sql` |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **Extended flowcharts** and component notes |
| [`FULLSTACK.md`](FULLSTACK.md) | Endpoints, env vars, tables, deployment notes |

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Flowcharts (runtime, import, UI tabs, optional local snapshot).
- **[FULLSTACK.md](FULLSTACK.md)** — API reference, environment variables, security posture for imports.

## License / status

Internal / PoC use unless otherwise noted. Verify categories and prices against official CSP documentation.
