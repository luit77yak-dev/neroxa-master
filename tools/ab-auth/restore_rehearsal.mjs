import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  prepareSecurity,
  startRestoredRest,
  startRestoredAuth,
  validateSecurity,
} from "./restore_security.mjs";

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
// archive remains container-local: no binary dump traverses the relay.
const run = (args, input) =>
  execFileSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), container, ...args], {
    ...(input === undefined ? {} : { input }),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
const psql = (database, sql) =>
  run(
    ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    sql,
  ).trim();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const evidence = { stage: "start", status: "FAIL", productionTouched: false, checks: [] };
const check = (name, ok) => {
  evidence.checks.push({ name, passed: Boolean(ok) });
  if (!ok) throw new Error(name);
};
const query = (db) =>
  psql(
    db,
    `
SELECT 'settings|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY t.instance_id::text), '')
FROM (SELECT * FROM public.neroxa_storefront_settings ORDER BY instance_id) t;
SELECT 'zones|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_storefront_delivery_zones ORDER BY id) t;
SELECT 'instances|' || coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY id::text), '')
FROM (SELECT * FROM public.neroxa_system_instances ORDER BY id) t;
SELECT 'pk|' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';
SELECT 'counts|' || (SELECT count(*) FROM public.neroxa_storefront_settings) || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones);
`,
  );
const runId = process.env.GITHUB_RUN_ID;
if (!/^[0-9]+$/.test(runId ?? "")) throw new Error("Safe CI run ID required");
const dumpPath = "/tmp/neroxa-restore-" + runId + ".dump";
const out = "audits/rehearsal/results/restore-report.json";
let cloneCreated = false;
let restoredRest;
let restoredAuth;
let security;
try {
  evidence.versions = {
    postgres: psql("postgres", "SELECT version();"),
    pgDump: run(["pg_dump", "--version"]).trim(),
    pgRestore: run(["pg_restore", "--version"]).trim(),
    node: process.version,
  };
  check(
    "PostgreSQL 17 client/server compatibility",
    /PostgreSQL 17\./.test(evidence.versions.postgres) &&
      /17\./.test(evidence.versions.pgDump) &&
      /17\./.test(evidence.versions.pgRestore),
  );
  evidence.globalRoles = "shared disposable cluster, not restored by pg_dump";
  evidence.stage = "source-baseline";
  // Called only after historical_rehearsal.mjs has populated the disposable database.
  check(
    "historical rehearsal report passed",
    JSON.parse(fs.readFileSync("audits/rehearsal/results/report.json", "utf8")).status === "PASS",
  );
  // The source database is already cut over. Snapshot it and restore the dump
  // into a separate disposable database; never mutate the source.
  security = await prepareSecurity({ work, project, psql, check });
  const baseline = query("postgres");
  // Dump the entire disposable database, including Supabase-managed Auth and
  // extension dependencies. A public-only dump cannot restore auth.uid() etc.
  // Preserve OWNER and ACL statements so permissions can be checked on restore.
  check(
    "source local Auth schema exists",
    psql("postgres", "SELECT count(*) FROM pg_namespace WHERE nspname='auth';") === "1",
  );
  // Keep the complete custom-format archive INSIDE the disposable DB container.
  // Large plain SQL over docker exec -i breaks the private Docker transport.
  evidence.stage = "archive-in-disposable-container";
  run(["pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom", "--file", dumpPath]);
  evidence.dumpSha256 = run(["sha256sum", dumpPath]).trim().split(" ")[0];
  check("valid archive SHA-256", /^[a-f0-9]{64}$/.test(evidence.dumpSha256));
  run(["chmod", "600", dumpPath]);
  evidence.dumpScope =
    "complete local disposable Supabase database (Auth, public, dependencies, owners, ACLs)";
  evidence.dumpFormat = "PostgreSQL custom archive, container-local";
  check(
    "nonempty local logical archive",
    Number(run(["stat", "-c", "%s", dumpPath]).trim()) > 1000,
  );
  const restoreDb = "neroxa_restore_" + process.env.GITHUB_RUN_ID;
  check("safe restore database name", /^neroxa_restore_[0-9]+$/.test(restoreDb));
  evidence.stage = "separate-restore-database";
  psql("postgres", 'CREATE DATABASE "' + restoreDb + '" TEMPLATE template0;');
  cloneCreated = true;
  // A fresh DB has public; pg_restore manages dependencies and schema order.
  // Keep the restore database separate from the source of the historical test.
  check(
    "target public schema exists",
    psql(restoreDb, "SELECT count(*) FROM pg_namespace WHERE nspname='public';") === "1",
  );
  const toc = run(["pg_restore", "--list", dumpPath]);
  const publicDeclarations = toc.split("\n").filter((line) => / SCHEMA - public /.test(line));
  check("unambiguous archive public schema metadata", publicDeclarations.length <= 1);
  // pg_dump may omit CREATE for the default public schema. Follow the TOC,
  // rather than parsing/replacing dump SQL or guessing from PostgreSQL version.
  if (publicDeclarations.length === 1) psql(restoreDb, "DROP SCHEMA public;");
  evidence.publicSchemaBootstrap = publicDeclarations.length ? "archive" : "template0";
  // Use pg_restore within the disposable container; fail atomically on ANY
  // SQL error. Archive restore handles extensions and schema ordering.
  check(
    "native disposable restore executor is superuser",
    run([
      "psql",
      "-XqAt",
      "-U",
      "supabase_admin",
      "-d",
      restoreDb,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "SELECT current_user='supabase_admin' AND current_setting('is_superuser')='on'",
    ]).trim() === "t",
  );
  evidence.restoreExecutor = "supabase_admin via local container socket; no role grants modified";
  evidence.stage = "restore-archive";
  run([
    "pg_restore",
    "-U",
    "supabase_admin",
    "-d",
    restoreDb,
    "--format=custom",
    "--exit-on-error",
    "--single-transaction",
    dumpPath,
  ]);
  check(
    "Supabase Auth schema restored",
    psql(restoreDb, "SELECT count(*) FROM pg_namespace WHERE nspname='auth';") === "1",
  );
  // Each fingerprint compares object identity and definitions, not just totals.
  // Include Supabase Auth and all non-system schemas from the same local stack.
  const catalog = (db) =>
    psql(
      db,
      `
SELECT 'schemas|' || md5(coalesce(string_agg(n.nspname || ':' || pg_get_userbyid(n.nspowner) || ':' || coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(coalesce(n.nspacl,acldefault('n',n.nspowner))) a),''), E'\\n' ORDER BY n.nspname), ''))
FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'relations|' || md5(coalesce(string_agg(n.nspname || '.' || c.relname || ':' || c.relkind::text || ':' || pg_get_userbyid(c.relowner) || ':' || coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a),'') || ':' || c.relrowsecurity::text || ':' || c.relforcerowsecurity::text, E'\\n' ORDER BY n.nspname,c.relname), ''))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'columns|' || md5(coalesce(string_agg(n.nspname || '.' || c.relname || '.' || a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin,d.adrelid),'null'), E'\\n' ORDER BY n.nspname,c.relname,a.attnum), ''))
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'policies|' || md5(coalesce(string_agg(to_jsonb(p)::text, E'\\n' ORDER BY schemaname,tablename,policyname), '')) FROM pg_policies p;
SELECT 'triggers|' || md5(coalesce(string_agg(n.nspname || '.' || c.relname || '.' || t.tgname || ':' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text, E'\\n' ORDER BY n.nspname,c.relname,t.tgname), ''))
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'constraints|' || md5(coalesce(string_agg(n.nspname || '.' || coalesce(k.conrelid::regclass::text,'') || '.' || k.conname || ':' || pg_get_constraintdef(k.oid) || ':' || k.convalidated::text, E'\\n' ORDER BY n.nspname,k.conrelid::regclass::text,k.conname), ''))
FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'indexes|' || md5(coalesce(string_agg(to_jsonb(i)::text, E'\\n' ORDER BY schemaname,tablename,indexname), '')) FROM pg_indexes i WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema';
SELECT 'functions|' || md5(coalesce(string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || pg_get_userbyid(p.proowner) || ':' || coalesce((SELECT string_agg(a::text, ',' ORDER BY a::text) FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a),'') || ':' || p.prosrc, E'\\n' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)), ''))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema';
SELECT 'extensions|' || md5(coalesce(string_agg(e.extname || ':' || e.extversion || ':' || n.nspname, E'\\n' ORDER BY e.extname), ''))
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;
SELECT 'table-grants|' || md5(coalesce(string_agg(grantee || ':' || table_schema || ':' || table_name || ':' || privilege_type, E'\\n' ORDER BY grantee,table_schema,table_name,privilege_type), '')) FROM information_schema.role_table_grants WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema';
`,
    );
  const sourceCatalog = catalog("postgres").split("\n");
  const restoredCatalog = catalog(restoreDb).split("\n");
  const schemaDetails = (db) =>
    JSON.parse(
      psql(
        db,
        "SELECT json_agg(json_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'",
      ),
    );
  evidence.schemaDetails = {
    source: schemaDetails("postgres"),
    restored: schemaDetails(restoreDb),
  };
  const categories = [
    "schemas",
    "relations",
    "columns",
    "policies",
    "triggers",
    "constraints",
    "indexes",
    "functions",
    "extensions",
    "table-grants",
  ];
  check(
    "structural fingerprint category count",
    sourceCatalog.length === categories.length && restoredCatalog.length === categories.length,
  );
  for (let index = 0; index < categories.length; index++) {
    check(
      "restored " + categories[index] + " fingerprint",
      sourceCatalog[index] === restoredCatalog[index] &&
        sourceCatalog[index].startsWith(categories[index] + "|"),
    );
  }
  check("restored fixture checksum", hash(query(restoreDb)) === hash(baseline));
  check(
    "restored settings PK by instance",
    psql(
      restoreDb,
      "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p'",
    ).includes("instance_id"),
  );
  const data = (db) => psql(db, fs.readFileSync("tools/ab-auth/restore_data.sql", "utf8"));
  const sourceData = data("postgres");
  const restoredData = data(restoreDb);
  check("all dumped table data and sequence values", sourceData === restoredData);
  evidence.dataSha256 = hash(sourceData);
  evidence.tableCount = sourceData.split("\n").filter((x) => x.startsWith("table|")).length;
  const extra = fs.readFileSync("tools/ab-auth/restore_properties.sql", "utf8");
  check(
    "complete function properties, defaults, column ACL and roles",
    psql("postgres", extra) === psql(restoreDb, extra),
  );
  const integritySql = fs.readFileSync("tools/ab-auth/restore_integrity.sql", "utf8");
  const integrity = psql(restoreDb, integritySql);
  check(
    "all restored foreign keys have zero orphans",
    integrity.split("\n").every((line) => line.endsWith("|0")),
  );
  evidence.foreignKeysChecked = integrity.split("\n").length;
  evidence.stage = "restored-auth-matrix";
  restoredAuth = await startRestoredAuth({ project, restoreDb, security, check });
  restoredRest = await startRestoredRest({ project, restoreDb });
  evidence.restoredServices = { authImage: restoredAuth.image, restImage: restoredRest.image };
  await validateSecurity({ security, url: restoredRest.url, check, psql, restoreDb });
  check("source data unchanged by target HTTP tests", sourceData === data("postgres"));
  evidence.stage = "done";
  evidence.status = "PASS";
} catch (e) {
  // Log only the primary PostgreSQL error, never Command was/DETAIL/data.
  const primary = String(e.stderr ?? "").match(/ERROR:\s*([^\n]+)/)?.[1];
  evidence.error = primary ? primary.slice(0, 240) : String(e.message).split("\n")[0].slice(0, 240);
  process.exitCode = 1;
} finally {
  for (const resource of [restoredRest, restoredAuth].filter(Boolean)) {
    try {
      execFileSync("docker", ["rm", "-f", resource.name], { stdio: "pipe" });
    } catch {
      evidence.cleanupError = "Restored REST container removal failed";
      process.exitCode = 1;
    }
  }
  // Never delete the original database; remove only the separate restore clone.
  if (cloneCreated) {
    const restoreDb = "neroxa_restore_" + process.env.GITHUB_RUN_ID;
    try {
      psql("postgres", 'DROP DATABASE "' + restoreDb + '" WITH (FORCE);');
      check(
        "restore database removed",
        psql("postgres", "SELECT count(*) FROM pg_database WHERE datname='" + restoreDb + "'") ===
          "0",
      );
    } catch (e) {
      evidence.cleanupError = String(e.message).slice(0, 200);
      process.exitCode = 1;
    }
  }
  // Remove only this run's disposable archive; never export it as CI evidence.
  try {
    run(["rm", "-f", dumpPath]);
  } catch (e) {
    evidence.archiveCleanupError = String(e.message).slice(0, 200);
    process.exitCode = 1;
  }
  if (process.exitCode) evidence.status = "FAIL";
  fs.mkdirSync("audits/rehearsal/results", { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
