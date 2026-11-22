// Public output is limited to enumerated labels. Never serialize an Error or SQL.
const stages=new Set(['ENTRY','TRANSPORT_CREATE','IDENTITY_A','IDENTITY_B','CATALOG','TIMEOUT','IDENTITY_AFTER_TIMEOUT','OBSERVE_TIMEOUT','WAIT','OBSERVE_WAIT','CANCEL','WAIT_COMPLETION','FINAL_IDENTITY_A','FINAL_IDENTITY_B','OBSERVE_CANCEL','FINAL_GUARD','CLEANUP']);
const reasons=new Map([
 ['Preflight policy CLOSED/invalid','POLICY_INVALID'],['Manual protected context required','CONTEXT_INVALID'],['Sole owner actor required','ACTOR_INVALID'],
 ['Approval size','GRANT_SIZE'],['Authority/policy not admitted','AUTHORITY_INVALID'],['Unpinned authority','AUTHORITY_PIN'],['Envelope encoding','GRANT_ENCODING'],['Payload encoding','GRANT_ENCODING'],['Approval signature','GRANT_SIGNATURE'],['Malformed approval','GRANT_FORMAT'],['Approval scope/window','GRANT_SCOPE_WINDOW'],
 ['Signed preflight identity/destination/attempt mismatch','GRANT_BINDING'],['CA bytes changed/unapproved','CA_HASH'],['Preflight deadline/approval changed','DEADLINE'],['Credential unavailable/invalid','CREDENTIAL_FORMAT'],['Private evidence root required','EVIDENCE_PERMISSIONS'],
 ['Transport start failed','TRANSPORT_START'],['Session ended/commit uncertain','TRANSPORT_ENDED'],['Submission pipe failed/commit uncertain','TRANSPORT_PIPE'],['Deadline; server cancellation NOT confirmed','TRANSPORT_TIMEOUT'],['Captured session BLOCKED','TRANSPORT_BLOCKED'],['Session BLOCKED/busy','TRANSPORT_BLOCKED'],
 ['Unexpected/incomplete SQLSTATE ledger','SQLSTATE_LEDGER'],['Stage missing/duplicated/reordered','SQLSTATE_LEDGER'],['Observed read session not admitted','IDENTITY_INVALID'],['Privileged/inheriting login rejected','ROLE_PRIVILEGES'],['Effective privileges exceed catalog-only preflight','EFFECTIVE_PRIVILEGES'],['Session reconnected/replaced','SESSION_CHANGED'],['Expected exactly one observation','ROW_COUNT'],['Invalid observation JSON','ROW_FORMAT'],
 ['Raw capture/interpretation integrity','CAPTURE_INTEGRITY'],['Incomplete response','CAPTURE_INCOMPLETE'],['Timeout cause not authenticated by captured error','TIMEOUT_PROOF'],['Timeout termination not independently observed','TIMEOUT_OBSERVATION'],['Authorized wait not observed; no signal sent','WAIT_NOT_OBSERVED'],['Cancellation target/request not confirmed','CANCEL_NOT_CONFIRMED'],['Cancellation cause not authenticated by captured error','CANCEL_PROOF'],['Cancellation completion not independently observed','CANCEL_OBSERVATION'],['Local closure/credential removal uncertain; HOLD','CLEANUP_UNCERTAIN']
]);
const sqlstates=new Set(['28P01','28000','42501','08001','08006','3D000','53300','57P01','57014','42601','42883','42P01','25P02']);
const osCodes=new Set(['ENOENT','EACCES','EEXIST','ENOSPC','EMFILE','EPIPE']);
const tagged=new WeakMap();
function ownString(e,key){try{const d=Object.getOwnPropertyDescriptor(e??{},key);return typeof d?.value==='string'?d.value:undefined;}catch{return undefined;}}
export function sqlstateOnly(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>65536)return 'NOT_OBSERVED';
 const found=[...bytes.toString('utf8').matchAll(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/g)].map(m=>m[1]);
 const distinct=[...new Set(found)];return distinct.length===1&&sqlstates.has(distinct[0])?distinct[0]:'NOT_OBSERVED';
}
export function safeDiagnostic(error,stage='ENTRY',sqlstate='NOT_OBSERVED'){
 const prior=error&&typeof error==='object'?tagged.get(error):undefined;
 if(prior)return {...prior};
 const code=reasons.get(ownString(error,'message'))??(osCodes.has(ownString(error,'code'))?ownString(error,'code'):'UNCLASSIFIED');
 return {stage:stages.has(stage)?stage:'ENTRY',code,sqlstate:sqlstates.has(sqlstate)?sqlstate:'NOT_OBSERVED'};
}
export function tagDiagnostic(error,source,stage,sqlstate){tagged.set(error,Object.freeze(safeDiagnostic(source,stage,sqlstate)));return error;}
