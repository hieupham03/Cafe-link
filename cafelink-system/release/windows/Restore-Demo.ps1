param([Parameter(Mandatory=$true)][string]$Archive,[string]$DataDirectory='',[switch]$Public)
. (Join-Path $PSScriptRoot 'scripts/release-common.ps1')
$settings=Get-ReleaseSettings -DataDirectory $DataDirectory -PublicProfile:$Public
$archivePath=[IO.Path]::GetFullPath($Archive)
$lease=Enter-ReleaseLease
$work=$null
try {
    Assert-ProfileOffline $settings
    if(-not (Test-Path -LiteralPath $archivePath -PathType Leaf)){throw 'Backup archive does not exist.'}
    $work=New-WorkDirectory 'restore'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        [long]$totalBytes=0
        if($zip.Entries.Count -gt 20000){throw 'Backup has too many entries.'}
        foreach($entry in $zip.Entries) {
            $name=$entry.FullName.Replace('\','/')
            if($name -match '(^/|:|(^|/)\.\.?(/|$))' -or -not $seen.Add($name.TrimEnd('/'))){throw 'Unsafe or duplicate backup path.'}
            if(($entry.ExternalAttributes -band 0x400) -ne 0 -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'Backup links are not allowed.'}
            $totalBytes+=$entry.Length
            if($totalBytes -gt 536870912){throw 'Backup exceeds the 512 MiB portable-demo limit.'}
            $destination=Assert-SafePath (Join-Path $work $name) $work
            if($name.EndsWith('/')) {New-Item -ItemType Directory -Path $destination -Force | Out-Null;continue}
            if($name -ne 'BACKUP.json' -and $name -notmatch '^profile/cafelink\.db(-wal|-shm|\.qr-key)?$' -and $name -notmatch '^profile/cafelink\.db\.media/[a-f0-9]{64}(-thumb)?\.jpg$'){throw 'Unexpected backup file.'}
            New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination)
        }
    } finally {$zip.Dispose()}
    $manifest=Get-Content -LiteralPath (Join-Path $work 'BACKUP.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($manifest.format -ne 'CafeLinkOfflineBackup/1' -or $manifest.schema -notin @(9,10,11) -or @($manifest.files).Count -lt 2){throw 'Unsupported backup manifest.'}
    $listed=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($row in $manifest.files) {
        if(-not $listed.Add([string]$row.path) -or -not ([string]$row.path).StartsWith('profile/')){throw 'Invalid manifest path.'}
        $file=Assert-SafePath (Join-Path $work $row.path) (Join-Path $work 'profile')
        if(-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -ne [long]$row.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine [string]$row.sha256){throw 'Backup file is missing or its checksum differs.'}
    }
    $actual=@(Get-ChildItem -LiteralPath (Join-Path $work 'profile') -Recurse -File -Force)
    if($actual.Count -ne $listed.Count){throw 'Unlisted backup content.'}
    $newProfile=Join-Path $work 'profile'
    $inspection=Invoke-BackupCheck (Join-Path $newProfile 'cafelink.db') -PassThru
    if($inspection.schema -ne $manifest.schema){throw 'Backup manifest schema does not match the database.'}
    $previous=Move-CurrentProfile $settings 'before-restore'
    try {
        New-Item -ItemType Directory -Path (Split-Path $settings.Profile -Parent) -Force | Out-Null
        Move-Item -LiteralPath $newProfile -Destination $settings.Profile
    } catch {
        if($previous -and -not (Test-Path -LiteralPath $settings.Profile)){Move-Item -LiteralPath $previous -Destination $settings.Profile}
        throw
    }
    [ordered]@{status='PASS';restoredArchiveSha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash;previousProfile=$previous} | ConvertTo-Json -Compress
} finally {if($work){Remove-OwnedWork $work};$lease.Dispose()}
