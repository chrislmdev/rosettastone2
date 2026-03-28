(() => {
  function initExceptionsPage() {
    const statusEl = document.getElementById('excStatusFilter');
    if (!statusEl || !Array.isArray(window.csoExceptionData)) return;
    const vals = [...new Set(window.csoExceptionData.map(r => (r.exceptionstatus || r.status || '').trim()).filter(Boolean))].sort();
    statusEl.innerHTML = '<option value="">Status: All</option>' + vals.map(v => `<option value="${v}">${v}</option>`).join('');
  }

  function renderExceptions() {
    const body = document.getElementById('excBody');
    const empty = document.getElementById('excEmpty');
    const count = document.getElementById('excCount');
    if (!body) return;

    const q = String(document.getElementById('excSearch')?.value || '').toLowerCase().trim();
    const csp = String(document.getElementById('excCspFilter')?.value || '').toLowerCase().trim();
    const status = String(document.getElementById('excStatusFilter')?.value || '').trim();
    const rows = (window.csoExceptionData || []).filter(r => {
      const rowCsp = String(r.csp_injected || r.csp || '').toLowerCase();
      const rowStatus = String(r.exceptionstatus || r.status || '');
      const blob = [
        r.exceptionuniqueid || r.uniqueid,
        r.csoshortname || r.shortname,
        r.impactlevel,
        rowStatus,
        r.exceptionpwsrequirement,
        r.exceptionbasisforrequest,
        r.exceptionsecurityconsiderations || r.exceptionsecurity
      ].join(' ').toLowerCase();
      return (!csp || rowCsp === csp) && (!status || rowStatus === status) && (!q || blob.includes(q));
    });

    if (!rows.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '0 items';
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
  }

  window.initExceptionsPage = initExceptionsPage;
  window.renderExceptions = renderExceptions;
})();
