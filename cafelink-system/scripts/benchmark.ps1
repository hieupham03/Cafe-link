param(
    [string]$ClientCounts='1,5,10,20',
    [ValidateRange(1,20)][int]$Repetitions=5,
    [ValidateRange(1,600)][int]$DurationSeconds=60,
    [ValidateRange(0,60)][int]$WarmupSeconds=10,
    [ValidateRange(50,10000)][int]$PeriodMillis=1000
)
. (Join-Path $PSScriptRoot 'runtime.ps1')
$counts = @($ClientCounts.Split(',') | ForEach-Object { [int]$_ })
if ($counts.Count -eq 0 -or @($counts | Where-Object { $_ -lt 1 -or $_ -gt 20 }).Count -gt 0) { throw 'ClientCounts must contain values from 1 to 20.' }
$outputDir = Join-Path $ProjectRoot ('target\benchmark-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputDir | Out-Null
$jarHash = (Get-FileHash -LiteralPath $AppJar -Algorithm SHA256).Hash
$cpu = Get-CimInstance Win32_Processor
$os = Get-CimInstance Win32_OperatingSystem
$machine = Get-CimInstance Win32_ComputerSystem
[ordered]@{
    capturedAtUtc=[DateTime]::UtcNow.ToString('o'); java=(& $JavaExecutable --version | Out-String).Trim()
    os=$os.Caption; osBuild=$os.BuildNumber; cpu=$cpu.Name; logicalProcessors=$cpu.NumberOfLogicalProcessors
    physicalRamBytes=$machine.TotalPhysicalMemory; appJarSha256=$jarHash
    topology='Loopback TCP, isolated server JVM and load-client JVM per case; no physical LAN claim'
    javaExecutable=$JavaExecutable; runtimeLauncherSha256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'runtime.ps1') -Algorithm SHA256).Hash
    clientCounts=$counts; repetitions=$Repetitions; warmupSeconds=$WarmupSeconds; durationSeconds=$DurationSeconds; periodMillis=$PeriodMillis
} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $outputDir 'environment.json')
$cases = @(); $caseNumber=0; $failed=0
foreach ($repeat in 1..$Repetitions) {
    $orderedCounts = if ($repeat % 2 -eq 0) { @($counts | Sort-Object -Descending) } else { $counts }
    foreach ($count in $orderedCounts) {
        $caseNumber++; $caseDir=Join-Path $outputDir ("clients-{0}-run-{1}" -f $count,$repeat)
        New-Item -ItemType Directory -Path $caseDir | Out-Null
        $serverProcess=$null; $clientProcess=$null; $status='FAIL'; $errorDetail=''; $port=$null; $listenerClosed=$false
        try {
            if ((Get-FileHash -LiteralPath $AppJar -Algorithm SHA256).Hash -ne $jarHash) { throw 'Application JAR changed during campaign.' }
            $probe=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,0)
            $probe.Start(); $port=$probe.LocalEndpoint.Port; $probe.Stop()
            $serverArgs=@('--enable-native-access=ALL-UNNAMED','-Dfile.encoding=UTF-8','-cp',('"'+$RuntimeClasspath+'"'),'com.cafelink.server.ServerMain','--headless',"--port=$port",('"--db='+ (Join-Path $caseDir 'server.db') +'"'))
            $serverProcess=Start-Process -FilePath $JavaExecutable -ArgumentList $serverArgs -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $caseDir 'server.log') -RedirectStandardError (Join-Path $caseDir 'server.err')
            $deadline=[DateTime]::UtcNow.AddSeconds(15); $ready=$false
            while ([DateTime]::UtcNow -lt $deadline) {
                $serverProcess.Refresh(); if ($serverProcess.HasExited) { throw 'Server exited during startup.' }
                $connection=New-Object System.Net.Sockets.TcpClient
                try { $connection.Connect('127.0.0.1',$port); $ready=$true; break } catch { Start-Sleep -Milliseconds 100 } finally { $connection.Dispose() }
            }
            if (-not $ready) { throw 'Server startup timeout.' }
            Write-Host "BENCHMARK case $caseNumber : $count guests, repeat $repeat"
            $clientArgs=@('--enable-native-access=ALL-UNNAMED','-Dfile.encoding=UTF-8','-cp',('"'+$RuntimeClasspath+'"'),'com.cafelink.client.BenchmarkClientMain',"--port=$port","--clients=$count","--warmup-seconds=$WarmupSeconds","--duration-seconds=$DurationSeconds","--period-ms=$PeriodMillis",('"--output='+(Join-Path $caseDir 'measurements')+'"'))
            $clientProcess=Start-Process -FilePath $JavaExecutable -ArgumentList $clientArgs -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $caseDir 'client.log') -RedirectStandardError (Join-Path $caseDir 'client.err')
            $null=$clientProcess.Handle
            $deadline=[DateTime]::UtcNow.AddSeconds($WarmupSeconds+$DurationSeconds+90)
            while (-not $clientProcess.WaitForExit(500)) {
                $serverProcess.Refresh(); if ($serverProcess.HasExited) { throw 'Server exited during measurement.' }
                if ([DateTime]::UtcNow -gt $deadline) { throw 'Load-client deadline exceeded.' }
            }
            $clientProcess.WaitForExit(); if ($clientProcess.ExitCode -ne 0) { throw "Load client failed with exit $($clientProcess.ExitCode)." }
            $summary=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $caseDir 'measurements\summary.json') | ConvertFrom-Json
            if ($summary.status -ne 'PASS') { throw 'Data reconciliation or request errors failed.' }
            $serverProcess.Refresh()
            [ordered]@{serverPeakWorkingSetBytes=$serverProcess.PeakWorkingSet64; clientPeakWorkingSetBytes=$clientProcess.PeakWorkingSet64; scope='Whole-case process peak, includes startup/authentication/warmup; not a measurement-window CPU benchmark'} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $caseDir 'process-metrics.json')
            $status='PASS'
        } catch { $errorDetail=$_.Exception.Message; $failed++; Write-Host "BENCHMARK FAILED: $errorDetail" }
        finally {
            foreach ($owned in @($clientProcess,$serverProcess)) { if ($null -ne $owned) { $owned.Refresh(); if (-not $owned.HasExited) { Stop-Process -Id $owned.Id; $owned.WaitForExit() } } }
        }
        if ($null -ne $port) {
            $cleanupProbe=New-Object System.Net.Sockets.TcpClient
            try { $cleanupProbe.Connect('127.0.0.1',$port) } catch { $listenerClosed=$true } finally { $cleanupProbe.Dispose() }
            if (-not $listenerClosed -and $status -eq 'PASS') { $status='FAIL'; $errorDetail='Owned JVM stop left its TCP listener open.'; $failed++ }
        }
        $databaseBytes=(@(Get-ChildItem -LiteralPath $caseDir -File | Where-Object { $_.Name -like 'server.db*' }) | Measure-Object -Property Length -Sum).Sum
        $cases += [pscustomobject]@{case=$caseNumber;clients=$count;repeat=$repeat;status=$status;listenerClosed=$listenerClosed;databaseBytes=$databaseBytes;folder=(Split-Path $caseDir -Leaf);error=$errorDetail}
        $cases | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $outputDir 'cases.csv')
    }
}
[ordered]@{status=$(if ($failed -eq 0) {'PASS'} else {'FAIL'});cases=$caseNumber;failed=$failed;appJarSha256=$jarHash;completedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $outputDir 'campaign-summary.json')
Write-Host "BENCHMARK evidence: $outputDir"
if ($failed -gt 0) { throw "$failed benchmark cases failed; raw evidence retained." }
