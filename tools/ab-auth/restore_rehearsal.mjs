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
const run = (args, input) => execFileSync("docker", ["exec", "-i", container, ...args], {
  input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
});
const psql = (database, sql) => run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql).trim();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const evidence = { stage: "start", status: "FAIL", productionTouched: false, checks: [] };
const check = (name, ok) => {
  evidence.checks.push({ name, passed: Boolean(ok) });
  if (!ok) throw new Error(name);
};
const query = (db) => psql(db, `
SELECT 'settings|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.organization_id::text), '')
FROM (SELECT organization_id, description, hero_title, min_order_amount, delivery_enabled FROM public.neroxa_storefront_settings ORDER BY organization_id) t;
SELECT 'zones|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_storefront_delivery_zones ORDER BY id) t;
SELECT 'instances|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_system_instances ORDER BY id) t;
SELECT 'pk|' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';
SELECT 'counts|' || (SELECT count(*) FROM public.neroxa_storefront_settings) || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones);
`);
const out = "audits/rehearsal/results/restore-report.json";
let cloneCreated = false;
try {
  evidence.stage = "source-baseline";
  // Called only after historical_rehearsal.mjs has populated the disposable database.
  check("historical rehearsal report passed", JSON.parse(fs.readFileSync("audits/rehearsal/results/report.json", "utf8")).status === "PASS");
  // The source database is already cut over: snapshot the post-cutover state, then
  // mutate it deliberately and restore its dump into a separate disposable database.
  const baseline = query("postgres");
  const dump = run(["pg_dump", "-U", "postgres", "-d", "postgres", "--schema=public", "--no-owner", "--format=plain"]);
  const dumpHash = hash(dump);
  evidence.dumpSha256 = dumpHash;
  check("nonempty logical dump", dump.length > 1000);
  const restoreDb = "neroxa_restore_" + process.env.GITHUB_RUN_ID;
  check("safe restore database name", /^neroxa_restore_[0-9]+$/.test(restoreDb));
  evidence.stage = "separate-restore-database";
  psql("postgres", 'CREATE DATABASE "' + restoreDb + '";');
  cloneCreated = true;
  // Fresh PostgreSQL databases include public by default; the dump recreates it.\n  // Drop only the empty schema in the newly created disposable restore database.\n  psql(restoreDb, "DROP SCHEMA IF EXISTS public CASCADE;");\n  // Recreate roles and extensions from the disposable Supabase platform, never production.
  // pg_dump --schema=public omits Auth/private managed objects, so restore only
  // the app schema. A fresh database has the same platform roles but not extensions.
  const extensions = psql("postgres", "SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql');").split("\n").filter(Boolean);
  for (const ext of extensions) {
    if (!/^[a-z0-9_-]+$/.test(ext)) throw new Error("Unexpected extension: " + ext);
    psql(restoreDb, 'CREATE EXTENSION IF NOT EXISTS "' + ext + '" CASCADE;');
  }
  // Restore fails closed if any dependency, ACL or object cannot be recreated.
  // pg_dump may declare public even though extension setup has already created it.
  // Remove only the exact standalone CREATE SCHEMA statement, never arbitrary SQL.
  const schemaDeclaration = /^CREATE SCHEMA (?:"public"|public);[ \\t]*\\r?$/gm;
  const occurrences = [...dump.matchAll(schemaDeclaration)].length;
  evidence.publicSchemaDeclarations = occurrences;
  check("at most one public schema declaration in dump", occurrences <= 1);
  const restoreSql = dump.replace(schemaDeclaration, "-- public schema already provisioned");
  psql(restoreDb, restoreSql);
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
  fs.mkdirSync("audits/rehearsal/results", { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
