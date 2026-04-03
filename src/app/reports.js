(() => {
  let reportChartInstances = [];

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  function destroyReportCharts() {
    reportChartInstances.forEach(c => {
      try {
        c.destroy();
      } catch (_) {
        /* ignore */
      }
    });
    reportChartInstances = [];
  }

  function canvasToPng(id) {
    const el = document.getElementById(id);
    try {
      return el && typeof el.toDataURL === 'function' ? el.toDataURL('image/png') : '';
    } catch (_) {
      return '';
    }
  }

  const REPORT_PRINT_CSS = `
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',system-ui,sans-serif;padding:28px 32px;color:#0f172a;font-size:11px;line-height:1.45;max-width:1100px;margin:0 auto}
    .report-header{border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px}
    h1{font-size:22px;margin:0 0 6px;font-weight:700;letter-spacing:-0.02em;color:#0f172a}
    .subtitle{margin:0;color:#64748b;font-size:12px}
    .meta{margin:12px 0 0;padding-left:18px;color:#475569;font-size:11px}
    h2{font-size:14px;margin:0 0 10px;color:#1e293b;text-transform:uppercase;letter-spacing:0.06em}
    .charts-section{margin-bottom:28px;page-break-inside:avoid}
    .charts-lead{margin:0 0 12px;color:#64748b;font-size:11px}
    .charts-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:start}
    @media print{.charts-grid{grid-template-columns:1fr 1fr 1fr}}
    .chart-fig{margin:0;page-break-inside:avoid;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px 12px}
    .chart-fig figcaption{font-size:10px;font-weight:600;color:#475569;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em}
    .chart-fig img{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px}
    table{border-collapse:collapse;width:100%;margin-top:8px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-size:10px;font-weight:600;color:#334155}
    tr:nth-child(even) td{background:#fafafa}
    .note{font-size:11px;color:#64748b;margin-top:12px}
    @page{margin:12mm}
    @media print{body{padding:0}.chart-fig{border-color:#ccc}}
  `;

  function chartBlock(title, dataUrl) {
    if (!dataUrl || dataUrl.length < 64) return '';
    return `<figure class="chart-fig"><figcaption>${escHtml(title)}</figcaption><img src="${dataUrl}" alt="" /></figure>`;
  }

  function openPrintDocument(title, headerTitle, metaLines, chartsSectionHtml, tableSectionHtml) {
    const filtHtml = metaLines.filter(Boolean).map(l => `<li>${escHtml(l)}</li>`).join('');
    const dateStr = new Date().toLocaleString();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
      <style>${REPORT_PRINT_CSS}</style></head><body>
      <header class="report-header">
        <h1>${escHtml(headerTitle)}</h1>
        <p class="subtitle">Generated ${escHtml(dateStr)} · CloudPrism</p>
        <ul class="meta">${filtHtml}</ul>
      </header>
      ${chartsSectionHtml}
      ${tableSectionHtml}
      </body></html>`;

    const win = window.open('', '_blank', 'width=1000,height=780');
    if (!win) {
      if (typeof showToast === 'function') showToast('Pop-up blocked — allow pop-ups to export PDF', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 400);
    if (typeof showToast === 'function') showToast('PDF — use Print → Save as PDF', 'success');
  }

  function runExceptionsLibraryReport() {
    if (typeof window.exportExceptionsPdf === 'function') {
      window.exportExceptionsPdf();
      return;
    }
    if (typeof showToast === 'function') showToast('Exceptions export not available', 'error');
  }

  async function runCatalogChangesSummaryReport() {
    const rows = window.catalogChanges || [];
    if (!rows.length) {
      if (typeof showToast === 'function') {
        showToast('No catalog changes loaded. Open the Catalog Changes tab first to load comparison data.', 'error');
      }
      return;
    }

    const meta = window.catalogChangesMeta || {};
    const ChartCtor = typeof Chart !== 'undefined' ? Chart : null;
    if (!ChartCtor) {
      if (typeof showToast === 'function') showToast('Chart.js not loaded', 'error');
      return;
    }

    destroyReportCharts();
    ChartCtor.defaults.color = '#475569';
    ChartCtor.defaults.font.family = "'IBM Plex Sans', sans-serif";
    ChartCtor.defaults.font.size = 9;

    const compact = { layout: { padding: { top: 4, right: 6, bottom: 4, left: 6 } } };
    const axisLight = {
      ticks: { color: '#475569', font: { size: 8 } },
      grid: { color: '#e2e8f0' },
    };

    const typeMap = {};
    const cspMap = {};
    const jwccBuckets = { '$0': 0, '$0–1': 0, '$1–10': 0, '$10+': 0 };
    rows.forEach(r => {
      const t = String(r.change_type || 'unknown').toLowerCase();
      typeMap[t] = (typeMap[t] || 0) + 1;
      const c = String(r.csp || '—').toLowerCase();
      cspMap[c] = (cspMap[c] || 0) + 1;
      const ad = Math.abs(Number(r.cust_delta) || 0);
      if (ad === 0) jwccBuckets['$0'] += 1;
      else if (ad < 1) jwccBuckets['$0–1'] += 1;
      else if (ad < 10) jwccBuckets['$1–10'] += 1;
      else jwccBuckets['$10+'] += 1;
    });

    const typeLabels = Object.keys(typeMap).sort();
    const typeColors = {
      added: '#22c55e',
      removed: '#ef4444',
      updated: '#3b82f6',
      unknown: '#94a3b8',
    };

    const ctxType = document.getElementById('repChartType')?.getContext('2d');
    if (ctxType) {
      const ch = new ChartCtor(ctxType, {
        type: 'doughnut',
        data: {
          labels: typeLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
          datasets: [{
            data: typeLabels.map(l => typeMap[l]),
            backgroundColor: typeLabels.map(l => typeColors[l] || '#6366f1'),
            borderWidth: 1,
            borderColor: '#fff',
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: false,
          maintainAspectRatio: false,
          cutout: '55%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#334155', boxWidth: 10, padding: 6, font: { size: 8 } },
            },
          },
        },
      });
      reportChartInstances.push(ch);
    }

    const cspLabels = Object.keys(cspMap).sort();
    const ctxCsp = document.getElementById('repChartCsp')?.getContext('2d');
    if (ctxCsp) {
      const ch = new ChartCtor(ctxCsp, {
        type: 'bar',
        data: {
          labels: cspLabels.map(c => c.toUpperCase()),
          datasets: [{
            label: 'Changes',
            data: cspLabels.map(c => cspMap[c]),
            backgroundColor: '#0ea5e9',
            borderRadius: 3,
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: false,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ...axisLight, beginAtZero: true },
            y: { ...axisLight, grid: { display: false } },
          },
        },
      });
      reportChartInstances.push(ch);
    }

    const bLabels = Object.keys(jwccBuckets);
    const ctxJwcc = document.getElementById('repChartJwcc')?.getContext('2d');
    if (ctxJwcc) {
      const ch = new ChartCtor(ctxJwcc, {
        type: 'bar',
        data: {
          labels: bLabels,
          datasets: [{
            label: 'Rows',
            data: bLabels.map(k => jwccBuckets[k]),
            backgroundColor: '#8b5cf6',
            borderRadius: 3,
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: '|JWCC Δ| magnitude (this page)',
              color: '#334155',
              font: { size: 10, weight: '600' },
            },
          },
          scales: {
            x: { ...axisLight, grid: { display: false } },
            y: { ...axisLight, beginAtZero: true },
          },
        },
      });
      reportChartInstances.push(ch);
    }

    await new Promise(r => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)));
    });

    const img1 = canvasToPng('repChartType');
    const img2 = canvasToPng('repChartCsp');
    const img3 = canvasToPng('repChartJwcc');

    destroyReportCharts();

    const metaLines = [
      `Rows in this sample: ${rows.length}`,
      meta.month_from && meta.month_to
        ? `Comparing import month ${meta.month_from} → ${meta.month_to}`
        : null,
      meta.total != null && meta.offset != null
        ? `Sample position: ${meta.offset + 1}–${meta.offset + rows.length} of ${meta.total} total changes (paginated API — charts reflect this page only)`
        : meta.total != null
          ? `Total changes (client window): ${meta.total}`
          : null,
    ];

    const chartsSection = `
      <section class="charts-section">
        <h2>Analytics overview</h2>
        <p class="charts-lead">Aggregates reflect the currently loaded change rows only (see meta). JWCC Δ is the contracted/JWCC unit price delta; Comm Δ is the commercial/list side.</p>
        <div class="charts-grid">
          ${chartBlock('Changes by type', img1)}
          ${chartBlock('Changes by CSP', img2)}
          ${chartBlock('JWCC price delta magnitude', img3)}
        </div>
      </section>`;

    const cap = 500;
    const noteFn = typeof window.formatCatalogChangeNotes === 'function' ? window.formatCatalogChangeNotes : () => '';
    const tableRows = rows.slice(0, cap)
      .map(
        r => `<tr>
        <td>${escHtml(r.csp)}</td>
        <td>${escHtml(r.catalogitemnumber)}</td>
        <td>${escHtml(r.title)}</td>
        <td>${escHtml(r.change_type)}</td>
        <td>${escHtml(noteFn(r))}</td>
        <td>${escHtml(fmtChgPrice(r.prev_jwcc))}</td>
        <td>${escHtml(fmtChgPrice(r.curr_jwcc))}</td>
        <td>${escHtml(fmtDelta(r.cust_delta))}</td>
        <td>${escHtml(fmtChgPrice(r.prev_comm))}</td>
        <td>${escHtml(fmtChgPrice(r.curr_comm))}</td>
        <td>${escHtml(fmtDelta(r.comm_delta))}</td>
      </tr>`
      )
      .join('');
    const more =
      rows.length > cap
        ? `<p class="note">First ${cap} of ${rows.length} loaded rows shown. Use Catalog Changes tab pagination or API for additional rows.</p>`
        : '';

    const tableSection = `
      <section class="detail-section">
        <h2>Change records (sample)</h2>
        <table><thead><tr>
          <th>CSP</th><th>Catalog #</th><th>Title</th><th>Type</th><th>Notes</th>
          <th>JWCC (from)</th><th>JWCC (to)</th><th>JWCC Δ</th>
          <th>Comm (from)</th><th>Comm (to)</th><th>Comm Δ</th>
        </tr></thead><tbody>${tableRows}</tbody></table>
        ${more}
      </section>`;

    openPrintDocument(
      'Catalog changes report',
      'Catalog changes summary',
      metaLines,
      chartsSection,
      tableSection
    );
  }

  async function runExceptionChangesSummaryReport() {
    const rows = window.exceptionChanges || [];
    if (!rows.length) {
      if (typeof showToast === 'function') {
        showToast(
          'No exception changes loaded. Open Catalog Changes → Exception deltas (API) first.',
          'error'
        );
      }
      return;
    }

    const meta = window.exceptionChangesMeta || {};
    const ChartCtor = typeof Chart !== 'undefined' ? Chart : null;
    if (!ChartCtor) {
      if (typeof showToast === 'function') showToast('Chart.js not loaded', 'error');
      return;
    }

    destroyReportCharts();
    ChartCtor.defaults.color = '#475569';
    ChartCtor.defaults.font.family = "'IBM Plex Sans', sans-serif";
    ChartCtor.defaults.font.size = 9;

    const compact = { layout: { padding: { top: 4, right: 6, bottom: 4, left: 6 } } };
    const axisLight = {
      ticks: { color: '#475569', font: { size: 8 } },
      grid: { color: '#e2e8f0' },
    };

    const typeMap = {};
    const cspMap = {};
    rows.forEach(r => {
      const t = String(r.change_type || 'unknown').toLowerCase();
      typeMap[t] = (typeMap[t] || 0) + 1;
      const c = String(r.csp || '—').toLowerCase();
      cspMap[c] = (cspMap[c] || 0) + 1;
    });

    const typeLabels = Object.keys(typeMap).sort();
    const typeColors = {
      added: '#22c55e',
      removed: '#ef4444',
      updated: '#3b82f6',
      unknown: '#94a3b8',
    };

    const ctxType = document.getElementById('repChartType')?.getContext('2d');
    if (ctxType) {
      const ch = new ChartCtor(ctxType, {
        type: 'doughnut',
        data: {
          labels: typeLabels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
          datasets: [{
            data: typeLabels.map(l => typeMap[l]),
            backgroundColor: typeLabels.map(l => typeColors[l] || '#6366f1'),
            borderWidth: 1,
            borderColor: '#fff',
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: false,
          maintainAspectRatio: false,
          cutout: '55%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#334155', boxWidth: 10, padding: 6, font: { size: 8 } },
            },
          },
        },
      });
      reportChartInstances.push(ch);
    }

    const cspLabels = Object.keys(cspMap).sort();
    const ctxCsp = document.getElementById('repChartCsp')?.getContext('2d');
    if (ctxCsp) {
      const ch = new ChartCtor(ctxCsp, {
        type: 'bar',
        data: {
          labels: cspLabels.map(c => c.toUpperCase()),
          datasets: [{
            label: 'Changes',
            data: cspLabels.map(c => cspMap[c]),
            backgroundColor: '#0ea5e9',
            borderRadius: 3,
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: false,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { ...axisLight, beginAtZero: true },
            y: { ...axisLight, grid: { display: false } },
          },
        },
      });
      reportChartInstances.push(ch);
    }

    await new Promise(r => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)));
    });

    const img1 = canvasToPng('repChartType');
    const img2 = canvasToPng('repChartCsp');

    destroyReportCharts();

    const metaLines = [
      `Rows in this sample: ${rows.length}`,
      meta.month_from && meta.month_to
        ? `Comparing import month ${meta.month_from} → ${meta.month_to}`
        : null,
      meta.total != null && meta.offset != null
        ? `Sample position: ${meta.offset + 1}–${meta.offset + rows.length} of ${meta.total} total (paginated API)`
        : meta.total != null
          ? `Total changes: ${meta.total}`
          : null,
    ];

    const chartsSection = `
      <section class="charts-section">
        <h2>Analytics overview</h2>
        <p class="charts-lead">Aggregates reflect the currently loaded exception change rows only.</p>
        <div class="charts-grid">
          ${chartBlock('Changes by type', img1)}
          ${chartBlock('Changes by CSP', img2)}
        </div>
      </section>`;

    const cap = 500;
    const noteFn = typeof window.formatExceptionChangeNotes === 'function' ? window.formatExceptionChangeNotes : () => '';
    const tableRows = rows.slice(0, cap)
      .map(
        r => `<tr>
        <td>${escHtml(r.csp)}</td>
        <td>${escHtml(r.exceptionuniqueid)}</td>
        <td>${escHtml(r.csoshortname)}</td>
        <td>${escHtml(r.change_type)}</td>
        <td>${escHtml(noteFn(r))}</td>
        <td>${escHtml(r.exceptionstatus_prev || '—')} → ${escHtml(r.exceptionstatus_curr || '—')}</td>
        <td>${escHtml(r.impactlevel_prev || '—')} → ${escHtml(r.impactlevel_curr || '—')}</td>
      </tr>`
      )
      .join('');
    const more =
      rows.length > cap
        ? `<p class="note">First ${cap} of ${rows.length} loaded rows shown.</p>`
        : '';

    const tableSection = `
      <section class="detail-section">
        <h2>Exception change records (sample)</h2>
        <table><thead><tr>
          <th>CSP</th><th>Exception ID</th><th>Short name</th><th>Type</th><th>Notes</th>
          <th>Status prev → curr</th><th>Impact prev → curr</th>
        </tr></thead><tbody>${tableRows}</tbody></table>
        ${more}
      </section>`;

    openPrintDocument(
      'Exception changes report',
      'Exception library changes summary',
      metaLines,
      chartsSection,
      tableSection
    );
  }

  const REPORTS_REGISTRY = [
    { id: 'exceptions_library', label: 'Exceptions library (PDF)', run: runExceptionsLibraryReport },
    { id: 'catalog_changes_summary', label: 'Catalog changes summary (PDF)', run: runCatalogChangesSummaryReport },
    { id: 'exception_changes_summary', label: 'Exception changes summary (PDF)', run: runExceptionChangesSummaryReport },
  ];

  function runCloudPrismReport(id) {
    const entry = REPORTS_REGISTRY.find(r => r.id === id);
    if (!entry) {
      if (typeof showToast === 'function') showToast('Unknown report', 'error');
      return;
    }
    return entry.run();
  }

  window.runCloudPrismReport = runCloudPrismReport;
  window.CLOUDPRISM_REPORTS_REGISTRY = REPORTS_REGISTRY;
})();
