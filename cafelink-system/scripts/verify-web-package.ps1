param([Parameter(Mandatory=$true)][string]$Archive,[switch]$PublicSmoke,[string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$workspaceRoot=Split-Path $projectRoot -Parent
$archivePath=[IO.Path]::GetFullPath($Archive)
if(-not (Test-Path -LiteralPath $archivePath -PathType Leaf)){throw 'Release ZIP does not exist.'}
$runId=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
if(-not $EvidenceDirectory){$EvidenceDirectory=Join-Path $workspaceRoot ('report/evidence/cafelink-v2/v9/'+$runId)}
$EvidenceDirectory=[IO.Path]::GetFullPath($EvidenceDirectory)
if(Test-Path -LiteralPath $EvidenceDirectory){throw 'Select a new evidence directory.'}
$fresh=Join-Path $projectRoot ('target/v9-package-check/'+$runId+'/Fresh copy with spaces CafeLink')
New-Item -ItemType Directory -Path $EvidenceDirectory,$fresh -Force | Out-Null
$summary=[ordered]@{phase='V9';status='RUNNING';runId=$runId;startedAt=(Get-Date).ToString('o');archiveSha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash;packageSmoke='NOT_RUN';internetBrowserSmoke='NOT_RUN';physicalLan='NOT_RUN';physicalPhone='NOT_RUN';remoteCi='NOT_RUN'}
Push-Location $projectRoot
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $names=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        [long]$unpackedBytes=0
        foreach($entry in $zip.Entries) {
            $name=$entry.FullName.Replace('\','/')
            $path=[IO.Path]::GetFullPath((Join-Path $fresh $name))
            if(-not $path.StartsWith($fresh+'\',[StringComparison]::OrdinalIgnoreCase) -or $name -match '(^/|:|(^|/)\.\.?(/|$))' -or -not $names.Add($name.TrimEnd('/'))){throw 'Unsafe release ZIP path.'}
            if(($entry.ExternalAttributes -band 0x400) -ne 0 -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Release ZIP links are not supported.'}
            $unpackedBytes+=$entry.Length
            if($unpackedBytes -gt 1073741824){throw 'Release ZIP exceeds the 1 GiB extraction limit.'}
        }
    } finally {$zip.Dispose()}
    [IO.Compression.ZipFile]::ExtractToDirectory($archivePath,$fresh)
    $release=Get-Content -LiteralPath (Join-Path $fresh 'RELEASE.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $summary.release=$release.release
    $summary.schema=$release.schema
    Push-Location (Join-Path $projectRoot 'web')
    try {
        & node tests/release-smoke.mjs "--package=$fresh" "--output=$EvidenceDirectory"
        if($LASTEXITCODE -ne 0){throw 'Extracted package acceptance failed.'}
        $summary.packageSmoke=(Get-Content -LiteralPath (Join-Path $EvidenceDirectory 'package-smoke.json') -Raw | ConvertFrom-Json).status
        if($summary.packageSmoke -ne 'PASS'){throw 'Extracted package acceptance has no passing result.'}
        if($PublicSmoke) {
            & node tests/release-public-smoke.mjs "--package=$fresh" "--output=$(Join-Path $EvidenceDirectory 'public')"
            $publicExit=$LASTEXITCODE
            $publicResult=Join-Path $EvidenceDirectory 'public/public-package.json'
            if(Test-Path -LiteralPath $publicResult){$summary.internetBrowserSmoke=(Get-Content -LiteralPath $publicResult -Raw | ConvertFrom-Json).status}
            if($publicExit -ne 0){throw 'Internet package acceptance failed.'}
        }
    } finally {Pop-Location}
    $summary.status='PASS'
} catch {$summary.status='FAIL';$summary.failure=$_.Exception.Message;Write-Host $summary.failure}
finally {
    $summary.finishedAt=(Get-Date).ToString('o')
    $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'summary.json') -Encoding UTF8
    Pop-Location
}
Write-Host "Web package evidence: $EvidenceDirectory"
if($summary.status -ne 'PASS'){exit 1}
