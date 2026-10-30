param([string]$OutputDirectory='', [string]$GateSummary='', [switch]$SkipBuild)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$projectRoot=Split-Path $PSScriptRoot -Parent
$workspaceRoot=Split-Path $projectRoot -Parent
if(-not $OutputDirectory){$OutputDirectory=Join-Path $workspaceRoot ('dist/CafeLink-Web-V9.4-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
$destination=[IO.Path]::GetFullPath($OutputDirectory)
$archive=$destination+'.zip'
if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $archive)){throw 'Package destination already exists; select a fresh directory.'}
Push-Location $projectRoot
try {
    if(-not $SkipBuild) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
        if($LASTEXITCODE -ne 0){throw 'Java build failed.'}
        & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-web.ps1
        if($LASTEXITCODE -ne 0){throw 'Web build failed.'}
    }
    $jar=Join-Path $projectRoot 'target/cafelink-1.0.0.jar'
    if($GateSummary) {
        & (Join-Path $PSScriptRoot 'verify-build-gate.ps1') -ProjectRoot $projectRoot -Summary $GateSummary
    }
    $pin=Get-Content release/runtime-windows-x64.json -Raw | ConvertFrom-Json
    $download=Join-Path $projectRoot ('.tools/'+$pin.archive)
    if(-not (Test-Path -LiteralPath $download)){Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri $pin.url -OutFile $download}
    if((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ine $pin.sha256){throw 'Bundled runtime archive checksum mismatch.'}
    $unpacked=Join-Path $projectRoot ('.tools/temurin-'+$pin.sha256.Substring(0,12))
    if(-not (Test-Path -LiteralPath (Join-Path $unpacked '.complete'))) {
        if(Test-Path -LiteralPath $unpacked){throw 'Incomplete runtime extraction exists; use a fresh tools directory.'}
        Expand-Archive -LiteralPath $download -DestinationPath $unpacked
        New-Item -ItemType File -Path (Join-Path $unpacked '.complete') | Out-Null
    }
    $runtime=@(Get-ChildItem -LiteralPath $unpacked -Directory)
    if($runtime.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $runtime[0].FullName 'bin/java.exe'))){throw 'Invalid runtime archive layout.'}
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath release/windows -Force | Copy-Item -Destination $destination -Recurse
    New-Item -ItemType Directory -Path (Join-Path $destination 'target'),(Join-Path $destination 'web'),(Join-Path $destination 'docs') -Force | Out-Null
    Copy-Item -LiteralPath $jar -Destination (Join-Path $destination 'target')
    Copy-Item -LiteralPath target/lib -Destination (Join-Path $destination 'target') -Recurse
    Copy-Item -LiteralPath web/dist -Destination (Join-Path $destination 'web') -Recurse
    Copy-Item -LiteralPath $runtime[0].FullName -Destination (Join-Path $destination 'runtime') -Recurse
    foreach($name in @('runtime.ps1','run-web.ps1','public-demo.ps1')) {Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $destination 'scripts')}
    # Only pinned public tunnel tooling is copied, never other .tools contents.
    $cloud=Join-Path $projectRoot '.tools/cloudflared-2026.10.3.exe'
    if(Test-Path -LiteralPath $cloud) {
        if((Get-FileHash -LiteralPath $cloud -Algorithm SHA256).Hash -ine '76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2'){throw 'Cloudflared cache checksum mismatch.'}
        New-Item -ItemType Directory -Path (Join-Path $destination '.tools') -Force | Out-Null
        Copy-Item -LiteralPath $cloud -Destination (Join-Path $destination '.tools')
    }
    foreach($name in @('FINAL_ARCHITECTURE.md','FINAL_PROTOCOL.md','FINAL_RUNBOOK.md','WEB_RELEASE.md','WEB_USER_ACCEPTANCE.md','WEB_V9_3.md','WEB_HARDENING.md')) {Copy-Item -LiteralPath (Join-Path $projectRoot ('docs/'+$name)) -Destination (Join-Path $destination 'docs')}
    if($GateSummary){Copy-Item -LiteralPath $GateSummary -Destination (Join-Path $destination 'VERIFICATION.json')}
    $runtimeVersion=& (Join-Path $destination 'runtime/bin/java.exe') --version
    [ordered]@{name='CafeLink Web';release='V9.4';patch='OPERATIONS_HARDENING';includedPatches=@('QR_ENTRY_FIX','GUEST_ZONES','TCP_READINESS','ADMIN_DIAGNOSTICS','PAYMENT_DEADLINE');schema=11;platform='Windows x64';createdAtUtc=[DateTime]::UtcNow.ToString('o');artifactVersion='1.0.0';javaRuntime=$runtimeVersion;runtimeSource=$pin;jarSha256=(Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash;frontendManifestSha256=(Get-FileHash web/dist/index.html -Algorithm SHA256).Hash;gateSummary=$(if($GateSummary){'VERIFICATION.json'}else{'NOT_PROVIDED'});realPayment='LOCAL_SIMULATOR';physicalPhone='NOT_RUN';physicalLan='NOT_RUN';remoteCi='NOT_RUN'} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $destination 'RELEASE.json') -Encoding UTF8
    foreach($mode in @('Local','Public')) {
        "@echo off`r`npowershell -NoProfile -ExecutionPolicy Bypass -File `"%~dp0Start-$mode.ps1`" %*`r`nif errorlevel 1 pause`r`n" | Set-Content -LiteralPath (Join-Path $destination "START-$($mode.ToUpper()).cmd") -Encoding ASCII
    }
    $files=@(Get-ChildItem -LiteralPath $destination -Recurse -File -Force | Sort-Object FullName | ForEach-Object {[ordered]@{path=$_.FullName.Substring($destination.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})
    [ordered]@{format='CafeLinkWebRelease/1';files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'SHA256-MANIFEST.json') -Encoding UTF8
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destination 'Verify-Package.ps1')
    if($LASTEXITCODE -ne 0){throw 'Package integrity validation failed.'}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($destination,$archive)
    [ordered]@{status='CANDIDATE';directory=$destination;archive=$archive;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash} | ConvertTo-Json -Compress
} finally {Pop-Location}
