param([switch]$Recovery)
. (Join-Path $PSScriptRoot 'runtime.ps1')
$fixtureClass = if ($Recovery) { 'com.cafelink.client.RecoverySmokeMain' } else { 'com.cafelink.client.DemoSmokeMain' }
$smokeId = [guid]::NewGuid().ToString('N')
$outputDir = Join-Path $ProjectRoot "target\smoke-$smokeId"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$databasePath = Join-Path $outputDir 'smoke.db'
$probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$probe.Start(); $smokePort = $probe.LocalEndpoint.Port; $probe.Stop()
$serverProcess = $null
function Start-SmokeServer([string]$Phase) {
    $arguments = @('--enable-native-access=ALL-UNNAMED', '-Dfile.encoding=UTF-8', '-cp', ('"' + $RuntimeClasspath + '"'), 'com.cafelink.server.ServerMain', '--headless', "--port=$smokePort", ('"--db=' + $databasePath + '"'))
    if ($Recovery -and $Phase -eq 'initial') { $arguments += '--fault=drop-order-ack' }
    $process = Start-Process -FilePath $JavaExecutable -ArgumentList $arguments -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputDir "server-$Phase.log") -RedirectStandardError (Join-Path $outputDir "server-$Phase.err")
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh(); if ($process.HasExited) { throw "Server exited early; inspect $outputDir" }
        $socket = New-Object System.Net.Sockets.TcpClient
        try { $socket.Connect('127.0.0.1', $smokePort); return $process } catch { Start-Sleep -Milliseconds 100 } finally { $socket.Dispose() }
    }
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    throw "Server startup timeout; inspect $outputDir"
}
function Stop-SmokeServer {
    $serverProcess.Refresh()
    if ($serverProcess.HasExited) { throw 'Smoke server exited before the requested stop.' }
    Stop-Process -Id $serverProcess.Id; $serverProcess.WaitForExit()
    $socket=New-Object System.Net.Sockets.TcpClient
    $stillListening=$false
    try { $socket.Connect('127.0.0.1',$smokePort); $stillListening=$true } catch { } finally { $socket.Dispose() }
    if ($stillListening) { throw 'Owned JVM stop left the port listening; restart verification would be invalid.' }
    Write-Host "Owned JVM stopped, listener closed: PID $($serverProcess.Id)"
}
try {
    $serverProcess = Start-SmokeServer 'initial'
    & $JavaExecutable '--enable-native-access=ALL-UNNAMED' '-Dfile.encoding=UTF-8' '-cp' $RuntimeClasspath $fixtureClass "--port=$smokePort" "--journal=$(Join-Path $outputDir 'client-state.json')" '--mode=populate' | Tee-Object -FilePath (Join-Path $outputDir 'populate.json')
    if ($LASTEXITCODE -ne 0) { throw 'Populate smoke failed' }
    Stop-SmokeServer; $serverProcess = $null
    $serverProcess = Start-SmokeServer 'restart'
    & $JavaExecutable '--enable-native-access=ALL-UNNAMED' '-Dfile.encoding=UTF-8' '-cp' $RuntimeClasspath $fixtureClass "--port=$smokePort" "--journal=$(Join-Path $outputDir 'client-state.json')" '--mode=verify-restart' | Tee-Object -FilePath (Join-Path $outputDir 'restart.json')
    if ($LASTEXITCODE -ne 0) { throw 'Restart smoke failed' }
    Write-Host "SMOKE PASS. Evidence: $outputDir"
} finally { if ($null -ne $serverProcess) { $serverProcess.Refresh(); if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id; $serverProcess.WaitForExit() } } }
