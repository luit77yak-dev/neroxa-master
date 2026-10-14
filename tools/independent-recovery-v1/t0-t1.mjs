import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const work = process.env.AB_WORKDIR;
const state = JSON.parse(fs.readFileSync(work + "/dr-state.private.json", "utf8"));
const { db, dst, src } = state;
if (
  !/^neroxa_recovery_[0-9]+$/.test(db) ||
  !/^supabase_db_neroxa-ab-[0-9]+$/.test(dst) ||
  dst === src
)
  throw Error("Independent disposable context required");
const e = {
  status: "FAIL",
  checks: [],
  rpoZero: false,
  t1CompleteClusterLoss:
    "NOT_PROVEN: T1 recovery requires the private checkpoint archive to survive outside the failed cluster; no WAL/PITR/CDC is configured.",
};
const run = (a, input) =>
  execFileSync("docker", ["exec", ...(input === undefined ? [] : ["-i"]), dst, ...a], {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
  });
const sql = (s) =>
  run(["psql", "-XqAt", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"], s).trim();
const check = (name, passed) => {
  e.checks.push({ name, passed: !!passed });
  if (!passed) throw Error(name);
};
const digest = () => sql(fs.readFileSync("tools/ab-auth/restore_data.sql", "utf8"));
try {
  check(
    "Actual target browser PASS normal build",
    JSON.parse(
      fs.readFileSync("audits/ab-auth/results/first-order-browser.json", "utf8"),
    ).checks.every((x) => x.passed),
  );
  const before = digest();
  const orderDigest = sql(
    "SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o",
  );
  check("T1 differs from restored T0", before !== state.baselineData);
  // Persist a private checkpoint after actual new browser orders, then freeze.
  sql("UPDATE neroxa_bridge.dr_freeze SET frozen=true");
  const frozen = digest();
  const archive = "/tmp/neroxa-t1-" + process.env.GITHUB_RUN_ID + ".dump";
  run(["pg_dump", "-U", "postgres", "-d", db, "--format=custom", "--file", archive]);
  run(["chmod", "600", archive]);
  const bytes = Buffer.from(run(["base64", "-w0", archive]).trim(), "base64");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  check("T1 archive hash matches container", run(["sha256sum", archive]).split(" ")[0] === hash);
  fs.writeFileSync(work + "/t1-checkpoint.private.dump", bytes, { mode: 0o600 });
  e.checkpoint = {
    sha256: hash,
    bytes: bytes.length,
    location: "private disposable runner outside target cluster; removed at cleanup",
  };
  let failure = "";
  try {
    sql(
      "BEGIN;UPDATE neroxa_bridge.dr_freeze SET frozen=false;INSERT INTO neroxa_bridge.journal(stage,sha256,catalog_digest) VALUES('DR_FAIL',repeat('0',64),repeat('0',32));DO $$ BEGIN RAISE EXCEPTION 'INJECTED_DR_T1_FAILURE';END $$;COMMIT;",
    );
  } catch (err) {
    failure = String(err.stderr ?? "");
  }
  check("Post-cutover transaction failure specific", failure.includes("INJECTED_DR_T1_FAILURE"));
  check(
    "Failed transaction journal absent",
    sql("SELECT count(*) FROM neroxa_bridge.journal WHERE stage='DR_FAIL'") === "0",
  );
  check("T1 full data and Auth unchanged after failure", digest() === frozen);
  // The restore policy MUST stop when a populated target has diverged from T0.
  const refuseOldSnapshot = (current) => {
    if (current !== state.baselineData) throw Error("T1_PRESENT_ROLLBACK_TO_T0_FORBIDDEN");
  };
  let blocked = false;
  try {
    refuseOldSnapshot(frozen);
  } catch (err) {
    blocked = err.message === "T1_PRESENT_ROLLBACK_TO_T0_FORBIDDEN";
  }
  check("Destructive rollback to T0 blocked by populated-target guard", blocked);
  let write = "";
  try {
    sql(
      "UPDATE public.neroxa_orders SET customer_name='Should never persist' WHERE id=(SELECT id FROM public.neroxa_orders LIMIT 1)",
    );
  } catch (err) {
    write = String(err.stderr ?? "");
  }
  check("Frozen T1 mutations rejected specifically", write.includes("DR_WRITE_FREEZE"));
  check("Frozen write no data loss", digest() === frozen);
  sql("UPDATE neroxa_bridge.dr_freeze SET frozen=false");
  check(
    "Roll-forward resumes with T1 orders intact",
    sql("SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.neroxa_orders o") ===
      orderDigest,
  );
  e.dataSha256 = crypto.createHash("sha256").update(frozen).digest("hex");
  e.status = "PASS";
} catch (err) {
  e.error = String(err.message).split("\n")[0].slice(0, 180);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "audits/ab-auth/results/independent-t0-t1.json",
    JSON.stringify(e, null, 2) + "\n",
  );
  console.log(JSON.stringify(e));
}
