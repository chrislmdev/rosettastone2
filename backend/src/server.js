/**
 * CloudPrism API Server
 */
import express from "express";
import cors from "cors";
import multer from "multer";
import { createHash } from "crypto";
import { stat } from "fs/promises";
import pkg from "pg";
import { loginHandler, requireAuth, createUserHandler } from "./auth.js";
import { enqueueImport } from "./queue.js";
import { resolveImportSpec } from "./importInference.js";
import { peekConsistentCspFromCsvFile } from "./csvCspPeek.js";

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /pricing, /exceptions, /parent-services — rows per page (query ?limit=&offset=) */
const CATALOG_API_DEFAULT_LIMIT = Math.max(
  1,
  parseInt(process.env.CATALOG_API_DEFAULT_LIMIT || "2000", 10)
);
const CATALOG_API_MAX_LIMIT = Math.max(
  CATALOG_API_DEFAULT_LIMIT,
  Math.min(
    parseInt(process.env.CATALOG_API_MAX_LIMIT || "100000", 10),
    500000
  )
);

function parseCatalogPaging(req) {
  let limit = parseInt(String(req.query.limit ?? ""), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = CATALOG_API_DEFAULT_LIMIT;
  limit = Math.min(limit, CATALOG_API_MAX_LIMIT);
  let offset = parseInt(String(req.query.offset ?? ""), 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

// Multer: store uploads in shared volume (raise UPLOAD_MAX_FILE_MB for very large CSVs, e.g. ~1M rows)
const uploadMaxBytes = Math.max(
  1,
  parseInt(process.env.UPLOAD_MAX_FILE_MB || "200", 10)
) * 1024 * 1024;
const upload = multer({
  dest: process.env.UPLOAD_DIR || "/tmp/cloudprism-uploads",
  limits: { fileSize: uploadMaxBytes },
});

// ── Health ────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, service: "CloudPrism API" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Auth ──────────────────────────────────────────────────────
app.post("/api/login", loginHandler);

// Admin: create/update user (admin only)
app.post("/api/users", requireAuth("admin"), createUserHandler);

// ── Import endpoints ──────────────────────────────────────────
// SECURITY: POST /api/import, POST /api/import/batch, and GET /api/import/status are
// intentionally unauthenticated for local/trusted-network batch workflows. Re-enable
// requireAuth before any public or internet-facing deploy. POST /api/users stays admin-only.

// POST /api/import — upload a CSV and queue processing
// Fields: file, csp (string), importMonth (YYYY-MM), fileType (pricing|parent|exceptions)
app.post("/api/import", upload.single("file"), async (req, res) => {
    const { csp, importMonth, fileType } = req.body || {};
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });
    if (!csp) return res.status(400).json({ error: "csp is required" });
    if (!importMonth || !/^\d{4}-\d{2}$/.test(importMonth)) {
      return res.status(400).json({ error: "importMonth must be YYYY-MM" });
    }
    if (!["pricing", "parent", "exceptions"].includes(fileType)) {
      return res.status(400).json({ error: "fileType must be: pricing, parent, or exceptions" });
    }

    try {
      // Compute file checksum for dedup detection
      const buf = await import("fs").then((m) =>
        m.promises.readFile(file.path)
      );
      const checksum = createHash("sha256").update(buf).digest("hex");

      // Create audit record in pending state
      const { rows } = await pool.query(
        `insert into catalog_import
           (import_month, csp, schema_name, source_file, checksum, status, imported_by)
         values ($1, $2, $3, $4, $5, 'pending', $6)
         returning id`,
        [
          importMonth,
          csp.toLowerCase(),
          fileType,
          file.originalname,
          checksum,
          req.user?.username || "anonymous-upload",
        ]
      );
      const importId = rows[0].id;

      // Enqueue the background job
      const jobId = await enqueueImport({
        importId,
        filePath: file.path,
        csp: csp.toLowerCase(),
        fileType,
        importMonth,
      });

      res.json({ ok: true, importId, jobId });
    } catch (err) {
      console.error("import error:", err);
      res.status(500).json({ error: err.message });
    }
});

const BATCH_MAX_FILES = 50;

// POST /api/import/batch — multipart: files[] (same field name "files"), importMonth, optional manifest JSON
app.post("/api/import/batch", upload.array("files", BATCH_MAX_FILES), async (req, res) => {
  const importMonth = req.body?.importMonth;
  if (!importMonth || !/^\d{4}-\d{2}$/.test(importMonth)) {
    return res.status(400).json({ error: "importMonth must be YYYY-MM" });
  }

  let manifest = {};
  if (req.body?.manifest != null && String(req.body.manifest).trim() !== "") {
    try {
      manifest = JSON.parse(String(req.body.manifest));
      if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
        return res.status(400).json({ error: "manifest must be a JSON object keyed by filename" });
      }
    } catch {
      return res.status(400).json({ error: "manifest must be valid JSON" });
    }
  }

  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ error: "No files uploaded (field name: files)" });
  }

  const results = [];
  const errors = [];
  const fsPromises = await import("fs/promises");

  for (const file of files) {
    const manifestEntry = manifest && manifest[file.originalname];
    const hasFullManifest =
      manifestEntry &&
      String(manifestEntry.csp || "").trim() &&
      String(manifestEntry.fileType || "").trim();

    let spec = resolveImportSpec(file.originalname, manifest);
    if (spec.error) {
      errors.push({ filename: file.originalname, error: spec.error });
      continue;
    }

    if (!hasFullManifest) {
      try {
        const csvCsp = await peekConsistentCspFromCsvFile(file.path);
        if (csvCsp) spec = { ...spec, csp: csvCsp };
      } catch (peekErr) {
        console.warn("batch import csp peek:", file.originalname, peekErr.message);
      }
    }

    const { csp, fileType } = spec;

    try {
      const buf = await fsPromises.readFile(file.path);
      const checksum = createHash("sha256").update(buf).digest("hex");

      const { rows } = await pool.query(
        `insert into catalog_import
           (import_month, csp, schema_name, source_file, checksum, status, imported_by)
         values ($1, $2, $3, $4, $5, 'pending', $6)
         returning id`,
        [
          importMonth,
          csp,
          fileType,
          file.originalname,
          checksum,
          req.user?.username || "batch-upload",
        ]
      );
      const importId = rows[0].id;
      const jobId = await enqueueImport({
        importId,
        filePath: file.path,
        csp,
        fileType,
        importMonth,
      });
      results.push({ filename: file.originalname, importId, jobId });
    } catch (err) {
      console.error("batch import file error:", file.originalname, err);
      errors.push({ filename: file.originalname, error: err.message || String(err) });
    }
  }

  res.json({ ok: true, results, errors });
});

// GET /api/import/status/:importId — poll import progress
app.get("/api/import/status/:importId", async (req, res) => {
  const { rows } = await pool.query(
    "select id, status, row_count, error_message, imported_at from catalog_import where id=$1",
    [req.params.importId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// GET /imports — list import history
app.get("/imports", async (_req, res) => {
  const q = `
    select id, import_month, csp, schema_name, source_file,
           row_count, status, error_message, imported_by, imported_at
    from catalog_import
    order by imported_at desc
    limit 200
  `;
  const { rows } = await pool.query(q);
  res.json(rows);
});

// ── Pricing ───────────────────────────────────────────────────
app.get("/pricing", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const q = String(req.query.q || "").toLowerCase();
  const focusCat = String(req.query.focus_category || "").toLowerCase();
  const params = [];
  const where = [];

  if (csp) {
    params.push(csp);
    where.push(`p.csp = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(lower(p.title) like $${params.length} or lower(p.csoshortname) like $${params.length} or lower(p.description) like $${params.length})`
    );
  }
  if (focusCat) {
    params.push(`%${focusCat}%`);
    where.push(`lower(p.focus_category) like $${params.length}`);
  }

  const page = parseCatalogPaging(req);
  const limIdx = params.length + 1;
  const offIdx = params.length + 2;
  params.push(page.limit, page.offset);

  const sql = `
    select p.csp, p.catalogitemnumber, p.title, p.csoshortname, p.description,
           p.list_unit_price, p.pricing_unit,
           p.jwccunitprice, p.jwccunitofissue,
           p.discountpremiumfee, p.service_category, p.focus_category
    from pricing_item p
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by p.csp, p.catalogitemnumber
    limit $${limIdx} offset $${offIdx}
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// ── Exceptions ────────────────────────────────────────────────
app.get("/exceptions", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const status = String(req.query.status || "").toLowerCase();
  const impactLevel = String(req.query.impact_level || "").toLowerCase();
  const service = String(req.query.service || "").toLowerCase();
  const params = [];
  const where = [];

  if (csp) {
    params.push(csp);
    where.push(`e.csp = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`lower(e.exceptionstatus) = $${params.length}`);
  }
  if (impactLevel) {
    params.push(impactLevel);
    where.push(`lower(e.impactlevel) = $${params.length}`);
  }
  if (service) {
    params.push(`%${service}%`);
    where.push(`lower(e.csoshortname) like $${params.length}`);
  }

  const page = parseCatalogPaging(req);
  const limIdx = params.length + 1;
  const offIdx = params.length + 2;
  params.push(page.limit, page.offset);

  const sql = `
    select e.*
    from exception_item e
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by e.csp, e.exceptionuniqueid
    limit $${limIdx} offset $${offIdx}
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// GET /exception-changes — exception field-level diff log
app.get("/exception-changes", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const params = [];
  const where = [];
  if (csp) {
    params.push(csp);
    where.push(`ecl.csp = $${params.length}`);
  }
  const sql = `
    select ecl.*, ci.import_month, ci.source_file
    from exception_change_log ecl
    join catalog_import ci on ci.id = ecl.import_id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by ecl.changed_at desc
    limit 1000
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// ── Changes ───────────────────────────────────────────────────
app.get("/changes", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const params = [];
  const where = [];
  if (csp) {
    params.push(csp);
    where.push(`c.csp = $${params.length}`);
  }
  const sql = `
    select c.*
    from change_log c
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by c.created_at desc
    limit 1000
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// ── Parent services ───────────────────────────────────────────
app.get("/parent-services", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const params = [];
  const where = [];
  if (csp) {
    params.push(csp);
    where.push(`ps.csp = $${params.length}`);
  }

  const page = parseCatalogPaging(req);
  const limIdx = params.length + 1;
  const offIdx = params.length + 2;
  params.push(page.limit, page.offset);

  const sql = `
    select ps.csp, ps.catalogitemnumber, ps.csoparentservice,
           ps.csoshortname, ps.category, ps.focus_category,
           ps.comparison_subcategory,
           ps.impactlevel, ps.newservice
    from parent_service ps
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by ps.csp, ps.csoshortname
    limit $${limIdx} offset $${offIdx}
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// ── Start ─────────────────────────────────────────────────────
const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`CloudPrism API listening on port ${port}`);
});
