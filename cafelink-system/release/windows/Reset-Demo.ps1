param([string]$DataDirectory='',[switch]$Public)
. (Join-Path $PSScriptRoot 'scripts/release-common.ps1')
$settings=Get-ReleaseSettings -DataDirectory $DataDirectory -PublicProfile:$Public
$lease=Enter-ReleaseLease
try {
    Assert-ProfileOffline $settings
    $previous=Move-CurrentProfile $settings 'before-reset'
    [ordered]@{status='PASS';previousProfile=$previous;nextStart='Creates a fresh cafe. Use a fresh browser profile for a clean demo.'} | ConvertTo-Json -Compress
} finally {$lease.Dispose()}
