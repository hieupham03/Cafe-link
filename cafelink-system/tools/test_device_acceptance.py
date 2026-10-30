"""Meaningful failure-path and launcher checks for the device UAT preparation tool."""
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import zipfile

from prepare_device_acceptance import prepare, PROJECT


class DeviceKitChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cafelink-device-kit-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / "verified.zip"
        self.proof = self.root / "proof.json"
        self.output = self.root / "new kit with spaces"
        self.guide = self.root / "guide.md"
        self.guide.write_text("Human tests remain NOT_RUN", encoding="utf-8")
        self.files = {"RELEASE.json": json.dumps({"release": "V9.4", "schema": 11}),
                      "SHA256-MANIFEST.json": "{}", "runtime/bin/java.exe": "fixture-only"}
        self.write_archive()

    def write_archive(self, extra=None):
        with zipfile.ZipFile(self.archive, "w") as archive:
            for name, content in self.files.items():
                archive.writestr(name, content)
            if extra:
                archive.writestr(*extra)
        self.proof.write_text(json.dumps({"softwareVerificationStatus": "PASS", "artifactHashesMatch": True,
                              "archiveSha256": hashlib.sha256(self.archive.read_bytes()).hexdigest()}), encoding="utf-8")

    def prepare(self):
        return prepare(self.archive, self.proof, self.output, PROJECT / "release/device-acceptance", self.guide)

    def test_pristine_kit_has_no_runtime_data_and_never_marks_human_tests_passed(self):
        result = self.prepare()
        self.assertEqual(result["status"], "PREPARED")
        record = json.loads((self.output / "RESULTS.json").read_text())
        self.assertTrue(record["cases"])
        self.assertEqual({case["result"] for case in record["cases"]}, {"NOT_RUN"})
        self.assertEqual(record["reviewer"], "")
        self.assertFalse((self.output / "app/data").exists())
        self.assertTrue((self.output / "START-PUBLIC.cmd").is_file())

    def test_modified_archive_is_rejected_before_writing_output(self):
        self.archive.write_bytes(self.archive.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "differs"):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_existing_directory_is_not_overwritten(self):
        self.output.mkdir()
        marker = self.output / "keep.txt"
        marker.write_text("user data")
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.prepare()
        self.assertEqual(marker.read_text(), "user data")

    def test_unsafe_and_private_archive_entries_are_rejected_without_extracting(self):
        for name in ["../outside.txt", "/absolute.txt", "C:/outside.txt", "a/./b", "a/trailing. ",
                     "data/cafelink.db", "backups/private.zip", "runtime/bin/JAVA.exe"]:
            with self.subTest(name=name):
                self.write_archive((name, "untrusted"))
                with self.assertRaises(ValueError):
                    self.prepare()
                self.assertFalse(self.output.exists())

    def test_symlink_archive_entry_is_rejected(self):
        entry = zipfile.ZipInfo("runtime/link")
        entry.create_system = 3
        entry.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.write_archive((entry, "../../outside"))
        with self.assertRaisesRegex(ValueError, "links"):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_failed_software_verification_is_rejected(self):
        proof = json.loads(self.proof.read_text())
        proof["softwareVerificationStatus"] = "FAIL"
        self.proof.write_text(json.dumps(proof))
        with self.assertRaisesRegex(ValueError, "passing"):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_other_release_cannot_silently_use_this_checkpoint(self):
        self.files["RELEASE.json"] = json.dumps({"release": "V9.3", "schema": 11})
        self.write_archive()
        with self.assertRaisesRegex(ValueError, "V9.4"):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_runner_keeps_local_and_public_profiles_separate_and_bounds_public_duration(self):
        self.prepare()
        app = self.output / "app"
        (app / "Verify-Package.ps1").write_text("exit 0", encoding="utf-8")
        fixture = "param($Port,$TcpPort,$DataDirectory,$DurationSeconds,[switch]$NoOpenBrowser)\n@{port=$Port;tcpPort=$TcpPort;profile=$DataDirectory;seconds=$DurationSeconds}|ConvertTo-Json -Compress"
        for mode in ["Local", "Public"]:
            (app / f"Start-{mode}.ps1").write_text(fixture, encoding="utf-8")
            command = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(self.output / "Run-UAT.ps1"),
                       "-Mode", mode, "-Port", "19688", "-TcpPort", "19658", "-NoOpenBrowser"]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            data = json.loads(next(line for line in result.stdout.splitlines() if line.startswith("{")))
            self.assertEqual(data["profile"], "data/device-uat-" + mode.lower())
            self.assertEqual(data["port"], "19688")
            if mode == "Public":
                self.assertEqual(data["seconds"], "1800")

    def test_runner_rejects_equal_ports_before_invoking_application(self):
        self.prepare()
        result = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(self.output / "Run-UAT.ps1"),
                                 "-Port", "19688", "-TcpPort", "19688"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ports must differ", result.stderr)


if __name__ == "__main__":
    unittest.main()
