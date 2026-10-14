// Real cross-cluster logical restore. Test-only: refuses any non-disposable context.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const work = process.env.AB_WORKDIR,
  source = process.env.DR_SOURCE_PROJECT,
  target = process.env.AB_PROJECT;
if (
  !work ||
  ![source, target].every((x) => /^neroxa-ab-[0-9]+$/.test(x ?? "")) ||
  source === target
)
  throw Error("Two distinct disposable projects required");
const src = "supabase_db_" + source,
  dst = "supabase_db_" + target,
  db = "neroxa_recovery_" + process.env.GITHUB_RUN_ID;
if (!/^neroxa_recovery_[0-9]+$/.test(db)) throw Error("Invalid recovery database");
const out = "audits/ab-auth/results/independent-restore.json";
const e = {
  status: "FAIL",
  stage: "preflight",
  checks: [],
  remoteSql: false,
  metrics: {},
  limitations: [
    "Operational 16-table bridge projection, not full commercial Master.",
    "Managed native bootstrap roles are compared, not imported or elevated.",
    "T0 recovery does not prove RPO zero or hosted recovery.",
    "Auth sessions and refresh tokens require separate portability/security review.",
    "MFA variants outside previous scoped matrix not independently certified.",
  ],
};
const check = (name, v) => {
  e.checks.push({ name, passed: !!v });
  console.log((v ? "PASS " : "FAIL ") + name);
  if (!v) throw Error(name);
};
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
const docker = (a, input) =>
  execFileSync("docker", a, {
    encoding: "utf8",
    input,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
const run = (c, a, input) =>
  docker(["exec", ...(input === undefined ? [] : ["-i"]), c, ...a], input);
const sql = (c, d, s, u = "postgres") =>
  run(c, ["psql", "-XqAt", "-U", u, "-d", d, "-v", "ON_ERROR_STOP=1"], s).trim();
const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const readEnv = (p) =>
  Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split("\n")
      .map((x) => x.match(/^([A-Z_]+)="(.*)"$/))
      .filter(Boolean)
      .map((x) => [x[1], x[2]]),
  );
const sourceEnv = readEnv(process.env.DR_SOURCE_WORKDIR + "/status.private.env"),
  targetEnv = readEnv(work + "/status.private.env");
for (const v of [sourceEnv, targetEnv]) {
  if (new URL(v.API_URL).hostname !== "127.0.0.1") throw Error("Loopback only");
  for (const k of ["ANON_KEY", "SERVICE_ROLE_KEY"]) console.log("::add-mask::" + v[k]);
}
const file = (n) => fs.readFileSync("tools/ab-auth/" + n, "utf8");
const timed = (name, f) => {
  const t = performance.now();
  const v = f();
  e.metrics[name + "Ms"] = Math.round(performance.now() - t);
  return v;
};
const created = [];
try {
  const ins = [src, dst].map((c) => JSON.parse(docker(["inspect", c]))[0]);
  for (const i of ins)
    for (const bs of Object.values(i.HostConfig.PortBindings ?? {}))
      for (const b of bs ?? []) check("Loopback database " + i.Name, b.HostIp === "127.0.0.1");
  const systems = [src, dst].map((c) =>
    sql(c, "postgres", "SELECT system_identifier FROM pg_control_system()"),
  );
  check("Different PostgreSQL system identifiers", systems[0] !== systems[1]);
  const mounts = ins.map((i) =>
    i.Mounts.filter((x) => x.Destination.includes("postgresql")).map((x) => x.Source),
  );
  check(
    "Different PostgreSQL data volumes",
    mounts.every((x) => x.length > 0) && !mounts[0].some((x) => mounts[1].includes(x)),
  );
  check(
    "Different native networks",
    Object.keys(ins[0].NetworkSettings.Networks).every(
      (x) => !Object.keys(ins[1].NetworkSettings.Networks).includes(x),
    ),
  );
  check(
    "Different signing/API credentials",
    sourceEnv.ANON_KEY !== targetEnv.ANON_KEY &&
      sourceEnv.SERVICE_ROLE_KEY !== targetEnv.SERVICE_ROLE_KEY,
  );
  e.clusters = {
    systemIdentifiers: systems,
    dataVolumes: mounts,
    images: ins.map((i) => i.Config.Image),
    networks: ins.map((i) => Object.keys(i.NetworkSettings.Networks)),
  };
  e.versions = {
    postgres: sql(src, "postgres", "SELECT version()"),
    dump: run(src, ["pg_dump", "--version"]).trim(),
    restore: run(dst, ["pg_restore", "--version"]).trim(),
    node: process.version,
  };
  check(
    "PostgreSQL 17 tools",
    /17\./.test(e.versions.dump) &&
      /17\./.test(e.versions.restore) &&
      /PostgreSQL 17\./.test(e.versions.postgres),
  );
  const props = file("restore_properties.sql");
  const roleSql = props
    .split("\n")
    .filter((x) => x.startsWith("SELECT 'roles|'") || x.startsWith("SELECT 'memberships|'"))
    .join("\n");
  check(
    "Native global roles and memberships semantically identical",
    sql(src, "postgres", roleSql) === sql(dst, "postgres", roleSql),
  );
  e.roleMapping =
    "Identity mapping verified by role attributes/memberships; bootstrap passwords and signing secrets intentionally not transferred.";
  check(
    "Extension versions equal",
    sql(
      src,
      "postgres",
      "SELECT string_agg(extname||':'||extversion,',' ORDER BY extname) FROM pg_extension",
    ) ===
      sql(
        dst,
        "postgres",
        "SELECT string_agg(extname||':'||extversion,',' ORDER BY extname) FROM pg_extension",
      ),
  );
  const state = JSON.parse(
    fs.readFileSync(process.env.DR_SOURCE_WORKDIR + "/bridge.private.json", "utf8"),
  );
  const ids = state.orders.map(lit).join(",");
  check(
    "Historical cohort 3 orders 6 items 12 events",
    sql(
      src,
      "postgres",
      `SELECT (SELECT count(*) FROM public.neroxa_orders WHERE id IN (${ids}))||':'||(SELECT count(*) FROM public.neroxa_order_items WHERE order_id IN (${ids}))||':'||(SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id IN (${ids}))`,
    ) === "3:6:12",
  );
  // Stop local SOURCE writers rather than copying while Auth changes session tables.
  for (const name of ["supabase_auth_" + source, "supabase_rest_" + source]) docker(["stop", name]);
  const baselineData = sql(src, "postgres", file("restore_data.sql"));
  const baselineProps = sql(src, "postgres", props);
  const cat = fs.readFileSync("tools/independent-recovery-v1/catalog.sql", "utf8");
  const baselineCatalog = sql(src, "postgres", cat);
  const archive = "/tmp/neroxa-independent-" + process.env.GITHUB_RUN_ID + ".dump",
    acl = archive + ".acl.sql";
  e.stage = "backup";
  timed("backup", () =>
    run(src, ["pg_dump", "-U", "postgres", "-d", "postgres", "--format=custom", "--file", archive]),
  );
  run(src, ["chmod", "600", archive]);
  run(
    src,
    ["psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-o", acl],
    file("restore_extension_acl.sql"),
  );
  run(src, ["chmod", "600", acl]);
  e.archive = {
    sha256: run(src, ["sha256sum", archive]).split(" ")[0],
    bytes: Number(run(src, ["stat", "-c", "%s", archive]).trim()),
    format: "custom",
    private: true,
  };
  const toc = run(src, ["pg_restore", "--list", archive]);
  e.archive.tocSha256 = sha(toc);
  e.archive.tocEntries = toc.split("\n").filter((x) => /^\d+;/.test(x)).length;
  check("Archive readable and nonempty", e.archive.bytes > 1000 && e.archive.tocEntries > 50);
  // Transfer armored text through Docker relay; exact binary decoded only privately.
  const bytes = timed("transfer", () =>
    Buffer.from(run(src, ["base64", "-w0", archive]).trim(), "base64"),
  );
  check("Archive SHA after crossing source/runner boundary", sha(bytes) === e.archive.sha256);
  const privateArchive = path.join(work, "recovery.private.dump");
  fs.writeFileSync(privateArchive, bytes, { mode: 0o600 });
  run(
    dst,
    ["sh", "-c", 'umask 077; base64 -d > "$1"', "dr-transfer", archive],
    bytes.toString("base64"),
  );
  const aclText = run(src, ["cat", acl]);
  run(dst, ["sh", "-c", 'umask 077; cat > "$1"', "dr-transfer", acl], aclText);
  check(
    "Archive SHA after crossing runner/target boundary",
    run(dst, ["sha256sum", archive]).split(" ")[0] === e.archive.sha256,
  );
  // Managed objects restored ONLY into empty separate DB, never over native bootstrap.
  sql(dst, "postgres", `CREATE DATABASE "${db}" TEMPLATE template0`);
  const declarations = toc.split("\n").filter((x) => / SCHEMA - public /.test(x));
  check("At most one archive public declaration", declarations.length <= 1);
  if (declarations.length) sql(dst, db, "DROP SCHEMA public");
  e.stage = "restore";
  timed("restore", () =>
    run(dst, [
      "pg_restore",
      "-U",
      "supabase_admin",
      "-d",
      db,
      "--exit-on-error",
      "--single-transaction",
      archive,
    ]),
  );
  run(dst, ["psql", "-XqAt", "-U", "supabase_admin", "-d", db, "-v", "ON_ERROR_STOP=1", "-f", acl]);
  e.stage = "compare";
  const restoredCatalog = sql(dst, db, cat),
    restoredProps = sql(dst, db, props),
    restoredData = sql(dst, db, file("restore_data.sql"));
  const compare = (label, a, b) => {
    const aa = a.split("\n"),
      bb = b.split("\n");
    check(label + " categories", aa.length === bb.length);
    for (let i = 0; i < aa.length; i++) check(label + " " + aa[i].split("|")[0], aa[i] === bb[i]);
  };
  compare("Catalog", baselineCatalog, restoredCatalog);
  compare("Properties", baselineProps, restoredProps);
  compare("Data", baselineData, restoredData);
  e.fingerprints = {
    sourceDataSha256: sha(baselineData),
    targetDataSha256: sha(restoredData),
    sourceCatalogSha256: sha(baselineCatalog),
    targetCatalogSha256: sha(restoredCatalog),
    sourcePropertiesSha256: sha(baselineProps),
    targetPropertiesSha256: sha(restoredProps),
  };
  const fk = sql(dst, db, file("restore_integrity.sql"));
  check(
    "All target FKs zero orphans",
    fk.split("\n").every((x) => x.endsWith("|0")),
  );
  e.foreignKeys = fk.split("\n").length;
  check(
    "Historical anchors restored",
    sql(dst, db, "SELECT count(*) FROM neroxa_bridge.legacy_order_anchors") === "3",
  );
  check(
    "No historical append capability",
    sql(
      dst,
      db,
      `SELECT count(*) FROM private.neroxa_order_amendment_capabilities WHERE order_id IN (${ids})`,
    ) === "0",
  );
  // Auth and REST configurations come from independently bootstrapped TARGET.
  const services = {};
  for (const [kind, port, prefix, varName] of [
    ["auth", 9999, "GOTRUE_", "GOTRUE_DB_DATABASE_URL"],
    ["rest", 3000, "PGRST_", "PGRST_DB_URI"],
  ]) {
    const original = JSON.parse(docker(["inspect", "supabase_" + kind + "_" + target]))[0];
    const env = original.Config.Env.filter(
      (x) => x.startsWith(prefix) || x.startsWith("API_EXTERNAL_URL="),
    ).map((x) => {
      if (!x.startsWith(varName + "=")) return x;
      const u = new URL(x.slice(varName.length + 1));
      u.pathname = "/" + db;
      return varName + "=" + u.toString();
    });
    const name = "neroxa_dr_" + kind + "_" + target;
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      Object.keys(original.NetworkSettings.Networks)[0],
      "--label",
      "com.supabase.cli.project=" + target,
      "-p",
      "127.0.0.1::" + port,
      ...env.flatMap((x) => ["-e", x]),
      original.Config.Image,
    ]);
    created.push(name);
    const info = JSON.parse(docker(["inspect", name]))[0],
      bind = info.NetworkSettings.Ports[port + "/tcp"][0];
    check("Restored " + kind + " loopback", bind.HostIp === "127.0.0.1");
    services[kind] = "http://127.0.0.1:" + bind.HostPort;
  }
  fs.writeFileSync(work + "/dr-services.private.json", JSON.stringify(services), { mode: 0o600 });
  const log = fs.openSync(work + "/dr-proxy.private.log", "a", 0o600);
  const proc = spawn(process.execPath, ["tools/independent-recovery-v1/proxy.mjs"], {
    detached: true,
    env: process.env,
    stdio: ["ignore", log, log],
  });
  proc.unref();
  fs.writeFileSync(work + "/dr-proxy.pid", String(proc.pid));
  targetEnv.API_URL = "http://127.0.0.1:56321";
  fs.writeFileSync(
    work + "/status.private.env",
    Object.entries(targetEnv)
      .map(([k, v]) => k + "=" + JSON.stringify(v))
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      ready = (await fetch(targetEnv.API_URL + "/auth/v1/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  check("Target Auth health", ready);
  const sourceActor = JSON.parse(
    fs.readFileSync(process.env.DR_SOURCE_WORKDIR + "/h03-actor.private.json", "utf8"),
  );
  const claims = JSON.parse(Buffer.from(sourceActor.token.split(".")[1], "base64url"));
  const client = createClient(targetEnv.API_URL, targetEnv.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await client.auth.signInWithPassword({
    email: sourceActor.email,
    password: sourceActor.password,
  });
  check(
    "Restored user authenticates against TARGET",
    !login.error && login.data.user?.id === claims.sub,
  );
  const token = login.data.session.access_token;
  console.log("::add-mask::" + token);
  const targetClaims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  check(
    "TARGET new JWT same UID and different signature",
    targetClaims.sub === claims.sub && token !== sourceActor.token,
  );
  const req = async (resource, t = token, body, method = "POST") => {
    const r = await fetch(targetEnv.API_URL + "/rest/v1/" + resource, {
      method,
      headers: {
        apikey: targetEnv.ANON_KEY,
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  const fixtures = JSON.parse(
    fs.readFileSync(process.env.DR_SOURCE_WORKDIR + "/h03-fixtures.private.json", "utf8"),
  );
  for (const [i, f] of fixtures.entries()) {
    const r = await req("rpc/get_admin_orders", token, { p_instance_id: f.instance_id });
    check(
      "Recovered scoped administrator " + i,
      i === 0
        ? r.status === 200
        : Array.isArray(r.body)
          ? r.body.length === 0
          : [401, 403].includes(r.status),
    );
  }
  const foreign = await req("rpc/get_admin_orders", sourceActor.token, {
    p_instance_id: fixtures[0].instance_id,
  });
  check(
    "SOURCE JWT rejected by TARGET signature",
    foreign.status === 401 && foreign.body.code === "PGRST301",
  );
  fs.writeFileSync(work + "/h03-actor.private.json", JSON.stringify({ ...sourceActor, token }), {
    mode: 0o600,
  });
  fs.copyFileSync(
    process.env.DR_SOURCE_WORKDIR + "/h03-fixtures.private.json",
    work + "/h03-fixtures.private.json",
  );
  fs.chmodSync(work + "/h03-fixtures.private.json", 0o600);
  fs.writeFileSync(
    work + "/dr-state.private.json",
    JSON.stringify({ db, source, src, dst, state, baselineData, sourceEnv, services, created }),
    { mode: 0o600 },
  );
  check(
    "SOURCE unchanged after target restore",
    sql(src, "postgres", file("restore_data.sql")) === baselineData,
  );
  e.stage = "recovered-operations";
  // SOURCE stays frozen; release only the verified TARGET operational gate.
  sql(dst, db, "UPDATE neroxa_bridge.dr_freeze SET frozen=false");
  const proof = JSON.parse(
    fs.readFileSync(process.env.DR_SOURCE_WORKDIR + "/dr-proof.private.json", "utf8"),
  );
  const service = (n, b) => req("rpc/" + n, targetEnv.SERVICE_ROLE_KEY, b);
  const beforeOrder = sql(
    dst,
    db,
    `SELECT count(*)||':'||(SELECT count(*) FROM public.neroxa_order_items WHERE order_id=${lit(proof.order.order_id)})||':'||(SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id=${lit(proof.order.order_id)}) FROM public.neroxa_orders WHERE id=${lit(proof.order.order_id)}`,
  );
  const retry = await service("create_public_order", { p_order: proof.payload });
  check(
    "Restored GROUP checkout same key returns same order",
    retry.status === 200 && retry.body[0]?.order_id === proof.order.order_id,
  );
  const repeat = await service("neroxa_append_order_items_with_capability", proof.append);
  check(
    "Restored append same request key returns NOT_SETTLED",
    repeat.status === 200 && repeat.body[0]?.payment_state === "NOT_SETTLED",
  );
  check(
    "Retry creates no order item or history",
    beforeOrder ===
      sql(
        dst,
        db,
        `SELECT count(*)||':'||(SELECT count(*) FROM public.neroxa_order_items WHERE order_id=${lit(proof.order.order_id)})||':'||(SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id=${lit(proof.order.order_id)}) FROM public.neroxa_orders WHERE id=${lit(proof.order.order_id)}`,
      ),
  );
  const altered = await service("create_public_order", {
    p_order: { ...proof.payload, customer_name: "Alteração fictícia proibida" },
  });
  check(
    "Restored checkout divergent payload rejected",
    altered.status >= 400 && !!altered.body.code,
  );
  const wrong = await service("neroxa_recover_group_order", {
    p_instance_id: fixtures[1].instance_id,
    p_checkout_key: proof.payload.idempotency_key,
    p_order: proof.payload,
  });
  check("Restored recovery cross-instance specifically denied", wrong.body.code === "42501");
  const recovered = await service("neroxa_recover_group_order", {
    p_instance_id: fixtures[0].instance_id,
    p_checkout_key: proof.payload.idempotency_key,
    p_order: proof.payload,
  });
  check(
    "Restored original buyer proof recovers same order",
    recovered.status === 200 && recovered.body.order_id === proof.order.order_id,
  );
  for (let i = 0; i < proof.people.length; i++) {
    const p = proof.people[i];
    const c = createClient(targetEnv.API_URL, targetEnv.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await c.auth.signInWithPassword({ email: p.email, password: p.password });
    check("TARGET recovered identity " + i, !signed.error && signed.data.user?.id === p.id);
    const t = signed.data.session.access_token;
    for (let j = 0; j < 3; j++) {
      const r = await req("rpc/get_admin_orders", t, { p_instance_id: fixtures[j].instance_id });
      check(
        "TARGET instance grant " + i + "/" + j,
        r.status === 200 &&
          Array.isArray(r.body) &&
          (i === j ? r.body.length > 0 : r.body.length === 0),
      );
    }
    const hist = await req("rpc/get_admin_orders", t, { p_instance_id: state.store });
    check(
      "TARGET historical access " + i,
      hist.status === 200 &&
        Array.isArray(hist.body) &&
        (i === 4
          ? hist.body.filter((x) => state.orders.includes(x.id)).length === 3
          : hist.body.length === 0),
    );
    const bad = await req("rpc/get_admin_orders", p.sourceToken, {
      p_instance_id: fixtures[0].instance_id,
    });
    check(
      "Foreign source signing rejected identity " + i,
      bad.status === 401 && bad.body.code === "PGRST301",
    );
  }
  check(
    "Target no new historical capability",
    sql(
      dst,
      db,
      `SELECT count(*) FROM private.neroxa_order_amendment_capabilities WHERE order_id IN (${ids})`,
    ) === "0",
  );
  e.stage = "ready-for-target-browser";
  e.status = "PASS";
} catch (err) {
  e.error =
    String(err.stderr ?? "").match(/ERROR:\s*([^\n]+)/)?.[1] ??
    String(err.message).split("\n")[0].slice(0, 180);
  process.exitCode = 1;
} finally {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(e, null, 2) + "\n");
  console.log(
    JSON.stringify({ stage: e.stage, status: e.status, checks: e.checks.length, error: e.error }),
  );
}
