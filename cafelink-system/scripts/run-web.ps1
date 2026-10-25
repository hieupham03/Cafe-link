param(
    [int]$Port = 8080,
    [int]$TcpPort = 5051,
    [string]$BindAddress = '127.0.0.1',
    [string]$DatabasePath = 'data/v2/cafelink.db',
    [string]$PublicOrigin = '',
    [string]$KeyStore = '',
    [string]$QrKeyFile = '',
    [ValidateSet('prepay','postpay')][string]$OrderingMode = 'prepay',
    [switch]$TrustedProxy,
    [string]$AssetsPath = ''
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$webAssets = Join-Path $ProjectRoot 'web\dist'
if ($AssetsPath) { $webAssets = [IO.Path]::GetFullPath((Join-Path $ProjectRoot $AssetsPath)) }
if (-not (Test-Path -LiteralPath (Join-Path $webAssets 'index.html'))) { throw 'Run scripts/build-web.ps1 first.' }
$options = @("--port=$Port", "--tcp-port=$TcpPort", "--bind=$BindAddress", "--db=$DatabasePath", "--assets=$webAssets", "--ordering-mode=$OrderingMode")
if ($PublicOrigin) { $options += "--public-origin=$PublicOrigin" }
if ($KeyStore) { $options += "--keystore=$KeyStore" }
if ($QrKeyFile) { $options += "--qr-key-file=$QrKeyFile" }
if ($TrustedProxy) { $options += '--trusted-proxy=true' }
Push-Location $ProjectRoot
try {
    & $JavaExecutable '--enable-native-access=ALL-UNNAMED' '-Dfile.encoding=UTF-8' '-cp' $RuntimeClasspath 'com.cafelink.web.WebMain' @options
    exit $LASTEXITCODE
} finally { Pop-Location }
