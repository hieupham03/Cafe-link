$ErrorActionPreference='Stop'
$ReleaseRoot=Split-Path $PSScriptRoot -Parent

function Assert-SafePath([string]$Path,[string]$Root) {
    $absolute=[IO.Path]::GetFullPath($Path)
    $boundary=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
    if(-not $absolute.StartsWith($boundary+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Path must stay inside the designated release directory.' }
    $ancestor=$absolute
    while($ancestor.Length -ge $boundary.Length) {
        if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {throw 'Links/junctions are not allowed in release data paths.'}
        if($ancestor -eq $boundary){break}
        $ancestor=Split-Path $ancestor -Parent
    }
    return $absolute
}

function Assert-NoLinks([string]$Directory) {
    $pending=New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Directory)
    while($pending.Count -gt 0) {
        foreach($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Links/junctions are not allowed in backup data.'}
            if($entry.PSIsContainer){$pending.Push($entry.FullName)}
        }
    }
}

function Get-ReleaseSettings([int]$Port=0,[int]$TcpPort=0,[string]$DataDirectory='',[switch]$PublicProfile) {
    if(-not (Test-Path -LiteralPath (Join-Path $ReleaseRoot 'RELEASE.json'))){throw 'Run this command inside an extracted CafeLink Web V9 release.'}
    $config=Get-Content -LiteralPath (Join-Path $ReleaseRoot 'config/demo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($Port -eq 0){$Port=[int]$config.port}
    if($TcpPort -eq 0){$TcpPort=[int]$config.tcpPort}
    if($Port -lt 1024 -or $Port -gt 65535 -or $TcpPort -lt 1024 -or $TcpPort -gt 65535 -or $Port -eq $TcpPort){throw 'Use two different ports between 1024 and 65535.'}
    if(-not $DataDirectory){if($PublicProfile){$DataDirectory=[string]$config.publicDataDirectory}else{$DataDirectory=[string]$config.dataDirectory}}
    if(-not $DataDirectory -or [IO.Path]::IsPathRooted($DataDirectory)){throw 'Data directory must be relative to the release.'}
    $profile=Assert-SafePath (Join-Path $ReleaseRoot $DataDirectory) (Join-Path $ReleaseRoot 'data')
    return [pscustomobject]@{Port=$Port;TcpPort=$TcpPort;Profile=$profile;Database=(Join-Path $profile 'cafelink.db')}
}

function Enter-ReleaseLease {
    $lock=Assert-SafePath (Join-Path $ReleaseRoot 'data/.release.lock') $ReleaseRoot
    New-Item -ItemType Directory -Path (Split-Path $lock -Parent) -Force | Out-Null
    try {return New-Object IO.FileStream($lock,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}
    catch {throw 'Cannot acquire the data lease. Stop the demo with Ctrl+C, or check folder permissions.'}
}

function Assert-ProfileOffline($Settings) {
    if(Test-Path -LiteralPath $Settings.Profile){Assert-NoLinks $Settings.Profile}
    foreach($suffix in @('','-wal','-shm')) {
        $file=$Settings.Database+$suffix
        if(Test-Path -LiteralPath $file) {
            try {$probe=New-Object IO.FileStream($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$probe.Dispose()}
            catch {throw 'Database is in use. Stop all CafeLink processes before maintenance.'}
        }
    }
}

function Invoke-BackupCheck([string]$Database,[switch]$PassThru) {
    . (Join-Path $PSScriptRoot 'runtime.ps1')
    $previousPreference=$ErrorActionPreference
    try {
        $ErrorActionPreference='Continue'
        $result=& $JavaExecutable '-cp' $RuntimeClasspath 'com.cafelink.server.BackupCheckMain' "--db=$Database" "--qr-key-file=$Database.qr-key" 2>&1
        $resultExit=$LASTEXITCODE
    } finally {$ErrorActionPreference=$previousPreference}
    if($resultExit -ne 0){throw 'Database/key validation failed. Keep the current data and check the selected backup.'}
    $jsonLines=@($result | ForEach-Object {[string]$_} | Where-Object {$_.Trim().StartsWith('{')})
    if($jsonLines.Count -ne 1){throw 'Backup inspector returned an invalid result.'}
    $inspection=$jsonLines[0] | ConvertFrom-Json
    if($inspection.status -ne 'PASS' -or $inspection.schema -notin @(9,10,11)){throw 'Unsupported inspected backup schema.'}
    if($PassThru){return $inspection}
}

function New-WorkDirectory([string]$Kind) {
    $work=Assert-SafePath (Join-Path $ReleaseRoot ('.work/'+$Kind+'-'+[guid]::NewGuid().ToString('N'))) (Join-Path $ReleaseRoot '.work')
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    return $work
}

function Remove-OwnedWork([string]$Directory) {
    $safe=Assert-SafePath $Directory (Join-Path $ReleaseRoot '.work')
    if((Split-Path $safe -Leaf) -notmatch '^(backup|restore)-[0-9a-f]{32}$'){throw 'Unexpected work directory.'}
    if(Test-Path -LiteralPath $safe){Assert-NoLinks $safe;Remove-Item -LiteralPath $safe -Recurse -Force}
}

function Move-CurrentProfile($Settings,[string]$Kind) {
    if(-not (Test-Path -LiteralPath $Settings.Profile)){return $null}
    $archive=Assert-SafePath (Join-Path $ReleaseRoot ('backups/'+$Kind+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))) (Join-Path $ReleaseRoot 'backups')
    New-Item -ItemType Directory -Path (Split-Path $archive -Parent) -Force | Out-Null
    Assert-NoLinks $Settings.Profile
    Move-Item -LiteralPath $Settings.Profile -Destination $archive
    return $archive
}
