#!/usr/bin/env node
/**
 * NEROXA V1 hosted-admission dependency closure audit.
 * Read-only, zero network access, no credentials, no module evaluation.
 * NO execution permission is derived from a passing closure audit.
 */
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,extname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

function contained(root,target) {
  const rel=relative(root,target);
  return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));
}
export function auditImportClosure(root, entries) {
  root=realpathSync(resolve(root));
  const seen=new Set(),missing=new Set(),outside=new Set();
  const walk=(file)=>{
    const absolute=resolve(root,file);
    if(!contained(root,absolute)){outside.add(file);return;}
    if(!existsSync(absolute)){missing.add(relative(root,absolute));return;}
    const real=realpathSync(absolute);
    if(!contained(root,real)){outside.add(relative(root,absolute));return;}
    if(seen.has(real))return;
    seen.add(real);
    const text=readFileSync(real,'utf8');
    // Parse only static relative import/export declarations; the host must run
    // additional validation for dynamic imports and non-JS dependencies.
    const re=/(?:\bimport\s*(?:[^;]*?\s+from\s*)?|\bexport\s+[^;]*?\s+from\s*)['"]((?:\.\.?\/)[^'"]+)['"]/g;
    for(const m of text.matchAll(re)){
      const target=resolve(dirname(real),m[1]);
      if(!contained(root,target)){outside.add(relative(root,target));continue;}
      walk(relative(root,target));
    }
  };
  for(const e of entries)walk(e);
  return Object.freeze({
    state:missing.size||outside.size?'BLOCKED':'CLOSED_IMPORTS_PRESENT_ONLY',
    scanned:seen.size,
    missing:[...missing].sort(),
    outside:[...outside].sort(),
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=process.argv[2]??'.';
  const entries=process.argv.slice(3);
  if(entries.length===0){console.error('USAGE: node import-closure-audit.mjs <repo-root> <entry1>...');process.exitCode=2;}
  else {
    try{
      const result=auditImportClosure(root,entries);
      console.log('HOSTED_EXECUTOR_IMPORT_CLOSURE='+result.state);
      console.log('SCANNED_MODULES='+result.scanned);
      console.log('MISSING_IMPORTS='+JSON.stringify(result.missing));
      console.log('OUTSIDE_REPO_IMPORTS='+JSON.stringify(result.outside));
      console.log('HOSTED_EXECUTION_AUTHORIZED=NO');
      if(result.state==='BLOCKED')process.exitCode=78;
    }catch(e){console.error('HOSTED_EXECUTOR_IMPORT_CLOSURE=BLOCKED; audit failed');process.exitCode=78;}
  }
}
