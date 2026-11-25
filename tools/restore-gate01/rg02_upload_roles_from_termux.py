#!/usr/bin/env python3
"""NEROXA RG02: upload only encrypted, audited passwordless roles from private Termux."""
import getpass,hashlib,json,os,re,secrets,stat,subprocess,sys,urllib.request,urllib.error
from pathlib import Path

ACCOUNT='8c26d033e8893cf22a84d11c629d9b42'
NAMESPACE='5061270478cf4b7d8db96212d0704163'
SOURCE='/root/.local/share/neroxa/commercial-recovery/pre-release.h5Br8bwm'
ROOT=Path.home()/'.local/share/neroxa/restore-gate01'
KEY=ROOT/'one-time-key.txt'
OUT=ROOT/'rg02-roles'
TTL=86400
CHUNK=16*1024*1024

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def req(url,data,token):
    request=urllib.request.Request(url,data=data,method='PUT',
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream'})
    try:
        with urllib.request.urlopen(request,timeout=90) as response:
            body=json.loads(response.read().decode())
        if body.get('success') is not True:raise RuntimeError('KV_WRITE_REJECTED')
    except urllib.error.HTTPError as exc:raise RuntimeError('KV_HTTP_'+str(exc.code)) from None

def readback(url,token,expected):
    request=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Cache-Control':'no-store'})
    try:
        with urllib.request.urlopen(request,timeout=90) as response:returned=response.read(len(expected)+1)
    except urllib.error.HTTPError as exc:raise RuntimeError('KV_READ_HTTP_'+str(exc.code)) from None
    if returned!=expected:raise RuntimeError('KV_READBACK_MISMATCH')

def main():
    if len(sys.argv)!=2 or sys.argv[1]!='RG02_ENCRYPTED_ROLES_ONLY':
        raise RuntimeError('CONFIRMATION_REQUIRED')
    os.umask(0o077)
    if not KEY.is_file() or KEY.is_symlink() or stat.S_IMODE(KEY.stat().st_mode)&0o077:
        raise RuntimeError('PREVIOUS_PRIVATE_KEY_UNAVAILABLE')
    if OUT.exists():raise RuntimeError('RG02_ALREADY_PREPARED_STOP')
    # Read only a private manifest and file metadata in Debian. No raw text leaves Debian except the encrypting pipe.
    inspect=String = r'''import json,hashlib,os,stat
from pathlib import Path
root=Path("/root/.local/share/neroxa/commercial-recovery/pre-release.h5Br8bwm")
manifest={}
for line in (root/"SHA256SUMS.private.txt").read_text().splitlines():
  h,name=line.split("  ",1)
  if name in manifest or len(h)!=64 or any(c not in "0123456789abcdef" for c in h): raise SystemExit(5)
  manifest[name]=h
p=root/"roles-no-passwords.private.sql"
if not p.is_file() or p.is_symlink() or stat.S_IMODE(p.stat().st_mode)&0o077:raise SystemExit(6)
if "roles-no-passwords.private.sql" not in manifest or "database.dump" not in manifest:raise SystemExit(7)
print(json.dumps({"roles_sha":manifest["roles-no-passwords.private.sql"],"dump_sha":manifest["database.dump"],"bytes":p.stat().st_size}))
'''
    proc=subprocess.run(['proot-distro','login','debian','--','python3','-c',inspect],
        capture_output=True,text=True,timeout=90)
    if proc.returncode:raise RuntimeError('PRIVATE_MANIFEST_NOT_ACCESSIBLE')
    info=json.loads(proc.stdout)
    if not (0<info['bytes']<=1024*1024):raise RuntimeError('ROLE_FILE_SIZE_INVALID')
    OUT.mkdir(mode=0o700,parents=True)
    os.chmod(OUT,0o700)
    ciphertext=OUT/'roles.gpg'
    partial=OUT/'roles.partial'
    reader=subprocess.Popen(['proot-distro','login','debian','--','/bin/sh','-c',
         'exec cat "/root/.local/share/neroxa/commercial-recovery/pre-release.h5Br8bwm/roles-no-passwords.private.sql"'],
         stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    enc=subprocess.Popen(['gpg','--batch','--yes','--pinentry-mode','loopback',
         '--passphrase-file',str(KEY),'--cipher-algo','AES256',
         '--symmetric','--output',str(partial)],
         stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    sha=hashlib.sha256();size=0
    try:
        for b in iter(lambda:reader.stdout.read(256*1024),b''):
            sha.update(b);size+=len(b);enc.stdin.write(b)
        enc.stdin.close()
        if enc.wait(timeout=60) or reader.wait(timeout=60):
            raise RuntimeError('ENCRYPTION_PIPELINE_BLOCKED')
        if size!=info['bytes'] or sha.hexdigest()!=info['roles_sha']:
            raise RuntimeError('AUDITED_SOURCE_HASH_MISMATCH')
        os.replace(partial,ciphertext)
        os.chmod(ciphertext,0o600)
    finally:
        if reader.poll() is None:reader.kill()
        if enc.poll() is None:enc.kill()
        if partial.exists():partial.unlink()
    if ciphertext.stat().st_size>CHUNK:raise RuntimeError('ROLES_CIPHERTEXT_TOO_LARGE')
    # Independent decrypt/hash check, no plaintext file and no plaintext logs.
    decrypt=subprocess.Popen(['gpg','--batch','--no-tty','--pinentry-mode','loopback',
        '--passphrase-file',str(KEY),'--decrypt',str(ciphertext)],
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    chk=hashlib.sha256()
    for b in iter(lambda:decrypt.stdout.read(256*1024),b''):chk.update(b)
    if decrypt.wait(timeout=60) or chk.hexdigest()!=info['roles_sha']:
        raise RuntimeError('CIPHERTEXT_DECRYPT_VERIFY_FAILED')
    prefix='rg01-'+secrets.token_hex(8)
    cipher=ciphertext.read_bytes()
    manifest={'version':1,'prefix':prefix,'cipher_sha256':digest(ciphertext),
      'cipher_bytes':len(cipher),'chunks':[{'key':prefix+'-chunk-0000',
      'bytes':len(cipher),'sha256':hashlib.sha256(cipher).hexdigest()}]}
    token=getpass.getpass('Cloudflare KV Storage Edit token (hidden): ')
    if not token:raise RuntimeError('KV_TOKEN_MISSING')
    base=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/storage/kv/namespaces/{NAMESPACE}/values/'
    chunk_url=base+prefix+'-chunk-0000'
    req(chunk_url+'?expiration_ttl='+str(TTL),cipher,token)
    readback(chunk_url,token,cipher)
    raw=json.dumps(manifest,separators=(',',':'),sort_keys=True).encode()
    manifest_key=prefix+'-manifest'
    req(base+manifest_key+'?expiration_ttl='+str(TTL),raw,token)
    readback(base+manifest_key,token,raw)
    (OUT/'transfer-private.json').write_text(json.dumps({'manifest_key':manifest_key,
      'cipher_sha256':manifest['cipher_sha256'],'roles_source_sha256':info['roles_sha'],
      'dump_source_sha256':info['dump_sha']},indent=2)+'\n')
    os.chmod(OUT/'transfer-private.json',0o600)
    print('RG02_ENCRYPTED_TRANSFER=PASS; PLAINTEXT_UPLOADED=NO; TTL_HOURS=24')
    print('ROLES_MANIFEST_KEY='+manifest_key)
    print('ROLES_EXPECTED_CIPHER_SHA256='+manifest['cipher_sha256'])
    print('ROLES_SOURCE_SHA256='+info['roles_sha'])
    print('DUMP_SOURCE_SHA256='+info['dump_sha'])
    print('GITHUB_SECRET_OR_PASSWORD_PRINTED=NO')

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('RG02_TRANSFER=BLOCKED:'+str(exc).split(':')[0][:70],file=sys.stderr)
        sys.exit(1)
