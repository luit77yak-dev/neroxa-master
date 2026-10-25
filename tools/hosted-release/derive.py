"""Deterministic postimages: no SQL/service/network effects; originals intact."""
from pathlib import Path
import hashlib,json,re
root=Path.cwd();out=root/'audits/02a5/hosted-release';out.mkdir(exist_ok=True)
source=json.loads((root/'audits/02a5/capability-admission/ORDER-AND-HASHES.json').read_text())['units']
core={'target_project':'iefaoaqzltvpfabyeelj','sources':[(x['path'],x['sha256']) for x in source],'guard':'pg_temp.neroxa_release_admitted(text,integer); authenticated transport + same SQL session; no disposable GUC','revision':1}
release_id=hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':')).encode()).hexdigest();units=[]
for item in source:
 p=root/item['path'];b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==item['sha256'];s=b.decode();n=item['order'];guard=f"pg_temp.neroxa_release_admitted('{release_id}',{n})"
 pattern=r"current_setting\('neroxa\.mission02a2_disposable',\s*true\)\s+IS\s+DISTINCT\s+FROM\s+'on'"
 s,count=re.subn(pattern,'NOT '+guard,s,flags=re.I)
 assert 'neroxa.mission02a2_disposable' not in s, 'Unhandled old context guard: '+str(p)
 prefix=f"-- Derived candidate for {core['target_project']}; no operational admission.\n-- Source SHA256: {item['sha256']}; original content/comments preserved below.\nDO $release$ BEGIN IF NOT {guard} THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;\n"
 s=prefix+s;name=f"{n:02d}-"+p.name;target=out/name;target.write_text(s)
 units.append({'order':n,'path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'source_path':item['path'],'source_sha256':item['sha256'],'context_guards_replaced':count})
manifest={'status':'CANDIDATE; hosted execution CLOSED','release_id':release_id,'target_project':core['target_project'],'execution_authorized':False,'approval':None,'units':units,'operational_admission':'No hosted transport/approval installed; missing pg_temp admission fails before any unit. Rehearsal admission is a separate real Docker identity/session proof, not a hosted receipt.'}
u2=(out/Path(units[1]['path']).name).read_text();assert u2.count('COMMIT;')==1
recovery=f"BEGIN;\nDO $recover$ BEGIN IF NOT pg_temp.neroxa_release_admitted('{release_id}',2) THEN RAISE EXCEPTION 'Recovery admission required'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='neroxa_storefront_settings_instance_fk') OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.neroxa_storefront_settings'::regclass AND attname='instance_id' AND atttypid='uuid'::regtype AND NOT attnotnull) THEN RAISE EXCEPTION 'Unexpected partial schema'; END IF; IF EXISTS(SELECT 1 FROM public.neroxa_storefront_settings s WHERE (SELECT count(*) FROM public.neroxa_system_instances i WHERE i.organization_id=s.organization_id)<>1) THEN RAISE EXCEPTION 'Unresolved disposition/mapping; STOP'; END IF; END $recover$;\n"+u2.split('COMMIT;',1)[1]+"\nCOMMIT;\n"
rpath=out/'02-recover-after-commit.pending.sql';rpath.write_text(recovery);manifest['recovery']={'path':str(rpath.relative_to(root)),'sha256':hashlib.sha256(rpath.read_bytes()).hexdigest(),'source_boundary':'original unit 2 COMMIT; explicit roll-forward, never original DDL replay'}
(out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'derived':len(units),'release_id':release_id,'old_guards':sum(x['context_guards_replaced'] for x in units),'originals_modified':False}))
