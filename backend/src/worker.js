/**
 * CloudPrism — CSV Import Worker
 *
 * Processes queued CSV import jobs from BullMQ.
 * Handles: pricing, parent_service, exception (file types)
 *
 * Key behaviors:
 *  - Streaming parse (handles 80MB files without OOM)
 *  - CSP: job metadata from batch/single import; row `csp` column overrides when valid
 *  - Title lookup: csoPricing missing title → resolved from parent_service
 *  - JWCC column mapping: customerunitprice → jwccunitprice
 *  - FinOps FOCUS 1.3 category normalization
 *  - Exception change log: field-level diff against previous import
 */
import { Worker } from "bullmq";
import { parse } from "csv-parse";
import { createReadStream } from "fs";
import pkg from "pg";
import IORedis from "ioredis";
import {
  resolvePricingFocusCategory,
  resolveParentFocusCategory,
} from "./focusInference.js";

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// ── Normalize CSV header keys ───────────────────────────────
function normalizeHeaders(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    out[k.toLowerCase().trim().replace(/\s+/g, "_")] = v?.trim() ?? "";
  }
  return out;
}

// ── Stream-parse a CSV file, yielding rows ──────────────────
async function* streamCsv(filePath) {
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, bom: true })
  );
  for await (const record of parser) {
    yield normalizeHeaders(record);
  }
}

const ALLOWED_JOB_CSP = new Set(["aws", "azure", "gcp", "oracle"]);

function pickEffectiveCsp(row, jobCsp) {
  const v = String(row.csp || row.csp_injected || "")
    .toLowerCase()
    .trim();
  if (ALLOWED_JOB_CSP.has(v)) return v;
  return String(jobCsp || "").toLowerCase();
}

// ── Process: pricing CSV ────────────────────────────────────
async function processPricing(filePath, csp, importId, client) {
  const titleMapCache = new Map();
  async function getTitleMap(forCsp) {
    if (titleMapCache.has(forCsp)) return titleMapCache.get(forCsp);
    const { rows: parents } = await client.query(
      `select csoshortname, csoparentservice
       from parent_service
       where csp = $1
       order by id desc`,
      [forCsp]
    );
    const titleMap = {};
    for (const p of parents) {
      if (p.csoshortname && p.csoparentservice) {
        titleMap[p.csoshortname.toLowerCase()] = p.csoparentservice;
      }
    }
    titleMapCache.set(forCsp, titleMap);
    return titleMap;
  }

  let count = 0;
  for await (const row of streamCsv(filePath)) {
    const effectiveCsp = pickEffectiveCsp(row, csp);
    const titleMap = await getTitleMap(effectiveCsp);
    const shortname = row.csoshortname || row.cso_short_name || "";
    // Resolve title: use CSV title if present, else look up from parent
    const title = row.title || row.csoparentservice ||
      titleMap[shortname.toLowerCase()] || shortname;

    const rawCommPrice = parseFloat(row.commercialunitprice) || null;
    const rawJwccPrice = parseFloat(row.customerunitprice) || null;
    const focusCat = resolvePricingFocusCategory({
      category: row.category || "",
      service_category: row.service_category || "",
      title,
      shortname,
      description: row.description || "",
    });

    await client.query(
      `insert into pricing_item (
        import_id, csp, catalogitemnumber, title, csoshortname, description,
        list_unit_price, pricing_unit,
        jwccunitprice, jwccunitofissue,
        commercialunitprice, commercialunitofissue,
        customerunitprice, customerunitofissue,
        discountpremiumfee, service_category, focus_category
      ) values (
        $1,$2,$3,$4,$5,$6,
        $7,$8,
        $9,$10,
        $11,$12,
        $13,$14,
        $15,$16,$17
      )`,
      [
        importId, effectiveCsp,
        row.catalogitemnumber || row.catalog_item_number || "",
        title,
        shortname,
        row.description || "",
        rawCommPrice,
        row.commercialunitofissue || "",
        rawJwccPrice,
        row.customerunitofissue || "",
        rawCommPrice,
        row.commercialunitofissue || "",
        rawJwccPrice,
        row.customerunitofissue || "",
        row.discountpremiumfee || "",
        row.category || "",
        focusCat,
      ]
    );
    count++;
  }
  return count;
}

// ── Process: parent service CSV ─────────────────────────────
async function processParent(filePath, csp, importId, client) {
  let count = 0;
  for await (const row of streamCsv(filePath)) {
    const effectiveCsp = pickEffectiveCsp(row, csp);
    const focusCat = resolveParentFocusCategory({
      category: row.category || "",
      csoparentservice: row.csoparentservice || row.cso_parent_service || "",
      csoshortname: row.csoshortname || row.cso_short_name || "",
    });
    await client.query(
      `insert into parent_service (
        import_id, csp, catalogitemnumber,
        csoparentservice, csoshortname,
        category, focus_category, impactlevel, newservice
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        importId, effectiveCsp,
        row.catalogitemnumber || row.catalog_item_number || "",
        row.csoparentservice || row.cso_parent_service || "",
        row.csoshortname || row.cso_short_name || "",
        row.category || "",
        focusCat,
        row.impactlevel || row.impact_level || "",
        (row.newservice || row.new_service || "").toLowerCase() === "true",
      ]
    );
    count++;
  }
  return count;
}

// ── Process: exception CSV ──────────────────────────────────
async function processException(filePath, csp, importId, client) {
  const prevMapCache = new Map();
  async function getPrevMap(forCsp) {
    if (prevMapCache.has(forCsp)) return prevMapCache.get(forCsp);
    const { rows: prev } = await client.query(
      `select e.*
       from exception_item e
       join catalog_import ci on ci.id = e.import_id
       where e.csp = $1
       order by ci.imported_at desc
       limit 5000`,
      [forCsp]
    );
    const prevMap = {};
    for (const p of prev) {
      if (p.exceptionuniqueid) prevMap[p.exceptionuniqueid] = p;
    }
    prevMapCache.set(forCsp, prevMap);
    return prevMap;
  }

  const TRACKED_FIELDS = [
    "exceptionstatus", "impactlevel", "exceptionpwsrequirement",
    "exceptionbasisforrequest", "exceptionsecurity"
  ];

  let count = 0;
  for await (const row of streamCsv(filePath)) {
    const effectiveCsp = pickEffectiveCsp(row, csp);
    const prevMap = await getPrevMap(effectiveCsp);
    const uid = row.exceptionuniqueid || row.exception_unique_id || "";
    await client.query(
      `insert into exception_item (
        import_id, csp, exceptionuniqueid, csoshortname,
        impactlevel, exceptionstatus,
        exceptionpwsrequirement, exceptionbasisforrequest, exceptionsecurity
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        importId, effectiveCsp, uid,
        row.csoshortname || row.cso_short_name || "",
        row.impactlevel || row.impact_level || "",
        row.exceptionstatus || row.exception_status || "",
        row.exceptionpwsrequirement || "",
        row.exceptionbasisforrequest || "",
        row.exceptionsecurity || "",
      ]
    );

    // Write field-level diff if we have a previous record
    if (uid && prevMap[uid]) {
      const old = prevMap[uid];
      for (const field of TRACKED_FIELDS) {
        const oldVal = old[field] ?? "";
        const newVal = row[field] ?? "";
        if (oldVal !== newVal) {
          await client.query(
            `insert into exception_change_log
               (import_id, csp, exceptionuniqueid, field_name, old_value, new_value)
             values ($1,$2,$3,$4,$5,$6)`,
            [importId, effectiveCsp, uid, field, oldVal, newVal]
          );
        }
      }
    }
    count++;
  }
  return count;
}

// ── Main job processor ──────────────────────────────────────
async function processJob(job) {
  const { importId, filePath, csp, fileType } = job.data;
  console.log(`[worker] job ${job.id} | csp=${csp} | type=${fileType} | file=${filePath}`);

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "update catalog_import set status='processing' where id=$1", [importId]
    );

    let count = 0;
    if (fileType === "pricing") {
      count = await processPricing(filePath, csp, importId, client);
    } else if (fileType === "parent") {
      count = await processParent(filePath, csp, importId, client);
    } else if (fileType === "exceptions") {
      count = await processException(filePath, csp, importId, client);
    } else {
      throw new Error(`Unknown fileType: ${fileType}`);
    }

    await client.query(
      "update catalog_import set status='done', row_count=$1 where id=$2",
      [count, importId]
    );
    await client.query("commit");
    console.log(`[worker] job ${job.id} done — ${count} rows`);
  } catch (err) {
    await client.query("rollback");
    await client.query(
      "update catalog_import set status='error', error_message=$1 where id=$2",
      [err.message, importId]
    );
    console.error(`[worker] job ${job.id} failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

// ── Start worker ────────────────────────────────────────────
const worker = new Worker("cloudprism-import", processJob, {
  connection,
  concurrency: 2,
});

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job.id}`);
});
worker.on("failed", (job, err) => {
  console.error(`[worker] failed job ${job?.id}:`, err.message);
});

console.log("[worker] CloudPrism import worker started");
