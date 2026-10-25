"""Local YAML/PowerShell checks; this does not pretend to execute GitHub Actions."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / '.tools/v8-validation'))
import yaml


def verify():
    workflow = yaml.load((PROJECT.parent / '.github/workflows/cafelink-v8.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
    assert set(workflow['on']) == {'push', 'pull_request', 'workflow_dispatch'}
    assert workflow['permissions'] == {'contents': 'read'}
    job = workflow['jobs']['windows-verify']
    assert job['runs-on'] == 'windows-latest'
    snippets = []
    for step in job['steps']:
        if 'uses' in step:
            assert re.fullmatch(r'actions/[a-z-]+@[0-9a-f]{40}', step['uses']), 'Action is not pinned'
        if 'run' in step:
            snippets.append({'label': step['name'], 'text': step['run']})
        if step.get('name') == 'Upload allowlisted results even after failure':
            assert step['if'] == 'always()'
            assert set(step['with']['path'].splitlines()) == {'report/evidence/cafelink-v2/v8/**', 'report/evidence/cafelink-v2/v8-gate/**', 'report/evidence/cafelink-v2/v9.3-gate/**'}
    for script in ['experiment-web.ps1', 'test-v8.ps1', 'test-web.ps1', 'run-web.ps1']:
        snippets.append({'label': script, 'text': (PROJECT / 'scripts' / script).read_text(encoding='utf-8-sig')})
    parse = r"""$items=([Console]::In.ReadToEnd() | ConvertFrom-Json); $failed=$false
foreach($item in $items) {
 $tokens=$null; $parseErrors=$null
 [System.Management.Automation.Language.Parser]::ParseInput($item.text,[ref]$tokens,[ref]$parseErrors) | Out-Null
 if($parseErrors.Count -gt 0) {$failed=$true; Write-Output $item.label; $parseErrors | ForEach-Object {Write-Output $_.Message}}
}
if($failed){exit 1}
"""
    result = subprocess.run(['powershell', '-NoProfile', '-Command', parse], input=json.dumps(snippets), capture_output=True, text=True)
    if result.returncode:
        raise ValueError(result.stdout + result.stderr)
    baseline = PROJECT.parent / 'dist/CafeLink-Original-1.0.0-Baseline.zip'
    assert hashlib.sha256(baseline.read_bytes()).hexdigest() == '60a1e6666f4bac52b2f0b868a9aafd9024563991ab22777076d639416e8766eb'
    return {'status': 'PASS', 'checks': ['YAML shape', 'pinned action references', 'PowerShell syntax', 'artifact path allowlist', 'sealed E0 SHA256'], 'remoteCi': 'NOT_RUN'}


if __name__ == '__main__':
    print(json.dumps(verify()))
