$filePath = "j:\git\rosettastone2\index.html"
$lines = Get-Content $filePath -Encoding UTF8
$newLines = New-Object System.Collections.Generic.List[string]

$skip1 = $false; $skip2 = $false; $skip3 = $false; $skip4 = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    # Chunk 1
    if ($line -match '^  // Gather all current pricing items') {
        $skip1 = $true
        $newLines.Add(@"
  const allPricing=[...csoPricingData];
  if(!allPricing.length){
    showToast('No pricing catalog data loaded — go to Admin and load mock data first','error');
    return;
  }
"@)
        continue
    }
    if ($skip1 -and $line -match "^  // Build a simple picker modal") {
        $skip1 = $false
        # DON'T continue here, let it add the "// Build a simple" line
    }
    if ($skip1) { continue }

    # Chunk 2
    if ($line -match '^      desc:r\.title,cat:r\.category\|\|'''',unit:r\.custUnitIssue\|\|''Month'',') {
        $skip2 = $true
        $newLines.Add(@'
      desc:r.title,cat:'',unit:r.custUnitIssue||'Month',
      qty:1,unitPrice:parseFloat(r.custUnitPrice)||0,notes:r.shortName||''
    }).replace(/"/g,'&quot;')})">
      <span class="pt-csp-badge cso" style="flex-shrink:0">CSO</span>
'@)
        continue
    }
    if ($skip2 -and $line -match '^      <span style="font-size:11px">') {
        $skip2 = $false
    }
    if ($skip2) { continue }

    # Chunk 3
    if ($line -match '^  // First try to find from loaded pricing catalog') {
        $skip3 = $true
        $newLines.Add('  const allItems = [...csoPricingData];')
        continue
    }
    if ($skip3 -and $line -match '^  // key mappings to catalog short names') {
        $skip3 = $false
    }
    if ($skip3) { continue }

    # Chunk 4
    if ($line -match '^  const names = keyMap\[key\]\|\|\[\];') {
        $skip4 = $true
        $newLines.Add(@'
  const names = keyMap[key]||[];
  for(const name of names){
    const match = allItems.find(i=>(i.shortName||'').toLowerCase().includes(name.toLowerCase()));
'@)
        continue
    }
    if ($skip4 -and $line -match '^    if\(match && match\.custUnitPrice\)\{') {
        $skip4 = $false
    }
    if ($skip4) { continue }

    $newLines.Add($line)
}

Set-Content -Path $filePath -Value $newLines -Encoding UTF8
Write-Output "Applied 4 targeted line replacements"
