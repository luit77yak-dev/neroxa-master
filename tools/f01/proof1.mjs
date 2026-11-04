/**
 * NEROXA F01 — Prova 1 focal (CANDIDATE, NOT ACTIVE).
 * This module is imported only by the existing native disposable harness.
 * It never provisions services, grants, users or SQL migrations itself.
 */
import crypto from 'node:crypto';

export async function f01Proof1(c) {
  const { sql, q, ids, api, check, digest, report } = c;
  if (!sql || !q || !ids || !api || !check || !digest || !report) {
    throw new Error('F01_PROVA1_BLOCKED: missing real harness dependencies');
  }

  const targets = ['A', 'B', 'C'];
  const instance = x => ids[`${x}store`];
  const order = x => ids[`${x}order`];
  if (targets.some(x => !instance(x) || !order(x))) {
    throw new Error('F01_PROVA1_BLOCKED: missing A1/A2/C native fixtures');
  }
  const orgs = JSON.parse(sql(`SELECT jsonb_object_agg(id, organization_id)
    FROM neroxa_system_instances
    WHERE id IN (${targets.map(x => q(instance(x))).join(',')});`));
  if (!orgs || orgs[instance('A')] !== orgs[instance('B')] ||
      orgs[instance('A')] === orgs[instance('C')]) {
    throw new Error('F01_PROVA1_BLOCKED: A1/A2/C lineage is not A/B same org and C different');
  }

  const out = report.f01Proof1 = {
    status: 'RUNNING', phase: 'candidate',
    identityModel: 'A1 and A2 same organization; C foreign organization',
    gates: [], scope: 'actual disposable PostgREST + GoTrue client identities; NOT production approval'
  };
  report.stage = 'F01 Prova 1 — minimal negative/positive matrix';

  const denied = r =>
    (r.http === 200 && Array.isArray(r.body) && r.body.length === 0) ||
    ([401, 403].includes(r.http) && r.body?.code === '42501');
  const allowedOne = r => r.http === 200 && Array.isArray(r.body) && r.body.length === 1;
  const groups = new Map();

  // Note: check() is the unchanged historical real-HTTP assertion helper.
  async function probe(gate, label, actor, target, op, expected, execute, accept, negative) {
    const before = digest();
    const prevChecks = report.checks.length;
    const response = await check(`F01-P1 ${gate} ${label}`, actor, target, op,
      expected, execute, accept, { phase: 'candidate', deny: negative, p0: negative });
    const after = digest();
    const observation = report.checks.at(-1);
    if (report.checks.length !== prevChecks + 1 || !observation ||
        observation.status !== 'PASS' ||
        (negative && JSON.stringify(before) !== JSON.stringify(after)) ||
        (gate === 'W-OWN' && JSON.stringify(before) === JSON.stringify(after))) {
      throw new Error(`F01_PROVA1_FAIL_CLOSED: ${gate}/${label}`);
    }
    const items = groups.get(gate) ?? [];
    items.push({ label, actor, target, op, status: observation.status,
      http: response.http, stateUnchanged: JSON.stringify(before) === JSON.stringify(after) });
    groups.set(gate, items);
  }

  // Negative SELECT: two stores within one organization and a foreign organization.
  for (const [actor, x] of [['admin_A', 'B'], ['admin_A', 'C'], ['admin_B', 'A']]) {
    const gate = x === 'C' ? 'R-CROSS-ORG' : 'R-SAME-ORG';
    await probe(gate, `order-${actor}-to-${x}`, actor, x, 'SELECT', 'DENY',
      () => api(actor, `neroxa_orders?id=eq.${order(x)}`), denied, true);
  }

  // Negative UPDATE/DELETE: do not accept an HTTP error alone if state changed.
  for (const x of ['B', 'C']) {
    const ownActor = `admin_${x}`;
    const foreignPath = `neroxa_storefront_availability?instance_id=eq.${instance(x)}`;
    const ownPreimage = await api(ownActor, foreignPath);
    if (!allowedOne(ownPreimage) || typeof ownPreimage.body[0].enabled !== 'boolean') {
      throw new Error(`F01_PROVA1_BLOCKED: target ${x} has no valid availability preimage`);
    }
    const initial = ownPreimage.body[0].enabled;
    // Ensure the negative PATCH attempts an actual change, not a no-op.
    if (!initial) {
      const prepared = await api(ownActor, foreignPath, 'PATCH', { enabled: true });
      if (!allowedOne(prepared) || prepared.body[0].enabled !== true)
        throw new Error(`F01_PROVA1_BLOCKED: cannot prepare target ${x} for mutation`);
    }
    try {
      const gate = x === 'C' ? 'W-CROSS-ORG' : 'W-SAME-ORG';
      await probe(gate, `availability-update-A-to-${x}`, 'admin_A', x, 'UPDATE', 'DENY',
        () => api('admin_A', `neroxa_storefront_availability?instance_id=eq.${instance(x)}`,
          'PATCH', { enabled: false }), denied, true);
      await probe(gate, `availability-delete-A-to-${x}`, 'admin_A', x, 'DELETE', 'DENY',
        () => api('admin_A', `neroxa_storefront_availability?instance_id=eq.${instance(x)}`,
          'DELETE'), denied, true);
      const payload = {
        id: crypto.randomUUID(), instance_id: instance(x), category_id: null,
        name: 'Synthetic F01 negative', slug: `f01-negative-${crypto.randomUUID()}`, price: 17
      };
      await probe(gate, `product-insert-A-to-${x}`, 'admin_A', x, 'INSERT', 'DENY',
        () => api('admin_A', 'neroxa_storefront_products', 'POST', payload),
        r => [401, 403].includes(r.http) && r.body?.code === '42501', true);
    } finally {
      if (!initial) {
        const restored = await api(ownActor, foreignPath, 'PATCH', { enabled: false });
        const now = await api(ownActor, foreignPath);
        if (!allowedOne(restored) || !allowedOne(now) || now.body[0].enabled !== false) {
          throw new Error(`F01_PROVA1_FAIL_CLOSED: cannot restore target ${x}`);
        }
      }
    }
  }

  // Positive SELECT: require actual user identities and the same REST endpoint.
  for (const x of targets) {
    await probe('R-OWN', `order-own-${x}`, `admin_${x}`, x, 'SELECT', 'ALLOW',
      () => api(`admin_${x}`, `neroxa_orders?id=eq.${order(x)}`), allowedOne, false);
  }

  // Positive UPDATE must actually change and then restore a synthetic value.
  // No business changes persist beyond the disposable run.
  for (const x of ['A', 'B', 'C']) {
    const path = `neroxa_storefront_availability?instance_id=eq.${instance(x)}`;
    const original = await api(`admin_${x}`, path);
    if (!allowedOne(original) || typeof original.body[0].enabled !== 'boolean') {
      throw new Error(`F01_PROVA1_BLOCKED: valid own availability preimage absent for ${x}`);
    }
    const initial = original.body[0].enabled;
    try {
      await probe('W-OWN', `availability-change-${x}`, `admin_${x}`, x, 'UPDATE', 'ALLOW',
        () => api(`admin_${x}`, path, 'PATCH', { enabled: !initial }),
        r => allowedOne(r) && r.body[0].enabled === !initial, false);
    } finally {
      const restored = await api(`admin_${x}`, path, 'PATCH', { enabled: initial });
      const now = await api(`admin_${x}`, path);
      if (!allowedOne(restored) || !allowedOne(now) || now.body[0].enabled !== initial) {
        throw new Error(`F01_PROVA1_FAIL_CLOSED: cannot restore own synthetic availability ${x}`);
      }
    }
  }

  const required = ['R-SAME-ORG', 'R-CROSS-ORG', 'W-SAME-ORG', 'W-CROSS-ORG', 'R-OWN', 'W-OWN'];
  for (const gate of required) {
    const observations = groups.get(gate) || [];
    if (!observations.length || observations.some(r => r.status !== 'PASS')) {
      throw new Error(`F01_PROVA1_FAIL_CLOSED: missing/failed ${gate}`);
    }
    const receipt = { id: gate, status: 'PASS', count: observations.length,
      negativeEffectPreserved: !gate.startsWith('R-OWN') && !gate.startsWith('W-OWN')
        ? observations.every(r => r.stateUnchanged) : null };
    out.gates.push(receipt);
    console.log('F01_PROVA1_GATE=' + JSON.stringify(receipt));
  }
  if (report.p0s?.length) throw new Error('F01_PROVA1_FAIL_CLOSED: P0 observation exists');
  out.status = 'PASS_FOCAL_ONLY';
  console.log('F01_PROVA1_SUMMARY=' + JSON.stringify(out));
}
