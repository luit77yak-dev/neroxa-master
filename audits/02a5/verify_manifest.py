#!/usr/bin/env python3
"""Offline artifact verification only. Never connects to PostgreSQL or applies SQL."""
import argparse,hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
def validate(manifest,root=ROOT,check_sources=True,release=False):
 units=manifest['units']; ids=[u['id'] for u in units]
 if len(ids)!=len(set(ids)) or ids!=manifest['order']: raise ValueError('duplicate or changed order')
 if len(units)!=27 or units[0]['kind']!='catalog': raise ValueError('unexpected profile size')
 if not manifest.get('tooling'):raise ValueError('missing reconstruction tooling')
 for tool in manifest['tooling']:
  target=(root/tool['path']).resolve()
  if not target.is_relative_to(root.resolve()) or hashlib.sha256(target.read_bytes()).hexdigest()!=tool['sha256']:raise ValueError('tooling mismatch')
  if check_sources and subprocess.check_output(['git','-C',str(root),'show',tool['source_sha']+':'+tool['path']],stderr=subprocess.DEVNULL)!=target.read_bytes():raise ValueError('tooling source mismatch')
 for i,u in enumerate(units):
  if u['depends_on']!=([ids[i-1]] if i else []):raise ValueError('dependency chain mismatch')
  path=(root/u['path']).resolve()
  if not path.is_relative_to(root.resolve()):raise ValueError('path traversal')
  content=path.read_bytes()
  if hashlib.sha256(content).hexdigest()!=u['sha256']:raise ValueError('hash mismatch: '+u['id'])
  if check_sources:
   original=subprocess.check_output(['git','-C',str(root),'show',u['source_sha']+':'+u['path']],stderr=subprocess.DEVNULL)
   if original!=content:raise ValueError('source commit mismatch: '+u['id'])
 if release:
  gate=json.loads((root/manifest['consumer_gate']['path']).read_text())
  if gate.get('status')!='PASS' or not gate.get('all_phone_consumers_disabled') or not gate.get('evidence_sha256'):raise ValueError('consumer disablement not verified')
  evidence=(root/gate['evidence_path']).resolve()
  if not evidence.is_relative_to(root.resolve()) or hashlib.sha256(evidence.read_bytes()).hexdigest()!=gate['evidence_sha256']:raise ValueError('consumer evidence mismatch')
 return len(units)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--release-ready',action='store_true');a=p.parse_args()
 try:
  n=validate(json.loads((ROOT/'audits/02a5/INTEGRATED-MANIFEST.json').read_text()),release=a.release_ready)
  print(json.dumps({'status':'PASS','scope':'artifact hashes/order/source only','units':n,'database_applied':False}))
 except Exception as e:
  print(json.dumps({'status':'BLOCKED','reason':str(e),'database_applied':False}));sys.exit(2)
