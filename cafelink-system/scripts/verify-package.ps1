$ErrorActionPreference='Stop'
$packagePath=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$manifest=Join-Path $packagePath 'SHA256-MANIFEST.csv'
if (-not (Test-Path -LiteralPath $manifest)) { throw 'Run this script inside an exported original-baseline package.' }
$count=0
foreach ($row in (Import-Csv -Encoding UTF8 -LiteralPath $manifest)) {
    $path=[IO.Path]::GetFullPath((Join-Path $packagePath $row.path))
    if (-not $path.StartsWith($packagePath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest path escapes package.' }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing file: $($row.path)" }
    if ((Get-Item -LiteralPath $path).Length -ne [long]$row.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $row.sha256) { throw "Changed file: $($row.path)" }
    $count++
}
Write-Host "PACKAGE VERIFY PASS: $count files checked. Generated runtime files are outside manifest."
