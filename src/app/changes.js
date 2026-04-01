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

  function formatImportedAt(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  }

  function formatCompareLine(mf, mt, af, at) {
    let s = `Comparing import month ${mf} → ${mt}`;
    const bits = [];
    if (af) bits.push(`prior ${formatImportedAt(af)}`);
    if (at) bits.push(`current ${formatImportedAt(at)}`);
    if (bits.length) s += ' · ' + bits.join(' · ');
    return s;
  }

  function chgPageLimit() {
    const m = window.catalogChangesMeta;
    return m && Number(m.limit) > 0 ? Number(m.limit) : 1000;
  }

  function updatePagerUi() {
    const src = window.catalogChangesSource;
    const meta = window.catalogChangesMeta;
    const prev = document.getElementById('chgBtnPrev');
    const next = document.getElementById('chgBtnNext');
    const limit = chgPageLimit();
    if (prev) {
      prev.style.display = src === 'api' ? 'inline-block' : 'none';
      prev.disabled = src !== 'api' || !meta || (meta.offset || 0) <= 0;
    }
    if (next) {
      next.style.display = src === 'api' ? 'inline-block' : 'none';
      const off = meta?.offset || 0;
      const total = meta?.total ?? 0;
      next.disabled = src !== 'api' || !meta || off + limit >= total;
    }
  }

  function updateCatalogChangesCompareLabel() {
    const el = document.getElementById('chgCompareBanner');
    if (!el) return;
    const meta = window.catalogChangesMeta;
    const src = window.catalogChangesSource;
    const rows = window.catalogChanges || [];

    if (src === 'api' && meta && meta.month_from && meta.month_to) {
      el.textContent = formatCompareLine(
        meta.month_from,
        meta.month_to,
        meta.imported_at_from,
        meta.imported_at_to
      );
      el.style.display = 'block';
      updatePagerUi();
      return;
    }
    if (src === 'client') {
      if (meta && meta.month_from && meta.month_to) {
        el.textContent = formatCompareLine(meta.month_from, meta.month_to, null, null);
        el.style.display = 'block';
      } else if (rows.length && rows[0].month_from) {
        el.textContent = formatCompareLine(rows[0].month_from, rows[0].month_to, null, null);
        el.style.display = 'block';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
      updatePagerUi();
      return;
    }
    el.textContent = '';
    el.style.display = 'none';
    updatePagerUi();
  }

  function renderCatalogChanges() {
    const body = document.getElementById('chgBody');
    const empty = document.getElementById('chgEmpty');
    const count = document.getElementById('chgCount');
    if (!body) return;
    const all = window.catalogChanges || [];
    const csp = String(document.getElementById('chgCspFilter')?.value || '').toLowerCase().trim();
    const type = String(document.getElementById('chgTypeFilter')?.value || '').toLowerCase().trim();
    const src = window.catalogChangesSource;
    const meta = window.catalogChangesMeta;

    const rows =
      src === 'api'
        ? all
        : all.filter(r => (!csp || r.csp === csp) && (!type || r.change_type === type));

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) {
        if (src === 'api' && meta && meta.total != null) count.textContent = `0 of ${meta.total} rows`;
        else count.textContent = '0 rows';
      }
      updatePagerUi();
      return;
    }
    if (empty) empty.style.display = 'none';
    if (count) {
      if (src === 'api' && meta && meta.total != null) {
        const off = meta.offset || 0;
        count.textContent = `${off + 1}–${off + rows.length} of ${meta.total}`;
      } else {
        count.textContent = `${rows.length} rows`;
      }
    }
    body.innerHTML = rows
      .map(
        r => `
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
    `
      )
      .join('');

    updatePagerUi();
  }

  window.renderCatalogChanges = renderCatalogChanges;
  window.updateCatalogChangesCompareLabel = updateCatalogChangesCompareLabel;
})();
