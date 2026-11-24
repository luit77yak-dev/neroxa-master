#!/usr/bin/env python3
"""Offline protocol test with synthetic data only. Never uses commercial dumps."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from unittest import mock

import restore_from_kv as reader

def main():
    secret = '7' * 64
    prefix = 'rg01-0000000000000000'
    payload = b'PGDMP' + os.urandom(16384)
    with tempfile.TemporaryDirectory(prefix='rg01-protocol-') as tmp:
        root = Path(tmp)
        source = root / 'fictional.dump'
        cipher = root / 'fictional.dump.gpg'
        source.write_bytes(payload)
        gpg_home = root / 'gpg'
        gpg_home.mkdir(mode=0o700)
        proc = subprocess.run(
            ['gpg', '--batch', '--no-tty', '--pinentry-mode', 'loopback',
             '--passphrase-fd', '0', '--cipher-algo', 'AES256',
             '--symmetric', '--output', str(cipher), str(source)],
            input=(secret + '\n').encode(), capture_output=True,
            env={**os.environ, 'GNUPGHOME': str(gpg_home)}, timeout=45)
        if proc.returncode:
            raise RuntimeError('DUMMY_GPG_ENCRYPT=FAIL')
        ciphertext = cipher.read_bytes()
        cipher_hash = hashlib.sha256(ciphertext).hexdigest()
        manifest_key = prefix + '-manifest'
        chunk_key = prefix + '-chunk-0000'
        manifest = {
            'version': 1, 'prefix': prefix, 'cipher_sha256': cipher_hash,
            'cipher_bytes': len(ciphertext),
            'chunks': [{'key': chunk_key, 'bytes': len(ciphertext),
                        'sha256': cipher_hash}],
        }
        blobs = {manifest_key: json.dumps(manifest).encode(), chunk_key: ciphertext}
        fake_env = {
            'RG01_ACCOUNT_ID': '0' * 32,
            'RG01_NAMESPACE_ID': '1' * 32,
            'RG01_KV_READ_TOKEN': 'DUMMY_TOKEN_NEVER_USED',
            'RG01_DECRYPT_KEY': secret,
        }

        def fake_fetch(account, namespace, token, key, maximum):
            data = blobs[key]
            if len(data) > maximum:
                raise reader.Blocked('DUMMY_LIMIT_EXCEEDED')
            return data

        with mock.patch.dict(os.environ, fake_env), mock.patch.object(reader, 'fetch', side_effect=fake_fetch):
            output = root / 'restored' / 'database.dump'
            reader.recover(manifest_key, cipher_hash, output)
            if output.read_bytes() != payload:
                raise RuntimeError('PROTOCOL_ROUND_TRIP=FAIL')
            print('PROTOCOL_ROUND_TRIP=PASS')
            blobs[chunk_key] = ciphertext[:-1] + bytes([ciphertext[-1] ^ 1])
            try:
                reader.recover(manifest_key, cipher_hash, root / 'tampered' / 'database.dump')
            except reader.Blocked as exc:
                if str(exc) != 'KV_CHUNK_HASH=FAIL':
                    raise RuntimeError('PROTOCOL_TAMPER_REJECTION=WRONG_REASON') from exc
            else:
                raise RuntimeError('PROTOCOL_TAMPER_REJECTION=FAIL')
            print('PROTOCOL_TAMPER_REJECTION=PASS')
    print('COMMERCIAL_DATA_USED=NO')

if __name__ == '__main__':
    main()
