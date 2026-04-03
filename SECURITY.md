# Security overview — CloudPrism

This document describes the **current security posture** of this repository (as shipped for local / proof-of-concept use) and **concrete steps** to harden it for anything beyond a **trusted, isolated network**.

It is **not** a formal risk assessment, penetration test, or authorization package.

---

## 1. Scope and intended use

- **In-repo defaults** (e.g. `docker-compose.yml`, sample `JWT_SECRET`, database password) are for **local development and demos**.
- The API and UI are **not** configured for **internet-facing** or **multi-tenant hostile** environments without additional controls.
- Treat catalog and exception data as **sensitive operational/business data** unless you have classified it otherwise.

---

## 2. Current environment (high level)

| Component | Role | Default exposure (Compose) |
|-----------|------|----------------------------|
| **web** (`nginx:stable`) | Serves static `index.html` and assets on **HTTP :8080** | Host port **8080** → container **80** (no TLS in `infra/nginx/default.conf`). |
| **api** (Node/Express) | REST API on **:3001** | Published to host; browser typically calls API **directly** (not proxied through nginx for API paths). |
| **worker** | BullMQ consumer; CSV import processing | No public port; shares **uploads** volume with API. |
| **db** (PostgreSQL 16) | Application data | **5432** published to host; credentials in Compose are **weak and static**. |
| **redis** (Redis 7) | BullMQ backend | **6379** published to host; **no password / ACL** in sample config. |

**Volumes:** Postgres data, Redis AOF, shared upload directory for CSVs between API and worker.

---

## 3. Authentication and authorization (today)

| Mechanism | Detail |
|-----------|--------|
| **JWT** | Issued on `POST /api/login`; verified on protected routes (e.g. `POST /api/users` requires `requireAuth('admin')`). |
| **Secret** | `JWT_SECRET` from environment; code falls back to a **placeholder** if unset — **must never be used in production**. |
| **Passwords** | Stored with **bcrypt** (cost 12 on user create). |
| **Roles** | `admin` and `viewer` enforced from **JWT payload** (not re-checked against DB on every request). |

**Critical design choice (documented in code):**  
`POST /api/import`, `POST /api/import/batch`, and `GET /api/import/status/:id` are **intentionally unauthenticated** for “trusted network” batch workflows. Most **read** catalog endpoints (`/pricing`, `/exceptions`, `/parent-services`, change/diff endpoints, `/imports`, etc.) are also **unauthenticated** in the current server.

---

## 4. Network and transport

- **No TLS** in the sample nginx config (HTTP only).
- API traffic (JWT, JSON bodies) can traverse the network in **cleartext** if clients use `http://`.
- **CORS** is enabled with default **`cors()`** (effectively permissive for browser callers).

---

## 5. Data and dependencies

- **SQL:** Queries in reviewed paths use **parameterized** statements (`pg` placeholders), which mitigates **SQL injection** for those code paths.
- **Uploads:** Multer writes files under `UPLOAD_DIR` (default `/tmp/cloudprism-uploads` in container) with configurable max size (`UPLOAD_MAX_FILE_MB`).
- **npm:** Backend dependencies are declared in `backend/package.json`. **Commit and use a lockfile** (`package-lock.json`) for reproducible installs and vulnerability baselining; run **`npm audit`** as part of your pipeline.
- **Secrets in Compose:** Database password, `JWT_SECRET`, and Redis URL appear as **plaintext environment variables** in `docker-compose.yml` — acceptable only for local demos.

---

## 6. Client (browser)

- The SPA can store **API base URL** and **Bearer token** in **localStorage** (high impact if **XSS** exists anywhere in the page or third-party scripts).
- Prefer **strict Content-Security-Policy**, minimal inline script over time, and treat XSS as a **credential theft** risk.

---

## 7. Known gaps (summary)

Prioritize fixing these before any non-local / sensitive deployment:

1. **Unauthenticated import and broad read API** — integrity and confidentiality depend entirely on **network isolation** unless you add auth (or a documented compensating control with evidence).
2. **Weak default credentials** — Postgres `cloudprism` / `cloudprism`, Redis **unauthenticated**, placeholder JWT secret in Compose.
3. **Exposed database and Redis ports** on the host — large blast radius if the host firewall is wrong.
4. **No TLS** for UI and API in sample stack.
5. **Permissive CORS** — any origin can drive a user’s browser to call your API if it is reachable.
6. **No rate limiting / lockout** on `POST /api/login` — brute-force risk if the API is reachable.
7. **Limited centralized audit trail** — security events are not clearly structured for SIEM; `catalog_import.imported_by` can be `anonymous-upload` for unauthenticated imports.
8. **Error responses** — some paths return internal error details to clients (information disclosure risk).
9. **JWT lifetime** (24h in code) and **no documented revocation** strategy.

---

## 8. What to do to make it secure (checklist)

Use this as an implementation backlog; order may depend on your threat model (e.g. IL4/IL5, internet vs enclave).

### 8.1 Must-do before anything sensitive or internet-adjacent

- [ ] **Replace all default secrets:** strong `JWT_SECRET` (high entropy, stored in a secret manager or Docker secrets), unique DB password, no fallback secret in production builds.
- [ ] **Do not publish Postgres or Redis to the host** unless required; use **internal Docker networks only** and firewall the host.
- [ ] **Enable Redis authentication** (`requirepass` or ACLs) and TLS if traffic crosses untrusted segments.
- [ ] **TLS everywhere:** terminate HTTPS at nginx (or cloud load balancer) for the UI; use **HTTPS for the API** (same host reverse proxy or separate cert).
- [ ] **Decide on authentication for imports and catalog reads:** add `requireAuth` (and appropriate roles) **or** enforce **mTLS / private network / VPN / IP allowlists** with written acceptance of residual risk.
- [ ] **Restrict CORS** to known UI origins (or serve API only via same-origin reverse proxy).
- [ ] **Commit `package-lock.json`** (backend) and run **`npm audit`** / dependency automation (Dependabot, etc.).

### 8.2 Strongly recommended

- [ ] **Rate limit** login and expensive read endpoints (reverse proxy or API middleware).
- [ ] **Normalize error responses** for clients (generic message) while logging details server-side.
- [ ] **Structured security logging:** authentication success/failure, authorization denials, admin user changes, import attempts (with actor attribution).
- [ ] **Health check** (`/health`) — avoid leaking stack details in failure responses in production.
- [ ] **Review upload path:** virus scanning / quarantine policy if uploads are untrusted; ensure worker cannot be tricked into reading arbitrary filesystem paths via job data (review BullMQ job payload trust).
- [ ] **Run containers as non-root** where practical; read-only root filesystem where possible.
- [ ] **Backup and encryption at rest** for Postgres volumes per organizational policy.

### 8.3 Optional / longer-term

- [ ] **Short-lived access tokens + refresh** or **session cookies** with **HttpOnly** / **Secure** / **SameSite** (requires SPA changes).
- [ ] **Re-validate user/role** from DB on sensitive operations (or short JWT TTL + revocation list).
- [ ] **WAF** or API gateway in front of public endpoints.
- [ ] **Formal assessment** (pen test, STIG/hardening guides) for your target baseline.

---

## 9. Reporting security issues

Add a **contact** for reports (e.g. `security@your-org` or a private security advisory process).  
Replace this section with your project’s preferred channel when known.

---

## 10. References in this repo

- API server: `backend/src/server.js` (includes security comment on unauthenticated import routes).
- Auth: `backend/src/auth.js`.
- Compose: `docker-compose.yml`.
- Nginx: `infra/nginx/default.conf`.
- DB bootstrap: `infra/db/init.sql` (review default user seeding for production).

---

*Update the “Reporting security issues” section and this footer date when you materially change deployment or controls.*
