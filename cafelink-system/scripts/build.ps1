param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'maven.ps1'), '-B', 'package')
if ($SkipTests) { $arguments += '-DskipTests=true' }
& powershell @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Build ready: target/cafelink-1.0.0.jar + target/lib/'
