(() => {
  function toNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v)
      .replace(/,/g, '')
      .replace(/\$/g, '')
      .trim()
      .replace(/^\[+/, '')
      .replace(/\]+$/, '')
      .trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  /** JWCC / contracted side (API: jwccunitprice; legacy CSV: customerunitprice). */
  function jwccPrice(r) {
    return toNum(
      r.jwccunitprice ?? r.customerunitprice ?? r.custunitprice
    );
  }

  /** Commercial / list side (API: list_unit_price; legacy: commercialunitprice). */
  function commPrice(r) {
    return toNum(
      r.list_unit_price ?? r.commercialunitprice ?? r.communitprice
    );
  }

  function jwccUnit(r) {
    return String(
      r.jwccunitofissue ?? r.customerunitofissue ?? r.custunitofissue ?? ''
    ).trim();
  }

  function commUnit(r) {
    return String(
      r.pricing_unit ?? r.commercialunitofissue ?? r.communitofissue ?? ''
    ).trim();
  }

  function buildKey(r) {
    return `${(r.csp_injected || r.csp || '').toLowerCase()}|${(r.catalogitemnumber || r.catalognum || '').toLowerCase()}`;
  }

  function pickMonths(historyByMonth) {
    const months = Object.keys(historyByMonth || {}).sort();
    if (months.length < 2) return { previous: null, current: null };
    return { previous: months[months.length - 2], current: months[months.length - 1] };
  }

  function computeCatalogChanges(historyByMonth, monthFromOpt, monthToOpt) {
    const months = Object.keys(historyByMonth || {}).sort();
    let previous = monthFromOpt && historyByMonth[monthFromOpt] ? monthFromOpt : null;
    let current = monthToOpt && historyByMonth[monthToOpt] ? monthToOpt : null;
    if (!previous || !current) {
      const picked = pickMonths(historyByMonth);
      previous = picked.previous;
      current = picked.current;
    }
    if (!previous || !current || previous === current) return [];
    const prevRows = historyByMonth[previous] || [];
    const currRows = historyByMonth[current] || [];
    const prevMap = new Map(prevRows.map(r => [buildKey(r), r]));
    const currMap = new Map(currRows.map(r => [buildKey(r), r]));
    const keys = new Set([...prevMap.keys(), ...currMap.keys()]);
    const out = [];

    keys.forEach(key => {
      const prev = prevMap.get(key);
      const curr = currMap.get(key);
      if (!prev && curr) {
        const jc = jwccPrice(curr);
        const cc = commPrice(curr);
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'added',
          csp: (curr.csp_injected || curr.csp || '').toLowerCase(),
          catalogitemnumber: curr.catalogitemnumber || curr.catalognum || '',
          title: curr.title || '',
          prev_jwcc: null,
          curr_jwcc: jc,
          prev_comm: null,
          curr_comm: cc,
          cust_delta: jc,
          cust_delta_pct: null,
          comm_delta: cc,
          comm_delta_pct: null
        });
        return;
      }
      if (prev && !curr) {
        const jp = jwccPrice(prev);
        const cp = commPrice(prev);
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'removed',
          csp: (prev.csp_injected || prev.csp || '').toLowerCase(),
          catalogitemnumber: prev.catalogitemnumber || prev.catalognum || '',
          title: prev.title || '',
          prev_jwcc: jp,
          curr_jwcc: null,
          prev_comm: cp,
          curr_comm: null,
          cust_delta: -jp,
          cust_delta_pct: null,
          comm_delta: -cp,
          comm_delta_pct: null
        });
        return;
      }

      const prevCust = jwccPrice(prev);
      const currCust = jwccPrice(curr);
      const prevComm = commPrice(prev);
      const currComm = commPrice(curr);
      const custDelta = currCust - prevCust;
      const commDelta = currComm - prevComm;
      const changed = custDelta !== 0 || commDelta !== 0 ||
        (prev.discountpremiumfee || '') !== (curr.discountpremiumfee || '') ||
        jwccUnit(prev) !== jwccUnit(curr) ||
        commUnit(prev) !== commUnit(curr);

      if (changed) {
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'updated',
          csp: (curr.csp_injected || curr.csp || '').toLowerCase(),
          catalogitemnumber: curr.catalogitemnumber || curr.catalognum || '',
          title: curr.title || '',
          prev_jwcc: prevCust,
          curr_jwcc: currCust,
          prev_comm: prevComm,
          curr_comm: currComm,
          cust_delta: custDelta,
          cust_delta_pct: prevCust ? (custDelta / prevCust) * 100 : null,
          comm_delta: commDelta,
          comm_delta_pct: prevComm ? (commDelta / prevComm) * 100 : null
        });
      }
    });

    return out.sort((a, b) => (a.csp + a.catalogitemnumber).localeCompare(b.csp + b.catalogitemnumber));
  }

  window.computeCatalogChanges = computeCatalogChanges;
})();
