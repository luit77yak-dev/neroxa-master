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
    "Rate limiting, abuse protection and live rollout sequencing are not validated.",
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
  const { handleCheckoutRequest } = await import(pathToFileURL(source).href);
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
  localSql(db, "NOTIFY pgrst, 'reload schema';");
  assert("Anonymous direct RPC EXECUTE removed",
    localSql(db, "SELECT has_function_privilege('anon','public.create_public_order(jsonb)','EXECUTE');") === "f");
  assert("Authenticated direct RPC EXECUTE removed",
    localSql(db, "SELECT has_function_privilege('authenticated','public.create_public_order(jsonb)','EXECUTE');") === "f");
  assert("Server-only service role RPC EXECUTE retained",
    localSql(db, "SELECT has_function_privilege('service_role','public.create_public_order(jsonb)','EXECUTE');") === "t");

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

  report.summary = {
    checksPassed: report.checks.filter(x => x.passed).length,
    checksFailed: report.checks.filter(x => !x.passed).length,
    consumer: "Pizza Perfect Plate pinned checkout-gateway.ts",
    rpcBypassDenied: true,
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
