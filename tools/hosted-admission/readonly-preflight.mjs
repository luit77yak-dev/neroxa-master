import fs from 'node:fs';
import path from 'node:path';
import {CapturedSession} from './session.mjs';
import {verifyGrant,sha256,AdmissionBlocked,PROJECT} from '../../delivery-candidate/src/server/hosted-release-core.mjs';
import {READ_IDENTITY,READ_CATALOG,TIMEOUT,WAIT,observeTarget} from './preflight-queries.mjs';

const blocked = reason=>{throw new AdmissionBlocked(reason);};
const freeze = x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const forbidden = new Set(['postgres','supabase_admin','service_role','anon','authenticated','authenticator']);

/** This scope cannot authorize UnitAdmission, SQL_RELEASE or a server deployment. */
export function checkPreflight(policy,context,approval,caBytes,now=Date.now()) {
 if(policy?.state!=='ADMITTED_FOR_PREFLIGHT'||policy.project!==PROJECT||policy.transport!=='SUPAVISOR_SESSION'||policy.port!==5432||!policy.host?.endsWith('.pooler.supabase.com')||!/^[a-z0-9.-]+$/.test(policy.host)||!/^[a-z][a-z0-9_]{0,62}$/.test(policy.role??'')||forbidden.has(policy.role)||!/^[a-f0-9]{64}$/.test(policy.caSha256??''))blocked('Preflight policy CLOSED/invalid');
 if(context?.event!=='workflow_dispatch'||context.runAttempt!=='1'||context.refProtected!==true||context.ref!==policy.ref||context.environment!==policy.environment||policy.environment!=='f02-hosted-preflight'||!/^\d+$/.test(context.runId??'')||!/^[a-f0-9]{40}$/.test(context.commit??'')||!policy.founderLogin)blocked('Manual protected context required');
 const grant=verifyGrant(approval,policy.authority,'HOSTED_PREFLIGHT',now),p=grant.payload;
 if(p.host!==policy.host||p.role!==policy.role||p.caSha256!==policy.caSha256||p.transport!==policy.transport||p.port!==5432||p.commit!==context.commit||p.ref!==context.ref||p.runId!==context.runId||p.runAttempt!=='1'||p.environment!==policy.environment||p.founder!==policy.founderLogin||p.operator!==context.actor||!Array.isArray(p.operations)||JSON.stringify([...p.operations].sort())!==JSON.stringify(['cancel','catalog','identity','timeout'])||!Number.isSafeInteger(p.maxDurationMs)||p.maxDurationMs<1||p.maxDurationMs>120000)blocked('Signed preflight identity/destination/attempt mismatch');
 if(sha256(Buffer.from(caBytes))!==policy.caSha256)blocked('CA bytes changed/unapproved');
 return grant;
}

export function validateIdentity(row,role,previous,now=Date.now()) {
 if(row?.db!=='postgres'||row.actor!==role||row.session_actor!==role||row.read_only!=='on'||row.ssl!==true||!/^TLSv1\.[23]$/.test(row.tls??'')||!Number.isSafeInteger(row.pid)||row.pid<=0||!Number.isFinite(Date.parse(row.start))||Math.abs(Date.parse(row.clock)-now)>5000||row.role?.rolcanlogin!==true||row.database_create!==false)blocked('Observed read session not admitted');
 for(const k of ['rolsuper','rolbypassrls','rolcreaterole','rolcreatedb','rolreplication','rolinherit'])if(row.role[k]!==false)blocked('Privileged/inheriting login rejected');
 for(const k of ['memberships','owns_business','business_write','business_read','definer_execute','schema_create'])if(!Number.isSafeInteger(row[k])||row[k]!==0)blocked('Effective privileges exceed catalog-only preflight');
 if(previous&&(row.pid!==previous.pid||row.start!==previous.start))blocked('Session reconnected/replaced');
 return freeze(structuredClone(row));
}

/** stdout has an exact stage ledger; SQLSTATE success alone is never cancellation proof. */
export function parseStages(bytes,expected) {
 const original=Buffer.from(bytes),digest=sha256(original),text=original.toString('utf8');
 if(!Buffer.from(text).equals(original))blocked('Invalid UTF-8 response');
 const states=[],rows=[];
 for(const line of text.split('\n').filter(x=>x.length)) {
  const m=/^NEROXA_STAGE_(\d+)_([0-9A-Z]{5})$/.exec(line);
  if(m){if(Number(m[1])!==states.length)blocked('Stage missing/duplicated/reordered');states.push(m[2]);}
  else rows.push(line);
 }
 if(JSON.stringify(states)!==JSON.stringify(expected)||sha256(original)!==digest)blocked('Unexpected/incomplete SQLSTATE ledger');
 return {rows:Object.freeze(rows),states:Object.freeze(states)};
}

function jsonRow(result) {
 if(result.rows.length!==1)blocked('Expected exactly one observation');
 try{return JSON.parse(result.rows[0]);}catch{blocked('Invalid observation JSON');}
}

/** No imports or constructors here open a connection. Only this explicit call can. */
export async function runReadOnlyPreflight({policy,context,approval,caBytes,evidenceRoot,credentialProvider,now=Date.now,makeTransport=(spec,root)=>new CapturedSession(spec,root,{timeoutMs:10000,maxBytes:65536}),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 // Canonical private copies before any callback; test dependency injection is not an env API.
 policy=freeze(structuredClone(policy));context=freeze(structuredClone(context));approval=Buffer.from(approval??'');caBytes=Buffer.from(caBytes??'');
 const initial=checkPreflight(policy,context,approval,caBytes,now()),began=performance.now();
 const guard=()=>{const g=checkPreflight(policy,context,approval,caBytes,now());if(g.receiptSha256!==initial.receiptSha256||performance.now()-began>=g.payload.maxDurationMs)blocked('Preflight deadline/approval changed');return g;};
 const password=await credentialProvider();guard();
 if(typeof password!=='string'||!password||Buffer.byteLength(password)>4096||/[\r\n\0]/.test(password))blocked('Credential unavailable/invalid');
 fs.mkdirSync(evidenceRoot,{recursive:true,mode:0o700});const st=fs.statSync(evidenceRoot);
 if(st.uid!==process.getuid()||(st.mode&0o077))blocked('Private evidence root required');
 const claim=path.join(evidenceRoot,initial.payload.nonce+'.reserved');
 fs.writeFileSync(claim,JSON.stringify({receiptSha256:initial.receiptSha256,runId:context.runId,commit:context.commit,state:'RESERVED; no retry'}),{flag:'wx',mode:0o600});
 const work=fs.mkdtempSync(path.join(evidenceRoot,'preflight-')),caPath=path.join(work,'ca.pem'),passPath=path.join(work,'pgpass');
 fs.writeFileSync(caPath,caBytes,{flag:'wx',mode:0o600});
 const esc=s=>s.replaceAll('\\','\\\\').replaceAll(':','\\:');
 const login=policy.role+'.'+PROJECT;
 fs.writeFileSync(passPath,[policy.host,'5432','postgres',login,password].map(esc).join(':')+'\n',{flag:'wx',mode:0o600});
 const env={PATH:process.env.PATH,PGHOST:policy.host,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:login,PGSSLMODE:'verify-full',PGSSLROOTCERT:caPath,PGPASSFILE:passPath,PGCONNECT_TIMEOUT:'5',PGAPPNAME:'neroxa-f02-preflight-'+context.runId};
 const spec=freeze({command:'psql',args:['-X','--no-password','-q','-A','-t','-v','ON_ERROR_STOP=0','-v','VERBOSITY=verbose'],env});
 let a,b,uncertain=false,sequence=0,previousReceipt=null,totalCaptured=0;
 const call=async(port,sql,expected)=>{guard();if(port.blocked)blocked('Captured session BLOCKED');const r=await port.query(sql);guard();if(port.blocked||r.receipt?.complete!==true)blocked('Incomplete response');const bytes=Buffer.from(r.bytes),out=fs.readFileSync(r.receipt.stdout),err=fs.readFileSync(r.receipt.stderr);
  if(out.length!==r.receipt.stdoutBytes||sha256(out)!==r.receipt.stdoutSha256||err.length!==r.receipt.stderrBytes||sha256(err)!==r.receipt.stderrSha256||!out.subarray(0,bytes.length).equals(bytes)||!/^NEROXA_FRAME_[a-f0-9]{48}\n$/.test(out.subarray(bytes.length).toString()))blocked('Raw capture/interpretation integrity');
  totalCaptured+=out.length+err.length;if(totalCaptured>65536||++sequence>32)blocked('Aggregate preflight capture budget');
  const ledger=Buffer.from(JSON.stringify({...r.receipt,sequence,previousReceipt,requestSha256:sha256(Buffer.from(sql))}));
  const file=path.join(work,String(sequence).padStart(4,'0')+'.receipt.json');fs.writeFileSync(file,ledger,{flag:'wx',mode:0o600});
  if(!fs.readFileSync(file).equals(ledger))blocked('Receipt reread integrity');previousReceipt=sha256(ledger);
  return {...parseStages(bytes,expected),stderr:Buffer.from(err)};};
 try {
  guard();a=makeTransport(spec,path.join(work,'A'));guard();b=makeTransport(freeze(structuredClone(spec)),path.join(work,'B'));guard();
  const priorA=validateIdentity(jsonRow(await call(a,READ_IDENTITY,['00000','00000','00000'])),policy.role,undefined,now());
  const priorB=validateIdentity(jsonRow(await call(b,READ_IDENTITY,['00000','00000','00000'])),policy.role,undefined,now());
  if(priorA.pid===priorB.pid)blocked('Two simultaneous distinct sessions required');
  const catalog=jsonRow(await call(a,READ_CATALOG,['00000','00000','00000']));
  const timeout=await call(a,TIMEOUT,['00000','00000','57014','00000']);
  if(timeout.rows.length||! /ERROR:\s+57014:\s+canceling statement due to statement timeout/.test(timeout.stderr.toString()))blocked('Timeout cause not authenticated by captured error');
  validateIdentity(jsonRow(await call(a,READ_IDENTITY,['00000','00000','00000'])),policy.role,priorA,now());
  const afterTimeout=jsonRow(await call(b,observeTarget(priorA,policy.role),['00000','00000','00000']));
  if(afterTimeout.wait_active!==false||afterTimeout.state!=='idle'||afterTimeout.transaction_open!==false)blocked('Timeout termination not independently observed');
  // Starts one harmless wait. Attach the rejection immediately so failure cannot be lost.
  const pending=call(a,WAIT,['00000','00000','57014','00000']).then(value=>({value}),error=>({error}));
  let active=false;
  for(let i=0;i<10;i++) {
   guard();const x=jsonRow(await call(b,observeTarget(priorA,policy.role),['00000','00000','00000']));
   if(x.wait_active===true){active=true;break;}await wait(50);guard();
  }
  if(!active)blocked('Authorized wait not observed; no signal sent');
  const cancel=await call(b,observeTarget(priorA,policy.role,true),['00000','00000','00000']);
  if(JSON.stringify(cancel.rows)!=='["t"]')blocked('Cancellation target/request not confirmed');
  const end=await pending;if(end.error)throw end.error;if(end.value.rows.length||! /ERROR:\s+57014:\s+canceling statement due to user request/.test(end.value.stderr.toString()))blocked('Cancellation cause not authenticated by captured error');
  validateIdentity(jsonRow(await call(a,READ_IDENTITY,['00000','00000','00000'])),policy.role,priorA,now());
  validateIdentity(jsonRow(await call(b,READ_IDENTITY,['00000','00000','00000'])),policy.role,priorB,now());
  const afterCancel=jsonRow(await call(b,observeTarget(priorA,policy.role),['00000','00000','00000']));
  if(afterCancel.wait_active!==false||afterCancel.state!=='idle'||afterCancel.transaction_open!==false)blocked('Cancellation completion not independently observed');
  guard();
  return freeze({scope:'HOSTED_PREFLIGHT ONLY; not migration',identity:'PASS',tls:'PASS; configured libpq verify-full and observed TLS, contingent on real transport',timeout:'PASS',cancellation:'PASS',catalog,catalogReadiness:catalog?.some(x=>!x.present)?'BLOCKED':'REQUIRES_SEPARATE_REVIEW',receiptSha256:initial.receiptSha256,runId:context.runId,rawCaptureRoot:work,receiptChain:previousReceipt,custody:'LOCAL ONLY; external recovery not established'});
 } catch(e) {uncertain=true;throw new AdmissionBlocked('Preflight BLOCKED; retained evidence; no retry or server cleanup');}
 finally {
  // Only close our clients and remove the local credential. Never server teardown,
  // role revocation, artifact upload or evidence deletion; none imply server cancellation.
  let closeFailed=false;for(const p of [a,b])try{p?.close();}catch{closeFailed=true;}
  try{fs.unlinkSync(passPath);}catch{closeFailed=true;}
  fs.writeFileSync(path.join(work,'FINAL.json'),JSON.stringify({state:uncertain?'BLOCKED; server state may require observation':'CLIENTS_CLOSED; no server cleanup',remoteCleanup:false,serverTerminationConfirmed:false,localCloseFailed:closeFailed}),{flag:'wx',mode:0o600});
  if(closeFailed)blocked('Local closure/credential removal uncertain; HOLD');
 }
}
