// Real disposable PostgreSQL/Auth/PostgREST test of the Pizza Perfect Plate
// gateway core against the candidate Neroxa Master schema. No production refs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const project = process.env.AB_PROJECT;
const work = process.env.AB_WORKDIR;
const reportPath = path.resolve("audits/ab-auth/results/checkout-gateway-integrated.json");
const report = {
  classification: "INCONCLUSIVO",
  stage: "preflight",
  productionCompatibility: false,
  source: "Disposable local full historical Master catalog + candidate migrations; Pizza Perfect Plate gateway pinned source",
  checks: [],
  limitations: [
    "Real local PostgREST and SQL with imported Pizza gateway core, not the deployed TanStack route or Vercel edge.",
    "Host/Origin values in Request are simulated and not cryptographically attested.",
    "No production secrets, production SQL, live domain or live customer data used.",
    "Local PostgreSQL quotas are tested; Vercel/edge IP rate limits, abuse protection, quota retention and live rollout are not validated.",
  ],
};

const assert = (name, condition, detail = "") => {
  const passed = !!condition;
  report.checks.push({ name, passed, ...(detail ? { detail } : {}) });
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) throw new Error("Gateway integration assertion failed: " + name);
};

function readLocalEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function localSql(db, statement) {
  try {
    return execFileSync("docker", [
      "exec", "-i", db, "psql", "-X", "-q", "-A", "-t", "-U", "postgres",
      "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    ], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    throw new Error("Disposable PostgreSQL statement failed");
  }
}

try {
  if (!project?.startsWith("neroxa-ab-") || !work ||
      !fs.existsSync(path.join(work, "status.private.env"))) {
    throw new Error("Explicit disposable Supabase test stack required");
  }
  const db = "supabase_db_" + project;
  const inspect = JSON.parse(execFileSync("docker", ["inspect", db], { encoding: "utf8" }))[0];
  for (const entries of Object.values(inspect.HostConfig.PortBindings ?? {})) {
    for (const entry of entries ?? []) {
      if (!["127.0.0.1", "::1"].includes(entry.HostIp)) {
        throw new Error("Non-loopback disposable database exposure");
      }
    }
  }
  const env = readLocalEnv(path.join(work, "status.private.env"));
  const apiUrl = new URL(env.API_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(apiUrl.hostname) ||
      !["http:", "https:"].includes(apiUrl.protocol) ||
      !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Only local API and local keys accepted");
  }

  report.stage = "import-consumer";
  const source = path.resolve("delivery-consumer/src/server/checkout-gateway.ts");
  if (!fs.existsSync(source)) throw new Error("Pinned delivery consumer checkout gateway missing");
  const { handleCheckoutRequest, CheckoutRateLimitError } = await import(pathToFileURL(source).href);
  assert("Pinned gateway core imported", typeof handleCheckoutRequest === "function");

  const rest = async (roleKey, bearer, route, method, body) => {
    const response = await fetch(new URL("/rest/v1/" + route, apiUrl), {
      method,
      headers: {
        apikey: roleKey,
        Authorization: "Bearer " + bearer,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    let value;
    try { value = raw ? JSON.parse(raw) : null; }
    catch { throw new Error("Non-JSON local PostgREST result"); }
    return { status: response.status, body: value };
  };
  const service = (route, method = "GET", body) =>
    rest(env.SERVICE_ROLE_KEY, env.SERVICE_ROLE_KEY, route, method, body);
  const anonymous = (route, method = "GET", body) =>
    rest(env.ANON_KEY, env.ANON_KEY, route, method, body);

  const contexts = {};
  const products = {};
  const ordersBefore = {};
  for (const alias of ["a", "b", "c"]) {
    const ctx = await service("rpc/get_public_storefront_context", "POST",
      { p_domain: alias + ".ab.invalid" });
    assert("Verified synthetic domain " + alias, ctx.status === 200 &&
      Array.isArray(ctx.body) && ctx.body.length === 1 &&
      ctx.body[0].domain === alias + ".ab.invalid");
    contexts[alias] = ctx.body[0];
    const catalog = await service("neroxa_storefront_products?instance_id=eq." +
      encodeURIComponent(ctx.body[0].instance_id) + "&select=id,price&limit=1");
    assert("Synthetic product for shop " + alias, catalog.status === 200 &&
      Array.isArray(catalog.body) && catalog.body.length === 1);
    products[alias] = catalog.body[0];
    const orders = await service("neroxa_orders?instance_id=eq." +
      encodeURIComponent(ctx.body[0].instance_id) + "&select=id");
    assert("Read synthetic shop order baseline " + alias,
      orders.status === 200 && Array.isArray(orders.body));
    ordersBefore[alias] = orders.body.length;
  }
  assert("A and B belong to same organization but different instances",
    contexts.a.organization_id === contexts.b.organization_id &&
    contexts.a.instance_id !== contexts.b.instance_id);
  assert("C belongs to another organization",
    contexts.c.organization_id !== contexts.a.organization_id);

  // The initial Auth matrix needs anon EXECUTE. Only revoke *after* it passes,
  // and only in this isolated disposable PostgreSQL instance.
  report.stage = "revoke-in-disposable-clone";
  localSql(db, fs.readFileSync("audits/sql/checkout-public-rpc-revoke.release-gate.candidate.sql", "utf8"));
  localSql(db, fs.readFileSync("audits/sql/checkout-durable-rate-limit.candidate.sql", "utf8"));
  localSql(db, "NOTIFY pgrst, 'reload schema';");
  assert("Anonymous direct RPC EXECUTE removed",
    localSql(db, "SELECT has_function_privilege('anon','public.create_public_order(jsonb)','EXECUTE');") === "f");
  assert("Authenticated direct RPC EXECUTE removed",
    localSql(db, "SELECT has_function_privilege('authenticated','public.create_public_order(jsonb)','EXECUTE');") === "f");
  assert("Server-only service role RPC EXECUTE retained",
    localSql(db, "SELECT has_function_privilege('service_role','public.create_public_order(jsonb)','EXECUTE');") === "t");
  assert("Anon cannot invoke quota RPC",
    localSql(db, "SELECT has_function_privilege('anon','public.neroxa_checkout_reserve_quota(uuid,text)','EXECUTE');") === "f");
  assert("Authenticated cannot invoke quota RPC",
    localSql(db, "SELECT has_function_privilege('authenticated','public.neroxa_checkout_reserve_quota(uuid,text)','EXECUTE');") === "f");
  assert("Service role can invoke quota RPC",
    localSql(db, "SELECT has_function_privilege('service_role','public.neroxa_checkout_reserve_quota(uuid,text)','EXECUTE');") === "t");

  const newOrder = (alias, key = crypto.randomUUID()) => ({
    instance_id: contexts[alias].instance_id,
    organization_id: contexts[alias].organization_id,
    store_domain: contexts[alias].domain,
    idempotency_key: key,
    customer_name: "Synthetic Customer " + alias.toUpperCase(),
    customer_phone: "00000000" + ({a:"081",b:"082",c:"083"}[alias]),
    fulfillment: "PICKUP",
    payment_method: "CASH",
    items: [{
      product_id: products[alias].id,
      quantity: 1,
      unit_price: 0.01, // Claimed browser price must be ignored by server.
    }],
  });

  report.stage = "direct-RPC-no-bypass";
  for (const alias of ["a", "b"]) {
    const denied = await anonymous("rpc/create_public_order", "POST", {
      p_order: newOrder(alias),
    });
    assert("Anonymous direct create RPC denied for " + alias,
      [401,403].includes(denied.status) && denied.body?.code === "42501");
  }
  // Actual PostgREST Auth user created only in the ephemeral local stack.
  const admin = createClient(apiUrl.toString(), env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const username = "gateway-" + project + "@ab.invalid";
  const password = crypto.randomBytes(24).toString("base64url");
  const registered = await admin.auth.admin.createUser({
    email: username, password, email_confirm: true,
  });
  if (registered.error) throw new Error("Disposable Auth registration failed");
  const client = createClient(apiUrl.toString(), env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email: username, password });
  if (signed.error || !signed.data.session) {
    throw new Error("Disposable Auth sign-in failed");
  }
  const authenticated = await rest(env.ANON_KEY, signed.data.session.access_token,
    "rpc/create_public_order", "POST", { p_order: newOrder("a") });
  assert("Authenticated direct create RPC denied",
    [401,403].includes(authenticated.status) && authenticated.body?.code === "42501");

  const fingerprint = (context, phone) => crypto.createHmac("sha256", "disposable-local-only-quota-hmac-secret")
    .update(context.instance_id + ":" + phone.replace(/[^0-9]/g, ""))
    .digest("hex");

  // Exercise the exact cross-repository gateway core against real local
  // PostgREST with service_role, as the server-only adapter is designed to do.
  report.stage = "gateway-real-PostgREST";
  const deps = {
    enabled: true,
    resolveContext: async (domain) => {
      const out = await service("rpc/get_public_storefront_context", "POST", {p_domain: domain});
      if (out.status !== 200) throw new Error("Local context RPC failed");
      return Array.isArray(out.body) ? (out.body[0] ?? null) : null;
    },
    reserveQuota: async (context, phone) => {
      const out = await service("rpc/neroxa_checkout_reserve_quota", "POST", {
        p_instance_id: context.instance_id,
        p_contact_fingerprint: fingerprint(context, phone),
      });
      if (out.status === 429 && out.body?.code === "PT429") {
        throw new CheckoutRateLimitError("quota exceeded");
      }
      if (out.status !== 200 || out.body !== true) {
        throw new Error("Disposable quota service failed");
      }
    },
    createOrder: async (payload) => {
      const out = await service("rpc/create_public_order", "POST", {p_order: payload});
      if (out.status !== 200 || !Array.isArray(out.body) || !out.body[0]) {
        throw new Error("Local create order RPC rejected");
      }
      return out.body[0];
    },
  };
  const makeRequest = (alias, payload, extras = {}) => {
    const domain = alias + ".ab.invalid";
    return new Request("https://" + domain + "/api/checkout", {
      method: "POST",
      headers: {
        host: domain,
        origin: "https://" + domain,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...extras,
      },
      body: JSON.stringify({p_order: payload}),
    });
  };

  const aPayload = newOrder("a");
  const bPayload = newOrder("b");
  const aResponse = await handleCheckoutRequest(makeRequest("a", aPayload), deps);
  assert("Gateway creates A checkout through service role", aResponse.status === 200);
  const aCreated = await aResponse.json();
  assert("A order price calculated by PostgreSQL",
    Number(aCreated.total) === Number(products.a.price));
  const bResponse = await handleCheckoutRequest(makeRequest("b", bPayload), deps);
  assert("Gateway creates B checkout through service role", bResponse.status === 200);
  const bCreated = await bResponse.json();
  assert("B order price calculated by PostgreSQL",
    Number(bCreated.total) === Number(products.b.price));
  assert("A and B orders have distinct identities", aCreated.order_id !== bCreated.order_id);

  const repeated = await handleCheckoutRequest(makeRequest("a", aPayload), deps);
  const repeatedBody = repeated.status === 200 ? await repeated.json() : null;
  assert("Gateway retries preserve order idempotency",
    repeated.status === 200 && repeatedBody?.order_id === aCreated.order_id);

  const swap = await handleCheckoutRequest(makeRequest("a", bPayload), deps);
  assert("Cross-shop request body rejected before privileged RPC", swap.status === 403);
  const bogus = await handleCheckoutRequest(makeRequest("a",
    {...aPayload, store_domain:"b.ab.invalid"}), deps);
  assert("Forged store_domain rejected before privileged RPC", bogus.status === 403);
  const unknown = await handleCheckoutRequest(makeRequest("unknown",
    {...aPayload, instance_id:undefined, organization_id:undefined,
      store_domain:undefined, idempotency_key:crypto.randomUUID()}), deps);
  assert("Unknown domain fails closed", unknown.status === 404);
  const productMix = await handleCheckoutRequest(makeRequest("a", {
    ...newOrder("a"), items:[{product_id:products.b.id,quantity:1}],
  }), deps);
  assert("Real SQL rejects other shop product through gateway", productMix.status === 503);

  const late = {};
  for (const alias of ["a","b","c"]) {
    const list = await service("neroxa_orders?instance_id=eq." +
      encodeURIComponent(contexts[alias].instance_id) + "&select=id");
    assert("Read final orders " + alias, list.status === 200 && Array.isArray(list.body));
    late[alias] = list.body.length;
  }
  assert("Exactly one new order in A", late.a === ordersBefore.a + 1);
  assert("Exactly one new order in B", late.b === ordersBefore.b + 1);
  assert("Other-organization shop C unaffected", late.c === ordersBefore.c);

  report.stage = "gateway-real-quota-429";
  // The sixth order attempt from a new synthetic contact must never reach
  // the privileged order RPC. This tests the gateway's actual HTTP 429,
  // not only direct invocation of the PostgreSQL quota function.
  const limitedPhone = "00000000999";
  const beforeLimited = await service("neroxa_orders?instance_id=eq." +
    encodeURIComponent(contexts.b.instance_id) + "&select=id");
  assert("Read B orders before gateway quota probe",
    beforeLimited.status === 200 && Array.isArray(beforeLimited.body));
  const limitedStatuses = [];
  for (let i = 0; i < 6; i++) {
    const payload = {...newOrder("b"), customer_phone: limitedPhone};
    const response = await handleCheckoutRequest(makeRequest("b", payload), deps);
    limitedStatuses.push(response.status);
  }
  assert("Five B gateway order requests accepted in ten-minute contact window",
    limitedStatuses.slice(0, 5).every(x => x === 200));
  assert("Sixth B gateway request blocked with HTTP 429", limitedStatuses[5] === 429);
  const afterLimited = await service("neroxa_orders?instance_id=eq." +
    encodeURIComponent(contexts.b.instance_id) + "&select=id");
  assert("429 prevented creation of a sixth B order",
    afterLimited.status === 200 && afterLimited.body.length === beforeLimited.body.length + 5);

  report.stage = "atomic-durable-quota";
  // One fingerprint, twelve concurrent independent workers (PostgREST HTTP).
  // Only five may reserve the same contact bucket; failed reservations must
  // roll back the simultaneous store counter increment.
  const concurrentFingerprint = crypto.createHash("sha256").update("parallel-quota-probe").digest("hex");
  const requestQuota = (instance_id, digest) => service(
    "rpc/neroxa_checkout_reserve_quota", "POST",
    { p_instance_id: instance_id, p_contact_fingerprint: digest },
  );
  const probes = await Promise.all(Array.from({ length: 12 },
    () => requestQuota(contexts.a.instance_id, concurrentFingerprint)));
  assert("Exactly five quota reservations under concurrent requests",
    probes.filter(p => p.status === 200 && p.body === true).length === 5);
  assert("Other seven concurrent requests receive 429",
    probes.filter(p => p.status === 429 && p.body?.code === "PT429").length === 7);
  const hits = localSql(db,
    "SELECT attempts FROM private.neroxa_checkout_quota_counters " +
    "WHERE instance_id='" + contexts.a.instance_id + "'::uuid AND scope='contact' " +
    "AND identity_hash='" + concurrentFingerprint + "' ORDER BY window_start DESC LIMIT 1;");
  assert("Durable contact quota counter persisted at five", hits === "5");
  const otherShop = await requestQuota(contexts.b.instance_id, concurrentFingerprint);
  assert("Another store has an independent contact quota", otherShop.status === 200 &&
    otherShop.body === true);
  const external = await requestQuota(contexts.c.instance_id, concurrentFingerprint);
  assert("Other organization has independent quota", external.status === 200 &&
    external.body === true);

  // Fill only the store-wide bucket in this discarded DB. The contact
  // fingerprints are synthetic one-off strings; no customer PII is stored.
  const storeBucketBefore = Number(localSql(db,
    "SELECT attempts FROM private.neroxa_checkout_quota_counters " +
    "WHERE instance_id='" + contexts.a.instance_id + "'::uuid AND scope='store' " +
    "ORDER BY window_start DESC LIMIT 1;"));
  assert("Store bucket populated before saturation", Number.isInteger(storeBucketBefore) &&
    storeBucketBefore >= 1 && storeBucketBefore < 60);
  const fillStatement = `DO $fill$ DECLARE idx int; BEGIN
    FOR idx IN ${storeBucketBefore + 1}..60 LOOP
      PERFORM public.neroxa_checkout_reserve_quota(
        '${contexts.a.instance_id}'::uuid,
        md5(idx::text || ':fixture') || md5(idx::text || ':local')
      );
    END LOOP;
  END $fill$;`;
  localSql(db, fillStatement);
  const maxed = await requestQuota(contexts.a.instance_id,
    crypto.createHash("sha256").update("blocked-on-store-wide-quota").digest("hex"));
  assert("Store-wide quota denies after 60 attempts", maxed.status === 429 &&
    maxed.body?.code === "PT429");
  const storeBucketAfter = Number(localSql(db,
    "SELECT attempts FROM private.neroxa_checkout_quota_counters " +
    "WHERE instance_id='" + contexts.a.instance_id + "'::uuid AND scope='store' " +
    "ORDER BY window_start DESC LIMIT 1;"));
  assert("Rejected quota attempt did not increment store bucket", storeBucketAfter === 60);

  report.summary = {
    checksPassed: report.checks.filter(x => x.passed).length,
    checksFailed: report.checks.filter(x => !x.passed).length,
    consumer: "Pizza Perfect Plate pinned checkout-gateway.ts",
    rpcBypassDenied: true,
    durableQuotaSimultaneousRequests: 12,
    durableQuotaEnforced: true,
    gatewayOrders: 2,
    rollbackOrDeploymentProven: false,
  };
  report.stage = "done";
} catch (e) {
  report.classification = "REPROVADO";
  report.error = { stage: report.stage, message: String(e.message).slice(0,180) };
} finally {
  fs.mkdirSync(path.dirname(reportPath), {recursive:true});
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  const passed = report.checks.filter(x => x.passed).length;
  const failed = report.checks.filter(x => !x.passed).length;
  console.log("DISPOSABLE_CHECKOUT_GATEWAY_RESULT=" +
    JSON.stringify({classification:report.classification,stage:report.stage,passed,failed}));
}
if (report.classification === "REPROVADO") process.exitCode = 1;
