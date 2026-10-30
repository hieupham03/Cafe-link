# Documentation is copied from one policy; links outside the portable bundle open the published source.
function Read-PackageDocumentation {
    param([string]$ProjectRoot)
    $policy = Get-Content -LiteralPath (Join-Path $ProjectRoot 'release/documentation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($policy.format -ne 'CafeLinkDocumentation/1' -or $policy.version -notmatch '^V[0-9]+(?:\.[0-9]+)+$' -or $policy.schema -lt 1) { throw 'Invalid documentation policy.' }
    if (-not $policy.currentPackage.StartsWith('CafeLink-Web-' + $policy.version + '-')) { throw 'Package label differs from the documentation version.' }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in $policy.guides) {
        if ($name -notmatch '^[A-Z0-9_]+\.md$' -or -not $seen.Add([string]$name)) { throw 'Invalid or duplicate portable guide.' }
        if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot ('docs/' + $name)) -PathType Leaf)) { throw "Missing portable guide: $name" }
        if ($name -match '^WEB_(V[0-9_]+)\.md$' -and $Matches[1].Replace('_', '.') -ne $policy.version) { throw "Retired portable guide: $name" }
        $body = [IO.File]::ReadAllText((Join-Path $ProjectRoot ('docs/' + $name)), [Text.Encoding]::UTF8)
        foreach ($label in [regex]::Matches(($body -split '\r?\n', 2)[0], '\bV\d+(?:\.\d+)+\b')) {
            if ($label.Value -ne $policy.version) { throw "Stale portable guide heading: $name" }
        }
        foreach ($block in [regex]::Matches($body, '```[^\n]*\n([\s\S]*?)```')) {
            foreach ($label in [regex]::Matches($block.Groups[1].Value, 'CafeLink-Web-(V\d+(?:\.\d+)+)(?:-RC\d+)?')) {
                if ($label.Groups[1].Value -ne $policy.version -or ($label.Value -match '-RC\d+$' -and $label.Value -ne $policy.currentPackage)) { throw "Stale portable launch command: $name" }
            }
            foreach ($label in [regex]::Matches($block.Groups[1].Value, '-Phase\s+(V\d+(?:\.\d+)+)')) {
                if ($label.Groups[1].Value -ne $policy.version) { throw "Stale portable test command: $name" }
            }
        }
    }
    if ($seen.Count -eq 0) { throw 'Portable documentation list is empty.' }
    return $policy
}

function Copy-PackageDocumentation {
    param([string]$ProjectRoot, [string]$WorkspaceRoot, [string]$Destination, $Documentation)
    $pairs = @()
    foreach ($name in $Documentation.guides) {
        $source = Join-Path $ProjectRoot ('docs/' + $name)
        $target = Join-Path $Destination ('docs/' + $name)
        Copy-Item -LiteralPath $source -Destination $target
        $pairs += [pscustomobject]@{ Source = $source; Target = $target }
    }
    Copy-Item -LiteralPath (Join-Path $ProjectRoot 'release/documentation.json') -Destination (Join-Path $Destination 'docs/DOCUMENTATION.json')
    $pairs += [pscustomobject]@{ Source = (Join-Path $ProjectRoot 'release/windows/START-HERE.md'); Target = (Join-Path $Destination 'START-HERE.md') }
    $workspacePrefix = [IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\') + '\'
    $destinationPrefix = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
    $repositoryBase = $Documentation.repository.TrimEnd('/') + '/blob/main/'
    foreach ($pair in $pairs) {
        $sourceFile = $pair.Source
        $targetFile = $pair.Target
        $body = [IO.File]::ReadAllText($targetFile, [Text.Encoding]::UTF8)
        $converted = [regex]::Replace($body, '(!?\[[^\]\r\n]*\]\()([^\)\r\n]+)(\))', [System.Text.RegularExpressions.MatchEvaluator]{
            param($match)
            $url = $match.Groups[2].Value
            if ($url -match '^(?:[A-Za-z][A-Za-z0-9+.-]*:|//|#)') { return $match.Value }
            $parts = $url -split '#', 2
            $relative = [Uri]::UnescapeDataString($parts[0])
            $local = [IO.Path]::GetFullPath((Join-Path (Split-Path $targetFile -Parent) $relative))
            if ($local.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $local)) { return $match.Value }
            $original = [IO.Path]::GetFullPath((Join-Path (Split-Path $sourceFile -Parent) $relative))
            if (-not $original.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $original)) { throw "Unresolved package documentation link: $sourceFile -> $url" }
            $repositoryPath = $original.Substring($workspacePrefix.Length).Replace('\', '/')
            if (Test-Path -LiteralPath (Join-Path $WorkspaceRoot '.git')) {
                & git -C $WorkspaceRoot ls-files --error-unmatch -- $repositoryPath 2>$null | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "Package documentation links to a local-only file: $url" }
            }
            $encoded = (($repositoryPath -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
            $replacement = $repositoryBase + $encoded
            if ($parts.Count -gt 1) { $replacement += '#' + $parts[1] }
            return $match.Groups[1].Value + $replacement + $match.Groups[3].Value
        })
        [IO.File]::WriteAllText($targetFile, $converted, (New-Object Text.UTF8Encoding($false)))
    }
}
