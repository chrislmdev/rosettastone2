/**
 * Infer CSP + import fileType from filename for batch CSV upload.
 * Keep in sync with inferImportFromFilename in index.html (Admin drop zone preview).
 */

const FILE_TYPES = { pricing: "pricing", parent: "parent", exceptions: "exceptions" };
const CSPS = ["aws", "azure", "gcp", "oracle"];

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

  const cspHits = [];
  if (/\b(aws|amazon)\b/.test(n)) cspHits.push("aws");
  if (/\b(azure|microsoft)\b/.test(n)) cspHits.push("azure");
  if (/\b(gcp|google)\b/.test(n)) cspHits.push("gcp");
  if (/\b(oracle|oci)\b/.test(n)) cspHits.push("oracle");
  const uniqueCsp = [...new Set(cspHits)];
  if (uniqueCsp.length === 0) {
    return { error: "No CSP keyword in filename (aws, azure, gcp, oracle, amazon, …)" };
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
