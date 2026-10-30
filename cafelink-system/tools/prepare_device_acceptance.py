"""Prepare an isolated human UAT kit from an already verified portable archive."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
WORKSPACE = PROJECT.parent
DEFAULT_PROOF = WORKSPACE / "report/evidence/cafelink-v2/v9.4-hardening/final-verification.json"
CASES = [
    ("P01", "Camera QR and ordering on a real phone using mobile data"),
    ("P02", "Two real devices scan one QR and keep orders private"),
    ("P03", "Touch, keyboard, rotation and small-screen layout"),
    ("P04", "Real network disconnect and reconnect without duplicate ordering"),
    ("P05", "Simulated payment failure, cancellation and retry on a phone"),
    ("P06", "Background, lock screen, reload and visit continuation"),
    ("A01", "A human hears the counter notification and verifies mute/reload"),
    ("L01", "Two physical machines on LAN; use the separate LAN runbook"),
    ("U01", "Human review of the complete customer and counter workflow"),
]


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def entries(archive):
    """Validate every destination before creating an output directory."""
    seen, result, total = set(), [], 0
    for entry in archive.infolist():
        name = entry.filename.replace("\\", "/")
        path = PurePosixPath(name)
        # Inspect raw segments too: PurePosixPath normalizes '.' segments.
        parts = name.rstrip("/").split("/")
        if not name or path.is_absolute() or any(part in ("", ".", "..") for part in parts) or ":" in name:
            raise ValueError("Unsafe archive path")
        if any(part.endswith((".", " ")) for part in parts):
            raise ValueError("Ambiguous Windows archive path")
        normalized = name.rstrip("/").casefold()
        if normalized in seen:
            raise ValueError("Duplicate archive path")
        seen.add(normalized)
        if stat.S_ISLNK(entry.external_attr >> 16) or entry.external_attr & 0x400:
            raise ValueError("Archive links are not supported")
        if parts[0].casefold() in {"data", "backups", "logs", ".work"}:
            raise ValueError("A UAT kit must not import runtime profiles or backups")
        total += entry.file_size
        if total > 1024 * 1024 * 1024:
            raise ValueError("Archive exceeds the 1 GiB extraction limit")
        result.append((entry, path))
    return result


def prepare(archive, proof_path, destination, resources, checklist):
    archive, destination = Path(archive), Path(destination).absolute()
    if destination.exists():
        raise ValueError("Output already exists; choose a new kit directory")
    proof = read_json(proof_path)
    if proof.get("softwareVerificationStatus") != "PASS" or proof.get("artifactHashesMatch") is not True:
        raise ValueError("A passing software verification record is required")
    if sha256(archive) != str(proof.get("archiveSha256", "")).upper():
        raise ValueError("Archive differs from the verified baseline")
    resources, checklist = Path(resources), Path(checklist)
    for required in [resources / "Run-UAT.ps1", resources / "README.md", checklist]:
        if not required.is_file():
            raise ValueError("Missing acceptance kit resource")
    with zipfile.ZipFile(archive) as package:
        files = entries(package)
        release = json.loads(package.read("RELEASE.json").decode("utf-8-sig"))
        if release.get("release") != "V9.4" or release.get("schema") != 11:
            raise ValueError("This checkpoint requires V9.4 schema 11")
        if "SHA256-MANIFEST.json" not in package.namelist():
            raise ValueError("Missing package integrity manifest")
        destination.mkdir(parents=True, exist_ok=False)
        app = destination / "app"
        for entry, relative in files:
            target = app.joinpath(*relative.parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with package.open(entry) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
    for name in ["Run-UAT.ps1", "README.md"]:
        shutil.copyfile(resources / name, destination / name)
    shutil.copyfile(checklist, destination / "CHECKLIST.md")
    for mode in ["Local", "Public"]:
        text = (f'@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-UAT.ps1" -Mode {mode} %*\r\n'
                'if errorlevel 1 pause\r\n')
        (destination / f"START-{mode.upper()}.cmd").write_bytes(text.encode("ascii"))
    (destination / "AUTOMATED_BASELINE.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    record = {
        "format": "CafeLinkDeviceAcceptance/1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "release": "V9.4", "archiveSha256": sha256(archive),
        "softwareVerification": "See AUTOMATED_BASELINE.json; not physical acceptance",
        "physicalPhone": "NOT_RUN", "physicalLan": "NOT_RUN", "audibleSpeakerOutput": "NOT_RUN",
        "reviewer": "", "devices": [],
        "cases": [{"id": key, "description": text, "result": "NOT_RUN", "testedAt": "",
                   "device": "", "browser": "", "network": "", "observations": ""} for key, text in CASES],
    }
    (destination / "RESULTS.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return {"status": "PREPARED", "directory": str(destination), "release": "V9.4",
            "archiveSha256": record["archiveSha256"], "humanCases": len(CASES),
            "physicalPhone": "NOT_RUN", "physicalLan": "NOT_RUN", "audibleSpeakerOutput": "NOT_RUN"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proof", type=Path, default=DEFAULT_PROOF)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    archive = args.archive or WORKSPACE / read_json(args.proof)["archive"]
    result = prepare(archive, args.proof, args.output, PROJECT / "release/device-acceptance",
                     PROJECT / "docs/WEB_DEVICE_ACCEPTANCE.md")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
