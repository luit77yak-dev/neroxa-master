"""Reconstruct the FULL captured application catalog, no rows or invented Auth."""
import json,pathlib,hashlib,sys
R=pathlib.Path(__file__).resolve().parents[2]
P=R/'audits/ab-auth/master-catalog-20261009.json';j=json.loads(P.read_text());source=json.loads((R/'audits/ab-auth/source.json').read_text())
assert hashlib.sha256(P.read_bytes()).hexdigest()==source['sha256']
def q(x):return '"'+x.replace('"','""')+'"'
def lit(x):return "'"+x.replace("'","''")+"'"
def name(x):return q(x['schema'])+'.'+q(x.get('table',x.get('name')))
priv={'a':'INSERT','r':'SELECT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','m':'MAINTAIN','X':'EXECUTE','U':'USAGE','C':'CREATE'}
def acl(kind,obj,items):
 if items is None:return []  # Native NULL ACL; no invented grants.
 lines=[f'REVOKE ALL ON {kind} {obj} FROM PUBLIC, anon, authenticated, service_role;']
 for a in items:
  role,rest=a.split('=',1);rights=rest.split('/',1)[0];recipient='PUBLIC' if not role else q(role.strip('"'))
  for c in rights:
   if c=='*':continue
   lines.append(f'GRANT {priv[c]} ON {kind} {obj} TO {recipient}'+(' WITH GRANT OPTION' if c+'*' in rights else '')+';')
 return lines
s=['BEGIN;','SET search_path=public,extensions;','SET check_function_bodies=off;']
for n in j['schemas']:
 if n['name']!='public':s.append(f'CREATE SCHEMA {q(n["name"])} AUTHORIZATION {q(n["owner"])};')
 else:s.append(f'ALTER SCHEMA public OWNER TO {q(n["owner"])};')
 s+=acl('SCHEMA',q(n['name']),n['acl'])
for t in j['types']:
 assert t['kind']=='e', 'Unsupported captured type; stop instead of simplifying'
 s.append(f'CREATE TYPE {name(t)} AS ENUM ('+','.join(lit(x) for x in t['enum_labels'])+');')
 s.append(f'ALTER TYPE {name(t)} OWNER TO {q(t["owner"])};')
for t in j['relations']:
 if t['kind']=='v':continue
 assert t['kind']=='r','Unsupported relation; stop'
 cols=[]
 for c in sorted([x for x in j['columns'] if x['schema']==t['schema'] and x['table']==t['name']],key=lambda x:x['position']):
  assert not c['identity'] and not c['generated'],'Unsupported generated/identity; stop'
  cols.append(q(c['name'])+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['not_null'] else ''))
 s.append(f'CREATE TABLE {name(t)} ('+','.join(cols)+');');s.append(f'ALTER TABLE {name(t)} OWNER TO {q(t["owner"])};')
for k in sorted(j['constraints'],key=lambda x:x['kind']=='f'):
 s.append(f'ALTER TABLE {name(k)} ADD CONSTRAINT {q(k["name"])} {k["definition"]}'+(' NOT VALID' if not k['validated'] and 'NOT VALID' not in k['definition'] else '')+';')
for v in j['relations']:
 if v['kind']=='v':
  s.append(f'CREATE VIEW {name(v)}'+(' WITH ('+','.join(v['options'])+')' if v['options'] else '')+' AS '+v['view_definition'].rstrip(';')+';')
  s.append(f'ALTER VIEW {name(v)} OWNER TO {q(v["owner"])};')
for f in j['functions']:
 s.append(f['definition'].rstrip(';')+';');sig=q(f['schema'])+'.'+q(f['name'])+'('+f['signature']+')'
 s.append(f'ALTER FUNCTION {sig} OWNER TO {q(f["owner"])};');s+=acl('FUNCTION',sig,f['acl'])
constraint_names={x['name'] for x in j['constraints'] if x['kind'] in ('p','u','x')}
for i in j['indexes']:
 assert i['valid'] and i['ready'],'Invalid source index; stop'
 if i['name'] not in constraint_names:s.append(i['definition']+';')
for t in j['triggers']:
 s.append(t['definition']+';')
 if t['enabled']!='O':
  state={'D':'DISABLE','A':'ENABLE ALWAYS','R':'ENABLE REPLICA'}[t['enabled']];s.append(f'ALTER TABLE {name(t)} {state} TRIGGER {q(t["name"])};')
for p in j['policies']:
 s.append(f'CREATE POLICY {q(p["name"])} ON {name(p)} AS {p["permissive"]} FOR {p["command"]} TO '+','.join('PUBLIC' if r=='public' else q(r) for r in p['roles'])+(' USING ('+p['using']+')' if p['using'] else '')+(' WITH CHECK ('+p['check']+')' if p['check'] else '')+';')
for t in j['relations']:
 if t['kind']=='r':
  if t['rls']:s.append(f'ALTER TABLE {name(t)} ENABLE ROW LEVEL SECURITY;')
  if t['force_rls']:s.append(f'ALTER TABLE {name(t)} FORCE ROW LEVEL SECURITY;')
 s+=acl('TABLE',name(t),t['acl'])
for c in j['columns']:
 if c['acl']:raise AssertionError('Captured column ACL requires explicit implementation; stop')
for d in j['default_privileges']:
 if d['owner']!='postgres':continue # Do NOT alter managed owner defaults.
 kind={'r':'TABLES','f':'FUNCTIONS','S':'SEQUENCES'}[d['kind']]
 prefix=f'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA {q(d["schema"])} '
 s.append(prefix+f'REVOKE ALL ON {kind} FROM PUBLIC,anon,authenticated,service_role;')
 for a in d['acl']:
  r,rights=a.split('=',1);rights=rights.split('/',1)[0]
  for c in rights:
   if c!='*':s.append(prefix+f'GRANT {priv[c]} ON {kind} TO '+('PUBLIC' if not r else q(r))+';')
s+=['SET check_function_bodies=on;','COMMIT;']
pathlib.Path(sys.argv[1]).write_text('\n'.join(s)+'\n')
print(json.dumps({'relations':len(j['relations']),'functions':len(j['functions']),'policies':len(j['policies']),'scope':'complete historical app catalog; real Auth supplied by Supabase platform','managed_defaults_not_rewritten':True}))
