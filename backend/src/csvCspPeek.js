/**
 * Read the first rows of an uploaded CSV and return a single CSP if the `csp`
 * column is present and consistently one of aws|azure|gcp|oracle.
 */
import { createReadStream } from "fs";
import { parse } from "csv-parse";

const ALLOWED = new Set(["aws", "azure", "gcp", "oracle"]);

function normalizeHeaderKey(k) {
  return String(k || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

function rowCspValue(row) {
  if (!row || typeof row !== "object") return "";
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeHeaderKey(k);
    if (nk === "csp" || nk === "csp_injected") {
      const c = String(v || "")
        .toLowerCase()
        .trim();
      if (ALLOWED.has(c)) return c;
    }
  }
  return "";
}

/**
 * @param {string} filePath
 * @param {number} maxRows
 * @returns {Promise<string|null>}
 */
export function peekConsistentCspFromCsvFile(filePath, maxRows = 200) {
  return new Promise((resolve, reject) => {
    const seen = new Set();
    let count = 0;
    let settled = false;

    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      })
    );

    const finish = (val) => {
      if (settled) return;
      settled = true;
      try {
        parser.destroy();
      } catch {
        /* ignore */
      }
      resolve(val);
    };

    parser.on("data", (row) => {
      if (settled) return;
      const c = rowCspValue(row);
      if (c) seen.add(c);
      count++;
      if (seen.size > 1) finish(null);
      else if (count >= maxRows) finish(seen.size === 1 ? [...seen][0] : null);
    });

    parser.on("end", () => {
      if (!settled) finish(seen.size === 1 ? [...seen][0] : null);
    });

    parser.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
