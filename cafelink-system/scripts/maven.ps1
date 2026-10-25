param([Parameter(ValueFromRemainingArguments=$true)][string[]]$MavenArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$mavenVersion = '3.9.11'
$toolsDir = Join-Path $projectRoot '.tools'
$mavenCmd = Join-Path $toolsDir "apache-maven-$mavenVersion\bin\mvn.cmd"
if (-not (Test-Path -LiteralPath $mavenCmd)) {
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    $archivePath = Join-Path $toolsDir "apache-maven-$mavenVersion-bin.zip"
    $sourceUrl = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$mavenVersion/apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest -Uri $sourceUrl -OutFile $archivePath -UseBasicParsing
    $expectedHash = (Invoke-WebRequest -Uri "$sourceUrl.sha512" -UseBasicParsing).Content.Trim().Split(' ')[0]
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash
    if ($actualHash -ine $expectedHash) { throw 'Maven archive checksum mismatch' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDir -Force
}
Push-Location $projectRoot
try { & $mavenCmd @MavenArgs; $result = $LASTEXITCODE } finally { Pop-Location }
exit $result
