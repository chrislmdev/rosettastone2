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

  function exportExceptionsCsv() {
    const rows = window.__excFilteredRows || [];
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('No rows to export', 'error');
      return;
    }
    const headers = ['csp', 'exceptionuniqueid', 'csoshortname', 'impactlevel', 'exceptionstatus',
      'exceptionpwsrequirement', 'exceptionbasisforrequest', 'exceptionsecurityconsiderations'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      const line = headers.map(h => {
        let v = r[h];
        if (v === undefined || v === null) {
          if (h === 'csp') v = r.csp_injected || r.csp || '';
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

  function exportExceptionsPdf() {
    const rows = window.__excFilteredRows || [];
    if (!rows.length) {
      if (typeof showToast === 'function') showToast('No rows to export', 'error');
      return;
    }
    const q = String(document.getElementById('excSearch')?.value || '').trim();
    const csp = String(document.getElementById('excCspFilter')?.value || '');
    const status = String(document.getElementById('excStatusFilter')?.value || '');
    const impact = String(document.getElementById('excImpactFilter')?.value || '');
    const service = String(document.getElementById('excServiceFilter')?.value || '');
    const filt = [`Count: ${rows.length}`, csp && `CSP: ${csp}`, status && `Status: ${status}`,
      impact && `Impact: ${impact}`, service && `Service: ${service}`, q && `Search: ${q}`].filter(Boolean).join(' · ');

    const tableRows = rows.slice(0, 500).map(r => `<tr>
      <td>${escHtml(r.csp_injected || r.csp)}</td>
      <td>${escHtml(r.exceptionuniqueid || r.uniqueid)}</td>
      <td>${escHtml(r.csoshortname || r.shortname)}</td>
      <td>${escHtml(r.impactlevel)}</td>
      <td>${escHtml(r.exceptionstatus || r.status)}</td>
      <td>${escHtml(r.exceptionpwsrequirement)}</td>
      <td>${escHtml(r.exceptionbasisforrequest)}</td>
      <td>${escHtml(r.exceptionsecurityconsiderations || r.exceptionsecurity)}</td>
    </tr>`).join('');

    const more = rows.length > 500 ? `<p style="font-size:11px;color:#666">Showing first 500 of ${rows.length} rows. Use CSV export for the full set.</p>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Exceptions report</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111;font-size:11px}
        h1{font-size:18px;margin:0 0 8px}
        .meta{color:#555;margin-bottom:16px;font-size:11px}
        table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#f0f0f0;font-size:10px}
      </style></head><body>
      <h1>Exceptions Library</h1>
      <div class="meta">${escHtml(filt)}</div>
      <table><thead><tr>
        <th>CSP</th><th>Exception ID</th><th>Short Name</th><th>Impact</th><th>Status</th>
        <th>PWS Requirement</th><th>Basis</th><th>Security</th>
      </tr></thead><tbody>${tableRows}</tbody></table>
      ${more}
      </body></html>`;

    const win = window.open('', '_blank', 'width=960,height=720');
    if (!win) {
      if (typeof showToast === 'function') showToast('Pop-up blocked — allow pop-ups to export PDF', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 300);
    if (typeof showToast === 'function') showToast('PDF — use Print dialog → Save as PDF', 'success');
  }

  function initExceptionsPage() {
    if (!Array.isArray(window.csoExceptionData)) return;
    const data = window.csoExceptionData;

    const statusEl = document.getElementById('excStatusFilter');
    if (statusEl) {
      const vals = [...new Set(data.map(r => (r.exceptionstatus || r.status || '').trim()).filter(Boolean))].sort();
      statusEl.innerHTML = '<option value="">Status: All</option>' +
        vals.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    const svcEl = document.getElementById('excServiceFilter');
    if (svcEl) {
      const vals = [...new Set(data.map(r => (r.csoshortname || r.shortname || '').trim()).filter(Boolean))].sort();
      svcEl.innerHTML = '<option value="">Service: All</option>' +
        vals.map(v => `<option value="${v}">${v}</option>`).join('');
    }
  }

  function renderExceptions() {
    const body = document.getElementById('excBody');
    const empty = document.getElementById('excEmpty');
    const count = document.getElementById('excCount');
    if (!body) return;

    const q       = String(document.getElementById('excSearch')?.value || '').toLowerCase().trim();
    const csp     = String(document.getElementById('excCspFilter')?.value || '').toLowerCase().trim();
    const status  = String(document.getElementById('excStatusFilter')?.value || '').trim();
    const impact  = String(document.getElementById('excImpactFilter')?.value || '').toLowerCase().trim();
    const service = String(document.getElementById('excServiceFilter')?.value || '').trim();

    const rows = (window.csoExceptionData || []).filter(r => {
      const rowCsp     = String(r.csp_injected || r.csp || '').toLowerCase();
      const rowStatus  = String(r.exceptionstatus || r.status || '');
      const rowImpact  = String(r.impactlevel || '').toLowerCase();
      const rowService = String(r.csoshortname || r.shortname || '');
      const blob = [
        r.exceptionuniqueid || r.uniqueid,
        rowService,
        rowImpact,
        rowStatus,
        r.exceptionpwsrequirement,
        r.exceptionbasisforrequest,
        r.exceptionsecurityconsiderations || r.exceptionsecurity,
      ].join(' ').toLowerCase();

      return (
        (!csp     || rowCsp === csp) &&
        (!status  || rowStatus === status) &&
        (!impact  || rowImpact === impact) &&
        (!service || rowService === service) &&
        (!q       || blob.includes(q))
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
        <td>${r.exceptionuniqueid || r.uniqueid || '—'}</td>
        <td>${r.csoshortname || r.shortname || '—'}</td>
        <td>${r.impactlevel || '—'}</td>
        <td>${r.exceptionstatus || r.status || '—'}</td>
        <td>${r.exceptionpwsrequirement || '—'}</td>
        <td>${r.exceptionbasisforrequest || '—'}</td>
        <td>${r.exceptionsecurityconsiderations || r.exceptionsecurity || '—'}</td>
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
