param([ValidateRange(1,100)][int]$Repetitions=3, [string]$OfflineSeconds='0', [ValidateRange(1,8)][int]$Parallelism=1)
. (Join-Path $PSScriptRoot 'runtime.ps1')
Push-Location $ProjectRoot
try {
    & $JavaExecutable '--enable-native-access=ALL-UNNAMED' '-Dfile.encoding=UTF-8' '-cp' $RuntimeClasspath 'com.cafelink.client.RecoveryExperimentMain' "--repetitions=$Repetitions" "--offline-seconds=$OfflineSeconds" "--parallelism=$Parallelism"
    $result = $LASTEXITCODE
} finally { Pop-Location }
exit $result
