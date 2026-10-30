param([string]$OutputDirectory='',[string]$Archive='',[string]$Proof='')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(-not $OutputDirectory){$OutputDirectory=Join-Path (Split-Path $projectRoot -Parent) ('dist/CafeLink-Device-UAT-V9.4-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))}
$options=@((Join-Path $projectRoot 'tools/prepare_device_acceptance.py'),'--output',$OutputDirectory)
if($Archive){$options+=@('--archive',$Archive)}
if($Proof){$options+=@('--proof',$Proof)}
& python @options
if($LASTEXITCODE -ne 0){throw 'Acceptance kit preparation failed. Existing directories were left unchanged; inspect the error above.'}
