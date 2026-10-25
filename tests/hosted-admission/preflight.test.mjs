import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';import {generateKeyPairSync,sign} from 'node:crypto';
import {checkPreflight,validateIdentity,parseStages,runReadOnlyPreflight} from '../../tools/hosted-admission/readonly-preflight.mjs';
import {validateEnvironment} from '../../tools/hosted-admission/environment-gate.mjs';
import {observeTarget} from '../../tools/hosted-admission/preflight-queries.mjs';
import {CapturedSession} from '../../tools/hosted-admission/session.mjs';
import {canonical,sha256,PROJECT,RELEASE,verifyGrant} from '../../delivery-candidate/src/server/hosted-release-core.mjs';

// TEST authority/host/role/CA. No operational credentials or approvals are produced.
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const ca=Buffer.from('SYNTHETIC CA; not a real certificate');
const policy={state:'ADMITTED_FOR_PREFLIGHT',project:PROJECT,environment:'f02-hosted-preflight',transport:'SUPAVISOR_SESSION',port:5432,host:'synthetic.pooler.supabase.com',role:'synthetic_preflight',caSha256:sha256(ca),ref:'refs/heads/synthetic-protected',founderLogin:'SYNTHETIC_FOUNDER',authority:{publicKeyPem:publicKey.export({format:'pem',type:'spki'}),keySha256:sha256(publicKey.export({format:'der',type:'spki'})),maxValidityMs:120000}};
const context={event:'workflow_dispatch',runAttempt:'1',runId:'123',ref:policy.ref,refProtected:true,commit:'a'.repeat(40),actor:'SYNTHETIC_OPERATOR',environment:policy.environment};
const now=Date.now();
const payload={version:1,scope:'HOSTED_PREFLIGHT',project:PROJECT,release:RELEASE,founder:policy.founderLogin,operator:context.actor,nonce:'b'.repeat(64),notBefore:now-1000,expires:now+110000,host:policy.host,role:policy.role,caSha256:policy.caSha256,transport:policy.transport,port:5432,commit:context.commit,ref:context.ref,runId:context.runId,runAttempt:'1',environment:policy.environment,operations:['identity','catalog','timeout','cancel'],maxDurationMs:30000};
const receipt=p=>{const b=Buffer.from(canonical(p));return Buffer.from(canonical({payload:b.toString('base64'),signature:sign(null,b,privateKey).toString('base64')}));};
const approval=receipt(payload),root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'neroxa-readonly-artificial-'));
const identity={db:'postgres',actor:policy.role,session_actor:policy.role,pid:1001,start:new Date(now-1000).toISOString(),clock:new Date(now).toISOString(),read_only:'on',ssl:true,tls:'TLSv1.3',role:{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolinherit:false,rolcanlogin:true},database_create:false,schema_create:0,memberships:0,owns_business:0,business_write:0,business_read:0,definer_execute:0};

test('nominal dedicated role/pooler policy verifies while shipped policy remains CLOSED',()=>{
 assert.equal(checkPreflight(policy,context,approval,ca,now).payload.role,policy.role);
 const closed=JSON.parse(fs.readFileSync(new URL('../../tools/hosted-admission/preflight-policy.json',import.meta.url)));
 assert.throws(()=>checkPreflight(closed,context,approval,ca,now));
});
test('preflight scope cannot authorize migration, server or wrong project/release',()=>{
 assert.throws(()=>verifyGrant(approval,policy.authority,'SQL_RELEASE',now));
 for(const change of [{scope:'SQL_RELEASE'},{scope:'HOSTED_SERVER'},{project:'other'},{release:'0'.repeat(64)}])assert.throws(()=>checkPreflight(policy,context,receipt({...payload,...change}),ca,now));
});
test('destination, identity, CA, session mode, commit and attempt all require signature binding',()=>{
 for(const change of [{host:'other.pooler.supabase.com'},{role:'postgres'},{caSha256:'0'.repeat(64)},{transport:'TRANSACTION'},{port:6543},{commit:'c'.repeat(40)},{runId:'124'},{runAttempt:'2'},{operator:'other'},{operations:['identity']}])assert.throws(()=>checkPreflight(policy,context,receipt({...payload,...change}),ca,now));
 assert.throws(()=>checkPreflight(policy,context,approval,Buffer.from('changed'),now));
});
test('automatic events, unprotected refs, other environment and expiry are denied',()=>{
 for(const change of [{event:'push'},{runAttempt:'2'},{refProtected:false},{ref:'refs/heads/other'},{environment:'Production'}])assert.throws(()=>checkPreflight(policy,{...context,...change},approval,ca,now));
 assert.throws(()=>checkPreflight(policy,context,approval,ca,payload.expires));
});
test('native identity validation rejects privilege escalation, PUBLIC paths, wrong role and reconnect',()=>{
 assert.equal(validateIdentity(identity,policy.role,undefined,now).actor,policy.role);
 for(const change of [{actor:'postgres'},{session_actor:'postgres'},{read_only:'off'},{ssl:false},{tls:'TLSv1.1'},{memberships:1},{database_create:true},{schema_create:1},{owns_business:1},{business_read:1},{business_write:1},{definer_execute:1},{business_read:null},{clock:new Date(now-6000).toISOString()}])assert.throws(()=>validateIdentity({...identity,...change},policy.role,undefined,now));
 for(const k of ['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','rolinherit'])assert.throws(()=>validateIdentity({...identity,role:{...identity.role,[k]:true}},policy.role,undefined,now));
 assert.throws(()=>validateIdentity({...identity,pid:1003},policy.role,identity,now));
});
test('missing, duplicated and wrong SQLSTATE cannot become timeout/cancellation PASS',()=>{
 const bytes=Buffer.from('NEROXA_STAGE_0_00000\nNEROXA_STAGE_1_57014\n');
 assert.deepEqual(parseStages(bytes,['00000','57014']).states,['00000','57014']);
 for(const b of ['NEROXA_STAGE_1_57014\n','NEROXA_STAGE_0_00000\nNEROXA_STAGE_0_00000\n','NEROXA_STAGE_0_00000\nNEROXA_STAGE_1_00000\n'])assert.throws(()=>parseStages(Buffer.from(b),['00000','57014']));
});
test('cancel target is restricted to observed PID/start, same role and exact harmless wait',()=>{
 const sql=observeTarget(identity,policy.role,true);assert.match(sql,/a.usename=current_user/);assert.match(sql,/a.backend_start=/);assert.match(sql,/a.pid<>pg_catalog.pg_backend_pid/);assert.match(sql,/a.query='SELECT pg_catalog.pg_sleep\(4\);'/);
 assert.throws(()=>observeTarget({...identity,pid:'1001;DROP'},policy.role,true));
 assert.throws(()=>observeTarget({...identity,start:"';SELECT"},policy.role,true));
});
const environment={name:policy.environment,can_admins_bypass:false,deployment_branch_policy:{protected_branches:true,custom_branch_policies:false},protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User',reviewer:{login:policy.founderLogin}}]}]};
test('environment requires founder approval, branch protection and no admin bypass',()=>{
 assert.equal(validateEnvironment(policy,environment).environment,policy.environment);
 assert.equal(validateEnvironment(policy,{...environment,protection_rules:[{...environment.protection_rules[0],prevent_self_review:false}]}).environment,policy.environment);
 for(const change of [{name:'Production'},{can_admins_bypass:true},{can_admins_bypass:undefined},{protection_rules:[]},{deployment_branch_policy:null}])assert.throws(()=>validateEnvironment(policy,{...environment,...change}));
 assert.throws(()=>validateEnvironment(policy,{...environment,protection_rules:[{...environment.protection_rules[0],reviewers:[{type:'User',reviewer:{login:'OTHER'}}]}]}));
});
test('unapproved invocation cannot access credentials or spawn any process',async()=>{
 let credentials=0,spawned=0;await assert.rejects(()=>runReadOnlyPreflight({policy:{...policy,state:'CLOSED'},context,approval,caBytes:ca,evidenceRoot:root(),credentialProvider:async()=>{credentials++;return'NEVER';},makeTransport:()=>{spawned++;throw Error('NEVER');}}));assert.equal(credentials,0);assert.equal(spawned,0);
});
test('expiry across asynchronous credential retrieval blocks before any spawn',async()=>{
 let clock=now,spawned=0;await assert.rejects(()=>runReadOnlyPreflight({policy,context,approval,caBytes:ca,evidenceRoot:root(),now:()=>clock,credentialProvider:async()=>{clock=payload.expires;return'SYNTHETIC';},makeTransport:()=>{spawned++;throw Error('NEVER');}}));assert.equal(spawned,0);
});

const fixture=fileURLToPath(new URL('./fake-preflight-child.mjs',import.meta.url));
async function artificial(mode='positive',evidenceRoot=root()) {
 const channel=path.join(evidenceRoot,'fixture-channel'),start=new Date().toISOString();let count=0;const specifications=[];
 const result=await runReadOnlyPreflight({policy,context,approval,caBytes:ca,evidenceRoot,credentialProvider:async()=>'SYNTHETIC PASSWORD:DO NOT LOG',makeTransport:(spec,dir)=>{
  specifications.push(spec);const side=count++===0?'A':'B';
  assert.equal(spec.env.PGHOST,policy.host);assert.equal(spec.env.PGUSER,policy.role+'.'+PROJECT);assert.equal(spec.env.PGSSLMODE,'verify-full');assert.ok(!JSON.stringify(spec.args).includes('PASSWORD'));assert.equal(spec.env.PGPASSWORD,undefined);assert.equal(spec.env.F02_PREFLIGHT_PASSWORD,undefined);
  const port=new CapturedSession({command:process.execPath,args:[fixture],env:{PATH:process.env.PATH,TEST_CHANNEL:channel,TEST_SIDE:side,TEST_MODE:mode,TEST_ROLE:policy.role,TEST_START:start}},dir,{timeoutMs:2000});
  if(mode==='tamperParsed'){const query=port.query.bind(port);port.query=async sql=>{const r=await query(sql);r.bytes[0]^=1;return r;};}
  return port;
 }});
 return {result,specifications,evidenceRoot};
}
test('ARTIFICIAL ONLY: two processes prove controller completion, exclusive capture and credential removal',async()=>{
 const {result,specifications,evidenceRoot}=await artificial();assert.equal(result.cancellation,'PASS');assert.equal(result.catalogReadiness,'BLOCKED');assert.equal(specifications.length,2);
 assert.equal(fs.existsSync(specifications[0].env.PGPASSFILE),false);assert.ok(fs.existsSync(result.rawCaptureRoot));
 const ledgerFiles=fs.readdirSync(result.rawCaptureRoot).filter(x=>/^\d{4}\.receipt\.json$/.test(x)).sort();let previous=null;for(const f of ledgerFiles){const bytes=fs.readFileSync(path.join(result.rawCaptureRoot,f));const rec=JSON.parse(bytes);assert.equal(rec.previousReceipt,previous);assert.equal(sha256(fs.readFileSync(rec.stdout)),rec.stdoutSha256);assert.equal(sha256(fs.readFileSync(rec.stderr)),rec.stderrSha256);previous=sha256(bytes);}assert.equal(previous,result.receiptChain);
 await assert.rejects(()=>artificial('positive',evidenceRoot)); // reserved nonce cannot be reused
});
test('ARTIFICIAL ONLY: privileged identity blocks rather than trying a fallback role',async()=>{await assert.rejects(()=>artificial('bypass'));});
test('ARTIFICIAL ONLY: pg_cancel_backend true without SQLSTATE cancellation is rejected',async()=>{const r=root();await assert.rejects(()=>artificial('booleanOnly',r));const w=fs.readdirSync(r).find(x=>x.startsWith('preflight-'));assert.match(fs.readFileSync(path.join(r,w,'A','0005.stdout'),'utf8'),/NEROXA_STAGE_2_00000/);assert.match(fs.readFileSync(path.join(r,w,'B','0004.stdout'),'utf8'),/^t\n/);});
test('ARTIFICIAL ONLY: timeout cannot masquerade as explicit user cancellation',async()=>{const r=root();await assert.rejects(()=>artificial('wrongCause',r));const w=fs.readdirSync(r).find(x=>x.startsWith('preflight-'));assert.match(fs.readFileSync(path.join(r,w,'A','0005.stderr'),'utf8'),/due to statement timeout/);assert.match(fs.readFileSync(path.join(r,w,'B','0004.stdout'),'utf8'),/^t\n/);});
test('imports and candidate workflow expose no automatic remote trigger or migration entrypoint',()=>{
 const text=fs.readFileSync(new URL('../../audits/02a5/hosted-preflight/f02-hosted-preflight.workflow.yml',import.meta.url),'utf8');
 assert.match(text,/workflow_dispatch:/);assert.doesNotMatch(text,/^\s+(push|pull_request|schedule|workflow_run):/m);assert.match(text,/needs: admission/);assert.match(text,/environment:\n\s+name: f02-hosted-preflight/);assert.doesNotMatch(text,/run:.*(submitUnit|rehearse|supabase start|psql.*-f)/);assert.match(text,/persist-credentials: false/);
 const entry=fs.readFileSync(new URL('../../tools/hosted-admission/preflight-entry.mjs',import.meta.url),'utf8');assert.doesNotMatch(entry,/UnitAdmission|openHosted\(/);
});

test('imports are inert with subprocess and network facilities explicitly forbidden',()=>{
 const target=new URL('../../tools/hosted-admission/preflight-entry.mjs',import.meta.url).href;
 const script=`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.spawn=()=>{throw Error('FORBIDDEN SPAWN')};syncBuiltinESMExports();globalThis.fetch=()=>{throw Error('FORBIDDEN NETWORK')};await import(${JSON.stringify(target)});console.log('INERT');`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{PATH:''}});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'INERT');
});
test('actual shipped entry and environment gate exit BLOCKED without credentials',()=>{
 const here=fileURLToPath(new URL('../../',import.meta.url));
 for(const args of [['tools/hosted-admission/environment-gate.mjs','--policy-only'],['tools/hosted-admission/preflight-entry.mjs']]){
  const r=spawnSync(process.execPath,args,{cwd:here,encoding:'utf8',env:{PATH:''}});assert.equal(r.status,78);assert.match(r.stderr,/BLOCKED/);assert.equal(r.stdout,'');
 }
});

test('ARTIFICIAL ONLY: interpreted buffer cannot diverge from exclusively captured bytes',async()=>{await assert.rejects(()=>artificial('tamperParsed'));});
