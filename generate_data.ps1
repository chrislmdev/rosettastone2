$csps = @('aws', 'azure', 'gcp', 'oracle')
$names = @("Virtual Machine", "Object Bucket", "Managed SQL", "VPC Network", "IAM User", "Load Balancer", "CDN Distribution", "KMS Key", "WAF Policy", "ML Endpoint", "Transcription API", "Analysis Service")
$categories = @{ "Virtual Machine"="Compute"; "Object Bucket"="Storage"; "Managed SQL"="Database"; "VPC Network"="Networking"; "IAM User"="Security"; "Load Balancer"="Networking"; "CDN Distribution"="Networking"; "KMS Key"="Security"; "WAF Policy"="Security"; "ML Endpoint"="AI and Machine Learning"; "Transcription API"="AI and Machine Learning"; "Analysis Service"="AI and Machine Learning" }

$pricing = New-Object System.Collections.Generic.List[PSCustomObject]
$parent = New-Object System.Collections.Generic.List[PSCustomObject]

# Generate 250 comparison groups (1000 total rows)
for ($i = 1; $i -le 250; $i++) {
    $baseName = $names[(Get-Random -Maximum $names.Count)]
    $cat = $categories[$baseName]
    $groupName = "$baseName Group $i"
    
    foreach ($csp in $csps) {
        $item_id = "ITEM-{0:D5}" -f ($i * 4 + [array]::IndexOf($csps, $csp))
        $title = "$($csp.ToUpper()) $baseName ($i)"
        
        $p_price = [math]::Round((Get-Random -Minimum 0.5 -Maximum 20.0), 3)
        $c_price = [math]::Round(($p_price * 0.75), 3)

        $pricing.Add([PSCustomObject]@{
            title = $title
            csoShortName = $baseName
            description = "Standard enterprise mapping for $baseName"
            catalogitemNumber = $item_id
            commercialUnitPrice = $p_price
            commercialunitofissue = "Month"
            customerunitprice = $c_price
            customerunitofissue = "Month"
            discountpremiumfee = "25%"
        })

        $parent.Add([PSCustomObject]@{
            csOParentService = $groupName
            csoShortName = $baseName
            catalogitemNumber = $item_id
            csp = $csp
            category = $cat
            impactlevel = "IL" + (Get-Random -Minimum 2 -Maximum 6)
            newService = "false"
        })
    }
}

$pricing | Export-Csv -Path "j:\git\rosettastone2\csoPricing_mock.csv" -NoTypeInformation
$parent | Export-Csv -Path "j:\git\rosettastone2\csOParentService_mock.csv" -NoTypeInformation
Write-Host "Done: Generated 1000 aligned rows across 250 comparison groups."
