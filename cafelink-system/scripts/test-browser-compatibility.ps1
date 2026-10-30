param([ValidateSet('firefox','webkit')][string[]]$Engines=@('firefox','webkit'),[switch]$SkipBrowserInstall)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$runId=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$evidence=Join-Path (Split-Path $projectRoot -Parent) ('report/evidence/cafelink-v2/v9.4-hardening/compatibility-'+$runId)
$previousEngine=$env:CAFELINK_E2E_ENGINE;$previousGroup=$env:CAFELINK_E2E_GROUP
$summary=[ordered]@{status='RUNNING';runId=$runId;startedAt=(Get-Date).ToString('o');platform='Windows browser engines, including 390px viewport tests';physicalPhone='NOT_RUN';physicalLan='NOT_RUN';gates=@();failedGroups=0}
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
Push-Location (Join-Path $projectRoot 'web')
try {
    if(-not (Test-Path ../target/cafelink-1.0.0.jar) -or -not (Test-Path dist/index.html)){throw 'Build source with scripts/build-web.ps1 before compatibility tests.'}
    $summary.jarSha256=(Get-FileHash ../target/cafelink-1.0.0.jar -Algorithm SHA256).Hash
    $summary.frontendManifestSha256=(Get-FileHash dist/index.html -Algorithm SHA256).Hash
    $groups=@(@{Name='v7';File='tests/v7.spec.ts';Minimum=9},@{Name='automatic';File='tests/automatic.spec.ts';Minimum=5},@{Name='diagnostics';File='tests/diagnostics.spec.ts';Minimum=4},@{Name='audio';File='tests/audio.spec.ts';Minimum=2})
    foreach($engine in $Engines) {
        $env:CAFELINK_E2E_ENGINE=$engine
        if(-not $SkipBrowserInstall) {
            & npx.cmd playwright install $engine
            if($LASTEXITCODE -ne 0){throw "Cannot install $engine"}
        }
        foreach($group in $groups) {
            if(@(Get-NetTCPConnection -LocalPort 18080,18081 -State Listen -ErrorAction SilentlyContinue).Count){throw 'Test ports are in use. No process was stopped.'}
            $env:CAFELINK_E2E_GROUP=$group.Name
            $result='test-results/'+$group.Name+'-results.json'
            if(Test-Path -LiteralPath $result){Remove-Item -LiteralPath $result -Force}
            $preference=$ErrorActionPreference
            try {
                $ErrorActionPreference='Continue'
                & npx.cmd playwright test $group.File *> (Join-Path $evidence ($engine+'-'+$group.Name+'.log'))
                $gateExit=$LASTEXITCODE
            } finally {$ErrorActionPreference=$preference}
            $gate=[ordered]@{engine=$engine;group=$group.Name;exitCode=$gateExit;status='FAIL'}
            if(Test-Path -LiteralPath $result) {
                Copy-Item -LiteralPath $result -Destination (Join-Path $evidence ($engine+'-'+$group.Name+'.json'))
                $gate.stats=(Get-Content -LiteralPath $result -Raw -Encoding UTF8 | ConvertFrom-Json).stats
                if($gateExit -eq 0 -and $gate.stats.expected -ge $group.Minimum -and $gate.stats.unexpected -eq 0 -and $gate.stats.flaky -eq 0 -and $gate.stats.skipped -eq 0){$gate.status='PASS'}
            }
            $summary.gates+=$gate
            if($gate.status -ne 'PASS'){$summary.failedGroups++}
            Write-Host ($engine+' '+$group.Name+': '+$gate.status)
        }
    }
    $summary.testListenersClosed=(@(Get-NetTCPConnection -LocalPort 18080,18081 -State Listen -ErrorAction SilentlyContinue).Count -eq 0)
    if(-not $summary.testListenersClosed){throw 'A test listener remained; no unrelated process was stopped.'}
    $summary.status=if($summary.failedGroups -eq 0){'PASS'}else{'FAIL'}
} catch {$summary.status='FAIL';$summary.failure=$_.Exception.Message;Write-Host $summary.failure}
finally {
    $env:CAFELINK_E2E_ENGINE=$previousEngine;$env:CAFELINK_E2E_GROUP=$previousGroup
    $summary.finishedAt=(Get-Date).ToString('o')
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'summary.json') -Encoding UTF8
    Pop-Location
}
Write-Host "Compatibility evidence: $evidence"
if($summary.status -ne 'PASS'){exit 1}
