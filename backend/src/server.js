import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/imports", async (_req, res) => {
  const q = `
    select id, import_month, csp, schema_name, source_file, row_count, imported_at
    from catalog_import
    order by imported_at desc
    limit 200
  `;
  const { rows } = await pool.query(q);
  res.json(rows);
});

app.get("/pricing", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const q = String(req.query.q || "").toLowerCase();
  const params = [];
  const where = [];
  if (csp) {
    params.push(csp);
    where.push(`p.csp = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(lower(p.title) like $${params.length} or lower(p.csoshortname) like $${params.length} or lower(p.description) like $${params.length})`);
  }
  const sql = `
    select p.*
    from pricing_item p
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by p.csp, p.catalogitemnumber
    limit 1000
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.get("/exceptions", async (req, res) => {
  const csp = String(req.query.csp || "").toLowerCase();
  const params = [];
  const where = [];
  if (csp) {
    params.push(csp);
    where.push(`e.csp = $${params.length}`);
  }
  const sql = `
    select e.*
    from exception_item e
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by e.csp, e.exceptionuniqueid
    limit 1000
  `;
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

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

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`api listening on ${port}`);
});
