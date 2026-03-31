(() => {
  const FOCUS_TAXONOMY = [
    'Compute',
    'Storage',
    'Database',
    'Networking',
    'AI and Machine Learning',
    'Security',
    'Analytics',
    'Developer Tools',
    'Management and Governance',
    'Integration',
    'Migration and Transfer',
    'Migration',
    'Web and Mobile',
    'Media Services',
    'Internet of Things',
    'End User Computing',
    'Professional Services',
    'Other'
  ];

  function normalize(v) {
    return String(v || '').toLowerCase().trim();
  }

  function normalizeText(v) {
    return normalize(v).replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function inferCategory(text) {
    if (/(professional services|managed service|technical account|tam|consulting|implementation service|support plan|premier support|training workshop|advisory)/.test(text)) return 'Professional Services';
    if (/(compute|ec2|vm|virtual machine|instance|kubernetes|container|serverless|lambda|function)/.test(text)) return 'Compute';
    if (/(storage|object|bucket|archive|block|file system|volume|blob|s3)/.test(text)) return 'Storage';
    if (/(database|dynamodb|sql|nosql|amazonmemorydb|elasticache|rds|postgres|mysql|cosmos|spanner|redis|cache)/.test(text)) return 'Database';
    if (/(network|vpc|vpn|dns|load balancer|gateway|cdn|egress|firewall)/.test(text)) return 'Networking';
    if (/(security|iam|kms|key management|waf|guardduty|sentinel|defender|siem)/.test(text)) return 'Security';
    if (/(ai|ml|machine learning|model|token|inference|bedrock|openai|vertex|genai)/.test(text)) return 'AI and Machine Learning';
    if (/(analytics|bigquery|synapse|athena|data lake|warehouse|spark)/.test(text)) return 'Analytics';
    if (/(devops|developer|pipeline|artifact|repo|build|deploy)/.test(text)) return 'Developer Tools';
    return 'Other';
  }

  function parentRowCategory(p) {
    const fc = String(p.focus_category || '').trim();
    const cat = String(p.category || '').trim();
    if (fc && fc.toLowerCase() !== 'other') return fc;
    return cat || '';
  }

  function mapFromParentService(pricingRow, parentRows) {
    const catalog = normalize(pricingRow.catalogitemnumber || pricingRow.catalognum);
    const csp = normalize(pricingRow.csp_injected || pricingRow.cspname || pricingRow.csp);
    const short = normalizeText(pricingRow.csoshortname || pricingRow.shortname);
    const title = normalizeText(pricingRow.title);

    const apiFc = String(pricingRow.focus_category || '').trim();
    if (apiFc && apiFc.toLowerCase() !== 'other') {
      return { category: apiFc, confidence: 'high', source: 'api_focus' };
    }

    let direct = parentRows.find(p => {
      const pCatalog = normalize(p.catalogitemnumber || p.catalognum);
      const pCsp = normalize(p.csp_injected || p.csp || p.cspname);
      return pCatalog && pCatalog === catalog && (!csp || !pCsp || pCsp === csp);
    });
    if (direct) {
      const pc = parentRowCategory(direct);
      if (pc) return { category: pc, confidence: 'high', source: 'catalog_match' };
    }

    let byName = parentRows.find(p => {
      const pShort = normalizeText(p.csoshortname || p.shortname || p.csoparentservice);
      const pCsp = normalize(p.csp_injected || p.csp || p.cspname);
      return pShort && (pShort === short || pShort === title) && (!csp || !pCsp || pCsp === csp);
    });
    if (byName) {
      const pc = parentRowCategory(byName);
      if (pc) return { category: pc, confidence: 'medium', source: 'name_match' };
    }

    const blob = `${title} ${short} ${normalizeText(pricingRow.description)}`;
    const inferred =
      typeof window !== 'undefined' && window.inferFocusCategoryFromText
        ? window.inferFocusCategoryFromText(blob)
        : inferCategory(blob);
    return { category: inferred, confidence: inferred === 'Other' ? 'low' : 'medium', source: 'keyword' };
  }

  function enrichPricingRows(pricingRows, parentRows) {
    return (pricingRows || []).map(r => {
      const classified = mapFromParentService(r, parentRows || []);
      return {
        ...r,
        mapped_category: classified.category,
        mapped_subcategory: r.csoshortname || r.shortname || '',
        classificationConfidence: classified.confidence,
        classificationSource: classified.source
      };
    });
  }

  function populatePricingCategoryOptions(msState) {
    const container = document.getElementById('ms-pcat-opts');
    if (!container) return;
    container.innerHTML = FOCUS_TAXONOMY.map(c => `
      <div class="ms-option" data-ms="pcat" data-val="${c}" onclick="toggleMsOpt('pcat','${c}',this)">
        <span class="ms-check"></span>${c}
      </div>
    `).join('');
    if (msState && msState.pcat) {
      container.querySelectorAll('.ms-option').forEach(opt => {
        if (msState.pcat.has(opt.dataset.val)) opt.classList.add('selected');
      });
    }
  }

  window.FOCUS_TAXONOMY = FOCUS_TAXONOMY;
  window.enrichPricingRows = enrichPricingRows;
  window.populatePricingCategoryOptions = populatePricingCategoryOptions;
})();
