/**
 * Contract-style comparison subcategories for the Services catalog (FOCUS category + subcategory row).
 *
 * Extend: push more { label, test } entries at the top of RULES (first match wins).
 * Optional CSV column comparison_subcategory overrides all inference (see comparisonSubcategoryFromRow).
 */
(() => {
  function normBlob(parent, short) {
    return String(`${parent || ""} ${short || ""}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /**
   * Ordered rules — more specific patterns first.
   * @type {{ label: string, test: (t: string) => boolean }[]}
   */
  const RULES = [
    {
      label: "Generative AI",
      test: t =>
        /(bedrock|openai|azure openai|vertex ai.*gemini|generative ai|genai|claude|gpt-4|gpt4|foundation model|large language|\bllm\b)/.test(
          t
        ),
    },
    { label: "Machine Learning", test: t => /(sagemaker|azure ml|vertex ai|machine learning studio|automl|forecasting|personalize)/.test(t) },
    { label: "AI Platforms", test: t => /(\bai platform|machine learning platform|ml platform|ai services)/.test(t) },
    { label: "Bots", test: t => /(lex|dialogflow|bot service|conversation|chatbot)/.test(t) },
    {
      label: "Containers",
      test: t =>
        /(amazon eks|\beks\b|elastic kubernetes|kubernetes service|azure kubernetes|\baks\b|google kubernetes engine|\bgke\b|container engine for kubernetes|\boke\b|kubernetes cluster)/.test(
          t
        ),
    },
    { label: "Containers", test: t => /(elastic container service|\becs\b|fargate|cloud run)/.test(t) },
    {
      label: "Containers",
      test: t =>
        /(container instances|container registry|artifact registry|elastic container registry|\becr\b|oci container registry)/.test(t),
    },
    {
      label: "Virtual Machines",
      test: t =>
        /(\bec2\b|compute engine|virtual machine|vm instances|azure virtual machine|dedicated host|bare metal)/.test(t),
    },
    { label: "Serverless", test: t => /(lambda|azure functions|cloud functions|functions as a service|\bfaas\b)/.test(t) },
    { label: "Databases", test: t => /(rds|relational database|sql database|cloud sql|dynamodb|cosmos|spanner|autonomous database|nosql)/.test(t) },
    { label: "Storage", test: t => /(object storage|blob storage|block storage|file storage|s3 |efs|ebs|disk)/.test(t) },
    { label: "Networking", test: t => /(vpc|virtual cloud network|load balancer|cdn|dns|vpn|express route|interconnect|nat gateway)/.test(t) },
    { label: "Security", test: t => /(waf|firewall|guardduty|sentinel|defender|kms|key vault|secrets manager|security center)/.test(t) },
    { label: "Analytics", test: t => /(bigquery|synapse|athena|redshift|data warehouse|emr|dataproc)/.test(t) },
    { label: "Integration", test: t => /(api gateway|service bus|event hub|event grid|pub.?sub|step functions|logic apps)/.test(t) },
    { label: "Developer Tools", test: t => /(codepipeline|codebuild|cloud build|devops|github|artifact|container registry)/.test(t) },
  ];

  function inferComparisonSubcategoryFromText(blob) {
    const t = normBlob(blob, "");
    if (!t) return "Other offerings";
    for (const { label, test } of RULES) {
      if (test(t)) return label;
    }
    return "";
  }

  function titleCaseWords(s) {
    const x = String(s || "").trim();
    if (!x) return "Other offerings";
    return x.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }

  /**
   * Explicit CSV / API field wins; else pattern inference; else short-name title case.
   */
  function comparisonSubcategoryFromRow(s) {
    const explicit = String(
      s.comparison_subcategory ||
        s.comparisonsubcategory ||
        s.comparisonSubcategory ||
        ""
    ).trim();
    if (explicit) return explicit;
    const parent = s.csoparentservice || s.csOParentService || "";
    const short = s.csoshortname || s.csoShortName || "";
    const inferred = inferComparisonSubcategoryFromText(`${parent} ${short}`);
    if (inferred) return inferred;
    return titleCaseWords(short || parent);
  }

  function resolveServiceCatalogFocusCategory(s) {
    const fcStr = String(s.focus_category || "").trim();
    const catStr = String(s.category || s.Category || "").trim();
    const norm = typeof window.normalizeFocusCategory === "function" ? window.normalizeFocusCategory : null;
    const normFc = norm ? norm(fcStr) : fcStr;
    const normCat = norm ? norm(catStr) : catStr;

    const pick = v => v && String(v).trim() && String(v).toLowerCase() !== "other";
    if (pick(normFc)) return normFc;
    if (pick(normCat)) return normCat;

    if (typeof window.resolveParentFocusCategory === "function") {
      return window.resolveParentFocusCategory({
        category: catStr,
        csoparentservice: s.csoparentservice || s.csOParentService || "",
        csoshortname: s.csoshortname || s.csoShortName || "",
      });
    }
    const blob = `${s.csoparentservice || s.csOParentService || ""} ${s.csoshortname || s.csoShortName || ""}`;
    return typeof window.inferFocusCategoryFromText === "function"
      ? window.inferFocusCategoryFromText(blob)
      : "Other";
  }

  window.inferComparisonSubcategoryFromText = inferComparisonSubcategoryFromText;
  window.comparisonSubcategoryFromRow = comparisonSubcategoryFromRow;
  window.resolveServiceCatalogFocusCategory = resolveServiceCatalogFocusCategory;
})();
