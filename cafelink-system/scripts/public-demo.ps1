param(
    [int]$Port = 8088,
    [int]$TcpPort = 5058,
    [string]$DatabasePath = 'data/public-demo/cafelink.db',
    [switch]$SkipBuild,
    [switch]$NoOpenBrowser,
    [ValidateRange(0,86400)][int]$DurationSeconds = 0,
    [string]$StartInfoPath = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path $PSScriptRoot -Parent
if ($Port -eq $TcpPort) { throw 'HTTP and TCP ports must differ.' }
$listeners = @(Get-NetTCPConnection -LocalPort $Port,$TcpPort -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count) { throw "Ports $Port/$TcpPort are in use. No existing process was stopped." }
Push-Location $projectRoot
$tunnelProcess = $null; $webProcess = $null
try {
    if (-not $SkipBuild) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1 -SkipTests
        if ($LASTEXITCODE -ne 0) { throw 'Java build failed.' }
    }
    . (Join-Path $PSScriptRoot 'runtime.ps1')
    # Pinned official Cloudflare release. Digest from GitHub's official release asset.
    $version = '2026.10.3'
    $expected = '76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2'
    $toolDir = Join-Path $projectRoot '.tools'
    New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
    $cloudflared = Join-Path $toolDir "cloudflared-$version.exe"
    if (-not (Test-Path -LiteralPath $cloudflared)) {
        $download = "$cloudflared.download"
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri "https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-windows-amd64.exe" -OutFile $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ine $expected) { throw 'Cloudflared download checksum mismatch.' }
        Move-Item -LiteralPath $download -Destination $cloudflared
    }
    if ((Get-FileHash -LiteralPath $cloudflared -Algorithm SHA256).Hash -ine $expected) { throw 'Cloudflared executable checksum mismatch.' }
    $runDir = Join-Path $projectRoot ('target/public-demo/' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null
    # Empty config isolates Quick Tunnel from a user's named-tunnel configuration.
    $configFile = Join-Path $runDir 'empty.yml'
    'tunnel: ""' | Set-Content -LiteralPath $configFile -Encoding ASCII
    $publicOrigin = ''
    for ($attempt=1; $attempt -le 3 -and -not $publicOrigin; $attempt++) {
        $tunnelLog = Join-Path $runDir "tunnel-attempt-$attempt.log"
        $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel','--config',('"'+$configFile+'"'),'--no-autoupdate','--url',"http://127.0.0.1:$Port",'--protocol','http2') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDir "tunnel-out-$attempt.log") -RedirectStandardError $tunnelLog
        $deadline = (Get-Date).AddSeconds(60)
        while ((Get-Date) -lt $deadline -and -not $tunnelProcess.HasExited) {
            $logText=Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue
            if (-not [string]::IsNullOrEmpty($logText)) {
                $match = [regex]::Match($logText,'https://[a-z0-9-]+\.trycloudflare\.com')
                if ($match.Success) { $publicOrigin = $match.Value; break }
            }
            Start-Sleep -Milliseconds 250
        }
        if (-not $publicOrigin) {
            if (-not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue }
            $tunnelProcess.Dispose(); $tunnelProcess=$null
            if ($attempt -lt 3) { Write-Host "Cloudflare did not provide an address (attempt $attempt/3). Retrying..."; Start-Sleep -Seconds 2 }
        }
    }
    if (-not $publicOrigin) { throw "Cloudflare did not provide a public address after 3 attempts. See $runDir. Local demo is available using run-web.ps1." }
    $passwordBytes = New-Object byte[] 18
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($passwordBytes) } finally { $rng.Dispose() }
    $demoPassword = [Convert]::ToBase64String($passwordBytes)
    # Use the resolved JVM PID, not Oracle's forwarding java.exe process.
    # Password is inherited through the environment, never placed in process arguments/logs.
    $oldPassword = $env:CAFELINK_DEMO_ADMIN_PASSWORD
    try {
        $env:CAFELINK_DEMO_ADMIN_PASSWORD = $demoPassword
        $argsList = @('--enable-native-access=ALL-UNNAMED','-Dfile.encoding=UTF-8','-cp',('"'+$RuntimeClasspath+'"'),'com.cafelink.web.WebMain',"--port=$Port","--tcp-port=$TcpPort",'--bind=127.0.0.1',('--db="'+[IO.Path]::GetFullPath($DatabasePath)+'"'),('--assets="'+(Join-Path $projectRoot 'web/dist')+'"'),"--public-origin=$publicOrigin",'--trusted-proxy=true','--ordering-mode=prepay')
        $webProcess = Start-Process -FilePath $JavaExecutable -ArgumentList $argsList -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runDir 'web.log') -RedirectStandardError (Join-Path $runDir 'web-error.log')
    } finally { $env:CAFELINK_DEMO_ADMIN_PASSWORD = $oldPassword }
    $ready = $false; $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if ($webProcess.HasExited) { throw "Web server exited. See $runDir\web-error.log" }
        try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/ready" -TimeoutSec 2; if($health.status -eq 'READY'){$ready = $true; break} } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw "Web server did not become ready. See $runDir" }
    # Quick Tunnel prints its URL before its connection to the Cloudflare edge is ready.
    # Allow bounded cold-start/retry time without mistaking URL allocation for readiness.
    Write-Host 'Local TCP/Core/DB ready. Waiting for the public tunnel connection...'
    $edgeReady=$false;$deadline=(Get-Date).AddSeconds(90)
    while((Get-Date) -lt $deadline -and -not $tunnelProcess.HasExited) {
        $edgeLog=Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue
        if($edgeLog -and $edgeLog.Contains('Registered tunnel connection')){$edgeReady=$true;break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $edgeReady){throw "Local app is ready but Cloudflare did not establish a tunnel within 90 seconds. Check Internet/firewall and retry; see $runDir. No existing process was stopped."}
    $publicReady=$false;$deadline=(Get-Date).AddSeconds(35)
    while ((Get-Date) -lt $deadline -and -not $tunnelProcess.HasExited) {
        try { $health=Invoke-RestMethod -Uri "$publicOrigin/api/ready" -TimeoutSec 8; if($health.status -eq 'READY'){$publicReady=$true; break} } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicReady) { throw "Local server is ready but the public HTTPS address is unreachable. See $runDir." }
    Write-Host "`nPublic demo: $publicOrigin/admin"
    Write-Host 'Account: admin'
    Write-Host "Temporary admin password: $demoPassword"
    Write-Host 'Log in using the public HTTPS address, click Mo tat ca ban, then display a table QR.'
    Write-Host 'Phones can use Wi-Fi or mobile data. Keep this terminal running. Ctrl+C stops this demo.'
    Write-Host "Logs: $runDir"
    if ($StartInfoPath) {
        [ordered]@{origin=$publicOrigin;webPid=$webProcess.Id;tunnelPid=$tunnelProcess.Id;logDirectory=$runDir;database=[IO.Path]::GetFullPath($DatabasePath)} | ConvertTo-Json | Set-Content -LiteralPath $StartInfoPath -Encoding UTF8
    }
    if (-not $NoOpenBrowser) { Start-Process "$publicOrigin/admin" }
    $started = Get-Date
    while (-not $webProcess.HasExited -and -not $tunnelProcess.HasExited) {
        if ($DurationSeconds -gt 0 -and ((Get-Date)-$started).TotalSeconds -ge $DurationSeconds) { break }
        Start-Sleep -Milliseconds 500
    }
    if ($webProcess.HasExited -or $tunnelProcess.HasExited) { throw "A demo process stopped unexpectedly. See $runDir" }
} finally {
    foreach ($ownedProcess in @($webProcess,$tunnelProcess)) {
        if ($null -ne $ownedProcess) { if (-not $ownedProcess.HasExited) { Stop-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue }; $ownedProcess.Dispose() }
    }
    Pop-Location
}
