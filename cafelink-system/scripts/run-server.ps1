param([int]$Port=5050, [string]$BindAddress='127.0.0.1', [string]$DatabasePath='data/cafelink.db', [switch]$Headless, [ValidateSet('none','drop-order-ack','drop-service-before')][string]$Fault='none')
. (Join-Path $PSScriptRoot 'runtime.ps1')
$arguments = @('--enable-native-access=ALL-UNNAMED', '-Dfile.encoding=UTF-8', '-cp', $RuntimeClasspath, 'com.cafelink.server.ServerMain', "--bind=$BindAddress", "--port=$Port", "--db=$DatabasePath")
$arguments += "--fault=$Fault"
if ($Headless) { $arguments += '--headless' }
Push-Location $ProjectRoot
try { & $JavaExecutable @arguments; $result = $LASTEXITCODE } finally { Pop-Location }
exit $result
