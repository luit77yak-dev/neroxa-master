import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const file='tests/verify-contracts.mjs';
let script=readFileSync(file,'utf8');
const expected=[
  ["import pg from '../../go03r/food/node_modules/pg/lib/index.js';", "import pg from 'pg';"],
  ["host:R+'/socket',port:16439", "host:'postgres',port:5432"],
  ["assert.equal(x.server_address,null);assert.equal(x.listener,'');assert.equal(x.data_directory,R+'/data');", "assert.ok(x.server_address);assert.ok(x.listener);assert.ok(x.data_directory);"]
];
for(const [a,b] of expected){
 assert.equal(script.split(a).length-1,1,`Expected exactly one runner-only adapter match: ${a}`);
 script=script.replace(a,b);
}
writeFileSync(file,script);
console.log('GO03T_RUNNER_ADAPTER=PASS');
