"""Exercise the actual PowerShell guard using isolated build fixtures, never live assets."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

GUARD = Path(__file__).resolve().parents[1] / "scripts/verify-build-gate.ps1"


class BuildGateChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cafelink-build-gate-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for path in ["target/cafelink-1.0.0.jar", "web/dist/index.html", "web/dist/assets/app.js"]:
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(path.encode())
        self.gate = {
            "status": "PASS",
            "artifact": {
                "jarSha256": self.sha(self.root / "target/cafelink-1.0.0.jar"),
                "webFiles": [{"path": str(p.relative_to(self.root / "web/dist")).replace("\\", "/"), "sha256": self.sha(p)}
                             for p in (self.root / "web/dist").rglob("*") if p.is_file()],
            },
        }

    @staticmethod
    def sha(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def check_gate(self, should_pass):
        summary = self.root / "summary.json"
        summary.write_text(json.dumps(self.gate), encoding="utf-8")
        result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(GUARD),
                                 "-ProjectRoot", str(self.root), "-Summary", str(summary)], capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, should_pass, result.stdout + result.stderr)

    def test_matching_build_passes(self):
        self.check_gate(True)

    def test_modified_jar_is_rejected(self):
        (self.root / "target/cafelink-1.0.0.jar").write_bytes(b"changed")
        self.check_gate(False)

    def test_modified_asset_is_rejected(self):
        (self.root / "web/dist/index.html").write_bytes(b"changed")
        self.check_gate(False)

    def test_missing_asset_is_rejected(self):
        (self.root / "web/dist/assets/app.js").unlink()
        self.check_gate(False)

    def test_additional_asset_is_rejected(self):
        (self.root / "web/dist/assets/extra.js").write_bytes(b"unverified file")
        self.check_gate(False)

    def test_empty_manifest_is_rejected(self):
        self.gate["artifact"]["webFiles"] = []
        self.check_gate(False)

    def test_missing_manifest_is_rejected(self):
        del self.gate["artifact"]["webFiles"]
        self.check_gate(False)

    def test_duplicate_manifest_paths_are_rejected(self):
        self.gate["artifact"]["webFiles"].append(self.gate["artifact"]["webFiles"][0])
        self.check_gate(False)

    def test_failed_gate_cannot_certify_a_build(self):
        self.gate["status"] = "FAIL"
        self.check_gate(False)


if __name__ == "__main__":
    unittest.main()
