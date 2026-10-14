"""Offline checksum verification only; never connects to a database."""
import argparse, hashlib, json, pathlib
p=argparse.ArgumentParser();p.add_argument('master_root',type=pathlib.Path);p.add_argument('delivery_legacy_root',type=pathlib.Path);a=p.parse_args()
m=json.loads((a.master_root/'audits/02a2/MANIFEST-02A2.json').read_text())
entries=[(a.master_root,m['historicalCatalog'])]
entries += [(a.master_root,x) for x in m['masterProfile']['predecessorOrder']]
entries += [(a.master_root,m['masterProfile']['newCandidate'])]
entries += [(a.delivery_legacy_root,x) for x in m['deliveryLegacyProfile']['migrations']]
entries += [(a.delivery_legacy_root,m['deliveryLegacyProfile']['newCandidate'])]
for root,e in entries:
 path=(root/e['path']).resolve();assert path.is_relative_to(root.resolve()),'Path outside repository'
 assert hashlib.sha256(path.read_bytes()).hexdigest()==e['sha256'],'Manifest mismatch: '+e['path']
print(json.dumps({'status':'PASS hashes only','files':len(entries),'databaseExecution':'NOT RUN','RLSProof':False}))
