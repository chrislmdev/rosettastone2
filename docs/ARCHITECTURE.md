# Architecture and flowcharts

This document expands on [README.md](../README.md) with Mermaid diagrams you can render in GitHub, GitLab, VS Code (preview), or any Mermaid-capable viewer.

## 1. Runtime topology (Docker Compose)

Services and how they connect:

```mermaid
flowchart TB
  subgraph host [Host machine]
    subgraph browser [Browser]
      SPA[CloudPrism SPA]
    end

    subgraph compose [Docker Compose]
      web[web nginx port 8080]
      api[api Node Express port 3001]
      worker[worker node src/worker.js]
      db[(db Postgres 16)]
      redis[(redis 7)]
    end
  end

  SPA -->|HTTP GET HTML JS CSS| web
  SPA -->|fetch REST| api
  api -->|SQL| db
  api -->|enqueue import jobs| redis
  worker -->|consume jobs| redis
  worker -->|SQL bulk insert| db
  web -.->|depends_on| api
```

**Volumes:** Postgres data, Redis AOF, shared `uploads` volume for CSV files between API (multer) and worker.

---

## 2. CSV import (single file)

```mermaid
flowchart TD
  client[Client UI or script] --> post[POST /api/import multipart]
  post --> validate[Validate csp importMonth fileType]
  validate --> row[INSERT catalog_import status pending]
  row --> job[enqueueImport to BullMQ]
  job --> apiReturn[Return importId jobId]
  workerPoll[Worker loop] --> claim[Claim job from Redis]
  claim --> read[Read file from UPLOAD_DIR]
  read --> infer[Resolve schema from fileType]
  infer --> batch[Batch INSERT into domain table]
  batch --> audit[UPDATE catalog_import row_count status]
```

**Domain tables:** `pricing_item`, `parent_service`, or `exception_item`, each referencing `catalog_import.id` as `import_id`.

---

## 3. Batch import

```mermaid
flowchart LR
  batch[POST /api/import/batch] --> many[Many files in one request]
  many --> each[Per file infer CSP and type]
  each --> loop[Same enqueue path as single import]
```

Optional **manifest** JSON maps filename to `{ csp, fileType }`. Filename heuristics apply when manifest is partial.

---

## 4. Browser: load catalogs from API

```mermaid
flowchart TD
  user[User clicks Reload from API] --> base[Read Admin backend URL and token]
  base --> p[Parallel GET per CSP]
  p --> p1[/pricing limit offset/]
  p --> p2[/exceptions/]
  p --> p3[/parent-services/]
  p1 --> merge[Merge into csoPricingData csoExceptionData csOParentServiceData]
  p2 --> merge
  p3 --> merge
  merge --> snap[Optional persistCatalogSnapshot localStorage]
  merge --> refresh[refreshAllViewsAfterDataLoad]
  refresh --> r1[renderServices renderPricing renderExceptions calcRun]
```

**Note:** `catalogHistoryByMonth` is cleared on API reload so **Catalog Changes** does not use stale browser-only history.

---

## 5. Browser: Catalog Changes tab (lazy, large catalogs)

```mermaid
flowchart TD
  open[User opens Catalog Changes tab] --> src{Data source}
  src -->|Two months in browser CSV history| client[computeCatalogChanges in diff.js]
  src -->|API-backed| imp[GET /imports distinct pricing import_month]
  imp --> pick[Pick last two months chronologically]
  pick --> delta[GET /pricing/changes from to limit offset]
  delta --> page[Render table and meta pagination]
  client --> page
```

Server-side diff avoids loading two full months of pricing into memory for **very large** catalogs.

---

## 6. Browser: Reports dropdown (PDF via print)

```mermaid
flowchart LR
  nav[Reports select] --> reg[runCloudPrismReport id]
  reg --> exc[exportExceptionsPdf or catalog charts]
  exc --> chart[Chart.js to canvas toDataURL]
  chart --> win[window.open print document]
  win --> pdf[User Save as PDF]
```

Runs **on demand** only; no background polling.

---

## 7. Optional local snapshot (no API)

```mermaid
flowchart TD
  admin[Admin CSV upload in browser] --> raw[handleAdminCSVRaw]
  raw --> arrays[Fill in-memory arrays]
  arrays --> persist[persistCatalogSnapshot]
  persist --> ls[localStorage JSON v1]
  restore[Restore snapshot] --> ls
  restore --> arrays2[Reload arrays]
```

Snapshot stores **pricing, exceptions, parent** arrays only — not full multi-month history (quota). **Exception month-over-month** deltas in the UI are **API-backed** (`GET /exceptions/changes`); the snapshot alone does not retain per-month exception snapshots for diffing.

---

## 8. Frontend module map (high level)

```mermaid
flowchart TB
  index[index.html inline script] --> data[src/data diff taxonomy focusInference]
  index --> exc[src/app exceptions.js]
  index --> chg[src/app changes.js]
  index --> rep[src/app reports.js]
  index --> cdn[Chart.js CDN]

  exc --> cdn
  rep --> cdn
```

---

## Related files

| Topic | Location |
|--------|-----------|
| HTTP routes | `backend/src/server.js` |
| Auth | `backend/src/auth.js` |
| Queue / worker | `backend/src/queue.js`, `backend/src/worker.js` |
| Schema | `infra/db/init.sql` |
| Nginx static + body size | `infra/nginx/default.conf` |
| Full API and env list | [FULLSTACK.md](../FULLSTACK.md) |
