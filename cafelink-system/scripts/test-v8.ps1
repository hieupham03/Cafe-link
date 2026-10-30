param([switch]$Quick,[switch]$SkipInstall,[switch]$SkipBrowserInstall)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    & python tools/verify_v8_workflow.py
    if($LASTEXITCODE -ne 0){throw 'Workflow/configuration checks failed'}
    & python tools/test_build_gate.py
    if($LASTEXITCODE -ne 0){throw 'Build-to-gate matching checks failed'}
    & python tools/test_device_acceptance.py
    if($LASTEXITCODE -ne 0){throw 'Device acceptance preparation checks failed'}
    & python tools/test_gate_evidence.py
    if($LASTEXITCODE -ne 0){throw 'Failed Java gate evidence checks failed'}
    $regressionArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/test-web.ps1')
    if($SkipInstall){$regressionArgs+='-SkipInstall'}
    if($SkipBrowserInstall){$regressionArgs+='-SkipBrowserInstall'}
    & powershell @regressionArgs
    if($LASTEXITCODE -ne 0){throw 'V8 regression gate failed'}
    & python tools/test_web_analysis.py
    if($LASTEXITCODE -ne 0){throw 'Measurement validation tests failed'}
    $experimentArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/experiment-web.ps1','-SkipBuild')
    if($Quick){$experimentArgs+='-Quick'}
    & powershell @experimentArgs
    if($LASTEXITCODE -ne 0){throw 'V8 experiment gate failed'}
} finally {Pop-Location}
