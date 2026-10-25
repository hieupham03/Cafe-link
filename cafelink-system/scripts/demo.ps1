param([int]$Port=5050)
. (Join-Path $PSScriptRoot 'runtime.ps1')
# These are the interactive app windows the human uses in the demo.
function Start-InteractiveApp([string]$MainClass, [string[]]$AppArguments) {
    $arguments = @('--enable-native-access=ALL-UNNAMED', '-Dfile.encoding=UTF-8', '-cp', ('"' + $RuntimeClasspath + '"'), $MainClass) + $AppArguments
    Start-Process -FilePath $JavaExecutable -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Normal -PassThru
}
$server = Start-InteractiveApp 'com.cafelink.server.ServerMain' @("--port=$Port")
Write-Host "Server PID: $($server.Id). Login admin in the server's management window."
foreach ($table in 1..3) {
    $client = Start-InteractiveApp 'com.cafelink.client.ClientMain' @("--port=$Port", "--username=ban$table")
    Write-Host "Guest table $table PID: $($client.Id)"
}
