$ErrorActionPreference='Stop'
$releaseRoot=$PSScriptRoot
$manifest=Get-Content -LiteralPath (Join-Path $releaseRoot 'SHA256-MANIFEST.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
foreach($row in $manifest.files) {
    if(-not $seen.Add([string]$row.path)){throw 'Duplicate package manifest path.'}
    $path=[IO.Path]::GetFullPath((Join-Path $releaseRoot $row.path))
    if(-not $path.StartsWith($releaseRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest path escapes package.'}
    if(-not (Test-Path -LiteralPath $path -PathType Leaf)){throw "Missing package file: $($row.path)"}
    if((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package links are not supported.'}
    if((Get-Item -LiteralPath $path).Length -ne [long]$row.bytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine [string]$row.sha256){throw "Changed package file: $($row.path)"}
}
foreach($directory in @('runtime','scripts','target/lib','web/dist')) {
    $root=Join-Path $releaseRoot $directory
    if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package directory links are not supported.'}
    foreach($item in Get-ChildItem -LiteralPath $root -Recurse -Force) {
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Package directory links are not supported.'}
        if(-not $item.PSIsContainer -and -not $seen.Contains($item.FullName.Substring($releaseRoot.Length+1).Replace('\','/'))){throw 'Unlisted file in executable or web assets directory.'}
    }
}
if($seen.Count -lt 10){throw 'Package manifest is incomplete.'}
Write-Host "PACKAGE VERIFY PASS: $($seen.Count) files. Runtime data is outside the pristine manifest."
