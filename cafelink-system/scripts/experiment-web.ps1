param([switch]$Quick, [switch]$SkipBuild, [string]$OutputPath='')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$workspaceRoot=Split-Path $ProjectRoot -Parent
if(-not $OutputPath) { $OutputPath=Join-Path $workspaceRoot ('report\evidence\cafelink-v2\v8\'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)) }
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
if((Test-Path -LiteralPath $OutputPath) -and @(Get-ChildItem -LiteralPath $OutputPath -Force).Count -gt 0) { throw 'Use a fresh output directory; evidence is never overwritten.' }
New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
$oldJava=$env:CAFELINK_JAVA; $oldClasspath=$env:CAFELINK_CLASSPATH
$env:CAFELINK_JAVA=$JavaExecutable; $env:CAFELINK_CLASSPATH=$RuntimeClasspath
$summary=[ordered]@{status='RUNNING';quick=[bool]$Quick;startedAt=(Get-Date).ToString('o');physicalLan='NOT_RUN';physicalPhone='NOT_RUN';remoteCi='NOT_RUN'}
Push-Location (Join-Path $ProjectRoot 'web')
try {
    if(-not $SkipBuild) {
        & npm.cmd run build
        if($LASTEXITCODE -ne 0){throw 'Production web build failed'}
        & npx.cmd vite build --mode experiment
        if($LASTEXITCODE -ne 0){throw 'Experiment build failed'}
    }
    $environment=[ordered]@{os=[Environment]::OSVersion.VersionString;cpu=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name);logicalProcessors=[Environment]::ProcessorCount;memoryBytes=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory;node=(& node --version);python=(& python --version);javaVersion=([regex]::Match($javaProbeText,'(?m)^\s*java\.version\s*=\s*(.+?)\s*$')).Groups[1].Value;jarSha256=(Get-FileHash $AppJar -Algorithm SHA256).Hash;productionManifestSha256=(Get-FileHash dist/index.html -Algorithm SHA256).Hash;experimentManifestSha256=(Get-FileHash experiment-dist/experiment.html -Algorithm SHA256).Hash;topology='Chromium -> HTTP Gateway -> TCP Core -> SQLite, all on loopback'}
    $environment | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputPath 'environment.json') -Encoding UTF8
    $sourceRoots=@('../src','../scripts','../tools','src','experiments','tests','dist','experiment-dist')
    $sourceFiles=@(Get-ChildItem -Path $sourceRoots -Recurse -File | Where-Object {$_.FullName -notmatch '__pycache__'}) + @(Get-Item package.json,package-lock.json,vite.config.ts,playwright.config.ts,tsconfig.json,../pom.xml)
    $manifest=@($sourceFiles | Sort-Object FullName | ForEach-Object {[ordered]@{path=$_.FullName.Substring($ProjectRoot.Length+1);sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}})
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputPath 'source-manifest.json') -Encoding UTF8
    $repeat=5; if($Quick){$repeat=1}
    & node experiments/campaign.mjs "--repetitions=$repeat" "--output=$(Join-Path $OutputPath 'recovery')"
    if($LASTEXITCODE -ne 0){throw 'Recovery campaign failed; raw evidence was retained'}
    $loadArgs=@('--repetitions=3','--seconds=15','--warmup=3','--counts=1,5,10,14')
    if($Quick){$loadArgs=@('--repetitions=1','--seconds=3','--warmup=1','--counts=1,5')}
    & node experiments/load.mjs @loadArgs "--output=$(Join-Path $OutputPath 'load')"
    if($LASTEXITCODE -ne 0){throw 'Load campaign failed; raw evidence was retained'}
    & python ../tools/analyze_web.py --input $OutputPath
    if($LASTEXITCODE -ne 0){throw 'Analysis failed'}
    $summary.status='PASS'
} catch { $summary.status='FAIL'; $summary.failure=$_.Exception.Message; Write-Host $summary.failure }
finally {
    $summary.finishedAt=(Get-Date).ToString('o')
    $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputPath 'summary.json') -Encoding UTF8
    $env:CAFELINK_JAVA=$oldJava; $env:CAFELINK_CLASSPATH=$oldClasspath
    Pop-Location
}
Write-Host "V8 evidence: $OutputPath"
if($summary.status -ne 'PASS'){exit 1}
