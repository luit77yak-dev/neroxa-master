import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const units = [
  ...JSON.parse(fs.readFileSync('audits/02a5/BUYER-PRE-GATE-MANIFEST.json')).sql,
  ...JSON.parse(fs.readFileSync('audits/02a5/F02-AMENDMENT-EXECUTION-MANIFEST.json')).units,
];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);

export async function proof1Focal(c) {
  const { sql, q, ids, services, report, crypto: crypt, sleep, url, env: bootstrapEnv } = c;
  report.proof1 = { source: { master: process.env.MISSION_SOURCE_SHA, delivery: process.env.MISSION_DELIVERY_SHA }, checks: [] };

  report.stage = 'install exact manifest units into disposable database';
  for (const unit of units) {
    const bytes = fs.readFileSync(unit.path);
    if (sha(bytes) !== unit.sha256) throw Error('Manifest hash mismatch: ' + unit.path);
    sql("SET neroxa.mission02a2_disposable='on';" + bytes.toString('utf8'));
  }
  for (const alias of ['A', 'B', 'C']) sql(`BEGIN; SET LOCAL neroxa.implementation_write_path='official';
    INSERT INTO neroxa_system_domains(system_instance_id,domain,status) VALUES(${q(ids[alias+'store'])},'${alias.toLowerCase()}.synthetic.invalid','VERIFIED') ON CONFLICT DO NOTHING;
    DELETE FROM neroxa_storefront_weekly_hours WHERE instance_id=${q(ids[alias+'store'])};
    INSERT INTO neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT ${q(ids[alias+'store'])},d,'00:00','24:00' FROM generate_series(0,6) d;
    COMMIT;`);

  const signatures = [
    'public.get_public_order_status(uuid,text)',
    'public.append_public_order_items_with_payment(uuid,text,jsonb,text)',
  ];
  report.stage = 'catalog-bound ACL cut';
  const observed = JSON.parse(sql(`SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'search_path',p.proconfig,'body_md5',md5(p.prosrc),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('${signatures[0]}'::regprocedure,'${signatures[1]}'::regprocedure);`));
  const expectedBodies = {
    'public.get_public_order_status(uuid,text)': '30881bd3c9ff32d39a1e3d9ee04f4dfe',
    'public.append_public_order_items_with_payment(uuid,text,jsonb,text)': '758e73cb4d71f1ff8c22e46d32fe2da7',
  };
  if (!Array.isArray(observed) || observed.length !== 2 || observed.some(fn => fn.owner !== 'postgres' || !fn.security_definer || !fn.search_path?.some(x => x === 'search_path=public') || expectedBodies[fn.signature] !== fn.body_md5 || (!fn.anon_execute && !fn.authenticated_execute))) throw Error('BLOCKED: legacy function preimage does not match expected frozen catalog');
  const overloads = sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment')");
  if (overloads !== '2') throw Error('BLOCKED: legacy RPC overload inventory differs from frozen catalog');
  const wrappers = sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND p.proname NOT IN ('get_public_order_status','append_public_order_items_with_payment') AND p.prosrc ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))");
  if (wrappers !== '0') throw Error('BLOCKED: legacy wrapper remains executable by anon/authenticated');
  for (const signature of signatures) sql(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`);
  sql("NOTIFY pgrst,'reload schema';");
  await sleep(2000);
  report.proof1.acl = { status: 'PASS', before: observed, signatures, delta: 'revoke EXECUTE only on two catalog-confirmed legacy overloads' };

  report.stage = 'synthetic checkout and capability issuance';
  const checkoutKey = crypt.randomUUID();
  const created = await services.admin.rpc('create_public_order', { p_order: {
    organization_id: ids.O1, instance_id: ids.Astore, store_domain: 'a.synthetic.invalid', idempotency_key: checkoutKey,
    customer_name: 'Synthetic Prova 1', customer_phone: '00000000001', fulfillment: 'PICKUP', payment_method: 'CASH',
    items: [{ product_id: ids.Aproduct, quantity: 1 }],
  } });
  if (created.error) throw Error('Synthetic checkout failed: ' + created.error.code);
  const order = Array.isArray(created.data) ? created.data[0] : created.data;
  if (!order?.order_id) throw Error('Synthetic checkout returned no order id');
  const trackingToken = crypt.randomBytes(32).toString('base64url');
  const amendmentToken = crypt.randomBytes(32).toString('base64url');
  for (const [fn, token] of [['neroxa_register_tracking_capability', trackingToken], ['neroxa_register_order_amendment_capability', amendmentToken]]) {
    const tokenHash = crypt.createHash('sha256').update(token).digest('hex');
    const registered = await services.admin.rpc(fn, { p_instance_id: ids.Astore, p_order_id: order.order_id, p_checkout_key: checkoutKey, p_token_sha256: tokenHash });
    if (registered.error) throw Error('Capability registration failed: ' + fn + ' ' + registered.error.code);
  }
  const snapshot = id => JSON.parse(sql(`SELECT json_build_object('items',(SELECT json_agg(to_jsonb(i) ORDER BY i.id) FROM neroxa_order_items i WHERE i.order_id=${q(id)}),'order',(SELECT to_jsonb(o) FROM neroxa_orders o WHERE o.id=${q(id)}));`));
  const foreignBefore = snapshot(ids.Border);
  const positiveBefore = snapshot(order.order_id);

  const runtime = {
    NEROXA_PRIVATE_TRACKING_ENABLED: 'true', NEROXA_BACKEND_MODE: 'homologation', NEROXA_TEST_PROJECT_REF: 'local-disposable',
    NEROXA_TRACKING_PROXY_CONTRACT: 'direct-canonical-host-v1', SUPABASE_URL: url, NEROXA_DELIVERY_BACKEND_URL: url,
    NEROXA_TRACKING_CANONICAL_DOMAINS: 'a.synthetic.invalid,b.synthetic.invalid,c.synthetic.invalid',
    NEROXA_TRACKING_QUOTA_SECRET: crypt.randomBytes(32).toString('hex'), NEROXA_CHECKOUT_RATE_LIMIT_SECRET: crypt.randomBytes(32).toString('hex'),
    NEROXA_CHECKOUT_GATEWAY_ENABLED: 'true', NEROXA_CHECKOUT_AMENDMENTS_ENABLED: 'true', NEROXA_GROUP_ADDONS_V1_ENABLED: 'false',
  };
  const { handlePrivateTrackingRequest } = await import('../../delivery-candidate/src/server/private-tracking.ts');
  const { privateTrackingDependencies } = await import('../../delivery-candidate/src/server/private-tracking-backend.ts');
  const { handleOrderAmendmentRequest } = await import('../../delivery-candidate/src/server/order-amendment.ts');
  const { orderAmendmentDependencies } = await import('../../delivery-candidate/src/server/order-amendment-backend.ts');
  const trackingDeps = privateTrackingDependencies(runtime, services.admin);
  const amendmentDeps = orderAmendmentDependencies(runtime, services.admin);
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '';
      if (!['a.synthetic.invalid', 'b.synthetic.invalid', 'c.synthetic.invalid'].includes(host)) { res.writeHead(403); res.end('{}'); return; }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request('https://' + host + req.url, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
      const response = req.url === '/api/order-track' ? await handlePrivateTrackingRequest(request, trackingDeps)
        : req.url === '/api/order-amend' ? await handleOrderAmendmentRequest(request, amendmentDeps) : Response.json({}, { status: 404 });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch { res.writeHead(503); res.end('{}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

  report.stage = 'three focal assertions under restricted UID';
  let child;
  try {
  const apiPort = Number(new URL(url).port);
  const handlerPort = Number(server.address().port);
  if (!Number.isInteger(apiPort) || !Number.isInteger(handlerPort) || apiPort === handlerPort) throw Error('BLOCKED: required loopback endpoint identity is invalid');
  execFileSync('bash', ['tools/mission-02a5/network.sh', 'lock'], { env: { ...process.env, PROOF1_API_PORT: String(apiPort), PROOF1_HANDLER_PORT: String(handlerPort) }, encoding: 'utf8', timeout: 15000 });
  const handoff = {
    apiUrl: url, anonKey: bootstrapEnv.ANON_KEY, foreignOrderId: ids.Border,
    foreignProductId: ids.Bproduct, positiveOrderId: order.order_id, positiveProductId: ids.Aproduct,
    trackingCapability: trackingToken, amendmentCapability: amendmentToken,
    localOrigin: `http://127.0.0.1:${server.address().port}`,
  };
  if (!handoff.anonKey) throw Error('BLOCKED: public anon key was not supplied by local bootstrap');
    const raw = execFileSync('sudo', ['-u', 'neroxa_test', '--', 'env', '-i', 'PATH=/usr/bin:/bin', 'HOME=/', process.execPath, 'audits/proof1-focal/client.mjs'], { input: JSON.stringify(handoff), encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 });
    const line = raw.split('\n').find(value => value.startsWith('PROOF1_FOCAL_CLIENT_RESULT='));
    if (!line || raw.split('\n').filter(value => value.startsWith('PROOF1_FOCAL_CLIENT_RESULT=')).length !== 1) throw Error('Focal client result missing or ambiguous');
    child = JSON.parse(line.slice('PROOF1_FOCAL_CLIENT_RESULT='.length));
  } finally { await new Promise(resolve => server.close(resolve)); }
  if (!Array.isArray(child?.checks) || child.checks.length !== 3 || child.checks.some(x => x.status !== 'PASS')) throw Error('One or more focal assertions failed');
  const foreignAfter = snapshot(ids.Border);
  if (canonical(foreignBefore) !== canonical(foreignAfter)) throw Error('Negative write changed foreign order items, totals, or payment');
  const positiveAfter = snapshot(order.order_id);
  const beforeTotal = Number(positiveBefore.order.total), afterTotal = Number(positiveAfter.order.total);
  if (positiveAfter.items?.length !== positiveBefore.items?.length + 1 || afterTotal - beforeTotal !== 30 || positiveAfter.order.payment_method !== positiveBefore.order.payment_method) throw Error('Capability positive mutation did not match expected scoped state change');
  report.proof1.checks = child.checks.map(check => check.id === 'negative-write' ? { ...check, stateUnchanged: true } : check);
  report.proof1.positive = { oneItemAdded: true, totalDelta: afterTotal - beforeTotal, paymentPreserved: true };
  report.proof1.status = 'PASS';
}
