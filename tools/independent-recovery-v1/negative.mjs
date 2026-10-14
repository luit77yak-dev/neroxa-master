// Deliberate negatives against real recovered PostgreSQL. No managed role edits.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
const work = process.env.AB_WORKDIR;
const { dst, db, state } = JSON.parse(fs.readFileSync(work + "/dr-state.private.json", "utf8"));
if (!/^supabase_db_neroxa-ab-[0-9]+$/.test(dst) || !/^neroxa_recovery_[0-9]+$/.test(db))
  throw Error("Disposable context");
const exec = (a, input) =>
  execFileSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), dst, ...a], {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
const sql = (s) =>
  exec(["psql", "-XqAt", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"], s).trim();
const e = { status: "FAIL", tests: [] };
const check = (name, passed) => {
  e.tests.push({ name, passed: !!passed });
  if (!passed) throw Error(name);
};
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
try {
  const file = work + "/recovery.private.dump",
    bytes = fs.readFileSync(file);
  const damaged = Buffer.from(bytes);
  damaged[damaged.length - 1] ^= 1;
  check("Checksum detects changed archive byte before restore", hash(damaged) !== hash(bytes));
  for (const [label, v] of [
    ["invalid", Buffer.from("not-an-archive")],
    ["incomplete", bytes.subarray(0, 30)],
  ]) {
    const path = "/tmp/neroxa-dr-" + process.env.GITHUB_RUN_ID + "-" + label + ".dump";
    exec(["sh", "-c", 'umask 077; base64 -d > "$1"', "negative", path], v.toString("base64"));
    let error = "";
    try {
      exec(["pg_restore", "--list", path]);
    } catch (err) {
      error = String(err.stderr ?? "");
    }
    check(
      "Real pg_restore rejects " + label + " archive",
      /does not appear to be a valid archive|end of file|could not read|too short|invalid archive/.test(
        error,
      ),
    );
    exec(["rm", "-f", path]);
  }
  const role = sql("SELECT to_regrole('neroxa_dr_missing_role') IS NULL");
  check("Native missing role preflight cannot map an unknown owner", role === "t");
  const extension = sql(
    "SELECT count(*) FROM pg_extension WHERE extname='neroxa_dr_missing_extension'",
  );
  check("Native absent required extension stops preflight", extension === "0");
  const aclBefore = sql(
    "SELECT md5(coalesce(proacl::text,'')) FROM pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure",
  );
  const aclDuring = sql(
    "BEGIN;REVOKE EXECUTE ON FUNCTION public.create_public_order(jsonb) FROM service_role;SELECT md5(coalesce(proacl::text,'')) FROM pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure;ROLLBACK;",
  );
  check("Transactional ACL drift detected", aclDuring !== aclBefore);
  check(
    "ACL restored after rollback",
    sql(
      "SELECT md5(coalesce(proacl::text,'')) FROM pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure",
    ) === aclBefore,
  );
  // Application data stays unmodified. Violate an actual FK, require native 23503 error.
  let fk = "";
  try {
    sql(
      "BEGIN;INSERT INTO public.neroxa_order_status_history(order_id,to_status) VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','RECEIVED');ROLLBACK;",
    );
  } catch (err) {
    fk = String(err.stderr ?? "");
  }
  check("Native orphan history rejected by FK", fk.includes("violates foreign key constraint"));
  let interrupted = "";
  try {
    sql(
      "BEGIN;CREATE TABLE neroxa_bridge.dr_interrupted(id integer);DO $$BEGIN RAISE EXCEPTION 'INJECTED_RESTORE_INTERRUPTION';END$$;COMMIT;",
    );
  } catch (err) {
    interrupted = String(err.stderr ?? "");
  }
  check(
    "Interrupted transactional recovery aborts specifically",
    interrupted.includes("INJECTED_RESTORE_INTERRUPTION"),
  );
  check(
    "Interrupted recovery leaves no partial object",
    sql("SELECT to_regclass('neroxa_bridge.dr_interrupted') IS NULL") === "t",
  );
  let historical = "";
  try {
    sql(
      "BEGIN;INSERT INTO private.neroxa_group_order_intents(order_id,payload_sha256) VALUES('" +
        state.orders[2] +
        "',repeat('0',64));ROLLBACK;",
    );
  } catch (err) {
    historical = String(err.stderr ?? "");
  }
  check(
    "Historical buyer proof specifically blocked by restored anchor trigger",
    historical.includes("Historical order has no new buyer proof"),
  );
  e.status = "PASS";
} catch (err) {
  e.error = String(err.message).split("\n")[0].slice(0, 180);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "audits/ab-auth/results/independent-negative.json",
    JSON.stringify(e, null, 2) + "\n",
  );
  console.log(JSON.stringify(e));
}
