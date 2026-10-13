import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const project = process.env.AB_PROJECT,
  work = process.env.AB_WORKDIR;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || !work) throw Error("Disposable fixture required");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(work, "status.private.env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
  throw Error("Loopback required");
const db = "supabase_db_" + project;
const sql = (s) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      db,
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
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) throw Error(name);
};
const rpc = async (name, body, key = env.SERVICE_ROLE_KEY, token = key) => {
  const r = await fetch(env.API_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
};
const fixtures = {};
try {
  for (const [i, alias] of ["a", "b", "c"].entries()) {
    const ctx = await rpc("get_public_storefront_context", { p_domain: alias + ".ab.invalid" });
    check("resolve " + alias, ctx.status === 200);
    const c = ctx.data[0];
    const p = crypto.randomUUID(),
      g = crypto.randomUUID(),
      a = crypto.randomUUID();
    const other = crypto.randomUUID();
    sql(`INSERT INTO public.neroxa_storefront_products(id,instance_id,name,slug,price,metadata) VALUES(${q(p)},${q(c.instance_id)},'Pizza fictícia ${alias}',${q("group-" + p)},${30 + i * 10},'{"kind":"PIZZA","options":[{"id":"tamanho","required":true,"choices":[{"id":"grande","name":"Grande","price":5}]}]}'::jsonb),(${q(other)},${q(c.instance_id)},'Produto sem grupo',${q("plain-" + other)},12,'{}');
INSERT INTO public.neroxa_storefront_addon_groups(id,instance_id,name,required,min_selections,max_selections) VALUES(${q(g)},${q(c.instance_id)},'Cobertura fictícia',true,1,1);
INSERT INTO public.neroxa_storefront_addons(id,group_id,name,price_delta) VALUES(${q(a)},${q(g)},'Queijo fictício',2.25);
INSERT INTO public.neroxa_storefront_product_addon_groups(product_id,group_id) VALUES(${q(p)},${q(g)});`);
    fixtures[alias] = { ...c, p, g, a, other, unit: 37.25 + i * 10 };
  }
  const A = fixtures.a,
    B = fixtures.b,
    C = fixtures.c;
  const line = (f = A) => ({
    selection_contract: "GROUP_ADDONS_V1",
    product_id: f.p,
    group_addon_ids: [f.a],
    size_id: "grande",
    quantity: 2,
    expected_unit_price: f.unit,
  });
  const order = (item = line(), f = A) => ({
    organization_id: f.organization_id,
    instance_id: f.instance_id,
    store_domain: f.domain,
    idempotency_key: crypto.randomUUID(),
    customer_name: "Cliente fictício",
    customer_phone: "00000000001",
    fulfillment: "PICKUP",
    payment_method: "CASH",
    items: [item],
    subtotal: 0.01,
  });
  const create = (p) => rpc("create_public_order", { p_order: p });
  const p = order();
  const first = await create(p);
  check(
    "server cents ignore forged subtotal",
    first.status === 200 && Number(first.data[0].total) === 74.5,
  );
  const id = first.data[0].order_id;
  check("retry same key preserves single order", (await create(p)).data[0].order_id === id);
  check(
    "changed payload same key rejected",
    (await create({ ...p, items: [{ ...line(), quantity: 1 }] })).status === 400,
  );
  const parallel = order();
  const races = await Promise.all([create(parallel), create(parallel), create(parallel)]);
  check(
    "concurrent same key one order",
    races.every((r) => r.status === 200 && r.data[0].order_id === races[0].data[0].order_id),
  );
  for (const [name, item] of [
    ["required group absent", { ...line(), group_addon_ids: [] }],
    ["duplicate addon", { ...line(), group_addon_ids: [A.a, A.a] }],
    ["addon other same-org shop", { ...line(), group_addon_ids: [B.a] }],
    ["addon other organization", { ...line(), group_addon_ids: [C.a] }],
    ["product other shop", { ...line(), product_id: B.p }],
    ["group not linked product", { ...line(), product_id: A.other }],
    ["invalid size", { ...line(), size_id: "nao-existe" }],
    ["required size missing", { ...line(), size_id: null }],
    ["negative quantity", { ...line(), quantity: -1 }],
    ["quantity over limit", { ...line(), quantity: 11 }],
    ["half pizza pending", { ...line(), second_product_id: A.other }],
    ["legacy identifiers mixed", { ...line(), addons: [{ id: A.p }] }],
    ["missing acknowledgement", { ...line(), expected_unit_price: undefined }],
    ["unknown contract", { ...line(), selection_contract: "UNKNOWN" }],
  ]) {
    check(name, (await create(order(item))).status === 400);
  }
  check(
    "forged price never accepted",
    (await create(order({ ...line(), expected_unit_price: 0.01 }))).status === 409,
  );
  sql(`UPDATE public.neroxa_storefront_products SET active=false WHERE id=${q(A.p)};`);
  check("inactive product rejected", (await create(order())).status === 400);
  sql(`UPDATE public.neroxa_storefront_products SET active=true WHERE id=${q(A.p)};`);
  sql(`UPDATE public.neroxa_storefront_addons SET active=false WHERE id=${q(A.a)};`);
  check("inactive addon rejected", (await create(order())).status === 400);
  sql(`UPDATE public.neroxa_storefront_addons SET active=true WHERE id=${q(A.a)};`);
  const extra = crypto.randomUUID();
  sql(
    `INSERT INTO public.neroxa_storefront_addons(id,group_id,name,price_delta) VALUES(${q(extra)},${q(A.g)},'Extra fictício',1);`,
  );
  check(
    "maximum selections enforced",
    (await create(order({ ...line(), group_addon_ids: [A.a, extra] }))).status === 400,
  );
  const snapshot = sql(
    `SELECT selection_snapshot::text FROM public.neroxa_order_items WHERE order_id=${q(id)};`,
  );
  check(
    "text size snapshot, authoritative name/price",
    JSON.parse(snapshot).options[0].choice_id === "grande" &&
      JSON.parse(snapshot).unit_price === 37.25,
  );
  sql(
    `UPDATE public.neroxa_storefront_products SET price=35,name='Nome fictício alterado' WHERE id=${q(A.p)};UPDATE public.neroxa_storefront_addons SET price_delta=3,name='Adicional alterado' WHERE id=${q(A.a)};`,
  );
  check(
    "snapshot unaffected by catalog mutation",
    sql(
      `SELECT selection_snapshot::text FROM public.neroxa_order_items WHERE order_id=${q(id)};`,
    ) === snapshot,
  );
  check("stale cart price conflict before order", (await create(order())).status === 409);
  check(
    "retry after catalog mutation returns old confirmed order",
    (await create(p)).data[0].order_id === id,
  );
  const fresh = { ...line(), expected_unit_price: 43.0, quantity: 1 };
  check("explicit updated price accepted", (await create(order(fresh))).data[0].total === 43);
  const token = crypto.randomBytes(32).toString("base64url"),
    digest = crypto.createHash("sha256").update(token).digest("hex");
  const reg = await rpc("neroxa_register_order_amendment_capability", {
    p_instance_id: A.instance_id,
    p_order_id: id,
    p_checkout_key: p.idempotency_key,
    p_token_sha256: digest,
  });
  check("register private capability", reg.status === 200 && reg.data === true);
  const amendment = {
    p_instance_id: A.instance_id,
    p_order_id: id,
    p_token: token,
    p_request_key: crypto.randomUUID(),
    p_items: [fresh],
  };
  const add = await rpc("neroxa_append_order_items_with_capability", amendment);
  check(
    "append same pricing NOT_SETTLED",
    add.status === 200 &&
      add.data[0].added_amount === 43 &&
      add.data[0].payment_state === "NOT_SETTLED",
  );
  check(
    "append idempotency same receipt",
    (await rpc("neroxa_append_order_items_with_capability", amendment)).data[0].total ===
      add.data[0].total,
  );
  check(
    "append other shop addon rejected",
    (
      await rpc("neroxa_append_order_items_with_capability", {
        ...amendment,
        p_request_key: crypto.randomUUID(),
        p_items: [{ ...fresh, group_addon_ids: [B.a] }],
      })
    ).status === 400,
  );
  check(
    "append wrong instance rejected",
    (
      await rpc("neroxa_append_order_items_with_capability", {
        ...amendment,
        p_instance_id: B.instance_id,
      })
    ).status === 403,
  );
  check(
    "anon cannot append capability",
    (await rpc("neroxa_append_order_items_with_capability", amendment, env.ANON_KEY)).status !==
      200,
  );
  check(
    "legacy service append cannot bypass grouped pricing",
    (
      await rpc("append_public_order_items_with_payment", {
        p_order_id: id,
        p_customer_phone: p.customer_phone,
        p_items: [{ product_id: A.p, quantity: 1, addons: [] }],
        p_payment_method: "CASH",
      })
    ).status === 400,
  );
  const tracked = await rpc(
    "get_public_order_status",
    { p_order_id: id, p_customer_phone: p.customer_phone },
    env.ANON_KEY,
  );
  check(
    "tracking exposes immutable snapshot",
    tracked.status === 200 &&
      tracked.data.items.some((i) => i.selectionSnapshot?.contract === "GROUP_ADDONS_V1"),
  );
  for (const f of [B, C])
    check(
      "independent shop normalized checkout " + f.domain,
      (await create(order(line(f), f))).data[0].total === f.unit * 2,
    );
  // Real Auth JWT against real instance RLS (not postgres/service impersonation).
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const password = crypto.randomBytes(24).toString("base64url");
  const email = "group-" + crypto.randomUUID() + "@ab.invalid";
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw Error("Synthetic Auth creation failed");
  sql(
    `INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${q(A.organization_id)},${q(user.data.user.id)},'OPERATOR');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(A.instance_id)},${q(user.data.user.id)},'OPERATOR');`,
  );
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw Error("Synthetic JWT failed");
  check(
    "authenticated A sees own grouped order",
    (
      await rpc(
        "get_admin_orders",
        { p_instance_id: A.instance_id, p_status: null },
        env.ANON_KEY,
        signed.data.session.access_token,
      )
    ).data.some((o) => o.id === id),
  );
  check(
    "authenticated A denied sibling B",
    (
      await rpc(
        "get_admin_orders",
        { p_instance_id: B.instance_id, p_status: null },
        env.ANON_KEY,
        signed.data.session.access_token,
      )
    ).status === 400,
  );
  check(
    "authenticated A denied organization C",
    (
      await rpc(
        "get_admin_orders",
        { p_instance_id: C.instance_id, p_status: null },
        env.ANON_KEY,
        signed.data.session.access_token,
      )
    ).status === 400,
  );
  check(
    "new helper PUBLIC EXECUTE revoked",
    sql(
      "SELECT has_function_privilege('anon','private.neroxa_prepare_group_item(uuid,jsonb)','EXECUTE')",
    ) === "f",
  );
  check(
    "legacy snapshots remain unknown",
    Number(
      sql("SELECT count(*) FROM public.neroxa_order_items WHERE selection_snapshot='{}'::jsonb"),
    ) > 0,
  );
} finally {
  const report = {
    classification: checks.every((c) => c.passed) ? "PASS_ISOLATED" : "FAIL",
    productionApproved: false,
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
  };
  fs.writeFileSync(
    "audits/ab-auth/results/group-addons.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("GROUP_ADDONS_RESULT=" + JSON.stringify(report));
}
