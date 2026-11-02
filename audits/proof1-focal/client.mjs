import http from 'node:http';

const input = [];
for await (const chunk of process.stdin) input.push(chunk);
const handoff = JSON.parse(Buffer.concat(input).toString());
const need = name => {
  const value = handoff[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const readResponse = async response => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
};
const rpc = async (name, body) => {
  const response = await fetch(`${need('apiUrl')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: need('anonKey'),
      Authorization: `Bearer ${need('anonKey')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await readResponse(response) };
};
const localRequest = (path, body, token) => new Promise((resolve, reject) => {
  const target = new URL(need('localOrigin'));
  const headers = {
    Host: 'a.synthetic.invalid',
    Origin: 'https://a.synthetic.invalid',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const req = http.request({
    hostname: target.hostname, port: Number(target.port), path,
    method: 'POST', headers, timeout: 15000,
  }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      try {
        resolve({
          status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString()),
          cacheControl: response.headers['cache-control'] ?? '',
        });
      } catch { reject(new Error('local handler returned non-JSON')); }
    });
  });
  req.on('timeout', () => req.destroy(new Error('local handler timeout')));
  req.on('error', reject);
  req.end(JSON.stringify(body));
});

const result = { status: 'FAIL', checks: [] };
try {
  const read = await rpc('get_public_order_status', {
    p_order_id: need('foreignOrderId'),
    p_customer_phone: '00000000001',
  });
  result.checks.push({ id: 'negative-read', status: [401, 403].includes(read.status) ? 'PASS' : 'FAIL', http: read.status, sqlstate: read.body?.code ?? null });

  const write = await rpc('append_public_order_items_with_payment', {
    p_order_id: need('foreignOrderId'),
    p_customer_phone: '00000000001',
    p_items: [{ product_id: need('foreignProductId'), quantity: 1 }],
    p_payment_method: 'CASH',
  });
  result.checks.push({ id: 'negative-write', status: [401, 403].includes(write.status) ? 'PASS' : 'FAIL', http: write.status, sqlstate: write.body?.code ?? null });

  const tracked = await localRequest('/api/order-track', { order_id: need('positiveOrderId') }, need('trackingCapability'));
  const trackingPass = tracked.status === 200
    && tracked.body?.order_id === need('positiveOrderId')
    && !JSON.stringify(tracked.body).includes('customer_')
    && tracked.cacheControl.includes('no-store');
  const amended = await localRequest('/api/order-amend', {
    order_id: need('positiveOrderId'),
    token: need('amendmentCapability'),
    request_key: crypto.randomUUID(),
    items: [{ product_id: need('positiveProductId'), quantity: 1 }],
  });
  const amendmentPass = amended.status === 200
    && amended.body?.order_id === need('positiveOrderId')
    && amended.body?.payment_state === 'NOT_SETTLED';
  result.checks.push({
    id: 'positive-capability', status: trackingPass && amendmentPass ? 'PASS' : 'FAIL',
    readHttp: tracked.status, appendHttp: amended.status,
    readOrderMatches: tracked.body?.order_id === need('positiveOrderId'),
    paymentState: amended.body?.payment_state ?? null,
  });
  result.status = result.checks.length === 3 && result.checks.every(x => x.status === 'PASS') ? 'PASS' : 'FAIL';
} catch (error) {
  result.error = String(error?.message ?? error).slice(0, 180);
}
console.log('PROOF1_FOCAL_CLIENT_RESULT=' + JSON.stringify(result));
process.exitCode = result.status === 'PASS' ? 0 : 1;
