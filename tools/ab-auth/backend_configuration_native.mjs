// Negative configuration/build checks and public-key binding on the real disposable stack.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const work=process.env.AB_WORKDIR;
const consumer=path.resolve('delivery-consumer');
const env=Object.fromEntries(fs.readFileSync(work+'/status.private.env','utf8').split('\n').flatMap(line=>{const m=line.match(/^([A-Z_]+)="(.*)"$/);return m?[[m[1],m[2]]]:[];}));
if(new URL(env.API_URL).hostname!=='127.0.0.1')throw Error('Only disposable loopback accepted');
const {testBackend,assertServerBackend,ensureTestBackendKey,configuredStoreDomain}=await import(pathToFileURL(consumer+'/src/core/delivery/backend-configuration.ts'));
const buildEnv={...process.env,VITE_NEROXA_BACKEND_MODE:'homologation',VITE_NEROXA_TEST_BACKEND_URL:env.API_URL,VITE_NEROXA_TEST_PROJECT_REF:'local-disposable',VITE_NEROXA_TEST_PUBLISHABLE_KEY:env.ANON_KEY,VITE_SUPABASE_URL:env.API_URL,VITE_SUPABASE_PUBLISHABLE_KEY:env.ANON_KEY,NEROXA_BACKEND_MODE:'homologation',NEROXA_TEST_PROJECT_REF:'local-disposable',SUPABASE_URL:env.API_URL,SUPABASE_PUBLISHABLE_KEY:env.ANON_KEY,NEROXA_DELIVERY_BACKEND_URL:env.API_URL};
const checks=[];const check=(name,passed)=>{checks.push({name,passed});if(!passed)throw Error(name);console.log('PASS '+name);};
const config=testBackend(buildEnv);assertServerBackend(config,buildEnv);
await ensureTestBackendKey(config);check('native PostgREST validates signed public key at sole allowed backend',true);
let denied=false;try{await ensureTestBackendKey(testBackend({...buildEnv,VITE_NEROXA_TEST_PUBLISHABLE_KEY:env.ANON_KEY.split('.').slice(0,2).join('.')+'.'+crypto.randomBytes(32).toString('base64url'),VITE_SUPABASE_PUBLISHABLE_KEY:undefined}));}catch{denied=true;}check('real native PostgREST rejects foreign signature before catalog or order',denied);
for(const [name,patch] of [['private origin',{SUPABASE_URL:'https://iefaoaqzltvpfabyeelj.supabase.co'}],['private project',{NEROXA_TEST_PROJECT_REF:'foreign'}],['private mode',{NEROXA_BACKEND_MODE:undefined}],['private public-key',{SUPABASE_PUBLISHABLE_KEY:'foreign'}]]){
 let blocked=false;try{assertServerBackend(config,{...buildEnv,...patch});}catch{blocked=true;}check(name+' divergence denies SSR and privilege context',blocked);
}
for(const [name,patch] of [['missing test configuration',{VITE_NEROXA_BACKEND_MODE:undefined,VITE_NEROXA_TEST_BACKEND_URL:undefined,VITE_NEROXA_TEST_PROJECT_REF:undefined,VITE_NEROXA_TEST_PUBLISHABLE_KEY:undefined}],['server-only opt-in default build',{VITE_NEROXA_BACKEND_MODE:undefined,VITE_NEROXA_TEST_BACKEND_URL:undefined,VITE_NEROXA_TEST_PROJECT_REF:undefined,VITE_NEROXA_TEST_PUBLISHABLE_KEY:undefined}],['missing test key',{VITE_NEROXA_TEST_PUBLISHABLE_KEY:undefined}],['production URL',{VITE_NEROXA_TEST_BACKEND_URL:'https://iefaoaqzltvpfabyeelj.supabase.co'}],['foreign administrative project',{VITE_SUPABASE_URL:'https://foreign.supabase.co'}]]){
 const child={...buildEnv,...patch};for(const key of Object.keys(child))if(child[key]===undefined)delete child[key];
 const fd=fs.openSync(work+'/negative-build.private.log','a',0o600);let blocked=false;
 try{execFileSync(process.execPath,[consumer+'/node_modules/vite/bin/vite.js','build','--mode',name==='server-only opt-in default build'?'production':'homologation'],{cwd:consumer,env:child,stdio:['ignore',fd,fd],timeout:90000});}catch(error){blocked=typeof error.status==='number'&&error.status!==0;}finally{fs.closeSync(fd);}
 check('normal build fails closed: '+name,blocked);
}
for(const host of ['unknown.ab.invalid','preview.ab.invalid','localhost','preview.lovable.app']){
 const domain=configuredStoreDomain(config,host);check('no fallback '+host,domain===host);
 const response=await fetch(env.API_URL+'/rest/v1/rpc/get_public_storefront_catalog',{method:'POST',headers:{apikey:env.ANON_KEY,Authorization:'Bearer '+env.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_domain:domain})});
 check('unknown domain remains denied by real catalog '+host,response.ok&&(await response.json())===null);
}
const result={classification:'PASS_NATIVE_BACKEND_CONFIGURATION',checks,passed:checks.length,failed:0,productionApproved:false,sqlModified:false};
fs.writeFileSync('audits/ab-auth/results/backend-configuration.json',JSON.stringify(result,null,2)+'\n');
console.log('BACKEND_CONFIGURATION_RESULT='+JSON.stringify(result));
