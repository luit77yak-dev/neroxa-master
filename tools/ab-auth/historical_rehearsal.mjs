import fs from "node:fs";
import { execFileSync } from "node:child_process";

const work = process.env.AB_WORKDIR;
const project = process.env.AB_PROJECT;
if (!work || !/^neroxa-rehearsal-[0-9]+$/.test(project))
  throw new Error("Disposable rehearsal context required");
const db = "supabase_db_" + project;
const inspect = JSON.parse(execFileSync("docker", ["inspect", db], { encoding: "utf8" }))[0];
for (const binds of Object.values(inspect.HostConfig.PortBindings ?? {}))
  for (const b of binds ?? [])
    if (b.HostIp !== "127.0.0.1") throw new Error("Database exposed beyond loopback");
const sql = (statement) =>
  execFileSync(
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
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const count = (table) => Number(sql("SELECT count(*) FROM public." + table + ";"));
const result = { stage: "bootstrap", status: "FAIL", productionTouched: false, checks: [] };
const check = (name, condition, detail) => {
  result.checks.push({ name, passed: !!condition, detail });
  if (!condition) throw Error(name + ": " + detail);
};
const save = () => {
  fs.mkdirSync("audits/rehearsal/results", { recursive: true });
  fs.writeFileSync("audits/rehearsal/results/report.json", JSON.stringify(result, null, 2));
};
try {
  const baseline = work + "/baseline.sql";
  execFileSync("python3", ["tools/ab-auth/build_schema.py", baseline], { stdio: "inherit" });
  sql(fs.readFileSync(baseline, "utf8"));
  check(
    "historical relations",
    Number(
      sql(
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'neroxa_%' AND c.relkind IN ('r','v');",
      ),
    ) === 34,
    "expected 34",
  );
  result.stage = "fixture";
  const fixture = fs.readFileSync("audits/sql/historical-two-store-rehearsal.fixture.sql", "utf8");
  // Historical trigger requires the same official-writer context used by existing A/B tests.
  sql(
    "BEGIN; SET LOCAL neroxa.implementation_write_path = 'official';\n" +
      fixture.replace(/^BEGIN;\s*/, "").replace(/COMMIT;[\s\S]*$/, "") +
      "\nCOMMIT;",
  );
  check("three historical instances", count("neroxa_system_instances") === 3, "expected 3");
  check("two historical settings", count("neroxa_storefront_settings") === 2, "expected 2");
  check("three historical zones", count("neroxa_storefront_delivery_zones") === 3, "expected 3");
  const preserved = () =>
    sql(`
 SELECT 'settings|' || coalesce(string_agg((to_jsonb(t)-'instance_id')::text,E'\\n' ORDER BY organization_id::text),'')
 FROM public.neroxa_storefront_settings t;
 SELECT 'zones|' || coalesce(string_agg((to_jsonb(t)-'instance_id')::text,E'\\n' ORDER BY id::text),'')
 FROM public.neroxa_storefront_delivery_zones t;`);
  const originalFields = preserved();
  const before = sql(
    "SELECT (SELECT count(*) FROM public.neroxa_storefront_settings)::text || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones)::text",
  );
  result.stage = "phase1";
  const phase1 = fs.readFileSync("audits/sql/storefront-instance-phase1.candidate.sql", "utf8");
  // Apply the existing candidate verbatim; includes conservative backfill.
  sql(phase1);
  const a = "a0000000-0000-4000-8000-000000000001",
    b = "a0000000-0000-4000-8000-000000000002",
    b1 = "b0000000-0000-4000-8000-000000000003";
  const n = (table, where) =>
    Number(sql("SELECT count(*) FROM public." + table + " WHERE " + where + ";"));
  check(
    "B1 settings automatically mapped",
    n("neroxa_storefront_settings", `organization_id='${b}' AND instance_id='${b1}'`) === 1,
    "unique instance backfill",
  );
  check(
    "B1 zone automatically mapped",
    n("neroxa_storefront_delivery_zones", `organization_id='${b}' AND instance_id='${b1}'`) === 1,
    "unique instance backfill",
  );
  check(
    "A settings deliberately unresolved",
    n("neroxa_storefront_settings", `organization_id='${a}' AND instance_id IS NULL`) === 1,
    "ambiguous settings must remain null",
  );
  check(
    "A zones deliberately unresolved",
    n("neroxa_storefront_delivery_zones", `organization_id='${a}' AND instance_id IS NULL`) === 2,
    "ambiguous zones must remain null",
  );
  result.stage = "phase2-block";
  const phase2 = fs.readFileSync(
    "audits/sql/storefront-instance-phase2-cutover.candidate.sql",
    "utf8",
  );
  let error = "";
  try {
    sql(phase2);
  } catch (e) {
    error = String(e.stderr || e.message).slice(0, 1500);
  }
  check(
    "phase2 rejects ambiguity",
    error.includes("Unresolved instance_id rows"),
    "expected explicit unresolved-row exception; received " + error.slice(0, 220),
  );
  check(
    "phase2 atomic rollback preserved PK",
    sql(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';",
    ).includes("organization_id"),
    "legacy PK should remain",
  );
  check(
    "phase2 preserves fixture counts",
    before ===
      sql(
        "SELECT (SELECT count(*) FROM public.neroxa_storefront_settings)::text || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones)::text",
      ),
    "no rows lost",
  );
  check(
    "phase2 leaves instance nullable",
    sql(
      "SELECT attnotnull FROM pg_attribute WHERE attrelid='public.neroxa_storefront_settings'::regclass AND attname='instance_id';",
    ) === "f",
    "NOT NULL cutover must not happen",
  );
  result.stage = "manual-reconciliation";
  const a1 = "b0000000-0000-4000-8000-000000000001",
    a2 = "b0000000-0000-4000-8000-000000000002";
  const originalSettings = count("neroxa_storefront_settings"),
    originalZones = count("neroxa_storefront_delivery_zones");
  // Explicit simulated business decision: legacy settings and both zones belong to A1.
  // A2 gets an independent settings row; no zones or orders are copied.
  sql(`BEGIN;
 UPDATE public.neroxa_storefront_settings SET instance_id='${a1}' WHERE organization_id='${a}' AND instance_id IS NULL;
 UPDATE public.neroxa_storefront_delivery_zones SET instance_id='${a1}' WHERE organization_id='${a}' AND instance_id IS NULL;
 COMMIT;`);
  check(
    "A1 settings explicitly mapped",
    n("neroxa_storefront_settings", `organization_id='${a}' AND instance_id='${a1}'`) === 1,
    "expected original settings assigned A1",
  );
  check(
    "A1 zones explicitly mapped",
    n("neroxa_storefront_delivery_zones", `organization_id='${a}' AND instance_id='${a1}'`) === 2,
    "both original zones assigned A1",
  );
  check(
    "A2 zones not duplicated",
    n("neroxa_storefront_delivery_zones", `organization_id='${a}' AND instance_id='${a2}'`) === 0,
    "no automatic zone copy",
  );
  check(
    "all existing settings mapped",
    n("neroxa_storefront_settings", "instance_id IS NULL") === 0,
    "no unresolved settings",
  );
  check(
    "all existing zones mapped",
    n("neroxa_storefront_delivery_zones", "instance_id IS NULL") === 0,
    "no unresolved zones",
  );
  check(
    "no zone lost",
    count("neroxa_storefront_delivery_zones") === originalZones,
    "zones unchanged",
  );
  // Phase 2 must be tested before adding the second settings row, because the
  // historical PK is organization_id. After cutover, A2 can receive its own row.
  check(
    "all legacy fields preserved before cutover",
    preserved() === originalFields,
    "all original settings and zones, ignoring only new instance_id",
  );
  result.stage = "resolved-phase2";
  sql(phase2);
  check(
    "settings PK moved to instance",
    sql(
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';",
    ).includes("instance_id"),
    "expected instance-scoped PK",
  );
  check(
    "settings instance required",
    sql(
      "SELECT attnotnull FROM pg_attribute WHERE attrelid='public.neroxa_storefront_settings'::regclass AND attname='instance_id';",
    ) === "t",
    "expected NOT NULL",
  );
  check(
    "zones instance required",
    sql(
      "SELECT attnotnull FROM pg_attribute WHERE attrelid='public.neroxa_storefront_delivery_zones'::regclass AND attname='instance_id';",
    ) === "t",
    "expected NOT NULL",
  );
  check(
    "all legacy fields preserved after cutover",
    preserved() === originalFields,
    "no field loss or modification",
  );
  check(
    "settings preserved through cutover",
    count("neroxa_storefront_settings") === originalSettings,
    "no lost settings",
  );
  // Use the legacy row as an explicit template, changing the store identity.
  sql(`INSERT INTO public.neroxa_storefront_settings (organization_id,instance_id,description,hero_title,min_order_amount,delivery_enabled)
 SELECT organization_id,'${a2}','Configuração própria da loja A2','Cardápio A2',min_order_amount,delivery_enabled
 FROM public.neroxa_storefront_settings WHERE instance_id='${a1}';`);
  check(
    "two independent settings in same organization",
    n("neroxa_storefront_settings", `organization_id='${a}'`) === 2,
    "expected A1 and A2 settings",
  );
  check(
    "A2 independent settings",
    n("neroxa_storefront_settings", `organization_id='${a}' AND instance_id='${a2}'`) === 1,
    "A2 settings created",
  );
  check(
    "B1 retained",
    n("neroxa_storefront_settings", `organization_id='${b}' AND instance_id='${b1}'`) === 1,
    "B1 settings unchanged",
  );
  check(
    "zones remain with A1 and B1",
    count("neroxa_storefront_delivery_zones") === originalZones &&
      n("neroxa_storefront_delivery_zones", `instance_id='${a2}'`) === 0,
    "no zones duplicated",
  );
  // Post-cutover writes are synthetic and local only. Logical restore must
  // preserve them together with their relationships and the whole database.
  result.stage = "post-cutover-writes";
  sql(fs.readFileSync("audits/sql/post-cutover-recovery.fixture.sql", "utf8"));
  check(
    "A1 post-cutover settings",
    n("neroxa_storefront_settings", `instance_id='${a1}' AND hero_title='After cutover A1' AND min_order_amount=21`) === 1,
    "A1 kept its independent configuration",
  );
  check(
    "A2 post-cutover settings",
    n("neroxa_storefront_settings", `instance_id='${a2}' AND hero_title='After cutover A2' AND min_order_amount=42`) === 1,
    "A2 kept its independent configuration",
  );
  check(
    "B1 settings unaffected by A writes",
    n("neroxa_storefront_settings", `instance_id='${b1}' AND hero_title='Cardápio legado B'`) === 1,
    "third shop unchanged",
  );
  check(
    "A2 synthetic zone isolated",
    n("neroxa_storefront_delivery_zones", `instance_id='${a2}' AND name='Synthetic A2 Zone'`) === 1 &&
      n("neroxa_storefront_delivery_zones", `instance_id='${a1}'`) === 2 &&
      n("neroxa_storefront_delivery_zones", `instance_id='${b1}'`) === 1,
    "only A2 receives the new zone",
  );
  check(
    "post-cutover orders from two shops",
    n("neroxa_orders", `instance_id='${a1}' AND total=21`) === 1 &&
      n("neroxa_orders", `instance_id='${a2}' AND total=42`) === 1,
    "distinct order identities and prices",
  );
  check(
    "post-cutover order items and status history",
    count("neroxa_order_items") === 2 && count("neroxa_order_status_history") === 2,
    "two synthetic orders, items, and history rows",
  );
  check(
    "post-cutover order organization matches instance",
    Number(sql("SELECT count(*) FROM public.neroxa_orders o JOIN public.neroxa_system_instances i ON i.id=o.instance_id WHERE o.organization_id<>i.organization_id;")) === 0,
    "zero tenant mismatch",
  );
  check(
    "unsafe legacy organization PK would collide",
    Number(sql("SELECT count(*) FROM (SELECT organization_id FROM public.neroxa_storefront_settings GROUP BY organization_id HAVING count(*) > 1) x;")) === 1,
    "direct key downgrade would lose one store's settings",
  );
  result.postCutover = { syntheticOrders: 2, syntheticItems: 2, syntheticHistory: 2, syntheticNewZones: 1 };
  result.stage = "done";
  result.status = "PASS";
} catch (e) {
  result.error = String(e.message).slice(0, 1000);
  process.exitCode = 1;
} finally {
  save();
  console.log(JSON.stringify(result, null, 2));
}
