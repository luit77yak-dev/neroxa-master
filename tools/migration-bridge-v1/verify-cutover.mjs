import { catalogDigestQuery } from "./catalog-fingerprint.mjs";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const work = process.env.AB_WORKDIR,
  project = process.env.AB_PROJECT;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || process.env.BRIDGE_SCENARIO !== "upgrade")
  throw Error("Disposable upgrade only");
const privateState = JSON.parse(fs.readFileSync(work + "/bridge.private.json"));
const source = JSON.parse(
  fs.readFileSync("audits/migration-bridge-v1-20261013/evidence/sandbox-catalog-readonly.json"),
)[0].metadata;
const sql = (s) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_" + project,
      "psql",
      "-XAtq",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const checks = [];
let done = false;
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  if (!ok) throw Error("BRIDGE_FINAL_FAILED " + name);
  console.log("PASS " + name);
};
const env = Object.fromEntries(
  fs
    .readFileSync(work + "/status.private.env", "utf8")
    .split("\n")
    .flatMap((l) => {
      const m = l.match(/^([A-Z_]+)="(.*)"$/);
      return m ? [[m[1], m[2]]] : [];
    }),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Local backend required");
const rpc = async (name, args, token) => {
  const r = await fetch(env.API_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: r.status, data: await r.json() };
};
try {
  for (const table of ["neroxa_orders", "neroxa_order_items", "neroxa_order_status_history"]) {
    const columns = source.columns
      .filter((c) => c.table === table)
      .map((c) =>
        c.type.startsWith("numeric") ? 'trim_scale(t."' + c.name + '")' : 't."' + c.name + '"',
      )
      .join(",");
    const ids = privateState.orders.map(q).join(",");
    const where = table === "neroxa_orders" ? "t.id" : "t.order_id";
    const hash = sql(
      `SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'[]')) FROM (SELECT jsonb_build_array(${columns}) x FROM public.${table} t WHERE ${where} IN (${ids})) s;`,
    );
    check(
      "original IDs and every historical field " + table,
      hash === privateState.original[table],
    );
  }
  check(
    "legacy snapshot marker remains empty, never reinterpreted",
    sql(
      `SELECT count(*) FROM public.neroxa_order_items WHERE order_id IN (${privateState.orders.map(q).join(",")}) AND selection_snapshot<>'{}'::jsonb;`,
    ) === "0",
  );
  check(
    "no historical capability fabricated",
    sql(
      `SELECT count(*) FROM private.neroxa_order_amendment_capabilities WHERE order_id IN (${privateState.orders.map(q).join(",")});`,
    ) === "0",
  );
  // Capture authoritative T1. No rollback to T0: all orders created by compiled browser must survive.
  const before = sql(
    "SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o;",
  );
  const count = Number(sql("SELECT count(*) FROM public.neroxa_orders;"));
  check("new post-cutover native orders exist", count > 3);
  check(
    "new GROUP version2 snapshots exist",
    Number(
      sql(
        "SELECT count(*) FROM public.neroxa_order_items WHERE selection_snapshot->>'contract'='GROUP_ADDONS_V1';",
      ),
    ) > 0,
  );
  // Actual transaction failure after a harmless journal checkpoint; rollback never deletes T1 orders.
  let failed = false;
  try {
    sql(
      "BEGIN;INSERT INTO neroxa_bridge.journal(stage,sha256,catalog_digest) VALUES('FAILURE_TEST',repeat('0',64),repeat('0',32));DO $$ BEGIN RAISE EXCEPTION 'INJECTED_POST_CUTOVER';END $$;COMMIT;",
    );
  } catch {
    failed = true;
  }
  check("post-cutover injected failure caught", failed);
  check(
    "failed checkpoint absent",
    sql("SELECT count(*) FROM neroxa_bridge.journal WHERE stage='FAILURE_TEST';") === "0",
  );
  check(
    "all T1 orders preserved",
    sql("SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o;") ===
      before,
  );
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const tokens = {};
  for (const alias of ["historicOperator", "foreignOperator", "outsider"]) {
    const email = "bridge-" + alias.toLowerCase() + "-" + project + "@ab.invalid",
      password = crypto.randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw Error("Synthetic Auth creation");
    const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const signed = await c.auth.signInWithPassword({ email, password });
    if (signed.error) throw Error("Native Auth login");
    tokens[alias] = { user: created.data.user.id, token: signed.data.session.access_token };
  }
  const foreign = sql(
    `SELECT id FROM public.neroxa_system_instances WHERE id<>${q(privateState.store)} ORDER BY id LIMIT 1;`,
  );
  sql(`BEGIN;INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${q(privateState.org)},${q(tokens.historicOperator.user)},'OPERATOR');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(privateState.store)},${q(tokens.historicOperator.user)},'OPERATOR');
 INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) SELECT organization_id,${q(tokens.foreignOperator.user)},'OPERATOR' FROM public.neroxa_system_instances WHERE id=${q(foreign)};
 INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(foreign)},${q(tokens.foreignOperator.user)},'OPERATOR');COMMIT;`);
  for (const [actor, x] of Object.entries(tokens)) {
    const r = await rpc(
      "get_admin_orders",
      { p_instance_id: privateState.store, p_status: null },
      x.token,
    );
    check(
      "historical authenticated read " + actor,
      r.status === 200 &&
        Array.isArray(r.data) &&
        r.data.length === (actor === "historicOperator" ? 3 : 0),
    );
  }
  // New native GROUP order on the ORIGINAL retained store, not only newly seeded stores.
  // These are explicit synthetic operational grants/configuration, never real owner recovery.
  sql(
    `BEGIN;UPDATE public.neroxa_organization_members SET role='OWNER' WHERE organization_id=${q(privateState.org)} AND user_id=${q(tokens.historicOperator.user)};UPDATE public.neroxa_instance_members SET role='OWNER' WHERE instance_id=${q(privateState.store)} AND user_id=${q(tokens.historicOperator.user)};INSERT INTO public.neroxa_system_domains(system_instance_id,domain,status) VALUES(${q(privateState.store)},'bridge-historical.ab.invalid','VERIFIED');COMMIT;`,
  );
  const send = async (resource, body, token = tokens.historicOperator.token) => {
    const r = await fetch(env.API_URL + "/rest/v1/" + resource, {
      method: "POST",
      headers: {
        apikey: env.ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  const opened = await send("neroxa_storefront_availability", {
    instance_id: privateState.store,
    enabled: true,
    timezone: "America/Sao_Paulo",
  });
  check("authorized real Auth configures retained store availability", opened.status === 201);
  const hours = await send(
    "neroxa_storefront_weekly_hours",
    Array.from({ length: 7 }, (_, weekday) => ({
      instance_id: privateState.store,
      weekday,
      opens_at: "00:00",
      closes_at: "24:00",
    })),
  );
  check("authorized scoped owner configures retained store hours", hours.status === 201);
  const group = crypto.randomUUID(),
    addon = crypto.randomUUID();
  sql(
    `BEGIN;INSERT INTO public.neroxa_storefront_addon_groups(id,instance_id,name,required,min_selections,max_selections) VALUES(${q(group)},${q(privateState.store)},'Grupo novo sintético do legado',true,1,1);INSERT INTO public.neroxa_storefront_addons(id,group_id,name,price_delta) VALUES(${q(addon)},${q(group)},'Adicional novo sintético',2);INSERT INTO public.neroxa_storefront_product_addon_groups(product_id,group_id) VALUES(${q(privateState.products[0])},${q(group)});COMMIT;`,
  );
  const newKey = crypto.randomUUID();
  const payload = {
    organization_id: privateState.org,
    instance_id: privateState.store,
    store_domain: "bridge-historical.ab.invalid",
    customer_name: "Novo perfil completamente fictício",
    customer_phone: "00000000123",
    fulfillment: "DELIVERY",
    payment_method: "CASH",
    address_street: "Rua fictícia do ensaio",
    address_number: "123",
    address_neighborhood: "Bairro sintético",
    idempotency_key: newKey,
    selection_contract: "GROUP_ADDONS_V1",
    expected_total: 39,
    expected_delivery_fee: 7,
    items: [
      {
        product_id: privateState.products[0],
        quantity: 1,
        selection_contract: "GROUP_ADDONS_V1",
        expected_unit_price: 32,
        group_addon_ids: [addon],
      },
    ],
  };
  const created = await rpc("create_public_order", { p_order: payload }, env.SERVICE_ROLE_KEY);
  check(
    "new native order on preserved original instance",
    created.status === 200 && Array.isArray(created.data) && Number(created.data[0].total) === 39,
  );
  const newOrder = created.data[0].order_id;
  check(
    "original store new order persisted with GROUP v2 and exact fee",
    sql(
      `SELECT count(*) FROM public.neroxa_orders o JOIN public.neroxa_order_items i ON i.order_id=o.id WHERE o.id=${q(newOrder)} AND o.instance_id=${q(privateState.store)} AND o.subtotal=32 AND o.delivery_fee=7 AND o.total=39 AND i.selection_snapshot->>'contract'='GROUP_ADDONS_V1' AND i.selection_snapshot->>'version'='2';`,
    ) === "1",
  );
  const retried = await rpc("create_public_order", { p_order: payload }, env.SERVICE_ROLE_KEY);
  check(
    "retained store idempotent retry preserves unique new order",
    retried.status === 200 &&
      retried.data[0].order_id === newOrder &&
      sql(
        `SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(privateState.store)} AND idempotency_key=${q(newKey)};`,
      ) === "1",
  );
  const recovered = await rpc(
    "neroxa_recover_group_order",
    { p_instance_id: privateState.store, p_checkout_key: newKey, p_order: payload },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "retained store new proof recovery works",
    recovered.status === 200 && JSON.stringify(recovered.data).includes(newOrder),
  );
  const altered = await rpc(
    "create_public_order",
    { p_order: { ...payload, customer_name: "Outro perfil fictício" } },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "same historical store intent rejects altered payload",
    altered.status >= 400 &&
      sql(
        `SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(privateState.store)} AND idempotency_key=${q(newKey)};`,
      ) === "1",
  );
  // Advance the T1 checkpoint after the additional real native write; no restore to T0.
  const afterNativeWrite = sql(
    "SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o;",
  );
  // Cutover gate only after substitutes were exercised with real browser and ingress remains offline.
  const bridgeManifest = JSON.parse(
    fs.readFileSync("audits/migration-bridge-v1-20261013/MANIFEST-PONTE.json"),
  );
  const e = bridgeManifest.sequence.find((x) => x.phase === "E");
  const gate = fs.readFileSync(e.path, "utf8");
  check("cutover gate hash", crypto.createHash("sha256").update(gate).digest("hex") === e.sha256);
  sql(
    "BEGIN;SET LOCAL app.bridge_environment='local-disposable';SET LOCAL app.bridge_consumers_frozen='yes';" +
      gate +
      "INSERT INTO neroxa_bridge.journal(stage,sha256,catalog_digest) VALUES('E'," +
      q(e.sha256) +
      ",(" +
      catalogDigestQuery +
      "));COMMIT;",
  );
  check(
    "client roles have no RLS-bypassing TRUNCATE",
    sql(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind='r' AND c.relname LIKE 'neroxa_%' AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'));",
    ) === "0",
  );
  const old = await rpc(
    "get_public_order_status",
    { p_order_id: privateState.orders[0], p_customer_phone: "00000000000" },
    env.ANON_KEY,
  );
  check(
    "legacy public phone tracking disabled in frozen test cutover",
    old.status === 401 || old.status === 403 || old.data?.code === "42501",
  );
  check(
    "all 16 projected tables keep RLS",
    sql(
      "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'neroxa_%' AND relkind='r' AND NOT relrowsecurity;",
    ) === "0",
  );
  check(
    "historical FKs prevent cascade deletion",
    sql(
      "SELECT count(*) FROM pg_constraint WHERE conrelid='public.neroxa_orders'::regclass AND contype='f' AND confdeltype='c';",
    ) === "0",
  );
  const historicalKey = privateState.keys[2],
    historicalId = privateState.orders[2];
  const rejectedOld = await rpc(
    "create_public_order",
    { p_order: { ...payload, idempotency_key: historicalKey } },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "old keyed order cannot become GROUP or duplicate",
    rejectedOld.status === 400 &&
      rejectedOld.data?.code === "22023" &&
      sql(
        `SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(privateState.store)} AND idempotency_key=${q(historicalKey)};`,
      ) === "1",
  );
  const historicalRecovery = await rpc(
    "neroxa_recover_group_order",
    {
      p_instance_id: privateState.store,
      p_checkout_key: historicalKey,
      p_order: { ...payload, idempotency_key: historicalKey },
    },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "old key alone is not buyer recovery proof",
    historicalRecovery.status === 403 && historicalRecovery.data?.code === "42501",
  );
  const deniedCapability = await rpc(
    "neroxa_register_order_amendment_capability",
    {
      p_instance_id: privateState.store,
      p_order_id: historicalId,
      p_checkout_key: historicalKey,
      p_token_sha256: crypto.randomBytes(32).toString("hex"),
    },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "received historical order cannot gain artificial capability",
    deniedCapability.status === 403 &&
      deniedCapability.data?.code === "42501" &&
      deniedCapability.data?.message?.includes("Historical order has no new buyer proof"),
  );
  let blockedProof = false;
  try {
    sql(
      `BEGIN;INSERT INTO private.neroxa_group_order_intents(order_id,payload_sha256,recovery_expires_at) VALUES(${q(historicalId)},repeat('0',64),clock_timestamp()+interval '1 hour');ROLLBACK;`,
    );
  } catch (e) {
    blockedProof = String(e.stderr ?? "").includes("Historical order has no new buyer proof");
  }
  check("privileged attempt to retrofit historical intent fails closed", blockedProof);
  const newCap = await rpc(
    "neroxa_register_order_amendment_capability",
    {
      p_instance_id: privateState.store,
      p_order_id: newOrder,
      p_checkout_key: newKey,
      p_token_sha256: crypto.randomBytes(32).toString("hex"),
    },
    env.SERVICE_ROLE_KEY,
  );
  check(
    "new legitimate native order still accepts private capability",
    newCap.status === 200 && newCap.data === true,
  );
  check(
    "all historical buyer capabilities remain absent",
    sql(
      `SELECT count(*) FROM private.neroxa_order_amendment_capabilities WHERE order_id IN (${privateState.orders.map(q).join(",")});`,
    ) === "0",
  );
  const detail = await rpc(
    "get_admin_order_detail",
    { p_instance_id: privateState.store, p_order_id: historicalId },
    tokens.historicOperator.token,
  );
  check(
    "historical half item remains readable only by scoped Auth",
    detail.status === 200 &&
      detail.data?.items?.length === 2 &&
      detail.data.items.some((x) => x.is_half) &&
      detail.data?.history?.length === 1,
  );
  check(
    "post-cutover native order and existing T1 writes preserved",
    sql("SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o;") ===
      afterNativeWrite,
  );
  done = true;
} finally {
  const r = {
    classification: done ? "PASS_BOUNDED_UPGRADE_AND_T1_ROLL_FORWARD" : "INCOMPLETE",
    checks,
    passed: checks.filter((x) => x.passed).length,
    failed: checks.filter((x) => !x.passed).length,
    scope: "16-table operational projection; no shared Master financial lifecycle certification",
    independentRestore: false,
    realSandboxRolesResolved: false,
    productionApproved: false,
  };
  fs.writeFileSync(
    "audits/ab-auth/results/migration-bridge-cutover.json",
    JSON.stringify(r, null, 2),
  );
  console.log(
    JSON.stringify({ classification: r.classification, passed: r.passed, failed: r.failed }),
  );
}
