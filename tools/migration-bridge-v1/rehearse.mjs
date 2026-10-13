// Strictly disposable Docker/PostgreSQL harness. No remote connection support.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const root = "audits/migration-bridge-v1-20261013";
const manifest = JSON.parse(fs.readFileSync(root + "/MANIFEST-PONTE.json"));
const sandbox = JSON.parse(fs.readFileSync(root + "/evidence/sandbox-catalog-readonly.json"))[0]
  .metadata;
const native = JSON.parse(fs.readFileSync("audits/ab-auth/master-catalog-20261009.json"));
const report = {
  classification: "INCONCLUSIVO",
  profile: manifest.profile,
  scope: manifest.scope,
  tests: [],
  productionApproved: false,
  remoteWrites: false,
};
const out = "audits/ab-auth/results";
fs.mkdirSync(out, { recursive: true });
const project = process.env.AB_PROJECT,
  work = process.env.AB_WORKDIR;
if (!project?.startsWith("neroxa-ab-") || !work || process.env.BRIDGE_SCENARIO !== "upgrade")
  throw Error("Disposable upgrade context required");
const db = "supabase_db_" + project;
const inspected = JSON.parse(execFileSync("docker", ["inspect", db], { encoding: "utf8" }))[0];
for (const b of Object.values(inspected.HostConfig.PortBindings ?? {}).flat())
  if (b.HostIp !== "127.0.0.1") throw Error("Loopback required");
const sql = (s) => {
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        db,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw Error("BRIDGE_SQL_FAILED");
  }
};
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const id = () => crypto.randomUUID();
const check = (name, passed) => {
  report.tests.push({ name, passed });
  if (!passed) throw Error("BRIDGE_CHECK_FAILED: " + name);
  console.log("PASS " + name);
};
const denied = (name, s) => {
  let blocked = false;
  try {
    sql("BEGIN;" + s + ";ROLLBACK;");
  } catch {
    blocked = true;
  }
  check(name, blocked);
};
const context =
  "SET LOCAL app.bridge_environment='local-disposable';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='90s';";
for (const [p, hash] of Object.entries(manifest.inputs))
  check(
    "input hash " + path.basename(p),
    crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") === hash,
  );
for (const x of manifest.sequence)
  check(
    "phase hash " + x.phase,
    crypto.createHash("sha256").update(fs.readFileSync(x.path)).digest("hex") === x.sha256,
  );
const phases = Object.fromEntries(
  manifest.sequence.map((x) => [x.phase, { ...x, sql: fs.readFileSync(x.path, "utf8") }]),
);
const digests = () =>
  Object.fromEntries(
    sandbox.relations.map((t) => {
      const cols = sandbox.columns
        .filter((c) => c.table === t.name)
        .map((c) => 't."' + c.name + '"');
      return [
        t.name,
        sql(
          "SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'[]')) FROM (SELECT jsonb_build_array(" +
            cols.join(",") +
            ') x FROM public."' +
            t.name +
            '" t) s;',
        ),
      ];
    }),
  );
let original, resolution;
function apply(phase) {
  const p = phases[phase];
  if (phase !== "A") {
    const hasJournal = sql("SELECT to_regclass('neroxa_bridge.journal') IS NOT NULL;") === "t";
    if (hasJournal) {
      const stored = sql(
        "SELECT sha256 FROM neroxa_bridge.journal WHERE stage=" + quote(phase) + ";",
      );
      if (stored) {
        check("journal hash " + phase, stored === p.sha256);
        check(
          "journal resume preserves data " + phase,
          JSON.stringify(digests()) === JSON.stringify(original),
        );
        return;
      }
    }
    if (
      phase !== "B" &&
      (!hasJournal ||
        sql(
          "SELECT count(*) FROM neroxa_bridge.journal WHERE stage=" +
            quote(String.fromCharCode(phase.charCodeAt(0) - 1)),
        ) !== "1")
    )
      throw Error("BRIDGE_STAGE_ORDER");
  }
  const resolve =
    phase === "C"
      ? "SET LOCAL app.bridge_resolution=" + quote(JSON.stringify(resolution)) + ";"
      : "";
  sql(
    "BEGIN;" +
      context +
      "SET LOCAL app.bridge_consumers_frozen='yes';" +
      resolve +
      p.sql +
      (phase === "A"
        ? ""
        : `INSERT INTO neroxa_bridge.journal(stage,sha256) VALUES(${quote(phase)},${quote(p.sha256)});`) +
      "COMMIT;",
  );
  check(
    "historical identity/value/snapshot digest after " + phase,
    JSON.stringify(digests()) === JSON.stringify(original),
  );
}
try {
  const env = {};
  for (const l of fs.readFileSync(path.join(work, "status.private.env"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)="(.*)"$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.API_URL || !["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
    throw Error("Local Auth only");
  const auth = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const person = await auth.auth.admin.createUser({
    email: "bridge-platform-" + project + "@ab.invalid",
    password: crypto.randomBytes(24).toString("base64url"),
    email_confirm: true,
  });
  if (person.error) throw Error("Synthetic real Auth failed");
  const user = person.data.user.id;
  check(
    "empty application schema before fixture",
    sql(
      "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'neroxa_%' AND relkind='r';",
    ) === "0",
  );
  sql(fs.readFileSync(root + "/observed-sandbox.empty-fixture.sql", "utf8"));
  const org = id(),
    store = id(),
    system = id(),
    productIds = [id(), id(), id(), id()],
    zone = id(),
    orders = [id(), id(), id()];
  let seed = `BEGIN;INSERT INTO public.neroxa_organizations(id,legal_name,trade_name) VALUES(${quote(org)},'Organização histórica inteiramente fictícia','Histórico sintético');
 INSERT INTO public.neroxa_systems(id,slug,name,system_type) VALUES(${quote(system)},'bridge-historical-system','Delivery sintético','DELIVERY');
 INSERT INTO public.neroxa_system_instances(id,organization_id,system_id,name,slug,system_type,status) VALUES(${quote(store)},${quote(org)},${quote(system)},'Loja histórica fictícia','bridge-old','DELIVERY','ACTIVE');
 INSERT INTO public.neroxa_platform_members(user_id,active) VALUES(${quote(user)},true);
 INSERT INTO public.neroxa_storefront_settings(organization_id,half_pizza_pricing_rule) VALUES(${quote(org)},'highest_half');
 INSERT INTO public.neroxa_storefront_delivery_zones(id,organization_id,name,neighborhoods,delivery_fee) VALUES(${quote(zone)},${quote(org)},'Bairro histórico',ARRAY['Bairro sintético'],7);`;
  productIds.forEach(
    (p, i) =>
      (seed += `INSERT INTO public.neroxa_storefront_products(id,instance_id,name,slug,price,metadata) VALUES(${quote(p)},${quote(store)},'Produto histórico ${i}', 'bridge-product-${i}',${30 + i * 10},'{}');`),
  );
  orders.forEach((o, i) => {
    seed += `INSERT INTO public.neroxa_orders(id,organization_id,instance_id,order_number,customer_name,customer_phone,fulfillment,payment_method,status,subtotal,delivery_fee,total,created_at) VALUES(${quote(o)},${quote(org)},${quote(store)},${i + 1},'Perfil sintético ${i}','0000000000${i}','DELIVERY','CASH','READY',70,7,77,'2025-01-01');`;
    [0, 1].forEach(
      (v) =>
        (seed += `INSERT INTO public.neroxa_order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total,addons,complements) VALUES(${quote(id())},${quote(o)},${quote(productIds[v])},'Snapshot histórico ${v}',1,${30 + v * 10},${30 + v * 10},'[{"legacy_type":"product_addon","name":"fictício","price":0}]','[]');`),
    );
    ["RECEIVED", "CONFIRMED", "PREPARING", "READY"].forEach(
      (s, k) =>
        (seed += `INSERT INTO public.neroxa_order_status_history(id,order_id,from_status,to_status,note,created_at) VALUES(${quote(id())},${quote(o)},${k ? quote(["RECEIVED", "CONFIRMED", "PREPARING"][k - 1]) : "NULL"},${quote(s)},'Evento histórico fictício','2025-01-01 00:0${k}:00+00');`),
    );
  });
  sql(seed + "COMMIT;");
  check(
    "faithful source preflight",
    Boolean(sql("BEGIN;" + context + phases.A.sql + "SELECT true;ROLLBACK;")),
  );
  check(
    "source 3 orders 6 items 12 history",
    sql(
      "SELECT (SELECT count(*) FROM public.neroxa_orders)||':'||(SELECT count(*) FROM public.neroxa_order_items)||':'||(SELECT count(*) FROM public.neroxa_order_status_history);",
    ) === "3:6:12",
  );
  original = digests();
  report.before = { counts: { orders: 3, items: 6, history: 12 }, digests: original };
  denied("preflight fails with no disposable marker", phases.A.sql);
  denied(
    "unexpected column rejected",
    context + "ALTER TABLE public.neroxa_orders ADD COLUMN unexpected text;" + phases.A.sql,
  );
  denied(
    "function tamper rejected",
    context + "ALTER FUNCTION public.get_admin_orders(uuid,text) SECURITY INVOKER;" + phases.A.sql,
  );
  denied(
    "ACL drift rejected",
    context + "GRANT SELECT ON public.neroxa_orders TO anon;" + phases.A.sql,
  );
  denied(
    "unknown policy rejected",
    context + "CREATE POLICY unexpected ON public.neroxa_orders USING(true);" + phases.A.sql,
  );
  denied(
    "ambiguous settings-to-instance rejected",
    context +
      `INSERT INTO public.neroxa_system_instances(id,organization_id,name,slug,system_type,status) VALUES(${quote(id())},${quote(org)},'Ambígua','ambiguous','DELIVERY','ACTIVE');` +
      phases.A.sql,
  );
  denied(
    "Auth identity orphan rejected",
    context +
      `INSERT INTO public.neroxa_platform_members(user_id) VALUES(${quote(id())});` +
      phases.A.sql,
  );
  denied(
    "wrong totals rejected",
    context + "UPDATE public.neroxa_orders SET total=999;" + phases.A.sql,
  );
  denied("phase C before expansion rejected", context + phases.C.sql);
  denied(
    "expansion failure rolls back everything",
    context + phases.B.sql + "DO $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE';END $$;",
  );
  check(
    "no journal after failed expansion",
    sql("SELECT to_regclass('neroxa_bridge.journal') IS NULL;") === "t",
  );
  apply("A");
  apply("B");
  apply("B");
  report.expanded = { digests: digests() };
  denied("missing commercial resolution rejected", context + phases.C.sql);
  resolution = {};
  // Synthetic explicit resolutions. Never a proposal to infer these values for real records.
  for (const [table, fields] of Object.entries(manifest.requiredResolution)) {
    if (!fields.length) continue;
    const key =
      table === "neroxa_storefront_settings"
        ? "organization_id"
        : ["neroxa_platform_members", "neroxa_organization_members"].includes(table)
          ? "user_id"
          : "id";
    const ids = JSON.parse(sql(`SELECT coalesce(jsonb_agg(${key}),'[]') FROM public.${table};`));
    resolution[table] = {};
    for (const rowId of ids) {
      const values = {};
      for (const field of fields) {
        const c = native.columns.find((c) => c.table === table && c.name === field);
        if (field === "id") values[field] = id();
        else if (field === "role")
          values[field] = table === "neroxa_platform_members" ? "ADMIN" : "OPERATOR";
        else if (field === "status") values[field] = "ACTIVE";
        else if (field.endsWith("_at")) values[field] = "2025-01-01T00:00:00+00:00";
        else if (c.default)
          values[field] = JSON.parse(sql("SELECT to_jsonb(" + c.default + ")::text;"));
        else throw Error("Synthetic resolution missing");
      }
      resolution[table][rowId] = values;
    }
  }
  // Inject failure *during* updates. Transaction rolls back and journal C must not exist.
  denied(
    "data conversion failure rollback",
    context +
      "SET LOCAL app.bridge_resolution=" +
      quote(JSON.stringify(resolution)) +
      ";" +
      phases.C.sql +
      "DO $$ BEGIN RAISE EXCEPTION 'INJECTED_FAILURE';END $$;",
  );
  check(
    "history intact after conversion rollback",
    JSON.stringify(digests()) === JSON.stringify(original),
  );
  check(
    "failed C not journaled",
    sql("SELECT count(*) FROM neroxa_bridge.journal WHERE stage='C';") === "0",
  );
  apply("C");
  apply("C");
  denied("native preparation refuses unfrozen consumers", context + phases.D.sql);
  apply("D");
  apply("D");
  report.afterPreparation = {
    digests: digests(),
    journal: JSON.parse(
      sql(
        "SELECT jsonb_agg(jsonb_build_object('stage',stage,'sha256',sha256) ORDER BY stage) FROM neroxa_bridge.journal;",
      ),
    ),
  };
  report.originalOrderIds = orders;
  report.syntheticStoreId = store;
  report.originalDigests = original;
  report.classification = "PASS_BOUNDED_OBSERVED_PROFILE_PREPARATION";
  // Private runtime data for further checks; generated exclusively in this disposable runner.
  fs.writeFileSync(
    path.join(work, "bridge.private.json"),
    JSON.stringify({ orders, store, org, products: productIds, original, resolution }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({ classification: report.classification, checks: report.tests.length }),
  );
} catch (e) {
  report.classification = "REPROVADO";
  report.error = String(e.message).slice(0, 200);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    out + "/migration-bridge-preparation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
