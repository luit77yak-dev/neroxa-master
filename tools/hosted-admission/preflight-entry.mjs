import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runReadOnlyPreflight} from './readonly-preflight.mjs';

export async function main() {
 const policy=JSON.parse(fs.readFileSync('tools/hosted-admission/preflight-policy.json'));
 const context={event:process.env.GITHUB_EVENT_NAME,runAttempt:process.env.GITHUB_RUN_ATTEMPT,runId:process.env.GITHUB_RUN_ID,ref:process.env.GITHUB_REF,refProtected:process.env.GITHUB_REF_PROTECTED==='true',commit:process.env.GITHUB_SHA,actor:process.env.GITHUB_ACTOR,environment:process.env.F02_ENVIRONMENT};
 const result=await runReadOnlyPreflight({policy,context,approval:process.env.F02_PREFLIGHT_GRANT,caBytes:process.env.F02_PREFLIGHT_CA_PEM,evidenceRoot:path.join(process.env.RUNNER_TEMP??'/NONEXISTENT','neroxa-f02-preflight-'+context.runId),credentialProvider:async()=>process.env.F02_PREFLIGHT_PASSWORD});
 // Raw responses/credentials are never dumped into the public Actions log.
 console.log('F02_PREFLIGHT_RESULT='+JSON.stringify({scope:result.scope,identity:result.identity,tls:result.tls,timeout:result.timeout,cancellation:result.cancellation,catalogReadiness:result.catalogReadiness,receiptSha256:result.receiptSha256,runId:result.runId,custody:result.custody}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('F02_PREFLIGHT=BLOCKED; no retry; retained private evidence; server state not presumed');process.exitCode=78;});
