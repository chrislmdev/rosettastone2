/**
 * Infer CSP + import fileType from filename for batch CSV upload.
 * Keep in sync with inferImportFromFilename in index.html (Admin drop zone preview).
 *
 * Recommended names (no CSV `csp` column required):
 *   - Tokens separated by _ or -: e.g. oci_pricing_mar2026.csv, gcp-parent-mapping.csv
 *   - Short CSP codes as whole tokens: aws, az, azure, gcp, google, oracle, oci, amazon, microsoft
 *   - Strict pair: pricing_aws.csv, aws_pricing.csv
 * Optional manifest JSON overrides wrong guesses.
 */

const FILE_TYPES = { pricing: "pricing", parent: "parent", exceptions: "exceptions" };
const CSPS = ["aws", "azure", "gcp", "oracle"];

/** Map a single filename token (already lowercased) to CSP, or null. */
function cspFromToken(t) {
  if (!t) return null;
  if (t === "aws" || t === "amazon") return "aws";
  if (t === "azure" || t === "microsoft" || t === "az") return "azure";
  if (t === "gcp" || t === "google") return "gcp";
  if (t === "oracle" || t === "oci") return "oracle";
  return null;
}

/**
 * CSP signals from (1) stem split on _ and (2) word-boundary scan on space-normalized name.
 * Whole-token matching avoids false positives like "jaws" → aws.
 */
function collectCspHits(stemUnderscored, nSpaced) {
  const hits = new Set();
  for (const part of stemUnderscored.split("_")) {
    const c = cspFromToken(part);
    if (c) hits.add(c);
  }
  if (/\b(aws|amazon)\b/.test(nSpaced)) hits.add("aws");
  if (/\b(azure|microsoft)\b/.test(nSpaced)) hits.add("azure");
  if (/\b(gcp|google)\b/.test(nSpaced)) hits.add("gcp");
  if (/\b(oracle|oci)\b/.test(nSpaced)) hits.add("oracle");
  if (/\baz\b/.test(nSpaced)) hits.add("azure");
  return [...hits];
}

/** CSP glued to the start of the stem (e.g. awspricing.csv) — longer codes before "az". */
function cspFromLeadingCode(stem) {
  const ordered = [
    "amazon",
    "microsoft",
    "google",
    "azure",
    "oracle",
    "aws",
    "gcp",
    "oci",
    "az",
  ];
  for (const code of ordered) {
    if (!stem.startsWith(code)) continue;
    if (stem.length === code.length) return cspFromToken(code);
    const next = stem.charAt(code.length);
    if (next === "_" || /[a-z0-9]/.test(next)) return cspFromToken(code);
  }
  return null;
}

/**
 * @param {string} originalName - e.g. "AWS_Monthly_Pricing.csv"
 * @returns {{ csp: string, fileType: string } | { error: string }}
 */
export function inferImportFromFilename(originalName) {
  const base = String(originalName || "").split(/[/\\]/).pop() || "";
  const stem = base.replace(/\.[^/.]+$/, "").toLowerCase().replace(/-/g, "_");

  for (const t of Object.keys(FILE_TYPES)) {
    for (const c of CSPS) {
      if (stem === `${t}_${c}` || stem === `${c}_${t}`) {
        return { csp: c, fileType: FILE_TYPES[t] };
      }
    }
  }

  const n = base
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  let uniqueCsp = collectCspHits(stem, n);
  if (uniqueCsp.length === 0) {
    const lead = cspFromLeadingCode(stem);
    if (lead) uniqueCsp = [lead];
  }
  if (uniqueCsp.length === 0) {
    return {
      error:
        "No CSP in filename. Use a token: aws, az, azure, gcp, google, oci, oracle, amazon, … (separate with _ or -), e.g. oci_pricing_mar2026.csv",
    };
  }
  if (uniqueCsp.length > 1) {
    return { error: `Multiple CSP keywords in filename: ${uniqueCsp.join(", ")}` };
  }

  const typeHits = new Set();
  if (/\b(exceptions?|exemptions?)\b/.test(n)) typeHits.add("exceptions");
  if (/\b(parent|mapping|mappings|csoparent|parentservice)\b/.test(n)) typeHits.add("parent");
  if (/\bservice\s*map\b/.test(n)) typeHits.add("parent");
  if (/\bpricing\b|\bcatalog\b/.test(n)) typeHits.add("pricing");
  else if (/\bprice\b/.test(n)) typeHits.add("pricing");

  if (typeHits.size === 0) {
    return {
      error:
        "No import type keyword (pricing, price, catalog, parent, mapping, exception, exemption, …)",
    };
  }
  if (typeHits.size > 1) {
    return { error: `Ambiguous import type: ${[...typeHits].join(", ")}` };
  }

  return { csp: uniqueCsp[0], fileType: [...typeHits][0] };
}

/**
 * @param {string} originalName
 * @param {Record<string, { csp?: string, fileType?: string }>} manifest - keys = exact original filenames
 */
export function resolveImportSpec(originalName, manifest) {
  const m = manifest && manifest[originalName];
  if (m && m.csp && m.fileType) {
    const csp = String(m.csp).toLowerCase();
    const fileType = String(m.fileType).toLowerCase();
    if (!CSPS.includes(csp)) {
      return { error: `Manifest: invalid csp "${m.csp}"` };
    }
    if (!Object.keys(FILE_TYPES).includes(fileType)) {
      return { error: `Manifest: invalid fileType "${m.fileType}"` };
    }
    return { csp, fileType };
  }
  return inferImportFromFilename(originalName);
}
