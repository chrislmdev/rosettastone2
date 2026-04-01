/**
 * Browser copy of backend/src/focusInference.js — keep regex / map in sync.
 */
(() => {
  const FOCUS_CATEGORY_MAP = {
    compute: "Compute",
    storage: "Storage",
    database: "Database",
    networking: "Networking",
    network: "Networking",
    security: "Security",
    identity: "Security",
    ai: "AI and Machine Learning",
    "machine learning": "AI and Machine Learning",
    ml: "AI and Machine Learning",
    analytics: "Analytics",
    "big data": "Analytics",
    "developer tools": "Developer Tools",
    devops: "Developer Tools",
    management: "Management and Governance",
    governance: "Management and Governance",
    monitoring: "Management and Governance",
    serverless: "Compute",
    containers: "Compute",
    web: "Web and Mobile",
    mobile: "Web and Mobile",
    iot: "Internet of Things",
    integration: "Integration",
    messaging: "Integration",
    "api gateway": "Integration",
    media: "Media Services",
    migration: "Migration and Transfer",
    transfer: "Migration and Transfer",
    "end user computing": "End User Computing",
    desktop: "End User Computing",
    "professional services": "Professional Services",
    "pro services": "Professional Services",
  };

  function normalizeFocusCategory(rawCategory) {
    if (!rawCategory) return "Other";
    const raw = String(rawCategory).trim();
    const lower = raw.toLowerCase();
    if (lower === "all" || lower === "any" || lower === "*" || lower === "n/a" || lower === "na") return "Other";
    if (lower === "te" || lower === "t&e" || lower === "t and e") return "Other";
    const squish = lower.replace(/[^a-z0-9]+/g, " ").trim();
    if (squish === "iaas" || /\biaas\b/.test(lower)) return "Compute";
    if (squish === "paas" || /\bpaas\b/.test(lower)) return "Compute";
    if (squish === "saas" || /\bsaas\b/.test(lower)) return "Web and Mobile";

    const entries = Object.entries(FOCUS_CATEGORY_MAP).sort((a, b) => b[0].length - a[0].length);
    for (const [key, val] of entries) {
      if (lower.includes(key)) return val;
    }
    return raw || "Other";
  }

  function inferFocusCategoryFromText(text) {
    const t = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!t) return "Other";

    if (/(professional services|managed service|technical account|tam|consulting|implementation service|support plan|premier support|training workshop|advisory|pro services)/.test(t))
      return "Professional Services";
    if (/(bedrock|openai|vertex|genai|machine learning|\bai\b|inference|embedding|neural|model|token|ml )/.test(t))
      return "AI and Machine Learning";
    if (/(analytics|bigquery|synapse|athena|data lake|warehouse|spark|big data)/.test(t)) return "Analytics";
    if (/(database|sql|nosql|rds|postgres|mysql|cosmos|spanner|redis|caching)/.test(t)) return "Database";
    if (/(security|iam|kms|waf|guardduty|sentinel|defender|siem|threat|key management)/.test(t)) return "Security";
    if (/(api gateway|service bus|event hub|event grid|pub.?sub|pubsub|messaging|queue|integration|workflow|orchestration|apim)/.test(t))
      return "Integration";
    if (/(network|vpc|vpn|dns|load balancer|cdn|egress|firewall|expressroute|interconnect|nat gateway)/.test(t))
      return "Networking";
    if (/(storage|object|bucket|archive|block|blob|volume|disk|s3 )/.test(t)) return "Storage";
    if (/(compute|vm|virtual machine|instance|kubernetes|container|serverless|lambda|function|engine|ocpu)/.test(t))
      return "Compute";
    if (/(devops|developer|pipeline|artifact|repo|build|deploy)/.test(t)) return "Developer Tools";
    if (/(monitor|governance|policy|logging|observability|control tower)/.test(t)) return "Management and Governance";
    if (/(migrate|migration|transfer|data movement)/.test(t)) return "Migration and Transfer";
    if (/(desktop|avd|virtual desktop|end user)/.test(t)) return "End User Computing";
    if (/(media|streaming|video|transcode)/.test(t)) return "Media Services";
    if (/(iot|internet of things|device twin)/.test(t)) return "Internet of Things";
    if (/(mobile|app service|web app)/.test(t)) return "Web and Mobile";

    return "Other";
  }

  function resolvePricingFocusCategory({ category, service_category, title, shortname, description }) {
    const fromCsv = normalizeFocusCategory(category || service_category || "");
    if (fromCsv !== "Other") return fromCsv;
    return inferFocusCategoryFromText(`${title} ${shortname} ${description}`);
  }

  function resolveParentFocusCategory({ category, csoparentservice, csoshortname }) {
    const fromCsv = normalizeFocusCategory(category || "");
    if (fromCsv !== "Other") return fromCsv;
    return inferFocusCategoryFromText(`${csoparentservice} ${csoshortname}`);
  }

  window.normalizeFocusCategory = normalizeFocusCategory;
  window.inferFocusCategoryFromText = inferFocusCategoryFromText;
  window.resolvePricingFocusCategory = resolvePricingFocusCategory;
  window.resolveParentFocusCategory = resolveParentFocusCategory;
})();
