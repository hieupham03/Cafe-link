param([switch]$SkipInstall, [switch]$SkipBrowserInstall,[ValidateSet('V8','V9','V9.1','V9.2','V9.3','V9.4')][string]$Phase='V9.4')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$workspaceRoot = Split-Path $projectRoot -Parent
$runId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidenceRoot = Join-Path $workspaceRoot ("report\evidence\cafelink-v2\"+$Phase.ToLower()+'-gate')
$runRoot = Join-Path $evidenceRoot $runId
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$summary = [ordered]@{ phase=$Phase; includedPhases=@('V5a','V6','V7','prepaid-simulator','automatic-private-visits','trusted-loopback-proxy','storefront-ui','web-policy-experiment','readiness-and-admin-diagnostics'); runId=$runId; startedAt=(Get-Date).ToString('o'); status='RUNNING'; gates=@(); physicalLan='NOT_RUN'; physicalPhone='NOT_RUN'; realPaymentProvider='NOT_INTEGRATED' }

function Invoke-Gate([string]$Name, [scriptblock]$Action) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    # Windows PowerShell 5 treats redirected native stderr as ErrorRecord even
    # when the tool exits 0 (e.g. JDK warnings). Gate on the actual exit code.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Action *> (Join-Path $runRoot "$Name.log")
        $gateExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    $timer.Stop()
    $summary.gates += [ordered]@{name=$Name;exitCode=$gateExit;durationMs=$timer.ElapsedMilliseconds}
    if ($gateExit -ne 0) { throw "Gate '$Name' failed. See $runRoot\$Name.log" }
    Write-Host "PASS $Name"
}
Push-Location $projectRoot
try {
    # No reuse: a listener on these test ports may belong to the user.
    $existing = @(Get-NetTCPConnection -LocalPort 18080,18081 -State Listen -ErrorAction SilentlyContinue)
    if ($existing.Count -gt 0) { throw 'Test ports 18080/18081 are already in use. No process was stopped.' }
    Invoke-Gate 'java-verify' { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maven.ps1 -B verify }
    $xmlRoot = New-Item -ItemType Directory -Path (Join-Path $runRoot 'junit') -Force
    Copy-Item -Path (Join-Path $projectRoot 'target\surefire-reports\TEST-*.xml') -Destination $xmlRoot.FullName
    $totals = [ordered]@{tests=0;failures=0;errors=0;skipped=0}
    foreach ($file in Get-ChildItem -LiteralPath $xmlRoot.FullName -Filter '*.xml') {
        $suite = ([xml](Get-Content -LiteralPath $file.FullName -Raw)).testsuite
        foreach ($key in @('tests','failures','errors','skipped')) { $totals[$key] += [int]$suite.GetAttribute($key) }
    }
    $summary.java = $totals
    Push-Location (Join-Path $projectRoot 'web')
    try {
        if (-not $SkipInstall) { Invoke-Gate 'npm-ci' { & npm.cmd ci --no-fund } }
        Invoke-Gate 'web-build' { & npm.cmd run build }
        Invoke-Gate 'experiment-build' { & npx.cmd vite build --mode experiment }
        if (-not $SkipBrowserInstall) { Invoke-Gate 'browser-install' { & npx.cmd playwright install chromium } }
        try { Invoke-Gate 'browser-e2e' { & npm.cmd run test:e2e } }
        finally {
            if (Test-Path -LiteralPath 'test-results\results.json') {
                Copy-Item -LiteralPath 'test-results\results.json' -Destination (Join-Path $runRoot 'playwright-results.json')
                $summary.browser = (Get-Content -LiteralPath 'test-results\results.json' -Raw | ConvertFrom-Json).stats
            }
            foreach($groupName in @('regression','recovery','ux','v7','automatic','convenience','workflow','shop','policy','diagnostics')) {
                $groupResult = "test-results\$groupName-results.json"
                if(Test-Path -LiteralPath $groupResult) {Copy-Item -LiteralPath $groupResult -Destination (Join-Path $runRoot "playwright-$groupName.json")}
            }
        }
        foreach ($name in @('dashboard-desktop.png','dashboard-mobile.png','guest-qr-menu.png','admin-visit-qr.png','guest-order-cart.png','guest-order-recovery.png','guest-checkout.png','staff-payment-recovery.png','ux-guest-mobile.png','ux-admin-desktop.png','v7-guest-prepaid.png','v7-sales-history.png','v5a-notifications.png','auto-table-qr.png','auto-private-mobile.png','auto-completed.png','shop-guest-desktop.png','shop-guest-mobile.png','shop-product-dialog.png','shop-mobile-cart.png','shop-mobile-viewport.png','diagnostics-desktop.png','diagnostics-mobile.png')) {
            Copy-Item -LiteralPath (Join-Path 'test-results' $name) -Destination (Join-Path $runRoot $name)
        }
        $browserResults = Get-Content -LiteralPath 'test-results\results.json' -Raw | ConvertFrom-Json
        $summary.browser = $browserResults.stats
    } finally { Pop-Location }
    # Verify process-tree cleanup after the browser runner, without killing any PID.
    $leftovers = @(Get-NetTCPConnection -LocalPort 18080,18081 -State Listen -ErrorAction SilentlyContinue)
    $summary.testListenersClosed = ($leftovers.Count -eq 0)
    if ($leftovers.Count -gt 0) { throw 'A test listener remained after Playwright shutdown.' }
    $summary.artifact = [ordered]@{jarSha256=(Get-FileHash target/cafelink-1.0.0.jar -Algorithm SHA256).Hash;frontendManifest=(Get-FileHash web/dist/index.html -Algorithm SHA256).Hash}
    $summary.artifact.webFiles = @(Get-ChildItem -LiteralPath web/dist -Recurse -File | ForEach-Object { [ordered]@{ path=$_.FullName.Substring((Join-Path $projectRoot 'web\dist').Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
    $baseline = Join-Path $workspaceRoot 'dist\CafeLink-Original-1.0.0-Baseline.zip'
    $summary.baselineSha256 = (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash
    if ($summary.baselineSha256 -ne '60A1E6666F4BAC52B2F0B868A9AAFD9024563991AB22777076D639416E8766EB') { throw 'Sealed E0 baseline hash changed.' }
    $summary.status = 'PASS'
} catch {
    $summary.status = 'FAIL'; $summary.failure = $_.Exception.Message
    Write-Host $summary.failure
} finally {
    $summary.finishedAt = (Get-Date).ToString('o')
    $summary | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $runRoot 'summary.json') -Encoding UTF8
    [ordered]@{runId=$runId;status=$summary.status;summary="$runId/summary.json"} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceRoot 'latest.json') -Encoding UTF8
    Pop-Location
}
Write-Host "Evidence: $runRoot"
if ($summary.status -ne 'PASS') { exit 1 }
