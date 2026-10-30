param([int]$Port=0,[int]$TcpPort=0,[string]$DataDirectory='',[switch]$NoOpenBrowser)
. (Join-Path $PSScriptRoot 'scripts/release-common.ps1')
$settings=Get-ReleaseSettings $Port $TcpPort $DataDirectory
if($env:CAFELINK_QR_KEY){throw 'Portable demo uses a QR key file. Clear CAFELINK_QR_KEY before using this release.'}
$lease=Enter-ReleaseLease
Push-Location $ReleaseRoot
try {
    $busy=@(Get-NetTCPConnection -LocalPort $settings.Port,$settings.TcpPort -State Listen -ErrorAction SilentlyContinue)
    if($busy.Count){throw 'A configured port is in use. No process was stopped; choose another port pair.'}
    Write-Host "CafeLink Web V9.4 - http://127.0.0.1:$($settings.Port)/admin"
    Write-Host 'Local account: admin / CafeLink@123. Payment is simulated. Ctrl+C stops this demo.'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ReleaseRoot 'scripts/run-web.ps1') -Port $settings.Port -TcpPort $settings.TcpPort -DatabasePath $settings.Database
    if($LASTEXITCODE -ne 0){throw 'Web server exited with an error.'}
} finally {Pop-Location;$lease.Dispose()}
