(() => {
  // ── Shared Chart instances (destroy before re-render) ──
  let chartService = null, chartStatus = null, chartImpact = null;

  function destroyCharts() {
    [chartService, chartStatus, chartImpact].forEach(c => { if (c) c.destroy(); });
    chartService = chartStatus = chartImpact = null;
  }

  // ── CSP accent colors aligned with CSS --aws/azure/gcp/oracle vars ──
  const CSP_COLORS = {
    aws:    '#ff9900',
    azure:  '#0096d6',
    gcp:    '#34a853',
    oracle: '#c74634',
  };
  const IL_COLORS = {
    il2: '#22c55e',
    il4: '#3b82f6',
    il5: '#a855f7',
    il6: '#ef4444',
  };
  const CHART_DEFAULTS = {
    color: '#e2e8f0',
    font: { family: "'IBM Plex Sans', sans-serif", size: 11 },
  };

  // ── Render the three charts from current filtered data ──
  function renderExceptionCharts(rows) {
    const grid = document.getElementById('excChartsGrid');
    if (!grid) return;
    destroyCharts();

    if (!rows.length) { grid.style.display = 'none'; return; }
    grid.style.display = 'grid';

    const isDark = true; // always dark theme
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.font.size = 11;

    // 1. Bar: Top 15 services by exception count
    const svcMap = {};
    rows.forEach(r => {
      const k = (r.csoshortname || r.shortname || 'Unknown').trim();
      svcMap[k] = (svcMap[k] || 0) + 1;
    });
    const svcSorted = Object.entries(svcMap).sort((a, b) => b[1] - a[1]).slice(0, 15);
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
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: '#1e2535' }, ticks: { color: '#94a3b8' } },
            y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          },
        },
      });
    }

    // 2. Doughnut: Status breakdown
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
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 10 } },
          },
        },
      });
    }

    // 3. Stacked bar: Impact level per CSP
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
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 10 } } },
          scales: {
            x: { stacked: true, grid: { color: '#1e2535' }, ticks: { color: '#94a3b8' } },
            y: { stacked: true, grid: { color: '#1e2535' }, ticks: { color: '#94a3b8' } },
          },
        },
      });
    }
  }

  // ── Populate filter dropdowns from data ──
  function initExceptionsPage() {
    if (!Array.isArray(window.csoExceptionData)) return;
    const data = window.csoExceptionData;

    // Status filter
    const statusEl = document.getElementById('excStatusFilter');
    if (statusEl) {
      const vals = [...new Set(data.map(r => (r.exceptionstatus || r.status || '').trim()).filter(Boolean))].sort();
      statusEl.innerHTML = '<option value="">Status: All</option>' +
        vals.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    // Service filter (CSO short name)
    const svcEl = document.getElementById('excServiceFilter');
    if (svcEl) {
      const vals = [...new Set(data.map(r => (r.csoshortname || r.shortname || '').trim()).filter(Boolean))].sort();
      svcEl.innerHTML = '<option value="">Service: All</option>' +
        vals.map(v => `<option value="${v}">${v}</option>`).join('');
    }
  }

  // ── Main render ──
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

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '0 items';
      renderExceptionCharts([]);
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

    renderExceptionCharts(rows);
  }

  window.initExceptionsPage = initExceptionsPage;
  window.renderExceptions   = renderExceptions;
  window.renderExceptionCharts = renderExceptionCharts;
})();
