param([switch]$SkipInstall, [switch]$SkipJava)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $projectRoot 'web')
try {
    if (-not $SkipInstall) { & npm.cmd ci --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
} finally { Pop-Location }
if (-not $SkipJava) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1') -SkipTests
    if ($LASTEXITCODE -ne 0) { throw 'Java package failed' }
}
Write-Host 'Web V9.4 ready. Run scripts/run-web.ps1; scripts/test-web.ps1 runs Java and browser verification.'
