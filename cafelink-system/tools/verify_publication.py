"""Check the published source tree and portable documentation, without reading private drafts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import subprocess
from urllib.parse import unquote, urlsplit


POLICY = 'cafelink-system/release/documentation.json'
COURSE = 'final-project-2/final-project/'
PRIVATE = ('viet-bao-cao-lt-mang/', 'report/tools/', 'report/templates/',
           'final-project/', 'final-project-2/references/',
           'report/evidence/cafelink-final/layout/', 'report/evidence/cafelink-student-paper/',
           'report/assets/cafelink-final/', 'report/CafeLink_Technical_Paper_')
BASELINE = 'dist/CafeLink-Original-1.0.0-Baseline.zip'


class Tree:
    def __init__(self, paths, reader):
        self.paths = set(paths)
        self.reader = reader
        self._text = {}

    def text(self, path):
        if path not in self._text:
            self._text[path] = self.reader(path).decode('utf-8-sig')
        return self._text[path]

    def exists(self, path):
        return path in self.paths or any(p.startswith(path.rstrip('/') + '/') for p in self.paths)


def load_tree(root, index=False, pristine=False):
    root = Path(root).resolve()
    if index:
        paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
        return Tree(filter(None, paths), lambda p: subprocess.check_output(['git', '-C', str(root), 'show', ':' + p]))
    if (root / '.git').exists():
        paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
        return Tree(filter(None, paths), lambda p: (root / p).read_bytes())
    paths = []
    for directory, folders, names in os.walk(root):
        relative = Path(directory).relative_to(root).as_posix()
        if not pristine:
            folders[:] = [name for name in folders if name not in {'.git', 'node_modules', '.tools', 'target', '__pycache__'}]
            if relative == 'cafelink-system/web':
                folders[:] = [name for name in folders if name not in {'dist', 'experiment-dist', 'test-results', 'playwright-report'}]
        paths.extend((Path(directory) / name).relative_to(root).as_posix() for name in names)
    return Tree(paths, lambda p: (root / p).read_bytes())


def headings(text):
    result, used = set(), {}
    for heading in re.findall(r'^#{1,6}\s+(.+)$', text, re.M):
        slug = re.sub(r'<[^>]+>', '', heading.strip().lower())
        slug = re.sub(r'[^\w\-\s]', '', slug).replace(' ', '-')
        count = used.get(slug, 0)
        used[slug] = count + 1
        result.add(slug + (f'-{count}' if count else ''))
    return result


def links(text):
    text = re.sub(r'```[^\n]*\n[\s\S]*?```', '', text)
    return (re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', text)
            + re.findall(r'(?:src|href)="([^"]+)"', text))


def check_links(tree, documents, errors):
    count = anchor_count = 0
    for path in documents:
        for raw in links(tree.text(path)):
            target = raw.strip().split(' "')[0].strip('<>')
            if target.lower().startswith('file:') or re.match(r'^[A-Za-z]:[\\/]', target):
                errors.append(f'{path}: machine-local link {target}')
                continue
            if urlsplit(target).scheme or target.startswith('//'):
                continue
            url, _, fragment = target.partition('#')
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(path), unquote(url))) if url else path
            count += 1
            if resolved.startswith('../') or resolved.startswith('/') or not tree.exists(resolved):
                errors.append(f'{path}: unpublished or missing link {target}')
            elif fragment and resolved.endswith('.md'):
                anchor_count += 1
                if unquote(fragment) not in headings(tree.text(resolved)):
                    errors.append(f'{path}: missing heading {target}')
    return {'documents': len(documents), 'localLinks': count, 'anchors': anchor_count}


def check_current_guides(tree, documents, policy, errors, check_scripts=True):
    version = policy['version']
    scripts = {Path(p).name.lower() for p in tree.paths if p.endswith(('.ps1', '.cmd'))}
    scripts.update(name.lower() for name in policy.get('generatedLaunchers', []))
    scripts.update(name.lower() for name in policy.get('externalCommands', []))
    for path in documents:
        text = tree.text(path)
        if check_scripts:
            for command in set(re.findall(r'(?<![\w.-])([A-Za-z0-9_-]+\.(?:ps1|cmd))(?![\w.-])', text, re.I)):
                if command.lower() not in scripts:
                    errors.append(f'{path}: command refers to an unpublished script {command}')
        first = text.splitlines()[0] if text else ''
        for found in re.findall(r'\bV\d+(?:\.\d+)+\b', first):
            if found != version:
                errors.append(f'{path}: stale guide heading {found}, expected {version}')
        for block in re.findall(r'```[^\n]*\n([\s\S]*?)```', text):
            for found in re.findall(r'CafeLink-Web-(V\d+(?:\.\d+)+)(?:-RC\d+)?', block):
                if found != version:
                    errors.append(f'{path}: command launches stale version {found}')
            for found in re.findall(r'CafeLink-Web-V\d+(?:\.\d+)+(?:-RC\d+)', block):
                if found != policy['currentPackage']:
                    errors.append(f'{path}: command launches {found}, expected {policy["currentPackage"]}')
            for found in re.findall(r'-Phase\s+(V\d+(?:\.\d+)+)', block):
                if found != version:
                    errors.append(f'{path}: test command selects stale phase {found}')


def source_checks(tree):
    errors = []
    policy = json.loads(tree.text(POLICY))
    if policy.get('format') != 'CafeLinkDocumentation/1':
        errors.append('Unknown documentation policy format')
    app = tree.text('cafelink-system/src/main/java/com/cafelink/common/ApplicationInfo.java')
    version = re.search(r'\bVERSION\s*=\s*"([^"]+)"', app)
    if not version or version[1] != policy['version']:
        errors.append('Documentation version differs from ApplicationInfo.VERSION')
    frontend_version = policy['version'].removeprefix('V')
    if frontend_version.count('.') == 1:
        frontend_version += '.0'
    package = json.loads(tree.text('cafelink-system/web/package.json'))
    lock = json.loads(tree.text('cafelink-system/web/package-lock.json'))
    if any(found != frontend_version for found in (package.get('version'), lock.get('version'), lock.get('packages', {}).get('', {}).get('version'))):
        errors.append('Frontend package/lock version differs from application version')
    if not policy['currentPackage'].startswith('CafeLink-Web-' + policy['version'] + '-'):
        errors.append('Current package label differs from application version')
    guides = policy['guides']
    if not guides or len(guides) != len(set(guides)):
        errors.append('Empty or duplicate portable guide list')
    for guide in guides:
        if '/' in guide or '\\' in guide or not guide.endswith('.md') or not tree.exists('cafelink-system/docs/' + guide):
            errors.append(f'Unpublished portable guide: {guide}')
    for path in sorted(tree.paths):
        if path.startswith(PRIVATE):
            errors.append(f'Local-only content is published: {path}')
        if path in ('report/CafeLink_Final_Report.md', 'report/CafeLink_Final_Handoff.md'):
            errors.append(f'Superseded report is published: {path}')
        if path.startswith('dist/') and path.endswith('.zip') and path != BASELINE:
            errors.append(f'Old/runtime release ZIP is published: {path}')
        if any(part in {'.cleanup', 'node_modules', '.tools', 'target', '__pycache__'} for part in Path(path).parts):
            errors.append(f'Build cache or local workspace content is published: {path}')
        if path.endswith(('.db', '.db-wal', '.db-shm', '.sqlite', '.sqlite3', '.qr-key', '.p12', '.pfx', '.pem')):
            errors.append(f'Runtime data or private key is published: {path}')
        name = Path(path).name
        if name == '.env' or (name.startswith('.env.') and name != '.env.example'):
            errors.append(f'Private environment file is published: {path}')
        retired = re.fullmatch(r'cafelink-system/docs/WEB_(V\d+(?:_\d+)+)\.md', path)
        if retired and retired[1].replace('_', '.') != policy['version']:
            errors.append(f'Retired guide is published: {path}')
    reports = sorted(p for p in tree.paths if p.startswith('report/') and p.endswith(('.docx', '.pdf')))
    if len(reports) != 2 or {Path(p).suffix for p in reports} != {'.docx', '.pdf'} or len({str(Path(p).with_suffix('')) for p in reports}) != 1:
        errors.append('Publish exactly one matching Word/PDF report pair')
    manifest_path = policy['reportManifest']
    if not tree.exists(manifest_path):
        errors.append('Current report validation manifest is missing')
    else:
        manifest = json.loads(tree.text(manifest_path))
        for kind in ('docx', 'pdf'):
            path = manifest.get(kind)
            if path not in reports:
                errors.append(f'Report manifest points outside the current pair: {path}')
            elif hashlib.sha256(tree.reader(path)).hexdigest().upper() != manifest.get(kind + 'Sha256', '').upper():
                errors.append(f'Report changed without a matching publication check: {path}')
    for entry in ['README.md', 'report/README.md']:
        if not tree.exists(entry):
            errors.append(f'Missing entry point: {entry}')
            continue
        resolved = {posixpath.normpath(posixpath.join(posixpath.dirname(entry), unquote(u.split('#')[0])))
                    for u in links(tree.text(entry)) if not urlsplit(u).scheme}
        for report in reports:
            if report not in resolved:
                errors.append(f'{entry}: does not link the current report {report}')
    documents = sorted(p for p in tree.paths if p.endswith('.md') and not p.startswith(COURSE))
    metrics = check_links(tree, documents, errors)
    active = [p for p in documents if p in ('README.md', 'cafelink-system/README.md', 'cafelink-system/release/windows/START-HERE.md')
              or (p.startswith('cafelink-system/docs/') and '/architecture/' not in p)]
    check_current_guides(tree, active, policy, errors)
    script = tree.text('cafelink-system/scripts/package-web.ps1')
    helper = tree.text('cafelink-system/scripts/package-documentation.ps1')
    if not all(name in script for name in ('Read-PackageDocumentation', 'Copy-PackageDocumentation')) or 'release/documentation.json' not in helper or '$Documentation.guides' not in helper:
        errors.append('Package script bypasses the shared documentation policy')
    return {'status': 'PASS' if not errors else 'FAIL', 'mode': 'source', 'version': policy['version'],
            **metrics, 'reportPair': reports, 'errors': errors}


def package_checks(root):
    root = Path(root)
    tree = load_tree(root, pristine=True)
    errors = []
    policy = json.loads(tree.text('docs/DOCUMENTATION.json'))
    release = json.loads(tree.text('RELEASE.json'))
    if policy.get('format') != 'CafeLinkDocumentation/1':
        errors.append('Unknown portable documentation policy format')
    if release['release'] != policy['version'] or release['schema'] != policy['schema']:
        errors.append('Portable documentation differs from RELEASE.json')
    expected = {'docs/' + p for p in policy['guides']}
    actual = {p for p in tree.paths if p.startswith('docs/') and p.endswith('.md')}
    if expected != actual:
        errors.append('Portable guide list has missing, extra or retired documents')
    for launcher in policy.get('generatedLaunchers', []):
        if launcher not in tree.paths:
            errors.append(f'Missing portable launcher: {launcher}')
    docs = sorted(actual | {'START-HERE.md'})
    metrics = check_links(tree, docs, errors)
    # The runbook also explains building from source; those scripts need not ship in portable.
    check_current_guides(tree, docs, policy, errors, check_scripts=False)
    return {'status': 'PASS' if not errors else 'FAIL', 'mode': 'package', **metrics, 'errors': errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--index', action='store_true', help='Check exactly the staged source snapshot')
    parser.add_argument('--pristine', action='store_true', help='For a fresh source export without Git, also reject generated build caches')
    parser.add_argument('--package', type=Path, help='Check extracted portable documentation instead of source')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    try:
        result = package_checks(args.package) if args.package else source_checks(load_tree(args.root, args.index, args.pristine))
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        result = {'status': 'FAIL', 'errors': [str(error)]}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
