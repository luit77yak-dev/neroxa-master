// New checks on the COMPLETE disposable native stack, never a fixture-only schema.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const project = process.env.AB_PROJECT,
  work = process.env.AB_WORKDIR;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || !work) throw Error("Disposable project required");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(work, "status.private.env"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Loopback only");
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
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  if (!ok) throw Error(name);
  console.log("PASS " + name);
};
const api = async (resource, body, key = env.SERVICE_ROLE_KEY, token = key, method = "POST") => {
  const r = await fetch(env.API_URL + "/rest/v1/" + resource, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
};
const rpc = (name, body, key, token) => api("rpc/" + name, body, key, token);
const fixtures = [];
let complete = false;
try {
  for (const [i, alias] of ["a", "b", "c"].entries()) {
    const c = (await rpc("get_public_storefront_context", { p_domain: alias + ".ab.invalid" }))
      .data[0];
    const cat = (await rpc("get_public_storefront_catalog", { p_domain: c.domain })).data;
    const p = crypto.randomUUID(),
      g = crypto.randomUUID(),
      a = crypto.randomUUID();
    sql(
      `INSERT INTO public.neroxa_storefront_products(id,instance_id,category_id,name,slug,price,metadata) VALUES(${q(p)},${q(c.instance_id)},${q(cat.categories[0].id)},${q("Pizza H03 " + alias)},${q("h03-" + p)},${30 + i * 10},'{"kind":"PIZZA","options":[{"id":"tamanho","required":true,"choices":[{"id":"pequena","name":"Pequena","price":0},{"id":"grande","name":"Grande","price":5}]},{"id":"borda","choices":[{"id":"recheada","name":"Recheada","price":2}]}]}'::jsonb);INSERT INTO public.neroxa_storefront_addon_groups(id,instance_id,name,required,min_selections,max_selections) VALUES(${q(g)},${q(c.instance_id)},'Grupo H03 obrigatório',true,1,2);INSERT INTO public.neroxa_storefront_addons(id,group_id,name,price_delta) VALUES(${q(a)},${q(g)},'Gratuito H03',0),(${q(crypto.randomUUID())},${q(g)},'Pago H03',2);INSERT INTO public.neroxa_storefront_product_addon_groups(product_id,group_id) VALUES(${q(p)},${q(g)});`,
    );
    fixtures.push({ ...c, p, g, a, price: 30 + i * 10 });
    check(
      "availability catalog scoped " + alias,
      cat.availability.instance_id === c.instance_id && cat.availability.open === true,
    );
  }
  const A = fixtures[0],
    B = fixtures[1],
    C = fixtures[2];
  const at = "'2026-10-13T15:00:00Z'::timestamptz";
  sql(
    `DELETE FROM public.neroxa_storefront_weekly_hours WHERE instance_id=${q(A.instance_id)}; INSERT INTO public.neroxa_storefront_weekly_hours VALUES(${q(A.instance_id)},2,'12:00','14:00');`,
  );
  check(
    "IANA local noon open",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},${at})`) === "t",
  );
  check(
    "outside hours closed",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},'2026-10-13T18:00Z')`) === "f",
  );
  sql(
    `INSERT INTO public.neroxa_storefront_special_days VALUES(${q(A.instance_id)},'2026-10-13',true)`,
  );
  check(
    "special holiday overrides weekly",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},${at})`) === "f",
  );
  sql(
    `UPDATE public.neroxa_storefront_special_days SET closed=false WHERE instance_id=${q(A.instance_id)}; INSERT INTO public.neroxa_storefront_special_hours VALUES(${q(A.instance_id)},'2026-10-13','09:00','10:00');`,
  );
  check(
    "special windows replace weekly",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},${at})`) === "f",
  );
  check(
    "special window open in timezone",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},'2026-10-13T12:30Z')`) === "t",
  );
  check(
    "A hours never change B or C",
    sql(
      `SELECT private.neroxa_store_is_open(${q(B.instance_id)},${at}) AND private.neroxa_store_is_open(${q(C.instance_id)},${at})`,
    ) === "t",
  );
  sql(
    `DELETE FROM public.neroxa_storefront_special_hours WHERE instance_id=${q(A.instance_id)}; DELETE FROM public.neroxa_storefront_special_days WHERE instance_id=${q(A.instance_id)}; DELETE FROM public.neroxa_storefront_weekly_hours WHERE instance_id=${q(A.instance_id)}; INSERT INTO public.neroxa_storefront_weekly_hours VALUES(${q(A.instance_id)},1,'22:00','02:00');`,
  );
  check(
    "overnight previous day timezone",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},'2026-10-13T04:00Z')`) === "t",
  );
  sql(
    `INSERT INTO public.neroxa_storefront_special_days VALUES(${q(A.instance_id)},'2026-10-13',true);`,
  );
  check(
    "current holiday blocks previous overnight",
    sql(`SELECT private.neroxa_store_is_open(${q(A.instance_id)},'2026-10-13T04:00Z')`) === "f",
  );
  const body = (f) => ({
    organization_id: f.organization_id,
    instance_id: f.instance_id,
    store_domain: f.domain,
    client_cart_reference: "a".repeat(64),
    idempotency_key: crypto.randomUUID(),
    customer_name: "Cliente H03 fictício",
    customer_phone: "00000000001",
    fulfillment: "PICKUP",
    payment_method: "CASH",
    expected_total: f.price,
    items: [
      {
        selection_contract: "GROUP_ADDONS_V1",
        product_id: f.p,
        group_addon_ids: [f.a],
        size_id: "pequena",
        quantity: 1,
        expected_unit_price: f.price,
      },
    ],
  });
  const before = Number(
    sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(A.instance_id)}`),
  );
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=false WHERE instance_id=${q(A.instance_id)}`,
  );
  const denied = await rpc("create_public_order", { p_order: body(A) });
  check(
    "closed denies authoritative checkout",
    denied.status === 423 && denied.data.code === "PT423",
  );
  check(
    "closed creates no rows",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(A.instance_id)}`),
    ) === before,
  );
  sql(
    `DELETE FROM public.neroxa_storefront_special_days WHERE instance_id=${q(A.instance_id)}; DELETE FROM public.neroxa_storefront_weekly_hours WHERE instance_id=${q(A.instance_id)}; UPDATE public.neroxa_storefront_availability SET enabled=true WHERE instance_id=${q(A.instance_id)}; INSERT INTO public.neroxa_storefront_weekly_hours SELECT ${q(A.instance_id)},d,'00:00'::time,'24:00'::time FROM generate_series(0,6) d;`,
  );
  const request = body(A);
  const first = await rpc("create_public_order", { p_order: request });
  check("confirmed real order", first.status === 200);
  const oid = first.data[0].order_id;
  const retries = await Promise.all([
    rpc("create_public_order", { p_order: request }),
    rpc("create_public_order", { p_order: request }),
  ]);
  check(
    "lost response and double click recover same order",
    retries.every((r) => r.status === 200 && r.data[0].order_id === oid) &&
      sql(
        `SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(A.instance_id)} AND idempotency_key=${q(request.idempotency_key)}`,
      ) === "1",
  );
  check(
    "changed original payload rejected",
    (await rpc("create_public_order", { p_order: { ...request, customer_name: "Outro fictício" } }))
      .status === 400,
  );
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=false WHERE instance_id=${q(A.instance_id)}`,
  );
  check(
    "already confirmed replay survives closing",
    (await rpc("create_public_order", { p_order: request })).data[0].order_id === oid,
  );
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=true WHERE instance_id=${q(A.instance_id)}`,
  );
  const amendmentToken = crypto.randomBytes(32).toString("base64url");
  check(
    "fixture buyer capability registered privately",
    (
      await rpc("neroxa_register_order_amendment_capability", {
        p_instance_id: A.instance_id,
        p_order_id: oid,
        p_checkout_key: request.idempotency_key,
        p_token_sha256: crypto.createHash("sha256").update(amendmentToken).digest("hex"),
      })
    ).data === true,
  );
  const priorItems = sql(`SELECT count(*) FROM public.neroxa_order_items WHERE order_id=${q(oid)}`);
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=false WHERE instance_id=${q(A.instance_id)}`,
  );
  check(
    "closed store rejects valid private append capability",
    (
      await rpc("neroxa_append_order_items_with_capability", {
        p_instance_id: A.instance_id,
        p_order_id: oid,
        p_token: amendmentToken,
        p_request_key: crypto.randomUUID(),
        p_items: request.items,
      })
    ).status === 423,
  );
  check(
    "closed append preserves historical items",
    sql(`SELECT count(*) FROM public.neroxa_order_items WHERE order_id=${q(oid)}`) === priorItems,
  );
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=true WHERE instance_id=${q(A.instance_id)}`,
  );
  const recovered = await rpc("neroxa_recover_group_order", {
    p_instance_id: A.instance_id,
    p_checkout_key: request.idempotency_key,
    p_order: request,
  });
  check(
    "private recovery exact proof returns own snapshot",
    recovered.status === 200 &&
      recovered.data.order_id === oid &&
      recovered.data.instance_id === A.instance_id,
  );
  check(
    "recovery key alone cannot reveal data",
    (
      await rpc("neroxa_recover_group_order", {
        p_instance_id: A.instance_id,
        p_checkout_key: request.idempotency_key,
        p_order: { instance_id: A.instance_id, idempotency_key: request.idempotency_key },
      })
    ).status === 403,
  );
  check(
    "recovery cross instance denied",
    (
      await rpc("neroxa_recover_group_order", {
        p_instance_id: B.instance_id,
        p_checkout_key: request.idempotency_key,
        p_order: request,
      })
    ).status === 403,
  );
  check(
    "anon cannot invoke recovery RPC",
    (
      await rpc(
        "neroxa_recover_group_order",
        { p_instance_id: A.instance_id, p_checkout_key: request.idempotency_key, p_order: request },
        env.ANON_KEY,
        env.ANON_KEY,
      )
    ).status === 401,
  );
  sql(
    `UPDATE private.neroxa_group_order_intents SET recovery_expires_at=clock_timestamp()-interval '1 second' WHERE order_id=${q(oid)}`,
  );
  check(
    "expired proof denies lookup",
    (
      await rpc("neroxa_recover_group_order", {
        p_instance_id: A.instance_id,
        p_checkout_key: request.idempotency_key,
        p_order: request,
      })
    ).status === 410,
  );
  check(
    "expired proof cannot create replacement",
    (await rpc("create_public_order", { p_order: request })).status === 410 &&
      sql(
        `SELECT count(*) FROM public.neroxa_orders WHERE instance_id=${q(A.instance_id)} AND idempotency_key=${q(request.idempotency_key)}`,
      ) === "1",
  );
  for (const f of [B, C]) {
    const cross = body(f);
    cross.items = request.items;
    check(
      "cross shop normalized product denied " + f.domain,
      (await rpc("create_public_order", { p_order: cross })).status === 400,
    );
  }
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = "availability-" + crypto.randomUUID() + "@example.invalid",
    password = crypto.randomBytes(24).toString("base64url");
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw Error("Local Auth user creation failed");
  sql(
    `INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${q(A.organization_id)},${q(user.data.user.id)},'OWNER');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(A.instance_id)},${q(user.data.user.id)},'OWNER');`,
  );
  const client = createClient(env.API_URL, env.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw Error("Local Auth login failed");
  const token = login.data.session.access_token;
  check(
    "authenticated owner can update A availability",
    (
      await api(
        "neroxa_storefront_availability?instance_id=eq." + A.instance_id,
        { timezone: "America/Sao_Paulo" },
        env.ANON_KEY,
        token,
        "PATCH",
      )
    ).data.length === 1,
  );
  const cross = await api(
    "neroxa_storefront_availability?instance_id=eq." + B.instance_id,
    { enabled: false },
    env.ANON_KEY,
    token,
    "PATCH",
  );
  check(
    "owner cannot mutate sibling availability",
    cross.status === 200 &&
      cross.data.length === 0 &&
      sql(
        `SELECT enabled FROM public.neroxa_storefront_availability WHERE instance_id=${q(B.instance_id)}`,
      ) === "t",
  );
  check(
    "anon lacks availability writes",
    (
      await api(
        "neroxa_storefront_availability?instance_id=eq." + A.instance_id,
        { enabled: false },
        env.ANON_KEY,
        env.ANON_KEY,
        "PATCH",
      )
    ).status === 401,
  );
  check(
    "private clock helper not publicly executable",
    sql(
      "SELECT has_function_privilege('anon','private.neroxa_store_is_open(uuid,timestamptz)','EXECUTE')",
    ) === "f",
  );
  fs.writeFileSync(path.join(work, "h03-fixtures.private.json"), JSON.stringify(fixtures), {
    mode: 0o600,
  });
  fs.writeFileSync(path.join(work, "h03-actor.private.json"), JSON.stringify({ token }), {
    mode: 0o600,
  });
  check(
    "absent availability never opens",
    sql(`SELECT private.neroxa_store_is_open('${crypto.randomUUID()}',${at})`) === "f",
  );
  sql(
    `DELETE FROM public.neroxa_storefront_weekly_hours WHERE instance_id=${q(C.instance_id)}; DELETE FROM public.neroxa_storefront_availability WHERE instance_id=${q(C.instance_id)};`,
  );
  const absentCatalog = (await rpc("get_public_storefront_catalog", { p_domain: C.domain })).data;
  check(
    "existing shop with absent configuration publishes closed",
    absentCatalog.availability.configured === false && absentCatalog.availability.open === false,
  );
  check(
    "client open flag cannot bypass missing server configuration",
    (
      await rpc("create_public_order", {
        p_order: { ...body(C), availability: { open: true }, timezone: "UTC" },
      })
    ).status === 423,
  );
  sql(
    `INSERT INTO public.neroxa_storefront_availability VALUES(${q(C.instance_id)},true,'America/Sao_Paulo'); INSERT INTO public.neroxa_storefront_weekly_hours SELECT ${q(C.instance_id)},d,'00:00'::time,'24:00'::time FROM generate_series(0,6) d; DELETE FROM public.neroxa_storefront_weekly_hours WHERE instance_id=${q(B.instance_id)};`,
  );
  check(
    "existing configuration without windows stays closed",
    (await rpc("create_public_order", { p_order: body(B) })).status === 423,
  );
  sql(
    `INSERT INTO public.neroxa_storefront_weekly_hours SELECT ${q(B.instance_id)},d,'00:00'::time,'24:00'::time FROM generate_series(0,6) d;`,
  );
  const readFingerprint = crypto.randomBytes(32).toString("hex");
  // Keep the HTTP burst away from a fixed-window boundary; never freeze the server clock.
  const seconds = Number(sql("SELECT extract(second FROM clock_timestamp())"));
  if (seconds > 50) await new Promise((r) => setTimeout(r, (61 - seconds) * 1000));
  const beforeWrites = sql(
    `SELECT coalesce(sum(attempts),0) FROM private.neroxa_checkout_quota_counters WHERE instance_id=${q(A.instance_id)}`,
  );
  let allowed = 0;
  for (let n = 0; n < 30; n++) {
    const response = await rpc("neroxa_recovery_reserve_quota", {
      p_instance_id: A.instance_id,
      p_contact_fingerprint: readFingerprint,
    });
    if (response.status === 200 && response.data === true) allowed++;
  }
  check("real recovery read budget accepts 30 bounded reads", allowed === 30);
  check(
    "real recovery read budget denies 31st read",
    (
      await rpc("neroxa_recovery_reserve_quota", {
        p_instance_id: A.instance_id,
        p_contact_fingerprint: readFingerprint,
      })
    ).status === 429,
  );
  check(
    "recovery reads never consume checkout quota",
    sql(
      `SELECT coalesce(sum(attempts),0) FROM private.neroxa_checkout_quota_counters WHERE instance_id=${q(A.instance_id)}`,
    ) === beforeWrites,
  );
  check(
    "anon cannot reserve privileged read quota",
    (
      await rpc(
        "neroxa_recovery_reserve_quota",
        { p_instance_id: A.instance_id, p_contact_fingerprint: readFingerprint },
        env.ANON_KEY,
        env.ANON_KEY,
      )
    ).status === 401,
  );
  complete = true;
} finally {
  const result = {
    classification: complete ? "PASS_NATIVE" : "INCOMPLETE",
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    productionApproved: false,
  };
  fs.writeFileSync("audits/ab-auth/results/h03-h04.json", JSON.stringify(result, null, 2));
  console.log("H03_H04_RESULT=" + JSON.stringify(result));
}
