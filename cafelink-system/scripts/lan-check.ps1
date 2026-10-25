param([Parameter(Mandatory=$true)][string]$ServerAddress,[ValidateRange(1,65535)][int]$Port=5050,[string]$OutputFile='')
$ErrorActionPreference='Stop'
$result=[ordered]@{timeUtc=[DateTime]::UtcNow.ToString('o');computer=$env:COMPUTERNAME;serverAddress=$ServerAddress;port=$Port;tcpConnected=$false;probeMs=$null;errorType=$null;scope='Connectivity probe only; not authentication/business/LAN acceptance'}
$watch=[Diagnostics.Stopwatch]::StartNew()
$socket=New-Object System.Net.Sockets.TcpClient
try {
    $task=$socket.ConnectAsync($ServerAddress,$Port)
    if (-not $task.Wait(5000)) { throw [TimeoutException]::new('TCP connection timed out') }
    $task.GetAwaiter().GetResult(); $result.tcpConnected=$true
} catch { $result.errorType=$_.Exception.GetType().Name }
finally { $watch.Stop(); $socket.Dispose(); $result.probeMs=$watch.Elapsed.TotalMilliseconds }
$json=$result | ConvertTo-Json
if ($OutputFile) { $json | Set-Content -Encoding UTF8 -LiteralPath $OutputFile }
Write-Output $json
if (-not $result.tcpConnected) { exit 1 }
