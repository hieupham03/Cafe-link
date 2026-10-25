param([int]$Port=0,[int]$TcpPort=0,[string]$DataDirectory='',[switch]$NoOpenBrowser,[ValidateRange(0,86400)][int]$DurationSeconds=0,[string]$StartInfoPath='')
. (Join-Path $PSScriptRoot 'scripts/release-common.ps1')
$settings=Get-ReleaseSettings $Port $TcpPort $DataDirectory -PublicProfile
if($env:CAFELINK_QR_KEY){throw 'Portable demo uses a QR key file. Clear CAFELINK_QR_KEY before using this release.'}
$lease=Enter-ReleaseLease
try {
    $options=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $ReleaseRoot 'scripts/public-demo.ps1'),'-SkipBuild','-Port',$settings.Port,'-TcpPort',$settings.TcpPort,'-DatabasePath',$settings.Database,'-DurationSeconds',$DurationSeconds)
    if($NoOpenBrowser){$options+='-NoOpenBrowser'}
    if($StartInfoPath){$options+=@('-StartInfoPath',$StartInfoPath)}
    & powershell @options
    if($LASTEXITCODE -ne 0){throw 'Public demo failed. Check target/public-demo logs; local demo remains available.'}
} finally {$lease.Dispose()}
