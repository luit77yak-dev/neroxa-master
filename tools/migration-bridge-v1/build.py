"""Generate review-only upgrade SQL from verified metadata; never connect to a database."""
import hashlib, json, pathlib, re
R=pathlib.Path(__file__).resolve().parents[2]
OUT=R/'audits/migration-bridge-v1-20261013'
E=OUT/'evidence'; SQL=OUT/'sql';SQL.mkdir(exist_ok=True)
S=json.loads((E/'sandbox-catalog-readonly.json').read_text())[0]['metadata']
LIVE=json.loads((E/'sandbox-functions-readonly.json').read_text())[0]['metadata']
N=json.loads((R/'audits/ab-auth/master-catalog-20261009.json').read_text())
TABLES={x['name'] for x in S['relations']}|{'neroxa_storefront_categories','neroxa_storefront_addon_groups','neroxa_storefront_addons','neroxa_storefront_product_addon_groups'}
FUNCS={x['name'] for x in LIVE['functions']}|{'get_public_storefront_catalog','neroxa_has_org_role','neroxa_has_platform_role','neroxa_set_updated_at','guard_neroxa_implementation_write_path','sync_domains_with_instance_status','reset_neroxa_domain_verification_on_change','set_neroxa_systems_updated_at','neroxa_is_platform_staff'}
TYPES={'neroxa_organization_role','neroxa_platform_role','neroxa_instance_status','neroxa_domain_status'}
q=lambda x:'"'+x.replace('"','""')+'"'
lit=lambda x:"'"+x.replace("'","''")+"'"
name=lambda x:'public.'+q(x)
cols=lambda j,t:[c for c in j['columns'] if c['table']==t]
oldcols={t:{c['name']:c for c in cols(S,t)} for t in TABLES}
newcols={t:{c['name']:c for c in cols(N,t)} for t in TABLES}
priv={'a':'INSERT','r':'SELECT','w':'UPDATE','d':'DELETE','D':'TRUNCATE','x':'REFERENCES','t':'TRIGGER','m':'MAINTAIN','X':'EXECUTE','U':'USAGE','C':'CREATE'}
def acl(kind,obj,entries,source=False):
 out=[f'REVOKE ALL ON {kind} {obj} FROM PUBLIC,anon,authenticated,service_role;']
 # SQL is review-only: preserve target known ACL, then native candidates restrict operational surfaces.
 for a in entries or []:
  role,rights=a.split('=',1);rights=rights.split('/')[0];role='PUBLIC' if not role else q(role)
  for c in rights:
   if not source and kind=='FUNCTION' and role=='PUBLIC':continue
   if not source and role in ('"anon"','"authenticated"') and c in 'Dxtm':continue
   if c!='*':out.append(f'GRANT {priv[c]} ON {kind} {obj} TO {role}'+(' WITH GRANT OPTION' if c+'*' in rights else '')+';')
 return out
GUARD="""DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR current_setting('app.bridge_environment',true) IS DISTINCT FROM 'local-disposable'
 THEN RAISE EXCEPTION 'BRIDGE_DISPOSABLE_CONTEXT_REQUIRED'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL
 THEN RAISE EXCEPTION 'BRIDGE_REAL_AUTH_REQUIRED'; END IF;
 IF pg_has_role('anon','postgres','MEMBER') OR pg_has_role('authenticated','service_role','MEMBER')
 THEN RAISE EXCEPTION 'BRIDGE_ROLE_ESCALATION'; END IF;
 IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN RAISE EXCEPTION 'BRIDGE_UNTRUSTED_SCHEMA_CREATE'; END IF;
END $$;"""
A=['-- A: strict read-only preflight; no writes, no application permission changes.',GUARD]
A+= ["DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'neroxa_%' AND c.relkind='r' AND NOT(c.relname=ANY(ARRAY["+','.join(lit(x) for x in sorted(oldcols) if oldcols[x])+ "]))) OR to_regclass('private.delivery_order_capabilities') IS NOT NULL OR to_regclass('public.neroxa_delivery_instance_grants') IS NOT NULL OR to_regclass('private.delivery_append_requests') IS NOT NULL THEN RAISE EXCEPTION 'BRIDGE_UNREVIEWED_EIGHT_SQL_PROFILE'; END IF; END $$;"]
for t in S['relations']:
 tn=t['name']; A.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass({lit('public.'+tn)}) AND relkind='r' AND pg_get_userbyid(relowner)='postgres' AND relrowsecurity={'true' if t['rls'] else 'false'} AND relacl::text[] IS NOT DISTINCT FROM ARRAY["+','.join(lit(a) for a in t['acl'])+"]::text[]) THEN RAISE EXCEPTION 'BRIDGE_RELATION_DRIFT'; END IF; END $$;")
 for c in cols(S,tn):
  A.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid={lit('public.'+tn)}::regclass AND a.attname={lit(c['name'])} AND format_type(a.atttypid,a.atttypmod)={lit(c['type'])} AND a.attnotnull={'false' if c['nullable'] else 'true'} AND pg_get_expr(d.adbin,d.adrelid) IS NOT DISTINCT FROM "+(lit(c['default']) if c['default'] else 'NULL')+") THEN RAISE EXCEPTION 'BRIDGE_COLUMN_DRIFT'; END IF; END $$;")
 A.append(f"DO $$ BEGIN IF (SELECT count(*) FROM pg_attribute WHERE attrelid={lit('public.'+tn)}::regclass AND attnum>0 AND NOT attisdropped)<>{len(cols(S,tn))} THEN RAISE EXCEPTION 'BRIDGE_COLUMN_COUNT_DRIFT'; END IF; END $$;")
for t in S['relations']:
 tn=t['name'];expected=sum(c['table']==tn for c in S['constraints']);indexes=sum(c['table']==tn for c in S['indexes'])
 A.append(f"DO $$ BEGIN IF (SELECT count(*) FROM pg_constraint WHERE conrelid={lit('public.'+tn)}::regclass)<>{expected} OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename={lit(tn)})<>{indexes} THEN RAISE EXCEPTION 'BRIDGE_CONSTRAINT_INDEX_COUNT_DRIFT'; END IF; END $$;")
for collection,select,expr in [('constraints','pg_constraint k JOIN pg_class c ON c.oid=k.conrelid','pg_get_constraintdef(k.oid)'),('indexes','pg_indexes i','i.indexdef')]:
 for x in S[collection] or []:
  if collection=='constraints':cond=f"k.conrelid={lit('public.'+x['table'])}::regclass AND k.conname={lit(x['name'])} AND k.convalidated={'true' if x['validated'] else 'false'}"
  else:cond=f"i.schemaname='public' AND i.tablename={lit(x['table'])} AND i.indexname={lit(x['name'])}"
  A.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM {select} WHERE {cond} AND {expr}={lit(x['definition'])}) THEN RAISE EXCEPTION 'BRIDGE_OBJECT_DRIFT'; END IF; END $$;")
A.append("DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'neroxa_%') OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'neroxa_%' AND NOT t.tgisinternal) THEN RAISE EXCEPTION 'BRIDGE_POLICY_TRIGGER_DRIFT'; END IF; END $$;")
A.append("DO $$ BEGIN IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f')<>8 THEN RAISE EXCEPTION 'BRIDGE_FUNCTION_OVERLOAD'; END IF; END $$;")
for f in LIVE['functions']:
 sig=f['schema']+'.'+f['name']+'('+re.sub(r'\bp_\w+\s+','',f['signature'])+')'
 A.append(f"DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({lit(sig)}) AND md5(prosrc)={lit(f['body_md5'])} AND md5(pg_get_functiondef(oid))={lit(f['definition_md5'])} AND pg_get_userbyid(proowner)='postgres' AND prosecdef={'true' if f['definer'] else 'false'} AND (SELECT array_agg(v ORDER BY v) FROM unnest(proacl::text[]) v) IS NOT DISTINCT FROM ARRAY["+','.join(lit(a) for a in sorted(f['acl']))+"]::text[]) THEN RAISE EXCEPTION 'BRIDGE_FUNCTION_DRIFT'; END IF; END $$;")
A.append("""DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.neroxa_orders o LEFT JOIN public.neroxa_system_instances i ON i.id=o.instance_id WHERE i.id IS NULL OR i.organization_id IS DISTINCT FROM o.organization_id)
 OR EXISTS(SELECT 1 FROM public.neroxa_order_items x LEFT JOIN public.neroxa_orders o ON o.id=x.order_id WHERE o.id IS NULL)
 OR EXISTS(SELECT 1 FROM public.neroxa_order_status_history x LEFT JOIN public.neroxa_orders o ON o.id=x.order_id WHERE o.id IS NULL)
 OR EXISTS(SELECT 1 FROM public.neroxa_order_items x JOIN public.neroxa_orders o ON o.id=x.order_id JOIN public.neroxa_storefront_products p ON p.id=x.product_id WHERE p.instance_id<>o.instance_id)
 OR EXISTS(SELECT 1 FROM public.neroxa_order_items x JOIN public.neroxa_orders o ON o.id=x.order_id JOIN public.neroxa_storefront_products p ON p.id=x.second_product_id WHERE p.instance_id<>o.instance_id)
 OR EXISTS(SELECT 1 FROM public.neroxa_orders WHERE total<>subtotal+delivery_fee)
 OR EXISTS(SELECT 1 FROM public.neroxa_orders o WHERE subtotal IS DISTINCT FROM (SELECT sum(line_total) FROM public.neroxa_order_items x WHERE x.order_id=o.id))
 THEN RAISE EXCEPTION 'BRIDGE_HISTORICAL_INTEGRITY'; END IF;
 IF EXISTS(SELECT 1 FROM public.neroxa_platform_members m LEFT JOIN auth.users u ON u.id=m.user_id WHERE u.id IS NULL)
 OR EXISTS(SELECT 1 FROM public.neroxa_organization_members m LEFT JOIN auth.users u ON u.id=m.user_id WHERE u.id IS NULL)
 THEN RAISE EXCEPTION 'BRIDGE_AUTH_ORPHAN'; END IF;
 IF EXISTS(SELECT 1 FROM public.neroxa_storefront_settings s WHERE (SELECT count(*) FROM public.neroxa_system_instances i WHERE i.organization_id=s.organization_id)<>1)
 OR EXISTS(SELECT 1 FROM public.neroxa_storefront_delivery_zones s WHERE (SELECT count(*) FROM public.neroxa_system_instances i WHERE i.organization_id=s.organization_id)<>1)
 THEN RAISE EXCEPTION 'BRIDGE_AMBIGUOUS_INSTANCE'; END IF;
END $$;""")
for t in sorted(TABLES):
 for c in cols(S,t):
  nc=newcols[t].get(c['name'])
  if nc and c['type']=='numeric' and nc['type'].startswith('numeric('):
   A.append(f"DO $$ BEGIN IF EXISTS(SELECT 1 FROM {name(t)} WHERE {q(c['name'])} IS DISTINCT FROM {q(c['name'])}::{nc['type']}::numeric) THEN RAISE EXCEPTION 'BRIDGE_MONETARY_PRECISION'; END IF; END $$;")
B=[GUARD,"CREATE SCHEMA neroxa_bridge; REVOKE ALL ON SCHEMA neroxa_bridge FROM PUBLIC,anon,authenticated,service_role;","CREATE TABLE neroxa_bridge.journal(stage text PRIMARY KEY,sha256 text NOT NULL CHECK(length(sha256)=64),catalog_digest text NOT NULL CHECK(length(catalog_digest)=32),completed_at timestamptz NOT NULL DEFAULT now());","ALTER TABLE neroxa_bridge.journal ENABLE ROW LEVEL SECURITY; REVOKE ALL ON neroxa_bridge.journal FROM PUBLIC,anon,authenticated,service_role;",
"CREATE TABLE neroxa_bridge.legacy_order_anchors(order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE RESTRICT,instance_id uuid NOT NULL,idempotency_key uuid);ALTER TABLE neroxa_bridge.legacy_order_anchors ENABLE ROW LEVEL SECURITY;REVOKE ALL ON neroxa_bridge.legacy_order_anchors FROM PUBLIC,anon,authenticated,service_role;"]
for t in N['types']:
 if t['name'] in TYPES:B.append('CREATE TYPE '+name(t['name'])+' AS ENUM ('+','.join(lit(x) for x in t['enum_labels'])+');')
for t in sorted(TABLES):
 if not oldcols[t]:
  B.append('CREATE TABLE '+name(t)+' ('+','.join(q(c['name'])+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['not_null'] else '') for c in cols(N,t))+');')
  B+=['ALTER TABLE '+name(t)+' ENABLE ROW LEVEL SECURITY;']+acl('TABLE',name(t),[])
 else:
  for c in cols(N,t):
   if c['name'] not in oldcols[t]:B.append(f"ALTER TABLE {name(t)} ADD COLUMN {q(c['name'])} {c['type']};")
C=[GUARD,"DO $$ BEGIN IF current_setting('app.bridge_consumers_frozen',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'BRIDGE_FROZEN_CONSUMERS_REQUIRED'; END IF; END $$;","DO $$ BEGIN IF current_setting('app.bridge_resolution',true) IS NULL OR current_setting('app.bridge_resolution',true)='' THEN RAISE EXCEPTION 'BRIDGE_EXPLICIT_RESOLUTION_REQUIRED'; END IF; END $$;"]
C.append('INSERT INTO neroxa_bridge.legacy_order_anchors(order_id,instance_id,idempotency_key) SELECT id,instance_id,idempotency_key FROM public.neroxa_orders;')
required={}
for t in sorted(TABLES):
 if not oldcols[t]:continue
 missing=[c for c in cols(N,t) if c['name'] not in oldcols[t] and c['not_null']]
 required[t]=[c['name'] for c in missing]
 # All missing non-null properties must be explicitly supplied per existing row. No blanket backfill default.
 key='organization_id' if t=='neroxa_storefront_settings' else 'user_id' if t in ('neroxa_platform_members','neroxa_organization_members') else 'id'
 for c in missing:
  expression=f"(current_setting('app.bridge_resolution')::jsonb->{lit(t)}->t.{q(key)}::text->{lit(c['name'])})"
  C.append(f"UPDATE {name(t)} t SET {q(c['name'])}=(jsonb_populate_record(NULL::{name(t)},jsonb_build_object({lit(c['name'])},{expression}))).{q(c['name'])} WHERE {q(c['name'])} IS NULL;")
  C.append(f"ALTER TABLE {name(t)} ALTER COLUMN {q(c['name'])} SET NOT NULL;")
 for c in cols(N,t):
  oc=oldcols[t].get(c['name'])
  if oc and oc['type']!=c['type']:
   C.append(f'ALTER TABLE {name(t)} ALTER COLUMN {q(c["name"])} DROP DEFAULT;')
   C.append(f'ALTER TABLE {name(t)} ALTER COLUMN {q(c["name"])} TYPE {c["type"]} USING {q(c["name"])}::text::{c["type"]};')
  if c['default']:C.append(f'ALTER TABLE {name(t)} ALTER COLUMN {q(c["name"])} SET DEFAULT {c["default"]};')
 # Add unique surrogate identity without discarding the original composite/user PK.
 if t in ('neroxa_platform_members','neroxa_organization_members'):
  C.append(f'ALTER TABLE {name(t)} ADD CONSTRAINT {q(t+"_bridge_id_unique")} UNIQUE(id);')
D=[GUARD,"DO $$ BEGIN IF current_setting('app.bridge_consumers_frozen',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'BRIDGE_FROZEN_CONSUMERS_REQUIRED'; END IF; END $$;","CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;"]
for f in N['functions']:
 if f['name'] not in FUNCS:continue
 D.append(f['definition'].rstrip(';')+';');sig=q(f['schema'])+'.'+q(f['name'])+'('+f['signature']+')';D+=acl('FUNCTION',sig,f['acl'])
# Preserve all legacy constraints, replace only explicitly verified order parent DELETE CASCADE with native RESTRICT.
for c in sorted(N['constraints'],key=lambda x:x['kind']=='f'):
 if c['table'] not in TABLES:continue
 refs=re.findall(r'REFERENCES (\w+)',c['definition'])
 if refs and any(x not in TABLES and x!='auth' for x in refs):continue
 prior=[x for x in S['constraints'] if x['table']==c['table'] and x['name']==c['name']]
 if prior and prior[0]['definition']==c['definition']:continue
 if prior:
  if c['table']=='neroxa_orders' and c['kind']=='f':D.append(f'ALTER TABLE {name(c["table"])} DROP CONSTRAINT {q(c["name"])};')
  else:continue # Legacy membership PK remains explicit, never silently replaced.
 D.append(f'ALTER TABLE {name(c["table"])} ADD CONSTRAINT {q(c["name"])} {c["definition"]};')
constraint_names={c['name'] for c in N['constraints']}
for i in N['indexes']:
 if i['table'] in TABLES and i['name'] not in constraint_names and not any(x['name']==i['name'] for x in S['indexes']):D.append(i['definition']+';')
for t in N['triggers']:
 if t['table'] in TABLES:D.append(t['definition']+';')
for p in N['policies']:
 if p['table'] not in TABLES:continue
 D.append(f'CREATE POLICY {q(p["name"])} ON {name(p["table"])} AS {p["permissive"]} FOR {p["command"]} TO '+','.join('PUBLIC' if r=='public' else q(r) for r in p['roles'])+(' USING ('+p['using']+')' if p['using'] else '')+(' WITH CHECK ('+p['check']+')' if p['check'] else '')+';')
for t in N['relations']:
 if t['name'] in TABLES:D+=['ALTER TABLE '+name(t['name'])+' ENABLE ROW LEVEL SECURITY;']+acl('TABLE',name(t['name']),t['acl'])
# Do not reproduce managed defaults. All new own objects use explicit ACLs.
D+=['GRANT USAGE ON SCHEMA private TO authenticated;']
files=[]
for phase,lines in [('A-preflight',A),('B-expand',B),('C-resolve-data',C),('D-native-preparation',D)]:
 p=SQL/(phase+'.candidate.sql');p.write_text('-- REVIEW-ONLY; never remote. Transaction/journal envelope is enforced by runner.\n'+'\n'.join(lines)+'\n');files.append({'phase':phase[0],'path':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'repeat':'read-only' if phase[0]=='A' else 'journal-skip-only; never blind replay','requires':None if phase[0]=='A' else chr(ord(phase[0])-1)})
ep=SQL/'E-cutover-gate.candidate.sql';files.append({'phase':'E','path':str(ep.relative_to(R)),'sha256':hashlib.sha256(ep.read_bytes()).hexdigest(),'repeat':'journal-skip-only; never blind replay','requires':'D plus all native candidates and browser substitutes verified'})
manifest={'version':1,'remoteExecutionAuthorized':False,'automaticMigrations':False,'sourceMaster':'bdf9be73b96adbc6b2ecb338fe140e281a27e75c','sourceDelivery':'f3db1fa1cb65ec45496f83fc517d0c33ca3bd6c8','profile':'observed-uninstalled-eight-sql-sandbox','scope':'16-table operational Delivery projection; not full Master replacement','tables':sorted(TABLES),'requiredResolution':required,'baselineProjection':{'relations':len(TABLES),'functions':sum(f['name'] in FUNCS for f in N['functions']),'policies':sum(p['table'] in TABLES for p in N['policies'])},'sequence':files,'nativeSequence':json.loads((E/'native-installation-reference.json').read_text())['sequence'],'blockedProfiles':['eight SQLs already installed; unproven grants/capabilities mapping'],'deferredFKs':['neroxa_system_instances.plan_id','neroxa_system_instances.subscription_id'],'legacyMembershipPrimaryKeys':'preserved, native id unique; no role conversion','inputs':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [E/'sandbox-catalog-readonly.json',E/'sandbox-functions-readonly.json',R/'audits/ab-auth/master-catalog-20261009.json',E/'legacy-state-profiles-readonly.json',E/'legacy-shape-readonly.json']}}
(OUT/'MANIFEST-PONTE.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Faithful observed source fixture DDL: this is only for an EMPTY disposable stack.
f=['BEGIN;','SET check_function_bodies=off;']
for t in S['relations']:
 f.append('CREATE TABLE '+name(t['name'])+' ('+','.join(q(c['name'])+' '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if not c['nullable'] else '') for c in cols(S,t['name']))+');')
for c in sorted(S['constraints'],key=lambda x:x['kind']=='f'):f.append(f'ALTER TABLE {name(c["table"])} ADD CONSTRAINT {q(c["name"])} {c["definition"]};')
keys={c['name'] for c in S['constraints'] if c['kind'] in ('u','p')}
for i in S['indexes']:
 if i['name'] not in keys:f.append(i['definition']+';')
for fn in LIVE['functions']:
 f.append(fn['definition'].rstrip(';')+';');f+=acl('FUNCTION',name(fn['name'])+'('+fn['signature']+')',fn['acl'],source=True)
for t in S['relations']:
 if t['rls']:f.append('ALTER TABLE '+name(t['name'])+' ENABLE ROW LEVEL SECURITY;')
 f+=acl('TABLE',name(t['name']),t['acl'],source=True)
f+=['SET check_function_bodies=on;','COMMIT;'];(OUT/'observed-sandbox.empty-fixture.sql').write_text('-- ONLY empty local-disposable database; synthetic metadata, NO REMOTE.\n'+'\n'.join(f)+'\n')
manifest['emptySourceFixture']={'path':str((OUT/'observed-sandbox.empty-fixture.sql').relative_to(R)),'sha256':hashlib.sha256((OUT/'observed-sandbox.empty-fixture.sql').read_bytes()).hexdigest()};(OUT/'MANIFEST-PONTE.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'tables':len(TABLES),'phases':4,'required_resolution':required}))
