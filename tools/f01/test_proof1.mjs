// Purely synthetic module tests; not evidence of native RLS or Auth security.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { f01Proof1 } from './proof1.mjs';

function fakeHarness({ leak = false } = {}) {
  const ids = {
    Astore: 'store-a', Bstore: 'store-b', Cstore: 'store-c',
    Aorder: 'order-a', Border: 'order-b', Corder: 'order-c'
  };
  const org = { 'store-a': 'O1', 'store-b': 'O1', 'store-c': 'O2' };
  const enabled = { A: true, B: true, C: true };
  const report = { checks: [], p0s: [] };
  const digest = () => ({ enabled: { ...enabled } });
  const q = s => `'${s}'`;
  const sql = () => JSON.stringify(org);
  const api = async (actor, path, method = 'GET', payload) => {
    const access = actor === 'admin_A' ? 'A' : actor === 'admin_B' ? 'B' : 'C';
    const target = path.includes('store-b') || path.includes('order-b') ? 'B' :
      path.includes('store-c') || path.includes('order-c') ? 'C' : 'A';
    if (path === 'neroxa_storefront_products' && method === 'POST') {
      return { http: 403, body: { code: '42501' } };
    }
    if (access !== target) {
      if (leak && method === 'GET' && access === 'A' && target === 'B')
        return { http: 200, body: [{ id: 'order-b' }] };
      return { http: 200, body: [] };
    }
    if (path.startsWith('neroxa_orders?')) return { http: 200, body: [{ id: ids[target + 'order'] }] };
    if (method === 'PATCH') enabled[target] = payload.enabled;
    return { http: 200, body: [{ enabled: enabled[target] }] };
  };
  const check = async (name, actor, target, op, expected, fn, validate) => {
    const response = await fn();
    report.checks.push({ name, actor, target, op, expected,
      status: validate(response) ? 'PASS' : 'FAIL' });
    return response;
  };
  return { ids, report, q, sql, api, check, digest };
}

test('focal 15 checks pass with synthetic mock adapter only', async () => {
  const f = fakeHarness();
  await f01Proof1(f);
  assert.equal(f.report.f01Proof1.status, 'PASS_FOCAL_ONLY');
  assert.equal(f.report.checks.length, 15);
  assert.equal(f.report.f01Proof1.gates.length, 6);
});

test('cross-store leak fails closed', async () => {
  const f = fakeHarness({ leak: true });
  await assert.rejects(() => f01Proof1(f), /FAIL_CLOSED/);
});
