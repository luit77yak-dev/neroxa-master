import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const work = process.env.AB_WORKDIR;
const project = process.env.AB_PROJECT;
if (!work || !/^neroxa-rehearsal-[0-9]+$/.test(project)) {
  throw new Error("Disposable rehearsal context required");
}
const container = "supabase_db_" + project;
const inspect = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
for (const bindings of Object.values(inspect.HostConfig.PortBindings ?? {})) {
  for (const binding of bindings ?? []) {
    if (binding.HostIp !== "127.0.0.1") throw new Error("Database exposed beyond loopback");
  }
}
// Use an attached stream only for short SQL commands. The private Docker
// relay does not support streaming large COPY payloads through docker exec -i.
const run = (args, input) => execFileSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), container, ...args], {
  ...(input === undefined ? {} : { input }),
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const psql = (database, sql) => run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql).trim();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const evidence = { stage: "start", status: "FAIL", productionTouched: false, checks: [] };
const check = (name, ok) => {
  evidence.checks.push({ name, passed: Boolean(ok) });
  if (!ok) throw new Error(name);
};
const query = (db) => psql(db, `
SELECT 'settings|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.instance_id::text), '')
FROM (SELECT instance_id, organization_id, description, hero_title, min_order_amount, delivery_enabled FROM public.neroxa_storefront_settings ORDER BY instance_id) t;
SELECT 'zones|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_storefront_delivery_zones ORDER BY id) t;
SELECT 'instances|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_system_instances ORDER BY id) t;
SELECT 'pk|' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';
SELECT 'counts|' || (SELECT count(*) FROM public.neroxa_storefront_settings) || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones);
`);
const runId = process.env.GITHUB_RUN_ID;
if (!/^[0-9]+$/.test(runId ?? "")) throw new Error("Safe CI run ID required");
const dumpPath = "/tmp/neroxa-restore-" + runId + ".dump";
const out = "audits/rehearsal/results/restore-report.json";
let cloneCreated = false;
try {
  evidence.stage = "source-baseline";
  // Called only after historical_rehearsal.mjs has populated the disposable database.
  check("historical rehearsal report passed", JSON.parse(fs.readFileSync("audits/rehearsal/results/report.json", "utf8")).status === "PASS");
  // The source database is already cut over. Snapshot it and restore the dump
  // into a separate disposable database; never mutate the source.
  const baseline = query("postgres");
  // Dump the entire disposable database, including Supabase-managed Auth and
  // extension dependencies. A public-only dump cannot restore auth.uid() etc.
  // Preserve OWNER and ACL statements so permissions can be checked on restore.
  check("source local Auth schema exists", psql("postgres", "SELECT count(*) FROM pg_namespace WHERE nspname='auth';") === "1");
  // Keep the complete custom-format archive INSIDE the disposable DB container.
  // Large plain SQL over docker exec -i breaks the private Docker transport.
  evidence.stage = "archive-in-disposable-container";
  run(["pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom", "--file", dumpPath]);
  evidence.dumpSha256 = run(["sha256sum", dumpPath]).trim().split(/\\s+/)[0];
  evidence.dumpScope = "complete local disposable Supabase database (Auth, public, dependencies, owners, ACLs)";
  evidence.dumpFormat = "PostgreSQL custom archive, container-local";
  check("nonempty local logical archive", Number(run(["stat", "-c", "%s", dumpPath]).trim()) > 1000);
  const restoreDb = "neroxa_restore_" + process.env.GITHUB_RUN_ID;
  check("safe restore database name", /^neroxa_restore_[0-9]+$/.test(restoreDb));
  evidence.stage = "separate-restore-database";
  psql("postgres", 'CREATE DATABASE "' + restoreDb + '";');
  cloneCreated = true;
  // A fresh DB has public; pg_restore manages dependencies and schema order.
  // Keep the restore database separate from the source of the historical test.
  check("target public schema exists", psql(restoreDb, "SELECT count(*) FROM pg_namespace WHERE nspname='public';") === "1");
  // Use pg_restore within the disposable container; fail atomically on ANY
  // SQL error. Archive restore handles extensions and schema ordering.
  evidence.stage = "restore-archive";
  run(["pg_restore", "-U", "postgres", "-d", restoreDb, "--format=custom", "--clean", "--if-exists", "--exit-on-error", "--single-transaction", dumpPath]);
  check("Supabase Auth schema restored", psql(restoreDb, "SELECT count(*) FROM pg_namespace WHERE nspname='auth';") === "1");
  const catalog = (db) => psql(db, `
SELECT 'tables|' || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
SELECT 'policies|' || count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'triggers|' || count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal;
SELECT 'constraints|' || count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public';
SELECT 'grants|' || coalesce(md5(string_agg(grantee || ':' || table_name || ':' || privilege_type, ',' ORDER BY grantee,table_name,privilege_type)), '') FROM information_schema.role_table_grants WHERE table_schema='public';
`);
  check("restored structural and table grants fingerprint", hash(catalog(restoreDb)) === hash(catalog("postgres")));
  check("restored fixture checksum", hash(query(restoreDb)) === hash(baseline));
  check("restored settings PK by instance", psql(restoreDb, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p'").includes("instance_id"));
  evidence.stage = "done";
  evidence.status = "PASS";
} catch (e) {
  evidence.error = String(e.stderr || e.message).slice(0,900);
  process.exitCode = 1;
} finally {
  // Never delete the original database; remove only the separate restore clone.
  if (cloneCreated) {
    const restoreDb = "neroxa_restore_" + process.env.GITHUB_RUN_ID;
    try { psql("postgres", 'DROP DATABASE "' + restoreDb + '" WITH (FORCE);'); }
    catch (e) { evidence.cleanupError = String(e.message).slice(0,200); process.exitCode = 1; }
  }
  // Remove only this run's disposable archive; never export it as CI evidence.
  try { run(["rm", "-f", dumpPath]); }
  catch (e) { evidence.archiveCleanupError = String(e.message).slice(0,200); process.exitCode = 1; }
  fs.mkdirSync("audits/rehearsal/results", { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
