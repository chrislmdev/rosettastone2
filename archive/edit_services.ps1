$filePath = "j:\git\rosettastone2\index.html"
$lines = Get-Content $filePath -Encoding UTF8
$start = -1
$end = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^const SERVICES = \[') {
        $start = $i
    }
    if ($start -ne -1 -and $i -gt $start -and $lines[$i] -match '^\];') {
        $end = $i
        break
    }
}

if ($start -ne -1 -and $end -ne -1) {
    $newLines = new-object System.Collections.ArrayList
    for ($i = 0; $i -lt $start; $i++) { [void]$newLines.Add($lines[$i]) }
    [void]$newLines.Add("let csOParentServiceData = [];")
    [void]$newLines.Add("let csoPricingData = [];")
    [void]$newLines.Add("let csoExceptionData = [];")
    for ($i = $end + 1; $i -lt $lines.Count; $i++) { [void]$newLines.Add($lines[$i]) }
    $lines = $newLines
    Write-Host "Replaced SERVICES"
}

$pStart = -1
$pEnd = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^let pricingData =') {
        $pStart = $i
    }
    if ($lines[$i] -match '^const SAMPLE_DATA = \{') {
        for ($j = $i + 1; $j -lt $lines.Count; $j++) {
            if ($lines[$j] -match '^\};') {
                $pEnd = $j
                break
            }
        }
        break
    }
}

if ($pStart -ne -1 -and $pEnd -ne -1) {
    $newLines2 = new-object System.Collections.ArrayList
    for ($i = 0; $i -lt $pStart; $i++) { [void]$newLines2.Add($lines[$i]) }
    for ($i = $pEnd + 1; $i -lt $lines.Count; $i++) { [void]$newLines2.Add($lines[$i]) }
    $lines = $newLines2
    Write-Host "Replaced pricingData"
}

Set-Content -Path $filePath -Value $lines -Encoding UTF8
