param([string]$ServerAddress='127.0.0.1', [int]$Port=5050, [string]$Username='ban1')
. (Join-Path $PSScriptRoot 'runtime.ps1')
& $JavaExecutable '--enable-native-access=ALL-UNNAMED' '-Dfile.encoding=UTF-8' '-cp' $RuntimeClasspath 'com.cafelink.client.ClientMain' "--host=$ServerAddress" "--port=$Port" "--username=$Username"
exit $LASTEXITCODE
