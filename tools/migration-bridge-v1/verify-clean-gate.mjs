import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const project = process.env.AB_PROJECT,
  work = process.env.AB_WORKDIR;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || process.env.BRIDGE_SCENARIO !== "clean")
  throw Error("Clean disposable only");
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
const env = Object.fromEntries(
  fs
    .readFileSync(work + "/status.private.env", "utf8")
    .split("\n")
    .flatMap((l) => {
      const m = l.match(/^([A-Z_]+)="(.*)"$/);
      return m ? [[m[1], m[2]]] : [];
    }),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Local only");
const m = JSON.parse(fs.readFileSync("audits/migration-bridge-v1-20261013/MANIFEST-PONTE.json"));
const e = m.sequence.find((x) => x.phase === "E");
const text = fs.readFileSync(e.path, "utf8");
const checks = [];
let done = false;
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  if (!ok) throw Error(name);
  console.log("PASS " + name);
};
const actors = JSON.parse(fs.readFileSync(work + "/h03-actor.private.json")),
  fixtures = JSON.parse(fs.readFileSync(work + "/h03-fixtures.private.json"));
const api = async (name, args, token = env.ANON_KEY) => {
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
  const browser = JSON.parse(fs.readFileSync("audits/ab-auth/results/first-order-browser.json"));
  check(
    "clean browser substitutes actually passed before cutover",
    browser.classification === "PASS_NORMAL_BUILD_DELIVERY_AND_PANEL_NATIVE" &&
      browser.failed === 0 &&
      browser.sdkReplacementAlias === false,
  );
  check("clean gate hash", crypto.createHash("sha256").update(text).digest("hex") === e.sha256);
  const fingerprint = () =>
    sql(
      "SELECT md5(jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.neroxa_orders o),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.neroxa_order_items i),'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM public.neroxa_order_status_history h))::text);",
    );
  const before = fingerprint();
  sql(
    "BEGIN;SET LOCAL app.bridge_environment='local-disposable';SET LOCAL app.bridge_consumers_frozen='yes';SET LOCAL app.bridge_clean_verified='yes';" +
      text +
      "COMMIT;",
  );
  check(
    "no implicit PUBLIC function execution",
    sql(
      "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname IN ('public','private','neroxa_private') AND p.prokind='f' AND a.grantee=0 AND a.privilege_type='EXECUTE';",
    ) === "0",
  );
  check(
    "no client TRUNCATE bypass",
    sql(
      "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind='r' AND c.relname LIKE 'neroxa_%' AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'TRUNCATE'));",
    ) === "0",
  );
  const own = await api(
    "get_admin_orders",
    { p_instance_id: fixtures[0].instance_id },
    actors.token,
  );
  check(
    "authenticated operational read still works after PUBLIC revoke",
    own.status === 200 && Array.isArray(own.data) && own.data.length > 0,
  );
  for (const f of fixtures.slice(1)) {
    const denied = await api("get_admin_orders", { p_instance_id: f.instance_id }, actors.token);
    check(
      "scoped Auth cannot cross " + f.domain,
      denied.status === 200 && Array.isArray(denied.data) && denied.data.length === 0,
    );
  }
  const catalog = await api("get_public_storefront_catalog", { p_domain: "a.ab.invalid" });
  check(
    "public catalog explicit grant survives cutover",
    catalog.status === 200 && catalog.data?.selection_contract === "GROUP_ADDONS_V1",
  );
  const old = await api("get_public_order_status", {
    p_order_id: own.data[0].id,
    p_customer_phone: "00000000000",
  });
  check(
    "phone tracking not public after cutover",
    old.status === 401 || old.status === 403 || old.data?.code === "42501",
  );
  check(
    "service-only proof recovery retains execution",
    sql(
      "SELECT has_function_privilege('service_role','public.neroxa_recover_group_order(uuid,uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.neroxa_recover_group_order(uuid,uuid,jsonb)','EXECUTE');",
    ) === "t",
  );
  check("clean gate preserves every order/item/history field", fingerprint() === before);
  done = true;
} finally {
  const r = {
    classification: done ? "PASS_CLEAN_POST_CUTOVER_ACL" : "INCOMPLETE",
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    productionApproved: false,
  };
  fs.writeFileSync(
    "audits/ab-auth/results/migration-bridge-clean-acl.json",
    JSON.stringify(r, null, 2),
  );
  console.log(
    JSON.stringify({ classification: r.classification, passed: r.passed, failed: r.failed }),
  );
}
