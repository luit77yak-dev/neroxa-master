import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyCloudflareHostedIdentity } from './cloudflare-hosted-identity.mjs';

const keys = generateKeyPairSync('ed25519'); // ephemeral synthetic test keys only
const attackerKeys = generateKeyPairSync('ed25519');
const nowMs = 1795176000000;
const baseline = Object.freeze({
  scope: 'HOSTED_SERVER', accountId: 'a'.repeat(32), workerId: 'b'.repeat(32),
  versionId: '10000000-0000-4000-8000-000000000001', releaseSha256: 'c'.repeat(64),
  projectRef: 'iefaoaqzltvpfabyeelj', backendOrigin: 'https://api.synthetic.invalid',
  domains: ['food.synthetic.invalid', 'master.synthetic.invalid'], nonce: 'd'.repeat(64),
  notBeforeMs: nowMs - 1000, expiresAtMs: nowMs + 60000,
});
const expected = Object.freeze({ ...baseline });
const trust = Object.freeze({
  publicKeyPem: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  maxValidityMs: 120000,
});
function signed(claims = baseline, key = keys.privateKey, payloadOverride) {
  const payload = Buffer.from(payloadOverride ?? JSON.stringify(claims));
  return { payload: payload.toString('base64url'), signature: sign(null, payload, key).toString('base64url') };
}
const check = (receipt, options = {}) => verifyCloudflareHostedIdentity({receipt,expected,trust,nowMs,...options});
test('accept exactly the synthetic signed Cloudflare identity tuple', () => assert.equal(check(signed()), true));
for(const [label, field, replacement] of [
  ['account mismatch','accountId','e'.repeat(32)],
  ['worker mismatch','workerId','e'.repeat(32)],
  ['version mismatch','versionId','20000000-0000-4000-8000-000000000001'],
  ['release SHA mismatch','releaseSha256','e'.repeat(64)],
  ['target Supabase mismatch','projectRef','uvyinrojuhizjqbuzdcy'],
  ['backend origin mismatch','backendOrigin','https://other.synthetic.invalid'],
  ['scope mismatch','scope','SQL_RELEASE'],
  ['hostnames wrong','domains',['food.synthetic.invalid']],
  ['hostnames unordered','domains',['master.synthetic.invalid','food.synthetic.invalid']],
  ['non-HTTPS origin','backendOrigin','http://api.synthetic.invalid'],
  ['malformed version','versionId','latest'],
  ['invalid nonce','nonce','1'],
  ['expired','expiresAtMs',nowMs],
  ['not yet valid','notBeforeMs',nowMs+1],
  ['oversized validity','expiresAtMs',nowMs+500000],
]) test('deny '+label, () => assert.equal(check(signed({...baseline,[field]: replacement})),false));
test('deny trusted identity mismatch even if attacker signs altered expected values',()=>{
  assert.equal(check(signed({...baseline,workerId:'e'.repeat(32)},attackerKeys.privateKey),
    {expected:{...expected,workerId:'e'.repeat(32)}}),false);
});
test('deny missing pinned trust',()=>assert.equal(check(signed(),{trust:{}}),false));
test('deny attacker self-provided key in receipt',()=>assert.equal(check({...signed(),publicKeyPem:trust.publicKeyPem}),false));
test('deny forged signature with correct identity',()=>assert.equal(check(signed(baseline,attackerKeys.privateKey)),false));
test('deny signature tampering',()=>assert.equal(check({...signed(),signature:'a'.repeat(86)}),false));
test('deny additional unsigned claims',()=>assert.equal(check(signed({...baseline,admin:true})),false));
test('deny duplicate JSON keys even with a signature',()=>{
  const raw=JSON.stringify(baseline).replace('"scope":"HOSTED_SERVER"','"scope":"HOSTED_SERVER","scope":"HOSTED_SERVER"');
  assert.equal(check(signed(baseline,keys.privateKey,raw)),false);
});
test('deny non-canonical JSON even with a signature',()=>{
  assert.equal(check(signed(baseline,keys.privateKey,JSON.stringify(baseline,null,2))),false);
});
test('deny missing server clock',()=>assert.equal(check(signed(),{nowMs:undefined}),false));
test('deny invalid trust interval',()=>assert.equal(check(signed(),{trust:{...trust,maxValidityMs:3600000}}),false));
test('deny incorrect host allowlist sourced externally',()=>assert.equal(check(signed(),{expected:{...expected,domains:['other.synthetic.invalid']}}),false));
test('deny receipt with padded base64url fields',()=>assert.equal(check({...signed(),payload:signed().payload+'='}),false));
