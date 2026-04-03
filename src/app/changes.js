(() => {
  function fmtDelta(v) {
    if (v === null || v === undefined) return '—';
    const n = Number(v) || 0;
    const sign = n > 0 ? '+' : '';
    return `${sign}$${n.toFixed(4)}`;
  }

  function fmtChgPrice(v) {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `$${n.toFixed(4)}`;
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function formatCatalogChangeNotes(r) {
    const mf = r.month_from || '—';
    const mt = r.month_to || '—';
    const t = String(r.change_type || '').toLowerCase();
    if (t === 'removed') return `In ${mf}; gone in ${mt}.`;
    if (t === 'added') return `New in ${mt}.`;
    if (t === 'updated') return `Delta ${mf}→${mt}.`;
    return `${mf} → ${mt}`;
  }

  function formatExceptionChangeNotes(r) {
    return formatCatalogChangeNotes(r);
  }

  function chgPageLimit() {
    const m = window.catalogChangesMeta;
    return m && Number(m.limit) > 0 ? Number(m.limit) : 1000;
  }

  function excChgPageLimit() {
    const m = window.exceptionChangesMeta;
    return m && Number(m.limit) > 0 ? Number(m.limit) : 1000;
  }

  function updatePagerUi() {
    const mode = window.catalogChangesMode || 'pricing';
    const src = mode === 'exceptions' ? window.exceptionChangesSource : window.catalogChangesSource;
    const meta = mode === 'exceptions' ? window.exceptionChangesMeta : window.catalogChangesMeta;
    const prev = document.getElementById('chgBtnPrev');
    const next = document.getElementById('chgBtnNext');
    const limit = mode === 'exceptions' ? excChgPageLimit() : chgPageLimit();
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
    const mode = window.catalogChangesMode || 'pricing';

    if (mode === 'exceptions') {
      const meta = window.exceptionChangesMeta;
      const src = window.exceptionChangesSource;
      if (src === 'api' && meta && meta.month_from && meta.month_to) {
        el.textContent = formatCompareLine(
          meta.month_from,
          meta.month_to,
          meta.imported_at_from,
          meta.imported_at_to
        );
        el.style.display = 'block';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
      updatePagerUi();
      return;
    }

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

  function fmtPairCell(prev, curr) {
    const p = prev != null && prev !== '' ? String(prev) : '—';
    const c = curr != null && curr !== '' ? String(curr) : '—';
    if (p === c) return escHtml(p);
    return `${escHtml(p)} → ${escHtml(c)}`;
  }

  function renderPricingChangesTable() {
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
        <td><span class="pt-csp-badge ${r.csp}">${escHtml(String(r.csp || '').toUpperCase())}</span></td>
        <td>${escHtml(r.catalogitemnumber || '—')}</td>
        <td>${escHtml(r.title || '—')}</td>
        <td>${escHtml(r.change_type)}</td>
        <td>${escHtml(formatCatalogChangeNotes(r))}</td>
        <td>${escHtml(fmtChgPrice(r.prev_jwcc))}</td>
        <td>${escHtml(fmtChgPrice(r.curr_jwcc))}</td>
        <td>${fmtDelta(r.cust_delta)}</td>
        <td>${escHtml(fmtChgPrice(r.prev_comm))}</td>
        <td>${escHtml(fmtChgPrice(r.curr_comm))}</td>
        <td>${fmtDelta(r.comm_delta)}</td>
      </tr>
    `
      )
      .join('');

    updatePagerUi();
  }

  function renderExceptionChangesTable() {
    const body = document.getElementById('chgExcBody');
    const empty = document.getElementById('chgExcEmpty');
    const count = document.getElementById('chgCount');
    if (!body) return;
    const all = window.exceptionChanges || [];
    const csp = String(document.getElementById('chgCspFilter')?.value || '').toLowerCase().trim();
    const type = String(document.getElementById('chgTypeFilter')?.value || '').toLowerCase().trim();
    const src = window.exceptionChangesSource;
    const meta = window.exceptionChangesMeta;

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
        <td><span class="pt-csp-badge ${r.csp}">${escHtml(String(r.csp || '').toUpperCase())}</span></td>
        <td>${escHtml(r.exceptionuniqueid || '—')}</td>
        <td>${escHtml(r.csoshortname || '—')}</td>
        <td>${escHtml(r.change_type)}</td>
        <td>${escHtml(formatExceptionChangeNotes(r))}</td>
        <td>${fmtPairCell(r.exceptionstatus_prev, r.exceptionstatus_curr)}</td>
        <td>${fmtPairCell(r.impactlevel_prev, r.impactlevel_curr)}</td>
      </tr>
    `
      )
      .join('');

    updatePagerUi();
  }

  function renderCatalogChanges() {
    const mode = window.catalogChangesMode || 'pricing';
    if (mode === 'exceptions') {
      const pe = document.getElementById('chgEmpty');
      if (pe) pe.style.display = 'none';
      renderExceptionChangesTable();
      return;
    }
    const ee = document.getElementById('chgExcEmpty');
    if (ee) ee.style.display = 'none';
    renderPricingChangesTable();
  }

  window.renderCatalogChanges = renderCatalogChanges;
  window.updateCatalogChangesCompareLabel = updateCatalogChangesCompareLabel;
  window.formatCatalogChangeNotes = formatCatalogChangeNotes;
  window.formatExceptionChangeNotes = formatExceptionChangeNotes;
})();
