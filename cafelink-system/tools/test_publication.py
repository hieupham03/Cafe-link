"""Regressions for stale guides, hidden local dependencies and mixed report versions."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from verify_publication import POLICY, Tree, load_tree, package_checks, source_checks


def fixture():
    policy = {'format': 'CafeLinkDocumentation/1', 'version': 'V9.4', 'schema': 11,
              'currentPackage': 'CafeLink-Web-V9.4-RC4', 'guides': ['FINAL_RUNBOOK.md'],
              'repository': 'https://github.com/hieupham03/Cafe-link',
              'reportManifest': 'report/evidence/current/report.json'}
    files = {
        POLICY: json.dumps(policy),
        'README.md': '# CafeLink\n[Word](report/current.docx) [PDF](report/current.pdf)\n',
        'report/README.md': '# Report\n[Word](current.docx) [PDF](current.pdf)\n',
        'cafelink-system/README.md': '# CafeLink V9.4\n[Run](docs/FINAL_RUNBOOK.md#start)\n',
        'cafelink-system/docs/FINAL_RUNBOOK.md': '# CafeLink V9.4\n## Start\n',
        'cafelink-system/src/main/java/com/cafelink/common/ApplicationInfo.java': 'public static final String VERSION = "V9.4";',
        'cafelink-system/web/package.json': '{"version":"9.4.0"}',
        'cafelink-system/web/package-lock.json': '{"version":"9.4.0","packages":{"":{"version":"9.4.0"}}}',
        'cafelink-system/scripts/package-web.ps1': 'Read-PackageDocumentation; Copy-PackageDocumentation',
        'cafelink-system/scripts/package-documentation.ps1': "'release/documentation.json'; $Documentation.guides",
        'report/current.docx': 'word bytes', 'report/current.pdf': 'pdf bytes',
    }
    manifest = {kind: 'report/current.' + kind for kind in ('docx', 'pdf')}
    manifest.update({kind + 'Sha256': hashlib.sha256(files['report/current.' + kind].encode()).hexdigest()
                     for kind in ('docx', 'pdf')})
    files[policy['reportManifest']] = json.dumps(manifest)
    return {path: text.encode('utf-8') for path, text in files.items()}


class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.files = fixture()

    def result(self, paths=None):
        return source_checks(Tree(self.files if paths is None else paths, self.files.__getitem__))

    def fails(self, message):
        result = self.result()
        self.assertEqual('FAIL', result['status'])
        self.assertTrue(any(message in error for error in result['errors']), result)

    def change_policy(self, change):
        policy = json.loads(self.files[POLICY])
        change(policy)
        self.files[POLICY] = json.dumps(policy).encode()

    def test_coherent_publication_passes(self):
        self.assertEqual('PASS', self.result()['status'])

    def test_local_only_link_fails_even_when_private_file_exists(self):
        published = set(self.files)
        self.files['cafelink-system/docs/README.md'] = b'[old](local-draft.md)'
        published.add('cafelink-system/docs/README.md')
        self.files['cafelink-system/docs/local-draft.md'] = b'# present only locally'
        result = self.result(published)
        self.assertEqual('FAIL', result['status'])
        self.assertTrue(any('unpublished or missing' in x for x in result['errors']))

    def test_duplicate_report_pair_fails(self):
        self.files['report/old.docx'] = b'old'
        self.files['report/old.pdf'] = b'old'
        self.fails('exactly one matching')

    def test_changed_word_without_new_export_proof_fails(self):
        self.files['report/current.docx'] = b'new user text'
        self.fails('matching publication check')

    def test_retired_guide_fails_even_without_any_link(self):
        self.files['cafelink-system/docs/WEB_V9_3.md'] = b'# old guide'
        self.fails('Retired guide')

    def test_stale_command_version_fails(self):
        self.files['cafelink-system/docs/FINAL_RUNBOOK.md'] += b'```powershell\ncd dist/CafeLink-Web-V9.3\n```'
        self.fails('stale version')

    def test_old_release_candidate_launch_fails(self):
        self.files['cafelink-system/docs/FINAL_RUNBOOK.md'] += b'```powershell\ncd dist/CafeLink-Web-V9.4-RC3\n```'
        self.fails('expected CafeLink-Web-V9.4-RC4')

    def test_stale_phase_fails(self):
        self.files['cafelink-system/docs/FINAL_RUNBOOK.md'] += b'```powershell\ntest-web.ps1 -Phase V9.3\n```'
        self.fails('stale phase')

    def test_old_heading_fails(self):
        self.files['cafelink-system/README.md'] = b'# CafeLink V9.3'
        self.fails('stale guide heading')

    def test_missing_package_guide_fails(self):
        self.change_policy(lambda p: p['guides'].append('REMOVED.md'))
        self.fails('Unpublished portable guide')

    def test_duplicate_package_guide_fails(self):
        self.change_policy(lambda p: p['guides'].append('FINAL_RUNBOOK.md'))
        self.fails('duplicate portable guide')

    def test_version_must_match_the_application(self):
        self.files['cafelink-system/src/main/java/com/cafelink/common/ApplicationInfo.java'] = b'VERSION = "V9.5";'
        self.fails('ApplicationInfo.VERSION')

    def test_stale_frontend_package_label_fails(self):
        self.files['cafelink-system/web/package.json'] = b'{"version":"2.0.0-v7"}'
        self.fails('Frontend package/lock version')

    def test_missing_heading_fails(self):
        self.files['cafelink-system/README.md'] = b'# CafeLink\n[run](docs/FINAL_RUNBOOK.md#deleted)'
        self.fails('missing heading')

    def test_machine_local_document_link_fails(self):
        self.files['cafelink-system/README.md'] = b'[draft](file:///D:/private/report.pdf)'
        self.fails('machine-local link')

    def test_private_authoring_tool_is_not_publishable(self):
        self.files['report/tools/private.py'] = b'# authoring only'
        self.fails('Local-only content')

    def test_old_report_markdown_is_not_publishable(self):
        self.files['report/CafeLink_Final_Report.md'] = b'# old report'
        self.fails('Superseded report')

    def test_typo_in_a_script_command_is_rejected(self):
        self.files['cafelink-system/docs/FINAL_RUNBOOK.md'] += b'```powershell\npowershell -File scripts/nonexistent.ps1\n```'
        self.fails('unpublished script')

    def test_runtime_database_is_rejected(self):
        self.files['cafelink-system/data/demo.db'] = b'database'
        self.fails('Runtime data')

    def test_dependency_cache_is_rejected(self):
        self.files['cafelink-system/web/node_modules/private.txt'] = b'cache'
        self.fails('Build cache')

    def test_secret_environment_file_is_rejected(self):
        self.files['cafelink-system/.env.local'] = b'PRIVATE=value'
        self.fails('Private environment')

    def test_runtime_zip_is_not_publishable(self):
        self.files['dist/CafeLink-Web-V9.3.zip'] = b'archive'
        self.fails('Old/runtime release ZIP')

    def test_packager_cannot_bypass_the_policy(self):
        self.files['cafelink-system/scripts/package-web.ps1'] = b'Copy-Item docs/OLD.md'
        self.fails('bypasses')


class SourceExportTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name, content in fixture().items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        dependency = self.root / 'cafelink-system/web/node_modules/draft.md'
        dependency.parent.mkdir(parents=True)
        dependency.write_text('# generated dependency')

    def test_retesting_built_source_export_ignores_generated_dependencies(self):
        self.assertEqual('PASS', source_checks(load_tree(self.root))['status'])

    def test_pristine_export_rejects_dependencies_accidentally_packed_in_zip(self):
        self.assertEqual('FAIL', source_checks(load_tree(self.root, pristine=True))['status'])


class PackageDocumentationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'docs').mkdir()
        self.policy = json.loads(fixture()[POLICY])
        (self.root / 'docs/DOCUMENTATION.json').write_text(json.dumps(self.policy))
        (self.root / 'RELEASE.json').write_text(json.dumps({'release': 'V9.4', 'schema': 11}))
        (self.root / 'START-HERE.md').write_text('# CafeLink V9.4\n[run](docs/FINAL_RUNBOOK.md#start)')
        (self.root / 'docs/FINAL_RUNBOOK.md').write_text('# CafeLink V9.4\n## Start\n[Source](https://github.com/example/repo)')

    def test_self_contained_portable_navigation_passes(self):
        self.assertEqual('PASS', package_checks(self.root)['status'])

    def test_repo_only_relative_link_fails_in_portable_package(self):
        (self.root / 'docs/FINAL_RUNBOOK.md').write_text('# CafeLink V9.4\n## Start\n[Source](../README.md)')
        result = package_checks(self.root)
        self.assertEqual('FAIL', result['status'])
        self.assertTrue(any('missing link' in x for x in result['errors']))

    def test_adding_old_guide_to_portable_package_fails(self):
        (self.root / 'docs/WEB_V9_3.md').write_text('# CafeLink V9.3')
        self.assertEqual('FAIL', package_checks(self.root)['status'])

    def test_manifest_and_release_version_must_match(self):
        (self.root / 'RELEASE.json').write_text(json.dumps({'release': 'V9.3', 'schema': 11}))
        self.assertEqual('FAIL', package_checks(self.root)['status'])


@unittest.skipUnless(shutil.which('powershell'), 'Portable packaging uses Windows PowerShell')
class DocumentationCopyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.workspace = self.base / 'workspace'
        self.project = self.workspace / 'cafelink-system'
        self.package = self.base / 'package'
        for folder in ['docs', 'release/windows']:
            (self.project / folder).mkdir(parents=True, exist_ok=True)
        (self.package / 'docs').mkdir(parents=True)
        self.policy = json.loads(fixture()[POLICY])
        self.policy_path = self.project / 'release/documentation.json'
        self.policy_path.write_text(json.dumps(self.policy))
        (self.project / 'README.md').write_text('# source')
        (self.project / 'release/windows/START-HERE.md').write_text('[run](docs/FINAL_RUNBOOK.md#start)')
        self.guide = self.project / 'docs/FINAL_RUNBOOK.md'
        self.guide.write_text('# CafeLink V9.4\n## Start\n[Source](../README.md)')
        self.driver = self.base / 'copy.ps1'
        self.driver.write_text('''param($ProjectRoot, $WorkspaceRoot, $Destination, $Helper)
$ErrorActionPreference='Stop'
. $Helper
$policy=Read-PackageDocumentation -ProjectRoot $ProjectRoot
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'release/windows/START-HERE.md') -Destination $Destination
Copy-PackageDocumentation -ProjectRoot $ProjectRoot -WorkspaceRoot $WorkspaceRoot -Destination $Destination -Documentation $policy
''')

    def run_copy(self):
        helper = Path(__file__).resolve().parents[1] / 'scripts/package-documentation.ps1'
        return subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(self.driver),
                               '-ProjectRoot', str(self.project), '-WorkspaceRoot', str(self.workspace),
                               '-Destination', str(self.package), '-Helper', str(helper)],
                              capture_output=True, text=True, timeout=30)

    def test_repo_link_is_rewritten_but_portable_link_stays_local(self):
        result = self.run_copy()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertIn('https://github.com/hieupham03/Cafe-link/blob/main/cafelink-system/README.md',
                      (self.package / 'docs/FINAL_RUNBOOK.md').read_text(encoding='utf-8'))
        self.assertIn('(docs/FINAL_RUNBOOK.md#start)', (self.package / 'START-HERE.md').read_text(encoding='utf-8'))

    def test_real_repository_guides_have_valid_portable_navigation(self):
        # A docs-only contract fixture; runtime behavior is checked by release-smoke.mjs.
        self.project = Path(__file__).resolve().parents[1]
        self.workspace = self.project.parent
        policy = json.loads((self.project / 'release/documentation.json').read_text(encoding='utf-8'))
        result = self.run_copy()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        (self.package / 'RELEASE.json').write_text(json.dumps({'release': policy['version'], 'schema': policy['schema']}))
        for name in policy.get('generatedLaunchers', []):
            (self.package / name).write_text('@echo off\n')
        checked = package_checks(self.package)
        self.assertEqual('PASS', checked['status'], checked)

    def test_missing_repo_link_stops_packaging(self):
        self.guide.write_text('[missing](../not-published.md)')
        self.assertNotEqual(0, self.run_copy().returncode)

    def test_retired_guide_in_policy_stops_packaging(self):
        self.policy['guides'].append('WEB_V9_3.md')
        self.policy_path.write_text(json.dumps(self.policy))
        (self.project / 'docs/WEB_V9_3.md').write_text('# old')
        self.assertNotEqual(0, self.run_copy().returncode)

    def test_stale_heading_stops_packaging_even_without_a_version_in_filename(self):
        self.guide.write_text('# CafeLink V9.3\n')
        self.assertNotEqual(0, self.run_copy().returncode)

    def test_stale_launch_command_stops_packaging(self):
        self.guide.write_text('# CafeLink V9.4\n```powershell\ncd CafeLink-Web-V9.4-RC3\n```')
        self.assertNotEqual(0, self.run_copy().returncode)

    def test_existing_but_untracked_link_target_stops_packaging(self):
        if not shutil.which('git'):
            self.skipTest('Git index check requires Git')
        self.guide.write_text('[private](../private-draft.md)')
        subprocess.run(['git', 'init', '--quiet', str(self.workspace)], check=True, capture_output=True)
        subprocess.run(['git', '-C', str(self.workspace), 'add', '.'], check=True, capture_output=True)
        (self.project / 'private-draft.md').write_text('# only local')
        self.assertNotEqual(0, self.run_copy().returncode)

    def test_link_cannot_escape_the_workspace(self):
        (self.base / 'outside.md').write_text('# outside')
        self.guide.write_text('[outside](../../../outside.md)')
        self.assertNotEqual(0, self.run_copy().returncode)


if __name__ == '__main__':
    unittest.main()
