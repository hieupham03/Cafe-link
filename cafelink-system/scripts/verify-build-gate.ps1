param([Parameter(Mandatory=$true)][string]$ProjectRoot,[Parameter(Mandatory=$true)][string]$Summary)
$ErrorActionPreference='Stop'
$gate=Get-Content -LiteralPath $Summary -Raw -Encoding UTF8 | ConvertFrom-Json
$jar=Join-Path $ProjectRoot 'target/cafelink-1.0.0.jar'
if($gate.status -ne 'PASS' -or $gate.artifact.jarSha256 -ine (Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash){throw 'JAR does not match the supplied passing gate.'}
$expected=@($gate.artifact.webFiles)
if($expected.Count -eq 0){throw 'Passing gate must include a nonempty frontend file manifest.'}
$frontend=[IO.Path]::GetFullPath((Join-Path $ProjectRoot 'web/dist'))
$paths=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($row in $expected) {
    $path=([string]$row.path).Replace('\','/')
    if(-not $path -or -not $paths.Add($path)){throw 'Duplicate or missing frontend manifest path.'}
}
$actual=@(Get-ChildItem -LiteralPath $frontend -Recurse -File | ForEach-Object {$_.FullName.Substring($frontend.Length+1).Replace('\','/')})
if($actual.Count -eq 0 -or @(Compare-Object -ReferenceObject @($paths) -DifferenceObject $actual).Count -ne 0){throw 'Frontend file list differs from supplied gate.'}
foreach($row in $expected) {
    if((Get-FileHash -LiteralPath (Join-Path $ProjectRoot ('web/dist/'+$row.path)) -Algorithm SHA256).Hash -ine $row.sha256){throw 'Frontend differs from supplied gate.'}
}
