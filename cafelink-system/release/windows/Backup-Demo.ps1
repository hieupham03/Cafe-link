param([string]$DataDirectory='',[switch]$Public)
. (Join-Path $PSScriptRoot 'scripts/release-common.ps1')
$settings=Get-ReleaseSettings -DataDirectory $DataDirectory -PublicProfile:$Public
$lease=Enter-ReleaseLease
$work=$null
try {
    Assert-ProfileOffline $settings
    $inspection=Invoke-BackupCheck $settings.Database -PassThru
    $work=New-WorkDirectory 'backup'
    Copy-Item -LiteralPath $settings.Profile -Destination (Join-Path $work 'profile') -Recurse
    Invoke-BackupCheck (Join-Path $work 'profile/cafelink.db')
    $entries=@(Get-ChildItem -LiteralPath (Join-Path $work 'profile') -Recurse -File -Force | Sort-Object FullName | ForEach-Object {
        [ordered]@{path=$_.FullName.Substring($work.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
    })
    [ordered]@{format='CafeLinkOfflineBackup/1';schema=$inspection.schema;createdAtUtc=[DateTime]::UtcNow.ToString('o');files=$entries;browserStorageIncluded=$false} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $work 'BACKUP.json') -Encoding UTF8
    $archive=Assert-SafePath (Join-Path $ReleaseRoot ('backups/backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.zip')) (Join-Path $ReleaseRoot 'backups')
    New-Item -ItemType Directory -Path (Split-Path $archive -Parent) -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($work,$archive)
    [ordered]@{status='PASS';backup=$archive;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash;files=$entries.Count} | ConvertTo-Json -Compress
} finally {if($work){Remove-OwnedWork $work};$lease.Dispose()}
