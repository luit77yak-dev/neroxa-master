// End-to-end LOCAL HTTPS ingress smoke on the real TanStack Start POST route,
// coupled with real disposable Supabase Auth/PostgREST/PostgreSQL.
// No production credentials, DNS, remote deploy, or online project refs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const project = process.env.AB_PROJECT;
const work = process.env.AB_WORKDIR;
const consumer = path.resolve("delivery-consumer");
const reportPath = path.resolve("audits/ab-auth/results/checkout-http-enabled.json");
const report = {
  classification: "INCONCLUSIVO",
  stage: "preflight",
  productionCompatibility: false,
  environment: "Disposable local PG17/Auth/PostgREST and TanStack dev-server TLS on loopback",
  checks: [],
  limitations: [
    "This tests the actual TanStack HTTP route and server adapter locally, not Vercel runtime/edge.",
    "Local TLS and --resolve simulate valid domains; they do not prove trusted public DNS or edge routing.",
    "The gateway uses a disposable local service_role key; least-privilege runtime credentials remain pending.",
    "Edge IP rate limits, abusive anonymous traffic and production deployment/rollback are not certified.",
  ],
};
let child;
let logFd;
let tmpConfig;
const assert = (name, ok) => {
  const passed = !!ok;
  report.checks.push({ name, passed });
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) throw new Error("Local HTTP checkout gate failed: " + name);
};
function statusEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
function run(command, args, opts = {}) {
  const p = spawnSync(command, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 180_000,
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (p.status !== 0)
    throw new Error("Disposable local command failed: " + command + " (exit " + p.status + ")");
  return p.stdout.trim();
}
async function postLocal(
  domain,
  payload,
  { origin, host, headers = {}, apiPath = "/api/checkout" } = {},
) {
  const url = "https://" + domain + ":4173" + apiPath;
  const resultFile = path.join(work, "checkout-response.private.json");
  const requestArgs = [
    "--silent",
    "--noproxy",
    "*",
    "--insecure",
    "--max-time",
    "8",
    "--resolve",
    domain + ":4173:127.0.0.1",
    "--request",
    "POST",
    "--header",
    "Content-Type: application/json",
    "--header",
    "Sec-Fetch-Site: same-origin",
    "--header",
    "Origin: " + (origin ?? "https://" + domain + ":4173"),
    ...Object.entries(headers)
      .map(([name, value]) => ["--header", name + ": " + value])
      .flat(),
    ...(host ? ["--header", "Host: " + host] : []),
    "--data-raw",
    JSON.stringify(apiPath === "/api/order-amend" ? payload : { p_order: payload }),
    "--output",
    resultFile,
    "--write-out",
    "%{http_code}",
    url,
  ];
  const proc = spawnSync("curl", requestArgs, {
    encoding: "utf8",
    timeout: 11_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (proc.status !== 0) return { status: 0, body: null };
  const code = Number(proc.stdout.trim());
  let body = null;
  const rawResponse = fs.readFileSync(resultFile, "utf8");
  try {
    body = JSON.parse(rawResponse);
  } catch {}
  const kind =
    body?.error === "Domínio não autorizado para pedidos."
      ? "gateway-protocol-or-domain"
      : body?.error === "Origem da solicitação inválida."
        ? "gateway-host-or-origin"
        : rawResponse.includes("Blocked request")
          ? "vite-host-blocked"
          : rawResponse.includes("Forbidden")
            ? "generic-forbidden"
            : body?.error
              ? "other-json-error"
              : "unknown";
  return { status: code, body, kind };
}
async function localApi(local, route, method = "GET", body) {
  const response = await fetch(new URL("/rest/v1/" + route, local.API_URL), {
    method,
    headers: {
      apikey: local.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + local.SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  return { status: response.status, body: payload };
}
async function main() {
  if (
    process.env.CI !== "true" ||
    !project?.startsWith("neroxa-ab-") ||
    !work ||
    !work.startsWith(process.env.RUNNER_TEMP + path.sep) ||
    !fs.existsSync(path.join(work, "status.private.env"))
  ) {
    throw new Error("Only unlinked disposable GitHub Actions stack is permitted");
  }
  report.stage = "preflight";
  const local = statusEnv(path.join(work, "status.private.env"));
  const parsed = new URL(local.API_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
    !local.ANON_KEY ||
    !local.SERVICE_ROLE_KEY
  )
    throw new Error("Expected loopback-only disposable Supabase credentials");
  if (
    !fs.existsSync(path.join(consumer, "package.json")) ||
    !fs.existsSync(path.join(consumer, "src/routes/api/checkout.ts"))
  )
    throw new Error("Pinned checkout consumer files absent");

  const db = "supabase_db_" + project;
  const meta = JSON.parse(run("docker", ["inspect", db], { timeout: 10_000 }))[0];
  for (const ports of Object.values(meta.HostConfig.PortBindings ?? {}))
    for (const port of ports ?? [])
      if (!["127.0.0.1", "::1"].includes(port.HostIp))
        throw new Error("PostgreSQL exposed outside loopback");

  // The preceding integration deliberately filled A's 60/min bucket.
  // Reset ONLY the isolated disposable quota counters before exercising HTTPS,
  // otherwise an expected HTTP order could be rejected by a previous test.
  report.stage = "reset-disposable-quota";
  run(
    "docker",
    [
      "exec",
      "-i",
      db,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "TRUNCATE TABLE private.neroxa_checkout_quota_counters;",
    ],
    { timeout: 12_000 },
  );
  assert("HTTP test starts with empty disposable quota counters", true);

  report.stage = "tls";
  const keyFile = path.join(work, "checkout-ci-key.private.pem");
  const certFile = path.join(work, "checkout-ci-cert.private.pem");
  run(
    "openssl",
    [
      "req",
      "-new",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "1",
      "-subj",
      "/CN=a.ab.invalid",
      "-addext",
      "subjectAltName=DNS:a.ab.invalid,DNS:b.ab.invalid,DNS:c.ab.invalid,DNS:unknown.ab.invalid",
    ],
    { timeout: 30_000 },
  );
  fs.chmodSync(keyFile, 0o600);

  report.stage = "start-real-tanstack";
  const env = {
    ...process.env,
    NEROXA_DELIVERY_BACKEND_URL: local.API_URL,
    SUPABASE_URL: local.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
    VITE_SUPABASE_URL: local.API_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
    NEROXA_GROUP_ADDONS_V1_ENABLED: "true",
    NEROXA_CHECKOUT_GATEWAY_ENABLED: "true",
    VITE_NEROXA_CHECKOUT_GATEWAY: "true",
    NEROXA_CHECKOUT_AMENDMENTS_ENABLED: "true",
    VITE_NEROXA_CHECKOUT_AMENDMENTS: "true",
    NEROXA_CHECKOUT_RATE_LIMIT_SECRET: crypto.randomBytes(48).toString("hex"),
  };
  // Temporary, uncommitted config only. The HTTPS requirement of the gateway
  // remains intact; the TLS listener itself is bound to loopback.
  tmpConfig = path.join(consumer, "vite.checkout-ci.config.ts");
  fs.writeFileSync(
    tmpConfig,
    'import { defineConfig } from "@lovable.dev/vite-tanstack-config";\n' +
      'import { readFileSync } from "node:fs";\n' +
      "export default defineConfig({\n" +
      ' tanstackStart: {server:{entry:"server"}},\n' +
      ' vite: {server: {host:"127.0.0.1", port:4173, strictPort:true,\n' +
      '   allowedHosts:["a.ab.invalid","b.ab.invalid","c.ab.invalid","unknown.ab.invalid"],\n' +
      "   https:{key:readFileSync(" +
      JSON.stringify(keyFile) +
      "),cert:readFileSync(" +
      JSON.stringify(certFile) +
      ")}}}\n" +
      "});\n",
  );
  // Avoid echoing environment or any generated keys in job logs.
  run("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: consumer,
    env,
    timeout: 240_000,
  });
  const logFile = path.join(work, "tanstack-https.private.log");
  logFd = fs.openSync(logFile, "w", 0o600);
  child = spawn(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--config",
      "vite.checkout-ci.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "4173",
    ],
    {
      cwd: consumer,
      env,
      stdio: ["ignore", logFd, logFd],
      detached: false,
    },
  );
  fs.closeSync(logFd);
  logFd = undefined;
  let ready = false;
  const seenStatus = new Set();
  const seenReasons = new Set();
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) break;
    const r = await postLocal("a.ab.invalid", {});
    seenStatus.add(r.status);
    if (r.status === 403) seenReasons.add(r.kind ?? "unknown");
    if (r.status === 400) {
      ready = true;
      break;
    }
    await sleep(1000);
  }
  // Whitelisted diagnostics only, never upload the server log or secret values.
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  report.httpProbe = {
    observedStatusCodes: [...seenStatus].sort(),
    observedRejectionCategories: [...seenReasons].sort(),
    devProcessExited: child.exitCode !== null,
    markers: {
      viteReady: log.includes("ready in"),
      viteLocalUrl: log.includes("Local:"),
      moduleNotFound: log.includes("ERR_MODULE_NOT_FOUND"),
      addressInUse: log.includes("EADDRINUSE"),
      viteConfigError: log.includes("failed to load config"),
      viteHostBlocked: log.includes("host is not allowed"),
      sourceTransformError: log.includes("Internal Server Error"),
      proxyError: log.includes("EACCES"),
    },
  };
  assert("Real local HTTPS TanStack checkout endpoint is enabled", ready);

  report.stage = "http-real-backend";
  const shops = {};
  const before = {};
  for (const alias of ["a", "b", "c"]) {
    const ctx = await localApi(local, "rpc/get_public_storefront_context", "POST", {
      p_domain: alias + ".ab.invalid",
    });
    assert(
      "Real PostgREST context for " + alias,
      ctx.status === 200 && Array.isArray(ctx.body) && ctx.body.length === 1,
    );
    const p = await localApi(
      local,
      "neroxa_storefront_products?instance_id=eq." +
        encodeURIComponent(ctx.body[0].instance_id) +
        "&select=id,price&limit=1",
    );
    assert("Real product for HTTP shop " + alias, p.status === 200 && p.body.length === 1);
    const orders = await localApi(
      local,
      "neroxa_orders?instance_id=eq." + encodeURIComponent(ctx.body[0].instance_id) + "&select=id",
    );
    assert(
      "HTTP baseline orders for " + alias,
      orders.status === 200 && Array.isArray(orders.body),
    );
    before[alias] = orders.body.length;
    shops[alias] = { context: ctx.body[0], product: p.body[0] };
  }
  assert(
    "HTTP shops A and B share organization, but not instance",
    shops.a.context.organization_id === shops.b.context.organization_id &&
      shops.a.context.instance_id !== shops.b.context.instance_id,
  );

  function order(alias, phone, key = crypto.randomUUID()) {
    const { context, product } = shops[alias];
    return {
      organization_id: context.organization_id,
      instance_id: context.instance_id,
      store_domain: context.domain,
      idempotency_key: key,
      customer_name: "Fixture HTTP " + alias,
      customer_phone: phone,
      fulfillment: "PICKUP",
      payment_method: "CASH",
      items: [{ product_id: product.id, quantity: 1, unit_price: 0.01 }],
    };
  }
  const a = await postLocal("a.ab.invalid", order("a", "00000000111"));
  assert(
    "Enabled real HTTPS POST creates shop A order",
    a.status === 200 && typeof a.body?.order_id === "string",
  );
  const bOrder = order("b", "00000000222");
  const b = await postLocal("b.ab.invalid", bOrder);
  assert(
    "Enabled real HTTPS POST creates shop B order",
    b.status === 200 && typeof b.body?.order_id === "string",
  );
  assert("HTTP A and B create distinct orders", a.body.order_id !== b.body.order_id);
  assert(
    "HTTP checkout prices are not client supplied",
    Number(a.body.total) === Number(shops.a.product.price) &&
      Number(b.body.total) === Number(shops.b.product.price),
  );
  assert(
    "HTTPS checkout issues a buyer-only capability to new A order",
    /^[A-Za-z0-9_-]{43}$/.test(a.body.amendment_token ?? ""),
  );
  assert(
    "HTTPS checkout issues independent buyer capability in B",
    /^[A-Za-z0-9_-]{43}$/.test(b.body.amendment_token ?? "") &&
      a.body.amendment_token !== b.body.amendment_token,
  );

  const same = await postLocal("b.ab.invalid", bOrder);
  assert(
    "HTTP retry reuses idempotent order",
    same.status === 200 && same.body?.order_id === b.body.order_id,
  );
  assert(
    "HTTPS checkout replay never reissues buyer capability",
    !Object.hasOwn(same.body ?? {}, "amendment_token"),
  );
  const mismatch = await postLocal("a.ab.invalid", order("b", "00000000223"));
  assert("HTTP route forbids cross-store order body", mismatch.status === 403);
  const mismatchedOrigin = await postLocal("a.ab.invalid", order("a", "00000000112"), {
    origin: "https://b.ab.invalid:4173",
  });
  assert("HTTP route rejects forged Origin", mismatchedOrigin.status === 403);
  const mismatchedHost = await postLocal("a.ab.invalid", order("a", "00000000113"), {
    host: "b.ab.invalid:4173",
  });
  assert("HTTP route rejects mismatched Host", mismatchedHost.status === 403);
  const unknown = await postLocal("unknown.ab.invalid", {
    ...order("a", "00000000114"),
    instance_id: undefined,
    organization_id: undefined,
    store_domain: undefined,
  });
  assert("HTTP route refuses unregistered host", unknown.status === 404);

  const limitedPhone = "00000000239";
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const x = await postLocal("b.ab.invalid", order("b", limitedPhone));
    statuses.push(x.status);
  }
  assert(
    "Five HTTP orders from one B contact succeed",
    statuses.slice(0, 5).every((x) => x === 200),
  );
  assert("Sixth real HTTPS order denied by persistent quota", statuses[5] === 429);

  const mixed = await postLocal("b.ab.invalid", {
    ...order("b", "00000000240"),
    items: [{ product_id: shops.a.product.id, quantity: 1 }],
  });
  assert("HTTP gateway refuses other shop product in SQL", mixed.status === 503);

  report.stage = "http-buyer-amendments";
  const amend = (alias, data, extras = {}) =>
    postLocal(alias + ".ab.invalid", data, {
      apiPath: "/api/order-amend",
      ...extras,
    });
  const newAppend = (alias, id, secret, key = crypto.randomUUID(), productId) => {
    return {
      instance_id: shops[alias].context.instance_id,
      order_id: id,
      token: secret,
      request_key: key,
      items: [{ product_id: productId ?? shops[alias].product.id, quantity: 1, unit_price: 0.01 }],
    };
  };
  const aToken = a.body.amendment_token,
    bToken = b.body.amendment_token;
  const baselineItems = await localApi(
    local,
    "neroxa_order_items?order_id=eq." + a.body.order_id + "&select=id",
  );
  assert(
    "HTTPS before-addition item count A",
    baselineItems.status === 200 && Array.isArray(baselineItems.body),
  );
  const appendKey = crypto.randomUUID();
  const appendPayload = newAppend("a", a.body.order_id, aToken, appendKey);
  const acceptedAppend = await amend("a", appendPayload);
  assert(
    "HTTP token-authorized item forgotten appends in store A",
    acceptedAppend.status === 200 && acceptedAppend.body?.payment_state === "NOT_SETTLED",
  );
  assert(
    "HTTPS amendment price server-owned",
    Number(acceptedAppend.body?.added_amount) === Number(shops.a.product.price),
  );
  const retryAppend = await amend("a", appendPayload);
  assert(
    "HTTP idempotent amendment replay does not add twice",
    retryAppend.status === 200 &&
      Number(retryAppend.body?.total) === Number(acceptedAppend.body?.total),
  );
  const afterAmendLines = await localApi(
    local,
    "neroxa_order_items?order_id=eq." + a.body.order_id + "&select=id",
  );
  assert(
    "HTTP replays added exactly one item",
    afterAmendLines.status === 200 && afterAmendLines.body.length === baselineItems.body.length + 1,
  );

  const stolen = await amend(
    "a",
    newAppend("a", a.body.order_id, crypto.randomBytes(32).toString("base64url")),
  );
  assert("HTTP amendment denies wrong buyer secret", stolen.status === 403);
  const switched = await amend("b", newAppend("a", a.body.order_id, aToken));
  assert("HTTP amendment denies cross-store host even with correct token", switched.status === 403);
  const foreignProduct = await amend(
    "a",
    newAppend("a", a.body.order_id, aToken, crypto.randomUUID(), shops.b.product.id),
  );
  assert("HTTP amendment rejects foreign product at PostgreSQL", foreignProduct.status === 409);
  const mismatchedAmendOrigin = await amend("a", newAppend("a", a.body.order_id, aToken), {
    origin: "https://b.ab.invalid:4173",
  });
  assert("HTTP amendment rejects cross-site Origin", mismatchedAmendOrigin.status === 403);

  const bLineBefore = await localApi(
    local,
    "neroxa_order_items?order_id=eq." + b.body.order_id + "&select=id",
  );
  assert("HTTP before-addition item count B", bLineBefore.status === 200);
  const bStatuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await amend("b", newAppend("b", b.body.order_id, bToken));
    bStatuses.push(res.status);
  }
  assert(
    "Buyer token allows five HTTPS amendments with durable quota",
    bStatuses.slice(0, 5).every((code) => code === 200),
  );
  assert("Sixth buyer amendment receives HTTP 429", bStatuses[5] === 429);
  const bLineAfter = await localApi(
    local,
    "neroxa_order_items?order_id=eq." + b.body.order_id + "&select=id",
  );
  assert(
    "Rate-limited buyer cannot add sixth extra line",
    bLineAfter.status === 200 && bLineAfter.body.length === bLineBefore.body.length + 5,
  );

  const directAppend = await fetch(
    new URL("/rest/v1/rpc/neroxa_append_order_items_with_capability", local.API_URL),
    {
      method: "POST",
      headers: {
        apikey: local.ANON_KEY,
        Authorization: "Bearer " + local.ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_instance_id: shops.a.context.instance_id,
        p_order_id: a.body.order_id,
        p_token: aToken,
        p_request_key: crypto.randomUUID(),
        p_items: [{ product_id: shops.a.product.id, quantity: 1 }],
      }),
    },
  );
  assert(
    "Public PostgREST direct-token amendment bypass forbidden",
    [401, 403].includes(directAppend.status),
  );

  const after = {};
  for (const alias of ["a", "b", "c"]) {
    const result = await localApi(
      local,
      "neroxa_orders?instance_id=eq." +
        encodeURIComponent(shops[alias].context.instance_id) +
        "&select=id",
    );
    assert(
      "Final HTTP order count query " + alias,
      result.status === 200 && Array.isArray(result.body),
    );
    after[alias] = result.body.length;
  }
  assert("HTTP creates one net order in A", after.a === before.a + 1);
  assert("HTTP creates six net orders in B", after.b === before.b + 6);
  assert("HTTP causes no C orders", after.c === before.c);

  report.stage = "http-group-addons";
  const rich = await localApi(local, "rpc/get_public_storefront_catalog", "POST", {
    p_domain: "b.ab.invalid",
  });
  assert(
    "HTTP group catalog advertises version",
    rich.status === 200 && rich.body?.selection_contract === "GROUP_ADDONS_V1",
  );
  const gp = rich.body.products.find((p) => p.name === "Pizza fictícia b");
  const gg = rich.body.addon_groups.find((g) => g.products.some((p) => p.product_id === gp?.id));
  assert("HTTP rich fixture product/group available", !!gp && !!gg && gg.addons.length === 1);
  const gl = {
    selection_contract: "GROUP_ADDONS_V1",
    product_id: gp.id,
    group_addon_ids: [gg.addons[0].id],
    size_id: "grande",
    quantity: 1,
    expected_unit_price: 47.25,
  };
  const go = { ...order("b", "00000000333"), items: [gl] };
  const stale = await postLocal("b.ab.invalid", {
    ...go,
    items: [{ ...gl, expected_unit_price: 0.01 }],
  });
  assert(
    "Actual HTTPS grouped stale price returns transactional 409",
    stale.status === 409 && stale.body?.code === "PRICE_CHANGED",
  );
  const grouped = await postLocal("b.ab.invalid", go);
  assert(
    "Actual HTTPS grouped checkout correct price/token",
    grouped.status === 200 &&
      grouped.body?.total === 47.25 &&
      typeof grouped.body?.amendment_token === "string",
  );
  const repeated = await postLocal("b.ab.invalid", go);
  assert(
    "Actual HTTPS grouped retry same order",
    repeated.status === 200 && repeated.body?.order_id === grouped.body.order_id,
  );
  const appendGroup = {
    instance_id: shops.b.context.instance_id,
    order_id: grouped.body.order_id,
    token: grouped.body.amendment_token,
    request_key: crypto.randomUUID(),
    items: [gl],
  };
  const groupAdd = await amend("b", appendGroup);
  assert(
    "Actual HTTPS grouped append price NOT_SETTLED",
    groupAdd.status === 200 &&
      groupAdd.body?.added_amount === 47.25 &&
      groupAdd.body?.payment_state === "NOT_SETTLED",
  );
  const groupReplay = await amend("b", appendGroup);
  assert(
    "Actual HTTPS grouped append replay original receipt",
    groupReplay.status === 200 && groupReplay.body?.total === groupAdd.body?.total,
  );
  report.stage = "done";
  report.summary = {
    gatewayEnabled: true,
    actualHttpRoute: true,
    tls: "ephemeral self-signed on loopback",
    directRpcBeforeHttp: "revoked in isolated stack by preceding integration",
    localOrdersCreated: 8,
    groupedCheckoutAndAppend: true,
    sixContactAttemptsDenied: true,
    buyerTokenIssuedOnlyOnNewOrder: true,
    buyerAmendmentEndpointTested: true,
    amendmentRateLimitVerified: true,
  };
}
try {
  await main();
} catch (e) {
  report.classification = "REPROVADO";
  report.error = {
    stage: report.stage,
    message: String(e.message).slice(0, 190),
  };
} finally {
  if (child) {
    child.kill("SIGTERM");
    await sleep(200).catch(() => {});
  }
  if (logFd !== undefined) {
    try {
      fs.closeSync(logFd);
    } catch {}
  }
  if (tmpConfig) {
    try {
      fs.rmSync(tmpConfig, { force: true });
    } catch {}
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  const passed = report.checks.filter((x) => x.passed).length;
  const failed = report.checks.filter((x) => !x.passed).length;
  console.log(
    "DISPOSABLE_ENABLED_HTTP_CHECKOUT=" +
      JSON.stringify({
        classification: report.classification,
        stage: report.stage,
        passed,
        failed,
      }),
  );
}
if (report.classification === "REPROVADO") process.exitCode = 1;
