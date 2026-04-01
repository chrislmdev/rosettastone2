(() => {
  let chartService = null, chartStatus = null, chartImpact = null;
  let chartDebounceTimer = null;

  function destroyCharts() {
    [chartService, chartStatus, chartImpact].forEach(c => { if (c) c.destroy(); });
    chartService = chartStatus = chartImpact = null;
  }

  const IL_COLORS = {
    il2: '#22c55e',
    il3: '#06b6d4',
    il4: '#3b82f6',
    il5: '#a855f7',
    il6: '#ef4444',
  };

  function renderExceptionCharts(rows) {
    const grid = document.getElementById('excChartsGrid');
    if (!grid) return;
    destroyCharts();

    if (!rows.length) { grid.style.display = 'none'; return; }
    grid.style.display = 'grid';

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.font.size = 9;

    const compact = {
      layout: { padding: { top: 2, right: 4, bottom: 2, left: 4 } },
    };

    const svcMap = {};
    rows.forEach(r => {
      const k = (r.csoshortname || r.shortname || 'Unknown').trim();
      svcMap[k] = (svcMap[k] || 0) + 1;
    });
    const svcSorted = Object.entries(svcMap).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const svcCtx = document.getElementById('excChartByService')?.getContext('2d');
    if (svcCtx) {
      chartService = new Chart(svcCtx, {
        type: 'bar',
        data: {
          labels: svcSorted.map(([k]) => k),
          datasets: [{
            label: 'Exceptions',
            data: svcSorted.map(([, v]) => v),
            backgroundColor: '#3b82f6',
            borderRadius: 3,
          }],
        },
        options: {
          ...compact,
          animation: false,
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#1e2535' }, ticks: { color: '#94a3b8', font: { size: 8 } } },
            y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 8 }, maxRotation: 0 } },
          },
        },
      });
    }

    const statusMap = {};
    rows.forEach(r => {
      const k = (r.exceptionstatus || r.status || 'Unknown').trim();
      statusMap[k] = (statusMap[k] || 0) + 1;
    });
    const STATUS_COLORS = { Approved: '#22c55e', Pending: '#f59e0b', Denied: '#ef4444',
      Unknown: '#4b5975', Active: '#22c55e' };
    const statusCtx = document.getElementById('excChartByStatus')?.getContext('2d');
    if (statusCtx) {
      const labels = Object.keys(statusMap);
      chartStatus = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: labels.map(l => statusMap[l]),
            backgroundColor: labels.map(l => STATUS_COLORS[l] || '#3b82f6'),
            borderWidth: 1,
            borderColor: '#0f1219',
          }],
        },
        options: {
          ...compact,
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#94a3b8', boxWidth: 10, padding: 6, font: { size: 8 } },
            },
          },
        },
      });
    }

    const csps = [...new Set(rows.map(r => (r.csp_injected || r.csp || '').toLowerCase()))].sort();
    const impacts = [...new Set(rows.map(r => (r.impactlevel || '').toLowerCase()))].sort();
    const impactCtx = document.getElementById('excChartByImpact')?.getContext('2d');
    if (impactCtx && csps.length) {
      chartImpact = new Chart(impactCtx, {
        type: 'bar',
        data: {
          labels: csps.map(c => c.toUpperCase()),
          datasets: impacts.map(il => ({
            label: il.toUpperCase(),
            data: csps.map(csp =>
              rows.filter(r =>
                (r.csp_injected || r.csp || '').toLowerCase() === csp &&
                (r.impactlevel || '').toLowerCase() === il
              ).length
            ),
            backgroundColor: IL_COLORS[il] || '#3b82f6',
            borderRadius: 2,
          })),
        },
        options: {
          ...compact,
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#94a3b8', boxWidth: 10, padding: 4, font: { size: 8 } },
            },
          },
          scales: {
            x: { stacked: true, grid: { color: '#1e2535' }, ticks: { color: '#94a3b8', font: { size: 8 } } },
            y: { stacked: true, grid: { color: '#1e2535' }, ticks: { color: '#94a3b8', font: { size: 8 } } },
          },
        },
      });
    }
  }

  function scheduleExceptionCharts(rows) {
    if (chartDebounceTimer) clearTimeout(chartDebounceTimer);
    if (!rows.length) {
      renderExceptionCharts([]);
      return;
    }
    chartDebounceTimer = setTimeout(() => {
      chartDebounceTimer = null;
      renderExceptionCharts(rows);
    }, 280);
  }

  function escCsv(s) {
    const t = String(s ?? '');
    if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatExcImportedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  }

  function exportExceptionsCsv() {
    const rows = window.__excFilteredRows || [];
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('No rows to export', 'error');
      return;
    }
    const headers = ['csp', 'import_month', 'imported_at', 'exceptionuniqueid', 'csoshortname', 'impactlevel', 'exceptionstatus',
      'exceptionpwsrequirement', 'exceptionbasisforrequest', 'exceptionsecurityconsiderations'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      const line = headers.map(h => {
        let v = r[h];
        if (v === undefined || v === null) {
          if (h === 'csp') v = r.csp_injected || r.csp || '';
          else if (h === 'import_month') v = r.import_month || '';
          else if (h === 'imported_at') v = r.imported_at || '';
          else if (h === 'exceptionuniqueid') v = r.uniqueid || '';
          else if (h === 'csoshortname') v = r.shortname || '';
          else if (h === 'exceptionstatus') v = r.status || '';
          else if (h === 'exceptionsecurityconsiderations') v = r.exceptionsecurity || '';
          else v = '';
        }
        return escCsv(v);
      });
      lines.push(line.join(','));
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exceptions-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    if (typeof showToast === 'function') showToast('CSV downloaded', 'success');
  }

  function canvasToPng(id) {
    const el = document.getElementById(id);
    try {
      return el && typeof el.toDataURL === 'function' ? el.toDataURL('image/png') : '';
    } catch (e) {
      return '';
    }
  }

  async function exportExceptionsPdf() {
    const rows = window.__excFilteredRows || [];
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('No rows to export', 'error');
      return;
    }
    const q = String(document.getElementById('excSearch')?.value || '').trim();
    const service = String(document.getElementById('excServiceFilter')?.value || '');
    const excCsp = typeof window.excCspFilters === 'object' && window.excCspFilters ? window.excCspFilters : null;
    const ms = typeof window.msState === 'object' && window.msState ? window.msState : null;
    const cspKeys = ['aws', 'azure', 'gcp', 'oracle'];
    let cspLine = '';
    if (excCsp) {
      const on = cspKeys.filter(k => excCsp[k]);
      if (on.length && on.length < cspKeys.length) cspLine = `CSP: ${on.map(k => k.toUpperCase()).join(', ')}`;
    }
    let statusLine = '';
    if (ms && ms.exstat && ms.exstat.size) statusLine = `Status: ${[...ms.exstat].sort().join(', ')}`;
    let impactLine = '';
    if (ms && ms.exil && ms.exil.size) impactLine = `Impact: ${[...ms.exil].sort().join(', ')}`;
    const filtLines = [
      `Records: ${rows.length}`,
      cspLine || null,
      statusLine || null,
      impactLine || null,
      service && `Service: ${service}`,
      q && `Search: ${q}`,
    ].filter(Boolean);
    const filtHtml = filtLines.map(l => `<li>${escHtml(l)}</li>`).join('');

    const grid = document.getElementById('excChartsGrid');
    const prevGridDisplay = grid ? grid.style.display : '';
    if (grid) grid.style.display = 'grid';

    if (chartDebounceTimer) {
      clearTimeout(chartDebounceTimer);
      chartDebounceTimer = null;
    }
    renderExceptionCharts(rows);
    await new Promise(r => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)));
    });

    const imgSvc = canvasToPng('excChartByService');
    const imgSt = canvasToPng('excChartByStatus');
    const imgIm = canvasToPng('excChartByImpact');

    if (grid) {
      if (prevGridDisplay) grid.style.display = prevGridDisplay;
      else if (rows.length) grid.style.display = 'grid';
    }
    scheduleExceptionCharts(rows);

    const chartBlock = (title, dataUrl) => {
      if (!dataUrl || dataUrl.length < 64) return '';
      return `<figure class="chart-fig"><figcaption>${escHtml(title)}</figcaption><img src="${dataUrl}" alt="" /></figure>`;
    };
    const chartsSection = `
      <section class="charts-section">
        <h2>Analytics overview</h2>
        <p class="charts-lead">Snapshot of filtered data at export time.</p>
        <div class="charts-grid">
          ${chartBlock('Exceptions by service', imgSvc)}
          ${chartBlock('Status breakdown', imgSt)}
          ${chartBlock('Impact level by CSP', imgIm)}
        </div>
      </section>`;

    const tableRows = rows.slice(0, 500).map(r => `<tr>
      <td>${escHtml(r.csp_injected || r.csp)}</td>
      <td>${escHtml(r.import_month || '—')}</td>
      <td>${escHtml(formatExcImportedAt(r.imported_at))}</td>
      <td>${escHtml(r.exceptionuniqueid || r.uniqueid)}</td>
      <td>${escHtml(r.csoshortname || r.shortname)}</td>
      <td>${escHtml(r.impactlevel)}</td>
      <td>${escHtml(r.exceptionstatus || r.status)}</td>
      <td>${escHtml(r.exceptionpwsrequirement)}</td>
      <td>${escHtml(r.exceptionbasisforrequest)}</td>
    </tr>`).join('');

    const more = rows.length > 500 ? `<p class="note">First 500 of ${rows.length} rows shown. Use CSV export for the full dataset.</p>` : '';

    const dateStr = new Date().toLocaleString();

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Exceptions report</title>
      <style>
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
        @media print{
          body{padding:0}
          .chart-fig{border-color:#ccc}
        }
      </style></head><body>
      <header class="report-header">
        <h1>Exceptions library</h1>
        <p class="subtitle">Generated ${escHtml(dateStr)} · CloudPrism</p>
        <ul class="meta">${filtHtml}</ul>
      </header>
      ${chartsSection}
      <section class="detail-section">
        <h2>Exception records</h2>
        <table><thead><tr>
          <th>CSP</th><th>Import month</th><th>Imported at</th><th>Exception ID</th><th>Short name</th><th>Impact</th><th>Status</th>
          <th>PWS requirement</th><th>Basis</th>
        </tr></thead><tbody>${tableRows}</tbody></table>
        ${more}
      </section>
      </body></html>`;

    const win = window.open('', '_blank', 'width=1000,height=780');
    if (!win) {
      if (typeof showToast === 'function') showToast('Pop-up blocked — allow pop-ups to export PDF', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
    if (typeof showToast === 'function') showToast('PDF — use Print → Save as PDF', 'success');
  }

  function initExceptionsPage() {
    if (!Array.isArray(window.csoExceptionData)) return;
    const data = window.csoExceptionData;

    const excCsp = typeof window.excCspFilters === 'object' && window.excCspFilters ? window.excCspFilters : null;
    if (excCsp) {
      ['aws', 'azure', 'gcp', 'oracle'].forEach(c => { excCsp[c] = true; });
      ['aws', 'azure', 'gcp', 'oracle'].forEach(c => {
        const btn = document.getElementById(`exc-pf-${c}`);
        if (btn) btn.classList.add('active');
      });
    }

    const ms = typeof window.msState === 'object' && window.msState ? window.msState : null;
    if (ms) {
      if (ms.exstat) ms.exstat.clear();
      if (ms.exil) ms.exil.clear();
      document.querySelectorAll('[data-ms="exstat"], [data-ms="exil"]').forEach(el => el.classList.remove('selected'));
      if (typeof updateMsLabel === 'function') {
        updateMsLabel('exstat');
        updateMsLabel('exil');
      }
    }

    const exstatOpts = document.getElementById('ms-exstat-opts');
    if (exstatOpts) {
      exstatOpts.innerHTML = '';
      const vals = [...new Set(data.map(r => (r.exceptionstatus || r.status || '').trim()).filter(Boolean))].sort();
      vals.forEach(v => {
        const div = document.createElement('div');
        div.className = 'ms-option';
        div.setAttribute('data-ms', 'exstat');
        div.setAttribute('data-val', v);
        div.innerHTML = `<span class="ms-check"></span><span>${escHtml(v)}</span>`;
        div.addEventListener('click', function onExstatClick() {
          if (typeof toggleMsOpt === 'function') toggleMsOpt('exstat', v, div);
        });
        exstatOpts.appendChild(div);
      });
    }

    const svcEl = document.getElementById('excServiceFilter');
    if (svcEl) {
      const vals = [...new Set(data.map(r => (r.csoshortname || r.shortname || '').trim()).filter(Boolean))].sort();
      svcEl.innerHTML = '<option value="">Service: All</option>' +
        vals.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    }
  }

  function renderExceptions() {
    const body = document.getElementById('excBody');
    const empty = document.getElementById('excEmpty');
    const count = document.getElementById('excCount');
    if (!body) return;

    const q = String(document.getElementById('excSearch')?.value || '').toLowerCase().trim();
    const service = String(document.getElementById('excServiceFilter')?.value || '').trim();
    const excCsp = typeof window.excCspFilters === 'object' && window.excCspFilters ? window.excCspFilters : null;
    const ms = typeof window.msState === 'object' && window.msState ? window.msState : null;
    const exstat = ms && ms.exstat ? ms.exstat : null;
    const exil = ms && ms.exil ? ms.exil : null;

    const rows = (window.csoExceptionData || []).filter(r => {
      const rowCsp = String(r.csp_injected || r.csp || '').toLowerCase().trim();
      const rowStatus = String(r.exceptionstatus || r.status || '');
      const rowImpactRaw = String(r.impactlevel || '');
      const rowService = String(r.csoshortname || r.shortname || '');
      const blob = [
        r.exceptionuniqueid || r.uniqueid,
        rowService,
        rowImpactRaw,
        rowStatus,
        r.exceptionpwsrequirement,
        r.exceptionbasisforrequest,
        r.exceptionsecurityconsiderations || r.exceptionsecurity,
      ].join(' ').toLowerCase();

      const cspOk = !excCsp || excCsp[rowCsp] || rowCsp === '—';
      const statusOk = !exstat || exstat.size === 0 || exstat.has(rowStatus);
      const levels = rowImpactRaw.split('|').map(l => l.trim().toUpperCase()).filter(Boolean);
      const impactOk = !exil || exil.size === 0 || levels.some(lv => exil.has(lv));

      return (
        cspOk &&
        statusOk &&
        impactOk &&
        (!service || rowService === service) &&
        (!q || blob.includes(q))
      );
    });

    window.__excFilteredRows = rows;

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '0 items';
      scheduleExceptionCharts([]);
      return;
    }
    if (empty) empty.style.display = 'none';
    if (count) count.textContent = `${rows.length} items`;

    body.innerHTML = rows.map(r => `
      <tr>
        <td><span class="pt-csp-badge ${(r.csp_injected || r.csp || '').toLowerCase()}">${String(r.csp_injected || r.csp || 'CSO').toUpperCase()}</span></td>
        <td>${r.import_month || '—'}</td>
        <td>${formatExcImportedAt(r.imported_at)}</td>
        <td>${r.exceptionuniqueid || r.uniqueid || '—'}</td>
        <td>${r.csoshortname || r.shortname || '—'}</td>
        <td>${r.impactlevel || '—'}</td>
        <td>${r.exceptionstatus || r.status || '—'}</td>
        <td>${r.exceptionpwsrequirement || '—'}</td>
        <td>${r.exceptionbasisforrequest || '—'}</td>
      </tr>
    `).join('');

    scheduleExceptionCharts(rows);
  }

  window.initExceptionsPage = initExceptionsPage;
  window.renderExceptions = renderExceptions;
  window.renderExceptionCharts = renderExceptionCharts;
  window.exportExceptionsCsv = exportExceptionsCsv;
  window.exportExceptionsPdf = exportExceptionsPdf;
})();
