param(
    [ValidateSet('Local','Public')][string]$Mode='Public',
    [ValidateRange(1024,65535)][int]$Port=19588,
    [ValidateRange(1024,65535)][int]$TcpPort=19558,
    [ValidateRange(1,3600)][int]$DurationSeconds=1800,
    [switch]$NoOpenBrowser
)
$ErrorActionPreference='Stop'
if($Port -eq $TcpPort){throw 'HTTP and TCP ports must differ.'}
$app=Join-Path $PSScriptRoot 'app'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Verify-Package.ps1')
if($LASTEXITCODE -ne 0){throw 'The prepared application was changed. Create a new kit from the verified archive.'}
$options=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $app "Start-$Mode.ps1"),'-Port',$Port,'-TcpPort',$TcpPort,'-DataDirectory',('data/device-uat-'+$Mode.ToLower()))
if($Mode -eq 'Public'){$options+=@('-DurationSeconds',$DurationSeconds)}
if($NoOpenBrowser){$options+='-NoOpenBrowser'}
Write-Host 'Human acceptance is NOT_RUN until the tester records actual results in RESULTS.json.'
Write-Host 'This kit uses separate local/public test profiles. Ctrl+C stops its current demo.'
& powershell @options
exit $LASTEXITCODE
