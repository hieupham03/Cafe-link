"""Create deliberate invalid backups for V9 CLI acceptance; never used by the release itself."""
import argparse
import hashlib
import json
from pathlib import Path
import warnings
import zipfile


def create(source, output):
    output.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(source) as archive:
        original = {entry.filename: archive.read(entry) for entry in archive.infolist() if not entry.is_dir()}

    def write(name, entries):
        with zipfile.ZipFile(output / name, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for path, value in entries.items():
                archive.writestr(path, value)

    write('traversal.zip', {'../outside-backup.txt': b'must not be extracted'})
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        with zipfile.ZipFile(output / 'duplicate.zip', 'x') as archive:
            archive.writestr('profile/cafelink.db', b'one')
            archive.writestr('profile/cafelink.db', b'two')
    corrupt = dict(original)
    corrupt['profile/cafelink.db'] = b'invalid' + original['profile/cafelink.db'][7:]
    write('corrupt-hash.zip', corrupt)
    wrong_key = dict(original)
    changed = bytearray(wrong_key['profile/cafelink.db.qr-key'])
    changed[0] ^= 1
    wrong_key['profile/cafelink.db.qr-key'] = bytes(changed)
    manifest = json.loads(wrong_key['BACKUP.json'].decode('utf-8-sig'))
    for row in manifest['files']:
        if row['path'] == 'profile/cafelink.db.qr-key':
            row['sha256'] = hashlib.sha256(changed).hexdigest()
    wrong_key['BACKUP.json'] = json.dumps(manifest).encode()
    write('wrong-key-valid-hash.zip', wrong_key)
    missing = {name: content for name, content in original.items() if not name.startswith('profile/cafelink.db.media/')}
    manifest = json.loads(missing['BACKUP.json'].decode('utf-8-sig'))
    manifest['files'] = [row for row in manifest['files'] if not row['path'].startswith('profile/cafelink.db.media/')]
    missing['BACKUP.json'] = json.dumps(manifest).encode()
    write('missing-media-valid-hash.zip', missing)
    return [file.name for file in sorted(output.glob('*.zip'))]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(create(args.backup, args.output)))
