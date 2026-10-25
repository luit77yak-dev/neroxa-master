import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const phone=new Set(['get_public_order_status','append_public_order_items','append_public_order_items_with_payment']);
/** Source inventory, NOT evidence that a deployed consumer has stopped. */
export function consumerInventory(){
 const out={scope:'only the two exact candidate source trees loaded by this disposable run',externalConsumers:'UNVERIFIED; food/mvp still distributed separately',sources:[],calls:[]};
 for(const [name,root,expected] of [['master','.',process.env.MISSION_SOURCE_SHA],['delivery','delivery-candidate',process.env.MISSION_DELIVERY_SHA]]){
  // The restricted test UID only reads these runner-owned checkout directories.
  // Trust these two exact paths for Git inspection, never a global wildcard.
  const git=(...args)=>execFileSync('git',['-c','safe.directory='+path.resolve(root),'-C',root,...args],{encoding:'utf8'});
  const actual=git('rev-parse','HEAD').trim();if(!expected||actual!==expected)throw Error('Consumer source identity mismatch');
  git('diff','--quiet','HEAD','--','src');
  const files=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p)){
   const bytes=fs.readFileSync(p);files.push({path:path.relative(root,p),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
   const ast=ts.createSourceFile(p,bytes.toString('utf8'),ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   function unwrap(n){while(n&&(ts.isAsExpression(n)||ts.isParenthesizedExpression(n)||ts.isTypeAssertionExpression(n)))n=n.expression;return n;}
   function visit(n){if(ts.isCallExpression(n)){
    const e=n.expression;const rpc=ts.isPropertyAccessExpression(e)&&e.name.text==='rpc'||ts.isElementAccessExpression(e)&&ts.isStringLiteral(e.argumentExpression)&&e.argumentExpression.text==='rpc';
    if(rpc){
     function names(node){const arg=unwrap(node);if(arg&&ts.isStringLiteralLike(arg))return [arg.text];if(arg&&ts.isConditionalExpression(arg))return [...names(arg.whenTrue),...names(arg.whenFalse)];throw Error('Unresolved dynamic RPC consumer: '+p);}
     for(const rpcName of new Set(names(n.arguments[0]))){
      if(phone.has(rpcName))throw Error('Executable phone consumer remains: '+p);
      if(rpcName==='create_public_order'&&!(name==='delivery'&&path.relative(root,p)==='src/server/checkout-backend.ts'))throw Error('Non-gateway checkout consumer remains: '+p);
      out.calls.push({source:name,file:path.relative(root,p),line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,rpc:rpcName});
     }
    }
   }ts.forEachChild(n,visit);}visit(ast);
  }}}
  walk(path.join(root,'src'));out.sources.push({name,commit:actual,files,treeSha256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')});
 }
 if(out.calls.filter(x=>x.rpc==='create_public_order').length!==1)throw Error('Expected exactly one server checkout consumer');
 out.status='PASS SOURCE INVENTORY ONLY';return out;
}
