import pg from '../../go03r/food/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
const R=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const results=[];const clients=[];
const save=()=>writeFileSync(R+'/evidence/test-results.json',JSON.stringify(results,null,2));
async function connect(user='go03t_owner',database='go03t_contracts'){
 const c=new pg.Client({host:R+'/socket',port:16439,user,database,connectionTimeoutMillis:3000,statement_timeout:5000,query_timeout:7000,ssl:false});
 clients.push(c);await c.connect();return c;
}
async function test(name,fn){
 try{const detail=await fn();results.push({name,result:'PASS',detail:detail??null});save();console.log('PASS '+name);}
 catch(e){results.push({name,result:'FAIL',sqlstate:e.code??null,error:e.message});save();console.error('FAIL '+name,e);throw e;}
}
async function denied(c,sql,args,code){
 try{await c.query(sql,args);throw Error('Statement unexpectedly succeeded');}
 catch(e){assert.equal(e.code,code,e.message);return {sqlstate:e.code};}
}
const tables=['public.neroxa_orders','public.neroxa_order_items','public.neroxa_order_status_history','private.neroxa_group_order_intents','private.neroxa_go02_checkout_operations','private.neroxa_tracking_capabilities','private.neroxa_order_amendment_capabilities'];
let owner,runtime;
async function counts(){const x={};for(const t of tables)x[t]=(await owner.query('SELECT count(*)::int n FROM '+t)).rows[0].n;return x;}
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',A2='10000000-0000-4000-8000-000000000003';
const OA='20000000-0000-4000-8000-000000000001',OB='20000000-0000-4000-8000-000000000002';
const PA='30000000-0000-4000-8000-000000000001',PB='30000000-0000-4000-8000-000000000002';
const payload=()=>({instance_id:A,organization_id:OA,store_domain:'a.go03t.invalid',idempotency_key:randomUUID(),customer_name:'GO03T synthetic fixture',customer_phone:'11999999999',fulfillment:'PICKUP',payment_method:'PIX',expected_total:10,client_cart_reference:'c'.repeat(64),items:[{product_id:PA,selection_contract:'GROUP_ADDONS_V1',quantity:1,expected_unit_price:10,group_addon_ids:[]}]});
const orderSql='SELECT * FROM public.neroxa_commercial_checkout_atomic($1::jsonb,$2,$3)';
async function order(c,p,track='a'.repeat(64),amend='b'.repeat(64)){return (await c.query(orderSql,[p,track,amend])).rows[0];}
const nonce=()=>randomBytes(32).toString('hex');
const claimSql='SELECT public.neroxa_claim_cloudflare_grant($1,$2,$3) AS claimed';
const expiry=()=>new Date(Date.now()+300000);
async function claim(c,n,e=expiry(),binding='e'.repeat(64)){return (await c.query(claimSql,[n,e,binding])).rows[0].claimed;}
async function waitForLock(c){
 const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 return pid;
}
async function observedLock(pid){
 for(let i=0;i<75;i++){
  const row=(await owner.query('SELECT pid,wait_event_type,wait_event,state FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
  if(row?.wait_event_type==='Lock')return row;
  await new Promise(r=>setTimeout(r,20));
 }
 throw Error('No PostgreSQL lock wait observed for competing backend');
}
try{
 const admin=await connect('go03t_owner','postgres');await admin.query('CREATE DATABASE go03t_contracts');await admin.end();
 owner=await connect();
 await test('disposable database identity and socket-only listener',async()=>{
  const x=(await owner.query("SELECT current_database() db,current_user,session_user,version(),inet_server_addr() server_address,current_setting('listen_addresses') listener,current_setting('data_directory') data_directory")).rows[0];
  assert.equal(x.db,'go03t_contracts');assert.equal(x.current_user,'go03t_owner');assert.equal(x.server_address,null);assert.equal(x.listener,'');assert.equal(x.data_directory,R+'/data');
  writeFileSync(R+'/evidence/database-identity.json',JSON.stringify(x,null,2));return x;
 });
 await test('actual catalog dependencies and versioned helper functions installed',async()=>{await owner.query(readFileSync(R+'/tests/dependencies.sql','utf8'));return {pgcrypto:(await owner.query("SELECT extversion FROM pg_extension WHERE extname='pgcrypto'")).rows[0].extversion};});
 await owner.query("CREATE FUNCTION pg_temp.neroxa_go02_admitted(text,integer) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='GO02_COMMERCIAL_CHECKOUT_V1' AND $2 IN(34,35) AND nullif(current_setting('go03t.admit',true),'')::boolean $$");
 for(const [unit,name]of [[34,'34-commercial-checkout-atomic'],[35,'35-cloudflare-nonce']]){
  const source=readFileSync(R+'/contracts/'+name+'.candidate.sql','utf8');
  for(const state of ['false',''])await test(`DDL ${unit} refuses ${state||'NULL'} admission transactionally`,async()=>{
   await owner.query("SELECT set_config('go03t.admit',$1,false)",[state]);
   try{await owner.query(source);throw Error('Unadmitted DDL unexpectedly passed');}catch(e){assert.equal(e.code,'P0001');await owner.query('ROLLBACK');}
   const relation=unit===34?'private.neroxa_go02_checkout_operations':'private.neroxa_cloudflare_grant_nonces';assert.equal((await owner.query('SELECT to_regclass($1) r',[relation])).rows[0].r,null);return {sqlstate:'P0001',no_relation_created:true};
  });
  await test(`DDL ${unit} real execution with exact source hash`,async()=>{
   await owner.query("SELECT set_config('go03t.admit','true',false)");await owner.query(source);
   return {sha256:createHash('sha256').update(source).digest('hex')};
  });
 }
 await owner.query("SET neroxa.implementation_write_path='official'");
 await owner.query('INSERT INTO neroxa_organizations(id,legal_name,trade_name) VALUES($1,\'GO03T A\',\'A\'),($2,\'GO03T B\',\'B\')',[OA,OB]);
 for(const [id,org,slug]of [[A,OA,'a'],[B,OB,'b'],[A2,OA,'a2']]){
  await owner.query("INSERT INTO neroxa_system_instances(id,organization_id,name,system_type,slug,status) VALUES($1,$2,$3,'DELIVERY',$3,'ACTIVE')",[id,org,slug]);
  await owner.query("INSERT INTO neroxa_system_domains(system_instance_id,domain,status) VALUES($1,$2,'VERIFIED')",[id,slug+'.go03t.invalid']);
  await owner.query("INSERT INTO neroxa_storefront_availability(instance_id,enabled,timezone) VALUES($1,true,'UTC')",[id]);
  await owner.query("INSERT INTO neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT $1,d,'00:00','23:59:59' FROM generate_series(0,6) d",[id]);
 }
 for(const [id,inst,name]of [[PA,A,'A product'],[PB,B,'B product']])await owner.query("INSERT INTO neroxa_storefront_products(id,instance_id,name,slug,price) VALUES($1,$2,$3,$1::text,10)",[id,inst,name]);
 runtime=await connect('service_role');
 await test('technical runtime identity has no superuser or BYPASSRLS',async()=>{
  const x=(await runtime.query('SELECT current_user,session_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(x.current_user,'service_role');assert.equal(x.rolsuper,false);assert.equal(x.rolbypassrls,false);return x;
 });
 const fns=['public.neroxa_commercial_checkout_atomic(jsonb,text,text)','public.neroxa_go02_checkout_contract()','public.neroxa_claim_cloudflare_grant(text,timestamptz,text)'];
 await test('effective function ACL, owner and empty search_path',async()=>{
  const out=[];for(const f of fns){
   for(const role of ['anon','authenticated','go03t_untrusted','service_role']){const v=(await owner.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,f])).rows[0].allowed;assert.equal(v,role==='service_role');}
   const row=(await owner.query('SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=$1::regprocedure',[f])).rows[0];assert(row.proconfig.includes('search_path=""'));assert.equal(row.owner,'go03t_owner');out.push(row);
  }return out;
 });
 for(const role of ['anon','authenticated','go03t_untrusted'])await test(role+' execution actually denied with 42501',async()=>{
  const c=await connect(role);await denied(c,orderSql,[payload(),'a'.repeat(64),'b'.repeat(64)],'42501');await denied(c,claimSql,[nonce(),expiry(),'e'.repeat(64)],'42501');return {sqlstate:'42501'};
 });
 await test('private ledgers deny direct SELECT and INSERT, RLS enabled',async()=>{
  for(const t of ['private.neroxa_go02_checkout_operations','private.neroxa_cloudflare_grant_nonces']){
   assert.equal((await owner.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',[t])).rows[0].relrowsecurity,true);
   await denied(runtime,'SELECT * FROM '+t,[],'42501');await denied(runtime,'INSERT INTO '+t+' DEFAULT VALUES',[],'42501');
  }return {sqlstate:'42501'};
 });
 await test('descriptor confirms required real functions',async()=>assert.equal((await runtime.query('SELECT public.neroxa_go02_checkout_contract() tag')).rows[0].tag,'GO02_COMMERCIAL_CHECKOUT_V1'));
 for(const [name,mutate,code]of [
  ['organization mismatch',p=>p.organization_id=OB,'42501'],
  ['cross-organization instance',p=>p.instance_id=B,'42501'],
  ['same-organization different instance',p=>p.instance_id=A2,'42501'],
  ['product from another tenant',p=>p.items[0].product_id=PB,'22023'],
  ['forged unit price',p=>p.items[0].expected_unit_price=0,'PT409'],
  ['forged total',p=>p.expected_total=0,'PT409'],
  ['NULL tenant',p=>p.instance_id=null,'22023'],
  ['NULL total',p=>p.expected_total=null,'22023'],
  ['NULL quantity',p=>p.items[0].quantity=null,'22023']
 ])await test(name+' rejected without any partial writes',async()=>{const p=payload();mutate(p);const before=await counts();await denied(runtime,orderSql,[p,'a'.repeat(64),'b'.repeat(64)],code);assert.deepEqual(await counts(),before);return {sqlstate:code};});
 await test('NULL entire order and NULL capability hashes are rejected',async()=>{
  await denied(runtime,orderSql,[null,'a'.repeat(64),'b'.repeat(64)],'22023');await denied(runtime,orderSql,[payload(),null,'b'.repeat(64)],'22023');return {sqlstate:'22023'};
 });
 let first,firstPayload;
 await test('successful order commits authoritative total and both capability hashes',async()=>{
  firstPayload=payload();first=await order(runtime,firstPayload);assert.equal(Number(first.total),10);assert.equal(first.capabilities_issued,true);
  const v=(await owner.query('SELECT o.total,t.token_sha256 tracking,a.token_sha256 amendment FROM neroxa_orders o JOIN private.neroxa_tracking_capabilities t ON t.order_id=o.id JOIN private.neroxa_order_amendment_capabilities a ON a.order_id=o.id WHERE o.id=$1',[first.order_id])).rows[0];assert.equal(v.tracking,'a'.repeat(64));assert.equal(v.amendment,'b'.repeat(64));return {order_id:first.order_id,total:10,pair_confirmed:true};
 });
 await test('committed replay neither duplicates nor rotates capabilities',async()=>{
  const before=await counts();const r=await order(runtime,firstPayload,'c'.repeat(64),'d'.repeat(64));assert.equal(r.order_id,first.order_id);assert.equal(r.capabilities_issued,false);assert.deepEqual(await counts(),before);
  assert.equal((await owner.query('SELECT token_sha256 FROM private.neroxa_tracking_capabilities WHERE order_id=$1',[first.order_id])).rows[0].token_sha256,'a'.repeat(64));return {same_order:true,no_reissue:true};
 });
 await test('same key with divergent payload is PT409',async()=>{await denied(runtime,orderSql,[{...firstPayload,customer_name:'changed'},'a'.repeat(64),'b'.repeat(64)],'PT409');return {sqlstate:'PT409'};});
 await test('expired replay and reconciliation fence reject with PT410',async()=>{
  await owner.query("UPDATE private.neroxa_group_order_intents SET recovery_expires_at=clock_timestamp()-interval '1 second' WHERE order_id=$1",[first.order_id]);await denied(runtime,orderSql,[firstPayload,'a'.repeat(64),'b'.repeat(64)],'PT410');
  const p=payload(),actor=randomUUID();await owner.query('INSERT INTO auth.users(id) VALUES($1)',[actor]);await owner.query("INSERT INTO private.neroxa_checkout_reconciliation(instance_id,checkout_key,outcome,actor_id) VALUES($1,$2,'FENCED_ABSENT',$3)",[A,p.idempotency_key,actor]);await denied(runtime,orderSql,[p,'a'.repeat(64),'b'.repeat(64)],'PT410');return {sqlstate:'PT410'};
 });
 await test('closed storefront fails before order write',async()=>{const before=await counts();await owner.query('UPDATE neroxa_storefront_availability SET enabled=false WHERE instance_id=$1',[A]);try{await denied(runtime,orderSql,[payload(),'a'.repeat(64),'b'.repeat(64)],'PT423');assert.deepEqual(await counts(),before);}finally{await owner.query('UPDATE neroxa_storefront_availability SET enabled=true WHERE instance_id=$1',[A]);}return {sqlstate:'PT423'};});
 await owner.query("CREATE FUNCTION public.go03t_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('go03t.fail_stage',true)=TG_ARGV[0] THEN RAISE EXCEPTION 'GO03T injected fault' USING ERRCODE='XX001'; END IF; RETURN NEW; END $$");
 for(const [stage,table]of [['items','public.neroxa_order_items'],['ledger','private.neroxa_go02_checkout_operations'],['amendment','private.neroxa_order_amendment_capabilities']]){
  await owner.query(`CREATE TRIGGER go03t_fault AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.go03t_fail('${stage}')`);
  await test('intermediate '+stage+' fault rolls back ALL rows and allows same-key retry',async()=>{
   const before=await counts(),p=payload();await runtime.query('BEGIN');await runtime.query("SELECT set_config('go03t.fail_stage',$1,true)",[stage]);await denied(runtime,orderSql,[p,'a'.repeat(64),'b'.repeat(64)],'XX001');await denied(runtime,'SELECT 1',[],'25P02');await runtime.query('ROLLBACK');assert.deepEqual(await counts(),before);
   const r=await order(runtime,p);assert.equal(r.capabilities_issued,true);return {injected_sqlstate:'XX001',transaction_aborted:'25P02',all_seven_table_counts_restored:true,retry_committed:true};
  });
  await owner.query(`DROP TRIGGER go03t_fault ON ${table}`);
 }
 await owner.query('DROP FUNCTION public.go03t_fail()');
 await test('two real sessions serialize checkout and commit exactly once',async()=>{
  const a=await connect('service_role'),b=await connect('service_role'),p=payload();const pid=await waitForLock(b);await a.query('BEGIN');const x=await order(a,p);const pending=order(b,p,'c'.repeat(64),'d'.repeat(64));const lock=await observedLock(pid);await a.query('COMMIT');const y=await pending;
  assert.equal(x.order_id,y.order_id);assert.equal(x.capabilities_issued,true);assert.equal(y.capabilities_issued,false);assert.equal((await owner.query('SELECT count(*)::int n FROM neroxa_orders WHERE instance_id=$1 AND idempotency_key=$2',[A,p.idempotency_key])).rows[0].n,1);return {lock_wait:lock,one_order:true,one_issuance:true};
 });
 await test('quota sixth attempt denied and failing increments rolled back',async()=>{
  for(let i=0;i<5;i++)assert.equal((await runtime.query('SELECT neroxa_checkout_reserve_quota($1,$2) ok',[A,'f'.repeat(64)])).rows[0].ok,true);
  await denied(runtime,'SELECT neroxa_checkout_reserve_quota($1,$2)',[A,'f'.repeat(64)],'PT429');const rows=(await owner.query('SELECT scope,attempts FROM private.neroxa_checkout_quota_counters WHERE instance_id=$1 ORDER BY scope',[A])).rows;assert.deepEqual(rows.map(r=>r.attempts),[5,5]);return {sqlstate:'PT429',counter_attempts:[5,5]};
 });
 for(const [name,args]of [
  ['NULL nonce',[null,expiry(),'e'.repeat(64)]],['malformed nonce',['invalid',expiry(),'e'.repeat(64)]],['NULL expiry',[nonce(),null,'e'.repeat(64)]],['expired nonce',[nonce(),new Date(Date.now()-1000),'e'.repeat(64)]],['far future nonce',[nonce(),new Date(Date.now()+3600000),'e'.repeat(64)]],['infinite expiry',[nonce(),'infinity','e'.repeat(64)]],['NULL binding',[nonce(),expiry(),null]]
 ])await test(name+' safely denied',async()=>denied(runtime,claimSql,args,'42501'));
 await test('simultaneous nonce claims have exactly one committed winner',async()=>{const a=await connect('service_role'),b=await connect('service_role'),n=nonce();const x=await Promise.all([claim(a,n),claim(b,n)]);assert.equal(x.filter(v=>v===true).length,1);assert.equal(x.filter(v=>v===false).length,1);assert.equal(await claim(runtime,n,expiry(),'f'.repeat(64)),false);return {results:x,replay_different_binding:false};});
 await test('claim rollback releases nonce for a competing real session',async()=>{
  const a=await connect('service_role'),b=await connect('service_role'),n=nonce();const pid=await waitForLock(b);await a.query('BEGIN');assert.equal(await claim(a,n),true);const pending=claim(b,n);const lock=await observedLock(pid);await a.query('ROLLBACK');assert.equal(await pending,true);assert.equal(await claim(runtime,n),false);return {lock_wait:lock,rollback_released_claim:true,committed_replay_denied:true};
 });
 await test('full fixture transaction rollback restores all checkout table counts',async()=>{
  const before=await counts();await runtime.query('BEGIN');assert.equal((await order(runtime,payload())).capabilities_issued,true);await runtime.query('ROLLBACK');assert.deepEqual(await counts(),before);return {rollback:'confirmed',all_seven_table_counts_restored:true};
 });
 writeFileSync(R+'/evidence/executed-contracts.json',JSON.stringify(['34-commercial-checkout-atomic','35-cloudflare-nonce'].map(n=>({file:n+'.candidate.sql',sha256:createHash('sha256').update(readFileSync(R+'/contracts/'+n+'.candidate.sql')).digest('hex')})),null,2));
 console.log('ALL_FOCAL_SQL_TESTS_PASS='+results.length);
}finally{
 await Promise.allSettled(clients.map(c=>c.end()));
}
