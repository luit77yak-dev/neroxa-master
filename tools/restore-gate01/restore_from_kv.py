#!/usr/bin/env python3
"""NEROXA RG01: authenticated retrieval of encrypted-only Cloudflare KV chunks."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request
import urllib.error

R = lambda pattern, value: bool(re.fullmatch(pattern, value))
class Blocked(Exception):
    pass

class RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Blocked('KV_REDIRECT=BLOCKED')

def fetch(account, namespace, token, key, maximum):
    url = ('https://api.cloudflare.com/client/v4/accounts/' + account +
           '/storage/kv/namespaces/' + namespace + '/values/' + key)
    request = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + token, 'Cache-Control': 'no-store'},
        method='GET')
    try:
        with urllib.request.build_opener(RejectRedirect()).open(request, timeout=60) as response:
            data = response.read(maximum + 1)
    except urllib.error.HTTPError as err:
        raise Blocked('KV_HTTP=' + str(err.code)) from None
    except urllib.error.URLError:
        raise Blocked('KV_TRANSPORT=FAIL') from None
    if len(data) > maximum:
        raise Blocked('KV_OBJECT=TOO_LARGE')
    return data

def recover(manifest_key, expected, output, expected_format='pg-custom'):
    account = os.getenv('RG01_ACCOUNT_ID', '')
    namespace = os.getenv('RG01_NAMESPACE_ID', '')
    token = os.getenv('RG01_KV_READ_TOKEN', '')
    password = os.getenv('RG01_DECRYPT_KEY', '')
    prefix = manifest_key.removesuffix('-manifest')
    if not (R(r'[a-f0-9]{32}', account) and R(r'[a-f0-9]{32}', namespace) and
            R(r'rg01-[a-f0-9]{16}', prefix) and manifest_key == prefix + '-manifest' and
            R(r'[a-f0-9]{64}', expected) and R(r'[a-f0-9]{64}', password) and token):
        raise Blocked('ADMISSION_INPUTS=INVALID')
    if not output.is_absolute() or output.exists():
        raise Blocked('OUTPUT=INVALID')
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output.parent, 0o700)
    try:
        manifest = json.loads(fetch(account, namespace, token, manifest_key, 131072))
    except (ValueError, UnicodeDecodeError):
        raise Blocked('KV_MANIFEST=INVALID') from None
    parts = manifest.get('chunks') if isinstance(manifest, dict) else None
    length = manifest.get('cipher_bytes') if isinstance(manifest, dict) else None
    if (not isinstance(parts, list) or not 1 <= len(parts) <= 32 or
        not isinstance(length, int) or not 0 < length <= 512*1024*1024 or
        manifest.get('version') != 1 or manifest.get('prefix') != prefix or
        manifest.get('cipher_sha256') != expected):
        raise Blocked('KV_MANIFEST=UNVERIFIED')
    cipher = output.with_suffix('.gpg')
    if cipher.exists():
        raise Blocked('CIPHERTEXT=EXISTS')
    digest = hashlib.sha256()
    total = 0
    with cipher.open('xb') as handle:
        os.chmod(cipher, 0o600)
        for index, part in enumerate(parts):
            if not isinstance(part, dict):
                raise Blocked('KV_CHUNK=INVALID')
            key = prefix + '-chunk-' + str(index).zfill(4)
            n = part.get('bytes')
            check = part.get('sha256')
            if (part.get('key') != key or not isinstance(n, int) or
                not 0 < n <= 16*1024*1024 or not isinstance(check, str) or
                not R(r'[a-f0-9]{64}', check)):
                raise Blocked('KV_CHUNK_METADATA=INVALID')
            data = fetch(account, namespace, token, key, 16*1024*1024)
            if len(data) != n or hashlib.sha256(data).hexdigest() != check:
                raise Blocked('KV_CHUNK_HASH=FAIL')
            handle.write(data)
            digest.update(data)
            total += n
    if total != length or digest.hexdigest() != expected:
        raise Blocked('CIPHERTEXT_HASH=FAIL')
    print('ENCRYPTED_DOWNLOAD=PASS')
    print('CIPHERTEXT_HASH=PASS')
    gpg_home = output.parent / '.rg01-gnupg'
    gpg_home.mkdir(mode=0o700)
    try:
        proc = subprocess.run(
            ['gpg', '--batch', '--no-tty', '--pinentry-mode', 'loopback',
             '--passphrase-fd', '0', '--decrypt', '--output', str(output), str(cipher)],
            input=(password + '\n').encode('ascii'),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={'PATH': os.getenv('PATH', '/usr/bin:/bin'), 'GNUPGHOME': str(gpg_home)},
            timeout=120)
        if proc.returncode or not output.is_file():
            raise Blocked('DECRYPT=FAIL')
        os.chmod(output, 0o600)
        if expected_format == 'pg-custom':
            with output.open('rb') as src:
                if src.read(5) != b'PGDMP':
                    raise Blocked('PG_CUSTOM_HEADER=FAIL')
        elif expected_format == 'roles-sql':
            if output.stat().st_size > 1048576:
                raise Blocked('ROLES_SIZE=INVALID')
            try:
                roles = output.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                raise Blocked('ROLES_FORMAT=INVALID') from None
            if ('\x00' in roles or
                not re.search(r'(?im)^\s*(?:CREATE|ALTER)\s+(?:ROLE|USER)\b', roles) or
                re.search(r'(?i)\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b', roles)):
                raise Blocked('ROLES_SOURCE=BLOCKED')
        else:
            raise Blocked('EXPECTED_FORMAT=INVALID')
        print('DECRYPT_VERIFY=PASS')
        print('PG_CUSTOM_HEADER=PASS' if expected_format == 'pg-custom' else 'ROLES_NO_PASSWORD_MATERIAL=PASS')
    finally:
        cipher.unlink(missing_ok=True)
        shutil.rmtree(gpg_home, ignore_errors=True)

def main():
    os.umask(0o077)
    p = argparse.ArgumentParser()
    p.add_argument('--manifest-key', required=True)
    p.add_argument('--expected-sha256', required=True)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--format', choices=['pg-custom', 'roles-sql'], default='pg-custom')
    a = p.parse_args()
    try:
        recover(a.manifest_key, a.expected_sha256, a.output, a.format)
    except (Blocked, OSError, subprocess.TimeoutExpired) as e:
        print('RESTORE_GATE01_FETCH=BLOCKED:' +
              (str(e) if isinstance(e, Blocked) else 'IO_OR_TIMEOUT'), file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
