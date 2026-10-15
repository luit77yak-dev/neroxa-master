#!/usr/bin/env python3
"""Replay exact Delivery historical migrations ONLY in a disposable local DB, then inspect catalog READ ONLY."""
import argparse,json,pathlib,subprocess,sys
p=argparse.ArgumentParser()
for arg in ['checkout','expected-sha','project','catalog']:p.add_argument('--'+arg,required=True)
a=p.parse_args()
root=pathlib.Path(a.checkout).resolve()
actual=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
assert actual==a.expected_sha,'BLOCKED SHA drift'
assert a.project.startswith('neroxa-f02-delivery-') and len(a.project)<70
files=sorted((root/'supabase/migrations').glob('*.sql'))
assert 20<=len(files)<=60,'Unexpected SQL migrations count'
db='supabase_db_'+a.project
base=['docker','--host=unix:///var/run/docker.sock','exec','-i',db,'psql','-X','-q','-A','-t','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
print('DELIVERY_HISTORICAL_PROFILE=DISPOSABLE_ONLY; SQL_MIGRATIONS='+str(len(files)),flush=True)
for i,f in enumerate(files,1):
    raw=f.read_bytes()
    if len(raw)>3_000_000:raise ValueError('SQL source unreasonably large')
    z=subprocess.run(base,input=raw,capture_output=True)
    if z.returncode:
        error=next((l.strip()[:220] for l in reversed(z.stderr.decode(errors='replace').splitlines()) if 'ERROR:' in l),'Migration SQL failed')
        print('DELIVERY_SQL_REPLAY=BLOCKED; index='+str(i)+'; file='+f.name+'; error='+error,flush=True)
        print('DELIVERY_POSTGRES_CATALOG=NOT_RUN; GATE=BLOCKED; POST_GATE=NOT_RUN',flush=True)
        sys.exit(2)
print('DELIVERY_SQL_REPLAY=PASS; count='+str(len(files)),flush=True)
z=subprocess.run(base,input=pathlib.Path(a.catalog).read_bytes(),capture_output=True)
if z.returncode:
    print('DELIVERY_POSTGRES_CATALOG=BLOCKED; catalog SELECT failed',flush=True);sys.exit(3)
rows=[x.strip() for x in z.stdout.decode(errors='replace').splitlines() if x.strip().startswith('{')]
assert len(rows)==1,'Expected exactly one SELECT JSON row'
d=json.loads(rows[0]);assert d.get('kind')=='F02_PRE_GATE_PG_CATALOG_ONLY'
names=('get_public_order_status','append_public_order_items','append_public_order_items_with_payment')
result={'profile':'DELIVERY_HISTORICAL_PRE_GATE_ONLY','sha':actual,'migrations':len(files),
'signatures':sorted(f['signature'] for f in d['functions'] if f['name'] in names),
'exposure':[{'signature':f['signature'],'anon':f['anon_execute'],'authenticated':f['authenticated_execute'],'security_definer':f['security_definer'],'owner':f['owner']} for f in d['functions'] if f['name'] in names],
'wrappers':[f['signature'] for f in d['functions'] if f['name'] not in names],
'pg_default_acl':d['default_acl'],'role_inheritance':d['inherited_roles'],'view_wrappers':d['view_wrappers'],
'gate':'BLOCKED','post_gate':'NOT_RUN','external_consumers':'UNKNOWN','commercial_release':False}
print('DELIVERY_F02_CATALOG='+json.dumps(result,sort_keys=True),flush=True)
print('F02_OPEN__NO_GATE_APPLIED__NO_REMOTE_SQL__CONSUMERS_UNKNOWN',flush=True)
