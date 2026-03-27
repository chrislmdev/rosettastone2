(() => {
  function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function buildKey(r) {
    return `${(r.csp_injected || r.csp || '').toLowerCase()}|${(r.catalogitemnumber || r.catalognum || '').toLowerCase()}`;
  }

  function pickMonths(historyByMonth) {
    const months = Object.keys(historyByMonth || {}).sort();
    if (months.length < 2) return { previous: null, current: null };
    return { previous: months[months.length - 2], current: months[months.length - 1] };
  }

  function computeCatalogChanges(historyByMonth) {
    const { previous, current } = pickMonths(historyByMonth);
    if (!previous || !current) return [];
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
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'added',
          csp: (curr.csp_injected || curr.csp || '').toLowerCase(),
          catalogitemnumber: curr.catalogitemnumber || curr.catalognum || '',
          title: curr.title || '',
          cust_delta: toNum(curr.customerunitprice || curr.custunitprice),
          cust_delta_pct: null,
          comm_delta: toNum(curr.commercialunitprice || curr.communitprice),
          comm_delta_pct: null
        });
        return;
      }
      if (prev && !curr) {
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'removed',
          csp: (prev.csp_injected || prev.csp || '').toLowerCase(),
          catalogitemnumber: prev.catalogitemnumber || prev.catalognum || '',
          title: prev.title || '',
          cust_delta: -toNum(prev.customerunitprice || prev.custunitprice),
          cust_delta_pct: null,
          comm_delta: -toNum(prev.commercialunitprice || prev.communitprice),
          comm_delta_pct: null
        });
        return;
      }

      const prevCust = toNum(prev.customerunitprice || prev.custunitprice);
      const currCust = toNum(curr.customerunitprice || curr.custunitprice);
      const prevComm = toNum(prev.commercialunitprice || prev.communitprice);
      const currComm = toNum(curr.commercialunitprice || curr.communitprice);
      const custDelta = currCust - prevCust;
      const commDelta = currComm - prevComm;
      const changed = custDelta !== 0 || commDelta !== 0 ||
        (prev.discountpremiumfee || '') !== (curr.discountpremiumfee || '') ||
        (prev.customerunitofissue || '') !== (curr.customerunitofissue || '') ||
        (prev.commercialunitofissue || '') !== (curr.commercialunitofissue || '');

      if (changed) {
        out.push({
          month_from: previous,
          month_to: current,
          change_type: 'updated',
          csp: (curr.csp_injected || curr.csp || '').toLowerCase(),
          catalogitemnumber: curr.catalogitemnumber || curr.catalognum || '',
          title: curr.title || '',
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
