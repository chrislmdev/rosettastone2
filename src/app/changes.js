(() => {
  function fmtDelta(v) {
    if (v === null || v === undefined) return '—';
    const n = Number(v) || 0;
    const sign = n > 0 ? '+' : '';
    return `${sign}$${n.toFixed(4)}`;
  }

  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    const n = Number(v) || 0;
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  }

  function renderCatalogChanges() {
    const body = document.getElementById('chgBody');
    const empty = document.getElementById('chgEmpty');
    const count = document.getElementById('chgCount');
    if (!body) return;
    const all = window.catalogChanges || [];
    const csp = String(document.getElementById('chgCspFilter')?.value || '').toLowerCase().trim();
    const type = String(document.getElementById('chgTypeFilter')?.value || '').toLowerCase().trim();
    const rows = all.filter(r => (!csp || r.csp === csp) && (!type || r.change_type === type));
    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '0 rows';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (count) count.textContent = `${rows.length} rows`;
    body.innerHTML = rows.map(r => `
      <tr>
        <td><span class="pt-csp-badge ${r.csp}">${r.csp.toUpperCase()}</span></td>
        <td>${r.catalogitemnumber || '—'}</td>
        <td>${r.title || '—'}</td>
        <td>${r.change_type}</td>
        <td>${fmtDelta(r.cust_delta)}</td>
        <td>${fmtPct(r.cust_delta_pct)}</td>
        <td>${fmtDelta(r.comm_delta)}</td>
        <td>${fmtPct(r.comm_delta_pct)}</td>
      </tr>
    `).join('');
  }

  window.renderCatalogChanges = renderCatalogChanges;
})();
