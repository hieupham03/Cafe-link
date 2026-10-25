$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$AppJar = Join-Path $ProjectRoot 'target\cafelink-1.0.0.jar'
$RuntimeClasspath = "$AppJar;$(Join-Path $ProjectRoot 'target\lib\*')"
if (Test-Path -LiteralPath (Join-Path $ProjectRoot 'RELEASE.json')) {
    $JavaExecutable = Join-Path $ProjectRoot 'runtime\bin\java.exe'
    if (-not (Test-Path -LiteralPath $AppJar -PathType Leaf) -or -not (Test-Path -LiteralPath $JavaExecutable -PathType Leaf)) {
        throw 'Portable release is incomplete. Extract a fresh copy of the release ZIP.'
    }
    return
}
if (-not (Test-Path -LiteralPath $AppJar)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
}
$javaOnPath = (Get-Command java -ErrorAction Stop).Source
# Oracle's javapath executable can be a forwarding process. Resolve java.home
# so Start-Process returns the actual JVM PID and cleanup really stops it.
$javaProbeInfo = New-Object System.Diagnostics.ProcessStartInfo
$javaProbeInfo.FileName=$javaOnPath
$javaProbeInfo.Arguments='-XshowSettings:properties --version'
$javaProbeInfo.UseShellExecute=$false; $javaProbeInfo.CreateNoWindow=$true
$javaProbeInfo.RedirectStandardOutput=$true; $javaProbeInfo.RedirectStandardError=$true
$javaProbe = [Diagnostics.Process]::Start($javaProbeInfo)
try {
    # Drain both pipes concurrently: a long PATH can fill stderr before stdout
    # closes and otherwise deadlock a clean-path launch.
    $javaProbeOut=$javaProbe.StandardOutput.ReadToEndAsync()
    $javaProbeErr=$javaProbe.StandardError.ReadToEndAsync()
    $javaProbe.WaitForExit()
    $javaProbeText=$javaProbeOut.GetAwaiter().GetResult()+$javaProbeErr.GetAwaiter().GetResult()
    if ($javaProbe.ExitCode -ne 0) { throw 'Java runtime discovery failed.' }
    $javaHomeMatch=[regex]::Match($javaProbeText,'(?m)^\s*java\.home\s*=\s*(.+?)\s*$')
    if (-not $javaHomeMatch.Success) { throw 'Java did not report java.home.' }
    $JavaExecutable=Join-Path $javaHomeMatch.Groups[1].Value.Trim() 'bin\java.exe'
    if (-not (Test-Path -LiteralPath $JavaExecutable -PathType Leaf)) { throw 'Resolved Java executable does not exist.' }
} finally { $javaProbe.Dispose() }
