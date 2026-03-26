$filePath = "j:\git\rosettastone2\index.html"
$lines = Get-Content $filePath -Encoding UTF8

$start = -1
$end = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^function renderServices\(\)\{') {
        $start = $i
    }
    if ($lines[$i] -match '^// EXPORT / SAMPLE CSV') {
        $end = $i
        break
    }
}

if ($start -ne -1 -and $end -ne -1) {
    $newContent = @"
function renderServices(){
  const q=document.getElementById('svcSearch').value.trim().toLowerCase();
  
  let rows=[...csOParentServiceData];
  
  if(q) {
      rows = rows.filter(r => [r.title, r.csoShortname, r.description, r.category, r.cspName].join(' ').toLowerCase().includes(q));
  }
  
  const cats = msState.cat;
  const ils  = msState.il;
  const csps = msState.csp;
  
  if(cats.size) rows = rows.filter(r => cats.has(r.category));
  if(csps.size) rows = rows.filter(r => csps.has(r.cspName.toLowerCase()));
  if(ils.size)  rows = rows.filter(r => {
      const rowIls = (r.impactlevel||'').split('|').map(x=>x.trim());
      return [...ils].some(il => rowIls.includes(il));
  });

  rows.sort((a,b)=>(a.title||'').localeCompare(b.title));
  
  const tbody=document.getElementById('svcBody');
  const empty=document.getElementById('svcEmpty');
  document.getElementById('svcMeta').innerHTML=`Showing <strong>` + rows.length + `</strong> of <strong>` + csOParentServiceData.length + `</strong> service rows`;
  if(!rows.length){tbody.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  tbody.innerHTML=rows.map(r=> {
    const isAws = r.cspName.toLowerCase()==='aws';
    const isAz = r.cspName.toLowerCase()==='azure';
    const isGcp = r.cspName.toLowerCase()==='gcp';
    const isOra = r.cspName.toLowerCase()==='oracle';
    
    // build badge
    const rawIls = (r.impactlevel||'').split('|').map(l=> `<span class="ib il-`+l.trim()+`">`+l.trim()+`</span>`).join('');
    const badgeHtml = r.title ? `<div class="se"><div class="sn"><a href="`+(r.productURL||'#')+`" target="_blank">`+r.title+`</a></div><div class="sm">`+rawIls+`</div></div>` : '<span class="none-ind">—</span>';
    
    return `<tr>
      <td class="td-cat"><span style="display:flex;align-items:center;gap:5px">`+(r.category||'—')+`</span></td>
      <td class="td-sub">`+(r.shortName||'—')+`</td>
      <td class="td-desc">`+(r.description||'—')+`</td>
      <td class="svc-cell td-aws-c">`+(isAws?badgeHtml:'<span class="none-ind">—</span>')+`</td>
      <td class="svc-cell td-azure-c">`+(isAz?badgeHtml:'<span class="none-ind">—</span>')+`</td>
      <td class="svc-cell td-gcp-c">`+(isGcp?badgeHtml:'<span class="none-ind">—</span>')+`</td>
      <td class="svc-cell td-oracle-c">`+(isOra?badgeHtml:'<span class="none-ind">—</span>')+`</td>
    </tr>`;
  }).join('');
}

function populateCats(){
  const cats=[...new Set(csOParentServiceData.map(s=>s.category))].filter(c=>c).sort();
  const container=document.getElementById('ms-cat-opts');
  container.innerHTML=cats.map(c=>`
    <div class="ms-option" data-ms="cat" data-val="`+c+`" onclick="toggleMsOpt('cat','`+c+`',this)">
      <span class="ms-check"></span><span>`+c+`</span>
    </div>`).join('');
}

document.querySelectorAll('.sortable').forEach(th=>{
  th.addEventListener('click',()=>{
    const col=th.dataset.col;
    svcSortDir = svcSortCol===col ? -svcSortDir : 1;
    svcSortCol=col;
    document.querySelectorAll('.sortable').forEach(t=>{t.classList.remove('sorted');t.querySelector('.si').textContent='↕';});
    th.classList.add('sorted');
    th.querySelector('.si').textContent=svcSortDir===1?'↑':'↓';
    renderServices();
  });
});

function fmt(v){
  const n=parseFloat(v);
  if(isNaN(n)) return v||'—';
  if(n<0.01) return '$'+n.toFixed(6);
  return '$'+n.toFixed(4);
}

function discClass(d){
  if(!d) return '';
  const s=String(d).trim();
  if(s.startsWith('-')) return 'price-disc';
  if(s.startsWith('+')) return 'price-disc-neg';
  return '';
}

function renderPricing(){
  const q=document.getElementById('priceSearch').value.trim().toLowerCase();
  const sortVal=document.getElementById('priceSort').value;

  let rows=[...csoPricingData];

  if(q) rows=rows.filter(r=>[r.title,r.shortName,r.description,r.catalogNum].join(' ').toLowerCase().includes(q));

  if(sortVal==='title') rows.sort((a,b)=>a.title.localeCompare(b.title));
  else if(sortVal==='price-asc') rows.sort((a,b)=>parseFloat(a.custUnitPrice||0)-parseFloat(b.custUnitPrice||0));
  else if(sortVal==='price-desc') rows.sort((a,b)=>parseFloat(b.custUnitPrice||0)-parseFloat(a.custUnitPrice||0));

  document.getElementById('priceCount').textContent=rows.length + ' items';
  const tbody=document.getElementById('priceBody');
  const empty=document.getElementById('priceEmpty');
  if(!rows.length){tbody.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  tbody.innerHTML=rows.map((r,idx)=>`<tr>
    <td><span class="pt-csp-badge cso"><svg width="11" height="11" style="vertical-align:middle;margin-right:3px"></svg>CSO</span></td>
    <td><span style="display:flex;align-items:center;gap:4px;font-family:var(--mono);font-size:10px;color:var(--text)">—</span></td>
    <td>`+(r.title||'—')+`</td>
    <td><span class="cat-num">`+(r.shortName||'—')+`</span></td>
    <td class="td-desc" style="max-width:200px">`+(r.description||'—')+`</td>
    <td><span class="cat-num">`+(r.catalogNum||'—')+`</span></td>
    <td><span class="price-val">`+fmt(r.commUnitPrice)+`</span></td>
    <td><span class="uoi">`+(r.commUnitIssue||'—')+`</span></td>
    <td><span class="price-val">`+fmt(r.custUnitPrice)+`</span></td>
    <td><span class="uoi">`+(r.custUnitIssue||'—')+`</span></td>
    <td><span class="`+discClass(r.discountFee)+`">`+(r.discountFee||'—')+`</span></td>
    <td style="white-space:nowrap">
      <button class="btn btn-ghost" style="padding:3px 7px;font-size:10px" onclick="openEditModal('csoPricing',`+idx+`)">✎</button>
      <button class="btn btn-danger" style="padding:3px 7px;font-size:10px" onclick="deleteRow('csoPricing',`+idx+`)">✕</button>
    </td>
  </tr>`).join('');
}

// ════════════════════════════════════════════════════════════
// ADMIN & CSV HANDLING
// ════════════════════════════════════════════════════════════
function splitCSVLine(line){
  const result=[];let cur='';let inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){inQ=!inQ;}
    else if(c===','&&!inQ){result.push(cur.trim());cur='';}
    else{cur+=c;}
  }
  result.push(cur.trim());
  return result;
}

function parseAdminCSV(schema, text){
  const lines=text.trim().split(/\r?\n/);
  const rows=[];
  let start=1;
  for(let i=start;i<lines.length;i++){
    const cols=splitCSVLine(lines[i]);
    if(cols.length<2) continue;
    if(schema==='csoPricing'){
      rows.push({
        title: cols[0]||'', shortName: cols[1]||'', description: cols[2]||'',
        catalogNum: cols[3]||'', commUnitPrice: cols[4]||'', commUnitIssue: cols[5]||'',
        custUnitPrice: cols[6]||'', custUnitIssue: cols[7]||'', discountFee: cols[8]||''
      });
    } else if(schema==='csoException'){
      rows.push({
        uniqueID: cols[0]||'', shortName: cols[1]||'', impactlevel: cols[2]||'', status: cols[3]||'',
        pwsRequirement: cols[4]||'', basisForRequest: cols[5]||'', securityConsiderations: cols[6]||'',
        requestDuration: cols[7]||'', suggestPlan: cols[8]||''
      });
    } else if(schema==='csOParentService'){
      rows.push({
        cspName: cols[0]||'', offeringindicator: cols[1]||'', title: cols[2]||'', shortName: cols[3]||'',
        description: cols[4]||'', category: cols[5]||'', impactlevel: cols[6]||'', contractCLIN: cols[7]||'',
        section508Compliance: cols[8]||'', methodofadd: cols[9]||'', csoChangeType: cols[10]||'',
        productURL: cols[31]||'', notes: cols[32]||'', availibleforusage: cols[33]||''
      });
    }
  }
  return rows;
}

function handleAdminCSV(schema, input){
  const file=input.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const rows=parseAdminCSV(schema, e.target.result);
      if(schema==='csoPricing') { csoPricingData=rows; renderPricing(); }
      else if(schema==='csoException') csoExceptionData=rows;
      else if(schema==='csOParentService') { csOParentServiceData=rows; populateCats(); renderServices(); }
      updateAdminMeta(schema, rows.length);
      showToast('✓ ' + file.name + ' loaded — ' + rows.length + ' rows','success');
    }catch(err){
      showToast('Error parsing CSV: '+err.message,'error');
    }
    input.value='';
  };
  reader.readAsText(file);
}

function updateAdminMeta(schema, count){
  const el=document.getElementById(schema.toLowerCase()+'-meta');
  if(el){
    el.textContent=count?count + ' items loaded':'No file loaded';
    el.className='uc-meta '+(count?'loaded':'empty');
  }
}

function clearAdminData(schema){
  if(schema==='csoPricing') { csoPricingData=[]; renderPricing(); }
  else if(schema==='csoException') csoExceptionData=[];
  else if(schema==='csOParentService') { csOParentServiceData=[]; renderServices(); }
  updateAdminMeta(schema, 0);
  showToast('Cleared ' + schema + ' data');
}

function loadSampleAdminData(){
  fetch('csoPricing_mock.csv').then(r=>r.text()).then(t=>{
    csoPricingData = parseAdminCSV('csoPricing', t);
    updateAdminMeta('csoPricing', csoPricingData.length);
    renderPricing();
  }).catch(()=>{});
  fetch('csoException_mock.csv').then(r=>r.text()).then(t=>{
    csoExceptionData = parseAdminCSV('csoException', t);
    updateAdminMeta('csoException', csoExceptionData.length);
  }).catch(()=>{});
  fetch('csOParentService_mock.csv').then(r=>r.text()).then(t=>{
    csOParentServiceData = parseAdminCSV('csOParentService', t);
    updateAdminMeta('csOParentService', csOParentServiceData.length);
    populateCats();
    renderServices();
  }).catch(()=>{});
  showToast('✓ Mock admin data loaded','success');
}

"@
    $newLines = new-object System.Collections.ArrayList
    for ($i = 0; $i -lt $start; $i++) { [void]$newLines.Add($lines[$i]) }
    [void]$newLines.Add($newContent)
    for ($i = $end; $i -lt $lines.Count; $i++) { [void]$newLines.Add($lines[$i]) }
    
    Set-Content -Path $filePath -Value $newLines -Encoding UTF8
    Write-Host "Replaced render functions successfully."
} else {
    Write-Host "Could not find bounds for render functions."
}
