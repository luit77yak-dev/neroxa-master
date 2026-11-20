import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {auditImportClosure} from './import-closure-audit.mjs';

const fixture=()=>mkdtempSync(join(tmpdir(),'neroxa-closure-'));
const put=(root,name,s)=>{const p=join(root,name);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,s);};
test('accepts closed relative ESM import graph without evaluating modules',()=>{
 const root=fixture();
 try {
  put(root,'src/main.mjs',"import {x} from './unit.mjs';\nexport {y} from './nest/other.mjs';\n");
  put(root,'src/unit.mjs',"export const x='no execution';\n");
  put(root,'src/nest/other.mjs',"import {x} from '../unit.mjs';\nexport const y=x;\n");
  const r=auditImportClosure(root,['src/main.mjs']);
  assert.equal(r.state,'CLOSED_IMPORTS_PRESENT_ONLY');assert.equal(r.scanned,3);assert.deepEqual(r.missing,[]);
 } finally {rmSync(root,{force:true,recursive:true});}
});
test('unresolved sibling import blocks',()=>{
 const root=fixture();
 try {
  put(root,'tools/preflight.mjs',"import {verifyGrant} from '../../delivery-candidate/src/server/hosted-release-core.mjs';\n");
  const r=auditImportClosure(root,['tools/preflight.mjs']);
  assert.equal(r.state,'BLOCKED');
  assert.ok(r.outside.length>0);
 } finally {rmSync(root,{force:true,recursive:true});}
});
test('missing relative module blocks despite existence of entry',()=>{
 const root=fixture();
 try {
  put(root,'src/index.mjs',"import {run} from './missing.mjs';\n");
  const r=auditImportClosure(root,['src/index.mjs']);
  assert.equal(r.state,'BLOCKED');
  assert.deepEqual(r.missing,['src/missing.mjs']);
 } finally {rmSync(root,{force:true,recursive:true});}
});
test('a cycle does not loop and keeps all modules',()=>{
 const root=fixture();
 try {
  put(root,'src/a.mjs',"import './b.mjs';\n");
  put(root,'src/b.mjs',"import './a.mjs';\n");
  const r=auditImportClosure(root,['src/a.mjs']);assert.equal(r.state,'CLOSED_IMPORTS_PRESENT_ONLY');assert.equal(r.scanned,2);
 } finally {rmSync(root,{force:true,recursive:true});}
});
