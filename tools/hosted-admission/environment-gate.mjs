import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

/** Read-only API metadata is necessary; absence or unknown protection is BLOCKED. */
export function validateEnvironment(policy,environment) {
 if(policy?.state!=='ADMITTED_FOR_PREFLIGHT'||!policy.founderLogin||!policy.ref?.startsWith('refs/heads/')||policy.environment!=='f02-hosted-preflight')throw Error('Nominal policy CLOSED');
 if(environment?.name!==policy.environment||environment.can_admins_bypass!==false||environment.deployment_branch_policy?.protected_branches!==true||environment.deployment_branch_policy?.custom_branch_policies!==false)throw Error('Environment/ref protection not demonstrated');
 const review=environment.protection_rules?.find(x=>x.type==='required_reviewers');
 if(typeof review?.prevent_self_review!=='boolean'||review.reviewers?.length!==1||review.reviewers[0].type!=='User'||review.reviewers[0].reviewer?.login!==policy.founderLogin)throw Error('Exclusive founder approval not enforced');
 return Object.freeze({environment:policy.environment,ref:policy.ref,status:'PROTECTION_METADATA_VERIFIED; actual approval still required'});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  const policy=JSON.parse(fs.readFileSync('tools/hosted-admission/preflight-policy.json'));
  if(process.argv[2]==='--policy-only') {
   if(policy.state!=='ADMITTED_FOR_PREFLIGHT'||!policy.ref||!policy.founderLogin)throw Error('CLOSED');
  } else {
   const result=validateEnvironment(policy,JSON.parse(fs.readFileSync(process.argv[2])));
   if(process.env.GITHUB_REF!==result.ref||process.env.GITHUB_REF_PROTECTED!=='true'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('Manual protected first attempt required');
   console.log('F02_ENVIRONMENT_METADATA=VERIFIED; founder approval still required');
  }
 } catch {console.error('F02_ENVIRONMENT=BLOCKED; no credentials or connections accessed');process.exitCode=78;}
}
