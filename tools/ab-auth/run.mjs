import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const out = path.resolve("audits/ab-auth/results");
fs.mkdirSync(out, { recursive: true });
const report = {
  classification: "INCONCLUSIVO",
  stage: "platform",
  source: "Full historical Master catalog 2026-10-09, no customer rows",
  productionCompatibility: false,
  tests: [],
  migrations: [],
  limitations: [
    "Historical catalog is not current production schema proof.",
    "Managed supabase_admin default privileges are recorded, not modified.",
    "Supabase Auth/PostgREST version and runtime differ from production; no production credentials used.",
  ],
};
let failureCode = 0;
const work = process.env.AB_WORKDIR;
const project = process.env.AB_PROJECT;
const db = `supabase_db_${project}`;
const sql = (text) => {
  try {
    return execFileSync(
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
      ],
      { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch (e) {
    const msg = String(e.stderr ?? "").match(/ERROR:\s*([^\n]+)/)?.[1] ?? "SQL failed";
    const error = new Error(msg.slice(0, 240));
    error.stage = report.stage;
    throw error;
  }
};
const id = () => crypto.randomUUID();
const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const tests = report.tests;
async function test(name, actor, request, expected, predicate) {
  const r = await request();
  const passed = expected.includes(r.status) && predicate(r.body);
  tests.push({ name, actor, passed, http: r.status, sqlstate: r.body?.code ?? null });
  console.log(`${passed ? "PASS" : "FAIL"} ${name} [${actor}] HTTP ${r.status}`);
  if (!passed) failureCode = 1;
  return r;
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replaceAll("=", "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid local TOTP secret");
    bits += n.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const p = h[19] & 15;
  return ((h.readUInt32BE(p) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
try {
  if (!work || !project || !project.startsWith("neroxa-ab-"))
    throw new Error("Explicit disposable context required");
  const inspected = JSON.parse(execFileSync("docker", ["inspect", db], { encoding: "utf8" }))[0];
  for (const binds of Object.values(inspected.HostConfig.PortBindings ?? {}))
    for (const b of binds ?? [])
      if (b.HostIp !== "127.0.0.1") throw new Error("Non-loopback published database port");
  const platformContainers = JSON.parse(
    execFileSync("docker", ["ps", "--format", "{{json .}}"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .map((x) => x)
      .join("\n")
      .split("\n")
      .filter(Boolean)
      .map((x) => JSON.parse(x))
      .map((x) => JSON.stringify(x))
      .join(",")
      .replace(/^/, "[")
      .replace(/$/, "]"),
  );
  for (const c of platformContainers.filter((x) => x.Names?.endsWith("_" + project))) {
    const i = JSON.parse(execFileSync("docker", ["inspect", c.Names], { encoding: "utf8" }))[0];
    for (const binds of Object.values(i.HostConfig.PortBindings ?? {}))
      for (const b of binds ?? [])
        if (!["127.0.0.1", "::1"].includes(b.HostIp)) throw new Error("Non-loopback platform bind");
  }
  report.versions = {
    cli: execFileSync("supabase", ["--version"], { encoding: "utf8" }).trim(),
    postgres: sql("SELECT version();"),
    node: process.version,
    images: platformContainers
      .filter((x) => x.Names?.endsWith("_" + project))
      .map((x) => ({ name: x.Names, image: x.Image })),
  };
  const env = {};
  for (const l of fs.readFileSync(path.join(work, "status.private.env"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  const url = env.API_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Only local API accepted");
  for (const key of ["ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (!env[key]) throw new Error("Local status key missing");
    console.log("::add-mask::" + env[key]);
  }
  const health = await fetch(url + "/auth/v1/health");
  if (!health.ok) throw new Error("Real Auth health failed");
  const admin = createClient(url, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const people = {};
  for (const alias of ["opA", "opB", "opC", "orgAdmin", "platform", "outsider"]) {
    const password = crypto.randomBytes(24).toString("base64url");
    const email = `${alias.toLowerCase()}-${project}@ab.invalid`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error("Local Auth create user failed");
    const client = createClient(url, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error("Local Auth login failed");
    const token = signed.data.session.access_token;
    console.log("::add-mask::" + token);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (
      claims.sub !== created.data.user.id ||
      claims.role !== "authenticated" ||
      claims.aal !== "aal1"
    )
      throw new Error("JWT is not an Auth issued authenticated AAL1 identity");
    people[alias] = { id: created.data.user.id, token, client };
    tests.push({ name: "Auth sign-in and JWT identity", actor: alias, passed: true });
  }
  report.stage = "baseline";
  const baseline = path.join(work, "baseline.sql");
  execFileSync("python3", ["tools/ab-auth/build_schema.py", baseline], { stdio: "inherit" });
  sql(fs.readFileSync(baseline, "utf8"));
  report.baseline = {
    relations: Number(
      sql(
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'neroxa_%' AND c.relkind IN ('r','v');",
      ),
    ),
    functions: Number(
      sql(
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f';",
      ),
    ),
    policies: Number(
      sql("SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','private');"),
    ),
  };
  if (
    report.baseline.relations !== 34 ||
    report.baseline.functions !== 50 ||
    report.baseline.policies !== 99
  )
    throw new Error("Complete snapshot object count mismatch");
  report.stage = "candidates";
  for (const file of [
    "instance-membership-foundation.candidate.sql",
    "storefront-instance-phase1.candidate.sql",
    "store-product-category-guard.candidate.sql",
    "storefront-tenant-integrity.candidate.sql",
    "storefront-parent-instance-guard.candidate.sql",
    "store-isolation-policies.candidate.sql",
    "storefront-instance-phase2-cutover.candidate.sql",
    "storefront-settings-zones-rls.candidate.sql",
    "storefront-admin-rpc.candidate.sql",
    "storefront-rpcs-phase2.candidate.sql",
    "store-isolation-prerequisites.assert.sql",
  ]) {
    const text = fs.readFileSync("audits/sql/" + file, "utf8");
    report.currentMigration = file;
    sql(text);
    report.migrations.push({
      file,
      sha256: crypto.createHash("sha256").update(text).digest("hex"),
      applied: true,
    });
  }
  const extra = "audits/sql/store-isolation-runtime-hardening.candidate.sql";
  if (fs.existsSync(extra)) {
    const text = fs.readFileSync(extra, "utf8");
    sql(text);
    report.migrations.push({
      file: path.basename(extra),
      sha256: crypto.createHash("sha256").update(text).digest("hex"),
      applied: true,
    });
  }
  const adminAcl = "audits/sql/admin-order-rpc-acl.release-gate.candidate.sql";
  sql(fs.readFileSync(adminAcl, "utf8"));
  report.migrations.push({
    file: path.basename(adminAcl),
    sha256: crypto.createHash("sha256").update(fs.readFileSync(adminAcl)).digest("hex"),
    applied: true,
  });
  sql(fs.readFileSync("audits/sql/group-addons-pricing.candidate.sql", "utf8"));
  sql(fs.readFileSync("audits/sql/store-availability.candidate.sql", "utf8"));
  sql(fs.readFileSync("audits/sql/checkout-recovery.candidate.sql", "utf8"));
  sql(fs.readFileSync("audits/sql/checkout-reconciliation.candidate.sql", "utf8"));
  sql(fs.readFileSync("audits/sql/operational-order-detail.candidate.sql", "utf8"));
  sql(fs.readFileSync("audits/sql/operational-order-transitions.candidate.sql", "utf8"));
  report.stage = "fixtures";
  const sharedSystem = id();
  const org = id(),
    A = id(),
    B = id(),
    catA = id(),
    catB = id(),
    productA = id(),
    productB = id(),
    orderA = id(),
    orderB = id(),
    zoneA = id(),
    zoneB = id(),
    orgC = id(),
    C = id(),
    catC = id(),
    productC = id(),
    orderC = id(),
    zoneC = id();
  // Only the postgres fixture transaction uses the existing official-writer guard context.
  // No JWT or role is impersonated; HTTP assertions use fresh Auth-issued sessions.
  sql(`BEGIN;
  SET LOCAL neroxa.implementation_write_path = 'official';
  INSERT INTO public.neroxa_organizations(id,legal_name,trade_name) VALUES(${literal(org)},'Organização fictícia A/B','AB fictícia');
  INSERT INTO public.neroxa_organizations(id,legal_name,trade_name) VALUES(${literal(orgC)},'Organização fictícia C','C fictícia');
  INSERT INTO public.neroxa_systems(id,name,slug,system_type) VALUES(${literal(sharedSystem)},'Sistema Delivery inteiramente fictício','ab-system','DELIVERY');
  INSERT INTO public.neroxa_system_instances(id,organization_id,system_id,name,slug,system_type,status) VALUES(${literal(A)},${literal(org)},${literal(sharedSystem)},'Loja fictícia A','ab-a','DELIVERY','ACTIVE'),(${literal(B)},${literal(org)},${literal(sharedSystem)},'Loja fictícia B','ab-b','DELIVERY','ACTIVE');
  INSERT INTO public.neroxa_system_instances(id,organization_id,system_id,name,slug,system_type,status) VALUES(${literal(C)},${literal(orgC)},${literal(sharedSystem)},'Loja fictícia C','ab-c','DELIVERY','ACTIVE');
  INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${literal(org)},${literal(people.opA.id)},'OPERATOR'),(${literal(org)},${literal(people.opB.id)},'OPERATOR'),(${literal(org)},${literal(people.orgAdmin.id)},'ADMIN');
  INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${literal(A)},${literal(people.opA.id)},'OPERATOR'),(${literal(B)},${literal(people.opB.id)},'OPERATOR'),(${literal(A)},${literal(people.orgAdmin.id)},'ADMIN');
  INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${literal(orgC)},${literal(people.opC.id)},'OPERATOR');
  INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${literal(C)},${literal(people.opC.id)},'OPERATOR');
  INSERT INTO public.neroxa_platform_members(user_id,role) VALUES(${literal(people.platform.id)},'ADMIN');
  INSERT INTO public.neroxa_storefront_categories(id,instance_id,name,slug) VALUES(${literal(catA)},${literal(A)},'Categoria fictícia A','cat-a'),(${literal(catB)},${literal(B)},'Categoria fictícia B','cat-b');
  INSERT INTO public.neroxa_storefront_products(id,instance_id,category_id,name,slug,price) VALUES(${literal(productA)},${literal(A)},${literal(catA)},'Produto fictício A','product-a',30),(${literal(productB)},${literal(B)},${literal(catB)},'Produto fictício B','product-b',40);
  INSERT INTO public.neroxa_storefront_settings(organization_id,instance_id,payment_methods) VALUES(${literal(org)},${literal(A)},ARRAY['CASH']),(${literal(org)},${literal(B)},ARRAY['CASH']);
  INSERT INTO public.neroxa_storefront_delivery_zones(id,organization_id,instance_id,name,neighborhoods,delivery_fee) VALUES(${literal(zoneA)},${literal(org)},${literal(A)},'Zona A',ARRAY['Bairro fictício A'],5),(${literal(zoneB)},${literal(org)},${literal(B)},'Zona B',ARRAY['Bairro fictício B'],7);
  INSERT INTO public.neroxa_system_domains(system_instance_id,domain,status) VALUES(${literal(A)},'a.ab.invalid','VERIFIED'),(${literal(B)},'b.ab.invalid','VERIFIED');
  INSERT INTO public.neroxa_orders(id,instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,subtotal,total) VALUES(${literal(orderA)},${literal(A)},${literal(org)},1,'Cliente fictício A','00000000001','PICKUP','CASH',30,30),(${literal(orderB)},${literal(B)},${literal(org)},1,'Cliente fictício B','00000000002','PICKUP','CASH',40,40);
  INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,quantity,unit_price,line_total) VALUES(${literal(orderA)},${literal(productA)},'Produto fictício A',1,30,30),(${literal(orderB)},${literal(productB)},'Produto fictício B',1,40,40);
  INSERT INTO public.neroxa_storefront_categories(id,instance_id,name,slug) VALUES(${literal(catC)},${literal(C)},'Categoria fictícia C','cat-c');
  INSERT INTO public.neroxa_storefront_products(id,instance_id,category_id,name,slug,price) VALUES(${literal(productC)},${literal(C)},${literal(catC)},'Produto fictício C','product-c',50);
  INSERT INTO public.neroxa_storefront_settings(organization_id,instance_id,payment_methods) VALUES(${literal(orgC)},${literal(C)},ARRAY['CASH']);
  INSERT INTO public.neroxa_storefront_delivery_zones(id,organization_id,instance_id,name,neighborhoods,delivery_fee) VALUES(${literal(zoneC)},${literal(orgC)},${literal(C)},'Zona C',ARRAY['Bairro fictício C'],9);
  INSERT INTO public.neroxa_system_domains(system_instance_id,domain,status) VALUES(${literal(C)},'c.ab.invalid','VERIFIED');
  INSERT INTO public.neroxa_orders(id,instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,subtotal,total) VALUES(${literal(orderC)},${literal(C)},${literal(orgC)},1,'Cliente fictício C','00000000004','PICKUP','CASH',50,50);
  INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,quantity,unit_price,line_total) VALUES(${literal(orderC)},${literal(productC)},'Produto fictício C',1,50,50);
  INSERT INTO public.neroxa_order_status_history(order_id,to_status,note) VALUES(${literal(orderA)},'RECEIVED','Fixture fictícia'),(${literal(orderB)},'RECEIVED','Fixture fictícia');COMMIT;`);
  // Explicit fictional shop configuration only, not a migration default/backfill.
  for (const instance of [A, B, C])
    sql(
      `INSERT INTO public.neroxa_storefront_availability(instance_id,enabled,timezone) VALUES(${literal(instance)},true,'America/Sao_Paulo'); INSERT INTO public.neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT ${literal(instance)},d,'00:00'::time,'24:00'::time FROM generate_series(0,6) d;`,
    );
  // Test-only INVOKER probe verifies the database role/claims reached by actual JWT HTTP calls.
  sql(`CREATE FUNCTION public.ab_runtime_identity() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT jsonb_build_object('role',current_user,'uid',auth.uid(),'aal',auth.jwt()->>'aal','superuser',current_setting('is_superuser')) $$;
  REVOKE ALL ON FUNCTION public.ab_runtime_identity() FROM PUBLIC,anon,service_role;
  GRANT EXECUTE ON FUNCTION public.ab_runtime_identity() TO authenticated;`);
  const api = async (actor, resource, method = "GET", body) => {
    const token = actor === "anon" ? env.ANON_KEY : people[actor].token;
    const r = await fetch(url + "/rest/v1/" + resource, {
      method,
      headers: {
        apikey: env.ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const rpc = (actor, fn, args) => api(actor, "rpc/" + fn, "POST", args);
  sql("NOTIFY pgrst, 'reload schema';");
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const probe = await rpc("opA", "ab_runtime_identity", {});
    if (
      probe.status === 200 &&
      probe.body?.role === "authenticated" &&
      probe.body?.uid === people.opA.id
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("PostgREST schema cache did not expose candidate schema");
  report.stage = "matrix";
  for (const actor of Object.keys(people))
    await test(
      "JWT effective PostgreSQL identity",
      actor,
      () => rpc(actor, "ab_runtime_identity", {}),
      [200],
      (r) =>
        r.role === "authenticated" &&
        r.uid === people[actor].id &&
        r.aal === "aal1" &&
        r.superuser === "off",
    );

  // Three-tenant Auth/JWT/PostgREST matrix: C belongs to another organization.
  const cTables = [
    ["neroxa_storefront_products", "id", productC],
    ["neroxa_storefront_categories", "id", catC],
    ["neroxa_orders", "id", orderC],
    ["neroxa_storefront_settings", "instance_id", C],
    ["neroxa_storefront_delivery_zones", "id", zoneC],
  ];
  for (const actor of ["opA", "opB", "opC", "orgAdmin", "outsider", "anon"]) {
    for (const [table, key, record] of cTables) {
      const own = actor === "opC";
      await test(
        table + " SELECT C",
        actor,
        () => api(actor, table + "?" + key + "=eq." + record),
        [200, 401, 403],
        (body) =>
          own
            ? Array.isArray(body) && body.length === 1
            : Array.isArray(body)
              ? body.length === 0
              : !!body?.code,
      );
      if (!own) {
        await test(
          table + " foreign C UPDATE",
          actor,
          () =>
            api(
              actor,
              table + "?" + key + "=eq." + record,
              "PATCH",
              table === "neroxa_orders"
                ? { notes: "Denied C" }
                : table === "neroxa_storefront_settings"
                  ? { description: "Denied C" }
                  : { name: "Denied C" },
            ),
          [200, 401, 403],
          (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
        );
        await test(
          table + " foreign C DELETE",
          actor,
          () => api(actor, table + "?" + key + "=eq." + record, "DELETE"),
          [200, 401, 403],
          (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
        );
      }
    }
  }
  for (const [table, key, record] of [
    ["neroxa_storefront_products", "id", productA],
    ["neroxa_storefront_categories", "id", catA],
    ["neroxa_orders", "id", orderA],
    ["neroxa_storefront_settings", "instance_id", A],
    ["neroxa_storefront_delivery_zones", "id", zoneA],
  ]) {
    await test(
      table + " C cannot read A",
      "opC",
      () => api("opC", table + "?" + key + "=eq." + record),
      [200, 401, 403],
      (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
    );
  }
  await test(
    "C operator cannot use A admin RPC",
    "opC",
    () => rpc("opC", "get_admin_orders", { p_instance_id: A }),
    [200, 401, 403],
    (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
  );
  await test(
    "A operator cannot use C admin RPC",
    "opA",
    () => rpc("opA", "get_admin_orders", { p_instance_id: C }),
    [200, 401, 403],
    (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
  );
  await test(
    "C operator own admin orders",
    "opC",
    () => rpc("opC", "get_admin_orders", { p_instance_id: C }),
    [200],
    (body) => Array.isArray(body) && body.some((o) => o.id === orderC),
  );
  const tables = [
    ["neroxa_storefront_products", "id", productA, productB],
    ["neroxa_storefront_categories", "id", catA, catB],
    ["neroxa_orders", "id", orderA, orderB],
    ["neroxa_storefront_settings", "instance_id", A, B],
    ["neroxa_storefront_delivery_zones", "id", zoneA, zoneB],
  ];
  for (const actor of ["opA", "opB", "orgAdmin", "outsider", "anon"])
    for (const [table, key, a, b] of tables) {
      for (const [store, record] of [
        ["A", a],
        ["B", b],
      ]) {
        const own =
          ((actor === "opA" || actor === "orgAdmin") && store === "A") ||
          (actor === "opB" && store === "B");
        await test(
          `${table} SELECT ${store}`,
          actor,
          () => api(actor, `${table}?${key}=eq.${record}`),
          [200, 401, 403],
          (r) => (own ? Array.isArray(r) && r.length === 1 : !Array.isArray(r) || r.length === 0),
        );
      }
    }
  for (const actor of ["opA", "opB", "orgAdmin", "outsider", "anon"]) {
    const foreign = actor === "opB" ? "A" : "B";
    const target = foreign === "A" ? A : B;
    const targetP = foreign === "A" ? productA : productB;
    const targetCat = foreign === "A" ? catA : catB;
    for (const [table, key, record] of tables) {
      const victim = foreign === "A" ? record : tables.find((x) => x[0] === table)[3];
      await test(
        `${table} foreign UPDATE`,
        actor,
        () =>
          api(
            actor,
            `${table}?${key}=eq.${victim}`,
            "PATCH",
            table === "neroxa_orders"
              ? { notes: "Fictitious unauthorized change" }
              : table === "neroxa_storefront_settings"
                ? { description: "Denied" }
                : { name: "Denied" },
          ),
        [200, 401, 403],
        (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
      );
      await test(
        `${table} foreign DELETE`,
        actor,
        () => api(actor, `${table}?${key}=eq.${victim}`, "DELETE"),
        [200, 401, 403],
        (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
      );
    }
    await test(
      "foreign product INSERT",
      actor,
      () =>
        api(actor, "neroxa_storefront_products", "POST", {
          instance_id: target,
          category_id: targetCat,
          name: "Denied",
          slug: id(),
          price: 1,
        }),
      [400, 401, 403],
      (r) => !!r.code,
    );
    await test(
      "foreign admin RPC",
      actor,
      () => rpc(actor, "get_admin_orders", { p_instance_id: target }),
      [200, 401, 403],
      (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
    );
    await test(
      "foreign status RPC",
      actor,
      () =>
        rpc(actor, "update_admin_order_status", {
          p_order_id: foreign === "A" ? orderA : orderB,
          p_status: "CONFIRMED",
        }),
      [400, 401, 403],
      (r) => !!r.code,
    );
    await test(
      "self grant rejected",
      actor,
      () =>
        api(actor, "neroxa_instance_members", "POST", {
          instance_id: target,
          user_id: people[actor]?.id ?? people.outsider.id,
          role: "ADMIN",
        }),
      [401, 403],
      (r) => !!r.code,
    );
  }
  await test(
    "org admin scoped own product INSERT",
    "orgAdmin",
    () =>
      api("orgAdmin", "neroxa_storefront_products", "POST", {
        instance_id: A,
        category_id: catA,
        name: "Produto novo fictício",
        slug: id(),
        price: 35,
      }),
    [201],
    (r) => Array.isArray(r) && r.length === 1,
  );
  await test(
    "org admin own settings UPDATE",
    "orgAdmin",
    () =>
      api("orgAdmin", `neroxa_storefront_settings?instance_id=eq.${A}`, "PATCH", {
        description: "Configuração fictícia atualizada",
      }),
    [200],
    (r) => Array.isArray(r) && r.length === 1,
  );
  await test(
    "org admin own zone UPDATE",
    "orgAdmin",
    () =>
      api("orgAdmin", `neroxa_storefront_delivery_zones?id=eq.${zoneA}`, "PATCH", {
        name: "Zona fictícia atualizada",
      }),
    [200],
    (r) => Array.isArray(r) && r.length === 1,
  );
  await test(
    "operator cannot write own catalog",
    "opA",
    () => api("opA", `neroxa_storefront_products?id=eq.${productA}`, "PATCH", { price: 1 }),
    [200, 400, 403],
    (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
  );
  await test(
    "cross-store category rejected",
    "orgAdmin",
    () =>
      api("orgAdmin", "neroxa_storefront_products", "POST", {
        instance_id: A,
        category_id: catB,
        name: "Denied",
        slug: id(),
        price: 1,
      }),
    [400, 401, 403],
    (r) => !!r.code,
  );
  await test(
    "own order admin read",
    "opA",
    () => rpc("opA", "get_admin_orders", { p_instance_id: A }),
    [200],
    (r) => Array.isArray(r) && r.some((o) => o.id === orderA),
  );
  await test(
    "own order status RPC",
    "opA",
    () => rpc("opA", "update_admin_order_status", { p_order_id: orderA, p_status: "CONFIRMED" }),
    [200],
    (r) => r?.id === orderA && r?.status === "CONFIRMED",
  );
  await test(
    "own direct order mutation rejected",
    "opA",
    () => api("opA", `neroxa_orders?id=eq.${orderA}`, "PATCH", { total: 1 }),
    [401, 403],
    (r) => !!r.code,
  );
  for (const table of ["neroxa_order_items", "neroxa_order_status_history"]) {
    await test(
      table + " own read",
      "opA",
      () => api("opA", `${table}?order_id=eq.${orderA}`),
      [200],
      (r) => Array.isArray(r) && r.length > 0,
    );
    await test(
      table + " foreign read",
      "opA",
      () => api("opA", `${table}?order_id=eq.${orderB}`),
      [200, 401, 403],
      (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
    );
  }
  for (const store of ["a", "b"])
    await test(
      "public catalog " + store,
      "anon",
      () => rpc("anon", "get_public_storefront_catalog", { p_domain: store + ".ab.invalid" }),
      [200],
      (r) =>
        r?.context?.instance_id === (store === "a" ? A : B) &&
        r.products.every((p) => p.id !== (store === "a" ? productB : productA)),
    );
  // Public catalog must resolve C's domain without leaking A/B catalog rows.
  await test(
    "public catalog C isolated",
    "anon",
    () => rpc("anon", "get_public_storefront_catalog", { p_domain: "c.ab.invalid" }),
    [200],
    (body) =>
      body?.context?.instance_id === C &&
      Array.isArray(body.products) &&
      body.products.some((p) => p.id === productC) &&
      body.products.every((p) => p.id !== productA && p.id !== productB),
  );
  await test(
    "cross-organization status RPC denied",
    "opA",
    () => rpc("opA", "update_admin_order_status", { p_order_id: orderC, p_status: "CONFIRMED" }),
    [400, 401, 403],
    (body) => !!body?.code,
  );
  await test(
    "C operator own order status RPC",
    "opC",
    () => rpc("opC", "update_admin_order_status", { p_order_id: orderC, p_status: "CONFIRMED" }),
    [200],
    (body) => body?.id === orderC && body?.status === "CONFIRMED",
  );
  for (const table of ["neroxa_order_items", "neroxa_order_status_history"]) {
    await test(
      table + " C own read",
      "opC",
      () => api("opC", table + "?order_id=eq." + orderC),
      [200],
      (body) => Array.isArray(body) && body.length > 0,
    );
    await test(
      table + " A cannot read C",
      "opA",
      () => api("opA", table + "?order_id=eq." + orderC),
      [200, 401, 403],
      (body) => (Array.isArray(body) ? body.length === 0 : !!body?.code),
    );
  }
  const cPayload = {
    organization_id: orgC,
    instance_id: C,
    store_domain: "c.ab.invalid",
    customer_name: "Cliente fictício C",
    customer_phone: "00000000005",
    fulfillment: "PICKUP",
    payment_method: "CASH",
    idempotency_key: id(),
    items: [{ product_id: productC, quantity: 1, unit_price: 1 }],
  };
  const cCreated = await test(
    "C checkout calculates server price",
    "anon",
    () => rpc("anon", "create_public_order", { p_order: cPayload }),
    [200],
    (body) => Array.isArray(body) && body.length === 1 && Number(body[0].total) === 50,
  );
  await test(
    "C checkout idempotent retry",
    "anon",
    () => rpc("anon", "create_public_order", { p_order: cPayload }),
    [200],
    (body) => Array.isArray(body) && body[0]?.order_id === cCreated.body?.[0]?.order_id,
  );
  await test(
    "C checkout rejects A product",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: {
          ...cPayload,
          idempotency_key: id(),
          items: [{ product_id: productA, quantity: 1 }],
        },
      }),
    [400, 403],
    (body) => !!body?.code,
  );
  await test(
    "C checkout rejects organization mismatch",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...cPayload, organization_id: org, idempotency_key: id() },
      }),
    [400, 403],
    (body) => !!body?.code,
  );
  if (cCreated.status === 200 && cCreated.body?.[0]?.order_id) {
    await test(
      "C append forgotten item recalculates total",
      "anon",
      () =>
        rpc("anon", "append_public_order_items_with_payment", {
          p_order_id: cCreated.body[0].order_id,
          p_customer_phone: cPayload.customer_phone,
          p_items: [{ product_id: productC, quantity: 1 }],
          p_payment_method: "CASH",
        }),
      [200],
      (body) => Array.isArray(body) && Number(body[0]?.total) === 100,
    );
    await test(
      "C append rejects A product",
      "anon",
      () =>
        rpc("anon", "append_public_order_items_with_payment", {
          p_order_id: cCreated.body[0].order_id,
          p_customer_phone: cPayload.customer_phone,
          p_items: [{ product_id: productA, quantity: 1 }],
          p_payment_method: "CASH",
        }),
      [400, 403],
      (body) => !!body?.code,
    );
  }
  const payload = {
    organization_id: org,
    instance_id: A,
    store_domain: "a.ab.invalid",
    customer_name: "Cliente inteiramente fictício",
    customer_phone: "00000000003",
    fulfillment: "PICKUP",
    payment_method: "CASH",
    idempotency_key: id(),
    items: [{ product_id: productA, quantity: 1, unit_price: 1 }],
  };
  // Verified domain association is enforced in the PostgreSQL candidate.
  // These are consistency checks, NOT trusted request-origin attestation.
  await test(
    "checkout rejects missing catalog domain",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, store_domain: "", idempotency_key: id() },
      }),
    [400],
    (r) => r?.code === "22023",
  );
  await test(
    "checkout rejects unknown catalog domain",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, store_domain: "unknown.ab.invalid", idempotency_key: id() },
      }),
    [401, 403],
    (r) => r?.code === "42501",
  );
  await test(
    "checkout rejects other instance domain in same organization",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, store_domain: "b.ab.invalid", idempotency_key: id() },
      }),
    [401, 403],
    (r) => r?.code === "42501",
  );
  await test(
    "checkout rejects domain from another organization",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, store_domain: "c.ab.invalid", idempotency_key: id() },
      }),
    [401, 403],
    (r) => r?.code === "42501",
  );
  const bPayload = {
    ...payload,
    instance_id: B,
    store_domain: "b.ab.invalid",
    customer_name: "Cliente fictício B",
    idempotency_key: id(),
    items: [{ product_id: productB, quantity: 1, unit_price: 1 }],
  };
  await test(
    "checkout accepts second store in same organization",
    "anon",
    () => rpc("anon", "create_public_order", { p_order: bPayload }),
    [200],
    (r) => Array.isArray(r) && Number(r[0]?.total) === 40,
  );
  await test(
    "checkout rejects forged first-store domain for second store",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...bPayload, store_domain: "a.ab.invalid", idempotency_key: id() },
      }),
    [401, 403],
    (r) => r?.code === "42501",
  );
  const created = await test(
    "public checkout server price",
    "anon",
    () => rpc("anon", "create_public_order", { p_order: payload }),
    [200],
    (r) => Array.isArray(r) && r.length === 1 && Number(r[0].total) === 30,
  );
  await test(
    "public checkout rejects foreign product",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: {
          ...payload,
          idempotency_key: id(),
          items: [{ product_id: productB, quantity: 1 }],
        },
      }),
    [400],
    (r) => !!r.code,
  );
  await test(
    "public checkout rejects organization mismatch",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, organization_id: id(), idempotency_key: id() },
      }),
    [400],
    (r) => !!r.code,
  );
  await test(
    "wrong domain cannot replay idempotent order",
    "anon",
    () =>
      rpc("anon", "create_public_order", {
        p_order: { ...payload, store_domain: "b.ab.invalid" },
      }),
    [401, 403],
    (r) => r?.code === "42501",
  );
  await test(
    "public idempotent retry",
    "anon",
    () => rpc("anon", "create_public_order", { p_order: payload }),
    [200],
    (r) => Array.isArray(r) && r[0]?.order_id === created.body?.[0]?.order_id,
  );
  await test(
    "public tracking rejects wrong contact",
    "anon",
    () =>
      rpc("anon", "get_public_order_status", {
        p_order_id: orderB,
        p_customer_phone: "00000000099",
      }),
    [200, 400, 403],
    (r) => r === null || !!r.code,
  );
  if (created.status === 200 && created.body?.[0]?.order_id) {
    await test(
      "public append valid own product",
      "anon",
      () =>
        rpc("anon", "append_public_order_items_with_payment", {
          p_order_id: created.body[0].order_id,
          p_customer_phone: "00000000003",
          p_items: [{ product_id: productA, quantity: 1 }],
          p_payment_method: "CASH",
        }),
      [200],
      (r) => Array.isArray(r) && Number(r[0]?.total) === 60,
    );
    await test(
      "public append rejects foreign product",
      "anon",
      () =>
        rpc("anon", "append_public_order_items_with_payment", {
          p_order_id: created.body[0].order_id,
          p_customer_phone: "00000000003",
          p_items: [{ product_id: productB, quantity: 1 }],
          p_payment_method: "CASH",
        }),
      [400, 403],
      (r) => !!r.code,
    );
  }
  await test(
    "public append rejects wrong contact",
    "anon",
    () =>
      rpc("anon", "append_public_order_items_with_payment", {
        p_order_id: orderB,
        p_customer_phone: "00000000099",
        p_items: [{ product_id: productA, quantity: 1 }],
        p_payment_method: "CASH",
      }),
    [400, 403],
    (r) => !!r.code,
  );
  await test(
    "platform AAL1 settings denied",
    "platform",
    () =>
      api("platform", `neroxa_storefront_settings?instance_id=eq.${B}`, "PATCH", {
        description: "Denied AAL1",
      }),
    [200, 403],
    (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
  );
  const aal1 = people.platform.token;
  const enrolled = await people.platform.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "AB synthetic TOTP",
  });
  if (enrolled.error) throw new Error("Real Auth TOTP enrollment failed");
  const challenge = await people.platform.client.auth.mfa.challenge({ factorId: enrolled.data.id });
  if (challenge.error) throw new Error("Real Auth MFA challenge failed");
  const verified = await people.platform.client.auth.mfa.verify({
    factorId: enrolled.data.id,
    challengeId: challenge.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (verified.error) throw new Error("Real Auth MFA verify failed");
  const session = await people.platform.client.auth.getSession();
  people.platform.token = session.data.session.access_token;
  console.log("::add-mask::" + people.platform.token);
  if (JSON.parse(Buffer.from(people.platform.token.split(".")[1], "base64url")).aal !== "aal2")
    throw new Error("MFA did not issue real AAL2 token");
  tests.push({ name: "Auth TOTP challenge and real AAL2 JWT", actor: "platform", passed: true });
  await test(
    "AAL2 effective PostgreSQL identity",
    "platform",
    () => rpc("platform", "ab_runtime_identity", {}),
    [200],
    (r) =>
      r.role === "authenticated" &&
      r.uid === people.platform.id &&
      r.aal === "aal2" &&
      r.superuser === "off",
  );

  for (const instance of [A, B])
    await test(
      "platform AAL2 instance read",
      "platform",
      () => api("platform", `neroxa_system_instances?id=eq.${instance}`),
      [200],
      (r) => Array.isArray(r) && r.length === 1,
    );
  await test(
    "platform AAL2 order RPC",
    "platform",
    () => rpc("platform", "get_admin_orders", { p_instance_id: B }),
    [200],
    (r) => Array.isArray(r) && r.some((o) => o.id === orderB),
  );
  await test(
    "platform AAL2 product tenant reassignment denied",
    "platform",
    () =>
      api("platform", `neroxa_storefront_products?id=eq.${productA}`, "PATCH", {
        instance_id: B,
        category_id: catB,
      }),
    [400, 403],
    (r) => !!r.code,
  );
  await test(
    "platform AAL2 category reassignment denied",
    "platform",
    () =>
      api("platform", `neroxa_storefront_categories?id=eq.${catA}`, "PATCH", { instance_id: B }),
    [400, 403],
    (r) => !!r.code,
  );
  await test(
    "platform AAL2 order tenant reassignment denied",
    "platform",
    () => api("platform", `neroxa_orders?id=eq.${orderA}`, "PATCH", { instance_id: B }),
    [200, 400, 403],
    (r) => (Array.isArray(r) ? r.length === 0 : !!r?.code),
  );
  await test(
    "platform AAL2 settings reassignment denied",
    "platform",
    () =>
      api("platform", `neroxa_storefront_settings?instance_id=eq.${A}`, "PATCH", {
        instance_id: B,
      }),
    [400, 403],
    (r) => !!r.code,
  );
  await test(
    "platform AAL2 zone reassignment denied",
    "platform",
    () =>
      api("platform", `neroxa_storefront_delivery_zones?id=eq.${zoneA}`, "PATCH", {
        instance_id: B,
      }),
    [400, 403],
    (r) => !!r.code,
  );
  await test(
    "platform AAL2 parent org reassignment denied",
    "platform",
    () => api("platform", `neroxa_system_instances?id=eq.${A}`, "PATCH", { organization_id: id() }),
    [400, 403],
    (r) => !!r.code,
  );
  people.platform.token = aal1;
  await test(
    "platform AAL1 membership grant rejected",
    "platform",
    () =>
      api("platform", "neroxa_platform_members", "POST", {
        user_id: people.outsider.id,
        role: "ADMIN",
      }),
    [401, 403],
    (r) => !!r.code,
  );
  report.classification = failureCode ? "REPROVADO" : "INCONCLUSIVO";
  report.identities = Object.entries(people).map(([alias, p]) => ({
    alias,
    authUserId: p.id,
    organizationRole:
      alias === "orgAdmin" ? "ADMIN" : ["opA", "opB"].includes(alias) ? "OPERATOR" : null,
    instanceScope: alias === "opB" ? "B" : ["opA", "orgAdmin"].includes(alias) ? "A" : null,
    platformRole: alias === "platform" ? "ADMIN" : null,
  }));
  report.successes = tests.filter((t) => t.passed).length;
  report.failures = tests.filter((t) => !t.passed).length;
  report.note =
    "Real Auth/JWT/PostgREST matrix on historical full catalog. Production release remains unapproved even if this matrix passes.";
} catch (e) {
  failureCode = 1;
  report.error = { stage: report.stage, message: String(e.message).slice(0, 240) };
  console.log("STOP at " + report.stage + ": " + report.error.message);
} finally {
  fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("AB_SANITIZED_RESULT=" + JSON.stringify(report));
  console.log(
    JSON.stringify({
      classification: report.classification,
      stage: report.stage,
      passed: tests.filter((t) => t.passed).length,
      failed: tests.filter((t) => !t.passed).length,
    }),
  );
}
process.exitCode = failureCode;
