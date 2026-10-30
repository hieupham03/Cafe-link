"""Check that the actual web gate preserves Java failure evidence in CI artifacts."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

GATE = Path(__file__).resolve().parents[1] / "scripts/test-web.ps1"


class JavaFailureEvidence(unittest.TestCase):
    def run_failed_gate(self, produce_xml, stale_xml=False):
        with tempfile.TemporaryDirectory(prefix="cafelink-failed-gate-") as directory:
            workspace = Path(directory)
            project = workspace / "project"
            scripts = project / "scripts"
            scripts.mkdir(parents=True)
            shutil.copyfile(GATE, scripts / GATE.name)
            if stale_xml:
                reports = project / "target/surefire-reports"
                reports.mkdir(parents=True)
                (reports / "TEST-old.xml").write_text('<testsuite tests="20" failures="0" errors="0" skipped="0" />')
            # Exercise the real orchestrator with a failing compiler/test process.
            # No app, database or user's Maven reports are touched by this fixture.
            fixture = "param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)\n"
            if produce_xml:
                fixture += "New-Item -ItemType Directory target/surefire-reports -Force | Out-Null\n"
                fixture += "'<testsuite tests=\"2\" failures=\"0\" errors=\"1\" skipped=\"0\" />' | Set-Content target/surefire-reports/TEST-failed.xml -Encoding UTF8\n"
            fixture += "Write-Host 'Fixture Java verification failed'\nexit 1\n"
            (scripts / "maven.ps1").write_text(fixture, encoding="utf-8")
            result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                                     "-File", str(scripts / "test-web.ps1"),
                                     "-SkipInstall", "-SkipBrowserInstall"],
                                    cwd=project, capture_output=True, text=True, timeout=45)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            gate_root = workspace / "report/evidence/cafelink-v2/v9.4-gate"
            latest = json.loads((gate_root / "latest.json").read_text(encoding="utf-8-sig"))
            run = gate_root / latest["runId"]
            summary = json.loads((run / "summary.json").read_text(encoding="utf-8-sig"))
            self.assertEqual(summary["status"], "FAIL")
            self.assertEqual(summary["gates"][0]["exitCode"], 1)
            self.assertIn("Fixture Java verification failed", (run / "java-verify.log").read_text(encoding="utf-16"))
            if produce_xml:
                self.assertTrue((run / "junit/TEST-failed.xml").is_file())
                self.assertEqual(summary["java"], {"tests": 2, "failures": 0, "errors": 1, "skipped": 0})
            else:
                self.assertNotIn("java", summary, "No reports must not become a passing zero-test result")
                self.assertEqual(summary["javaEvidence"], "NOT_PRODUCED")

    def test_failed_java_reports_are_still_copied(self):
        self.run_failed_gate(True)

    def test_compiler_failure_does_not_fabricate_junit_totals(self):
        self.run_failed_gate(False)

    def test_compiler_failure_cannot_reuse_old_passing_reports(self):
        self.run_failed_gate(False, stale_xml=True)


if __name__ == "__main__":
    unittest.main()
