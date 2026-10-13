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
      .map((c) => 't."' + c.name + '"')
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
      "BEGIN;INSERT INTO neroxa_bridge.journal(stage,sha256) VALUES('FAILURE_TEST',repeat('0',64));DO $$ BEGIN RAISE EXCEPTION 'INJECTED_POST_CUTOVER';END $$;COMMIT;",
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
    const email = alias.toLowerCase() + "-" + project + "@ab.invalid",
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
      "INSERT INTO neroxa_bridge.journal(stage,sha256) VALUES('E'," +
      q(e.sha256) +
      ");COMMIT;",
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
  check(
    "new Auth grants do not mutate original orders",
    sql("SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o;") ===
      before,
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
