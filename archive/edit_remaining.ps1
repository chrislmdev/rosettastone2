$filePath = "j:\git\rosettastone2\index.html"
$lines = Get-Content $filePath -Encoding UTF8
$newLines = New-Object System.Collections.Generic.List[string]

$skip1 = $false; $skip2 = $false; $skip3 = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    # START SKIP 1
    if ($line -match '^function exportPricingCSV\(\)\{') {
        $skip1 = $true
        $newLines.Add(@'
function exportPricingCSV(){
  let lines=['Title,Short Name,Description,Catalog #,Commercial Unit Price,Commercial Unit of Issue,Customer Unit Price,Customer Unit of Issue,Discount/Premium/Fee'];
  csoPricingData.forEach(r=>{
    lines.push([r.title,r.shortName,r.description,r.catalogNum,r.commUnitPrice,r.commUnitIssue,r.custUnitPrice,r.custUnitIssue,r.discountFee].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','));
  });
  downloadBlob(lines.join('\n'),'csoPricing-export.csv','text/csv');
  showToast('✓ Exported pricing data','success');
}

function downloadSampleCSV(){
  let lines=['Category,Title,Short Name,Description,Catalog #,Commercial Unit Price,Commercial Unit of Issue,Customer Unit Price,Customer Unit of Issue,Discount/Premium/Fee'];
  lines.push('"Compute","Amazon EC2 On-Demand (c6i.large)","EC2","2 vCPU / 4 GiB compute instance","AWS-EC2-001","0.0850","Hour","0.0765","Hour","-10%"');
  lines.push('"Storage","Amazon S3 Standard Storage","S3","Object storage – first 50 TB/month","AWS-S3-001","0.0230","GB/Month","0.0207","GB/Month","-10%"');
  downloadBlob(lines.join('\n'),'rosettastone-sample.csv','text/csv');
  showToast('✓ Sample CSV downloaded');
}

function downloadBlob(content,filename,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ════════════════════════════════════════════════════════════
function openAddModal(){
  editingRow=null;
  document.getElementById('modalTitle').textContent='Add Pricing Row';
  ['title','short','desc','cat','cup','cui','kusp','kusi','dpf'].forEach(f=>document.getElementById('m-'+f).value='');
  document.getElementById('rowModal').classList.add('open');
}

function openEditModal(_csp,idx){
  editingRow={idx};
  const r=csoPricingData[idx];
  document.getElementById('modalTitle').textContent='Edit Pricing Row';
  document.getElementById('m-title').value=r.title||'';
  document.getElementById('m-short').value=r.shortName||'';
  document.getElementById('m-desc').value=r.description||'';
  document.getElementById('m-cat').value=r.catalogNum||'';
  document.getElementById('m-cup').value=r.commUnitPrice||'';
  document.getElementById('m-cui').value=r.commUnitIssue||'';
  document.getElementById('m-kusp').value=r.custUnitPrice||'';
  document.getElementById('m-kusi').value=r.custUnitIssue||'';
  document.getElementById('m-dpf').value=r.discountFee||'';
  document.getElementById('rowModal').classList.add('open');
}

function closeModal(){document.getElementById('rowModal').classList.remove('open');}

function saveRow(){
  const title=document.getElementById('m-title').value.trim();
  if(!title){showToast('Title is required','error');return;}
  const row={
    title,
    shortName:document.getElementById('m-short').value.trim(),
    description:document.getElementById('m-desc').value.trim(),
    catalogNum:document.getElementById('m-cat').value.trim(),
    commUnitPrice:document.getElementById('m-cup').value.trim(),
    commUnitIssue:document.getElementById('m-cui').value.trim(),
    custUnitPrice:document.getElementById('m-kusp').value.trim(),
    custUnitIssue:document.getElementById('m-kusi').value.trim(),
    discountFee:document.getElementById('m-dpf').value.trim()
  };
  if(editingRow){
    csoPricingData[editingRow.idx]=row;
    showToast('✓ Row updated','success');
  } else {
    csoPricingData.push(row);
    showToast('✓ Row added','success');
  }
  updateAdminMeta('csoPricing', csoPricingData.length);
  closeModal();
  renderPricing();
}

function deleteRow(_csp,idx){
  if(!confirm('Delete this pricing row?')) return;
  csoPricingData.splice(idx,1);
  updateAdminMeta('csoPricing', csoPricingData.length);
  renderPricing();
  showToast('Row deleted');
}
'@)
        continue
    }
    # END SKIP 1
    if ($skip1 -and ($line -match '^// ════════════════════════════════════════════════════════════' -and $i -lt ($lines.Count - 1) -and $lines[$i+1] -match '^// PAGE SWITCHING')) {
        $skip1 = $false
    }
    if ($skip1) { continue }

    # START SKIP 2
    if ($line -match '^function igceAddFromCatalog\(clinId\)\{') {
        $skip2 = $true
        $newLines.Add(@'
function igceAddFromCatalog(clinId){
  igceCatalogTargetClin=clinId;
  const allPricing=[...csoPricingData];
  if(!allPricing.length){
    showToast('No pricing catalog data loaded — go to Admin and load mock data first','error');
    return;
  }
  // Build a simple picker modal
  let rows=allPricing.slice(0,200).map(r=>`
    <div class="igce-catalog-row" onclick="igcePickCatalogItem(${JSON.stringify({
      desc:r.title,cat:'',unit:r.custUnitIssue||'Month',
      qty:1,unitPrice:parseFloat(r.custUnitPrice)||0,notes:r.shortName||''
    }).replace(/"/g,'&quot;')})">
      <span class="pt-csp-badge cso" style="flex-shrink:0">CSO</span>
      <span style="font-size:11px">${escH(r.title)}</span>
      <span class="igce-catalog-price">$${parseFloat(r.custUnitPrice||0).toFixed(4)} / ${escH(r.custUnitIssue||'')}</span>
    </div>`).join('');

  document.getElementById('igce-catalog-list').innerHTML=rows;
  document.getElementById('igce-catalog-search').value='';
  document.getElementById('igce-catalog-modal').classList.add('open');
}
'@)
        continue
    }
    # END SKIP 2
    if ($skip2 -and $line -match '^function igceCatalogFilter\(\)\{') {
        $skip2 = $false
    }
    if ($skip2) { continue }

    # START SKIP 3
    if ($line -match '^// ── Pricing lookup ────────────────────────────────────────────') {
        $skip3 = $true
        $newLines.Add(@'
// ── Pricing lookup ────────────────────────────────────────────
function calcGetPrice(key, csp){
  const allItems = [...csoPricingData];
  const keyMap = {
    compute_vcpu_month: ['EC2','Virtual Machines','Compute Engine','Compute'],
    storage_primary_gb: ['EBS','Managed Disks','Persistent Disk','Block Volumes'],
    storage_archive_gb: ['S3 Glacier','Archive Storage'],
    storage_object_gb:  ['S3','Blob Storage','Cloud Storage','Object Storage'],
    database_vcpu_month:['RDS','SQL Database','Cloud SQL','Autonomous Database'],
    networking_egress_gb:['CloudFront','CDN'],
    lb_month:           ['Elastic Load Balancing','Load Balancer','Cloud Load Balancing'],
    waf_month:          ['WAF','Azure WAF','Cloud Armor'],
    monitoring_month:   ['CloudWatch','Azure Monitor','Cloud Monitoring','Monitoring'],
    ml_tokens_m:        ['Bedrock','Azure OpenAI','Vertex AI','OCI Generative AI'],
    vdi_user_month:     ['WorkSpaces','Azure Virtual Desktop','Secure Desktops'],
    backup_gb_month:    ['S3','Blob Storage'],
    k8s_cluster_month:  ['EKS','AKS','GKE','Container Engine'],
  };
  const names = keyMap[key]||[];
  for(const name of names){
    const match = allItems.find(i=>(i.shortName||'').toLowerCase().includes(name.toLowerCase()));
    if(match && match.custUnitPrice){
      const p = parseFloat(match.custUnitPrice);
      if(!isNaN(p) && p>0) return p;
    }
  }
  // Fall back to built-in
  return CALC_BASE_PRICES[key]?.[csp] ?? 0;
}
'@)
        continue
    }
    # END SKIP 3
    if ($skip3 -and $line -match '^// ── Service group definitions ─────────────────────────────────') {
        $skip3 = $false
    }
    if ($skip3) { continue }

    $newLines.Add($line)
}

Set-Content -Path $filePath -Value $newLines -Encoding UTF8
Write-Output "Applied remaining 4 JS functions."
