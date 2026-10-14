import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const work = process.env.AB_WORKDIR,
  project = process.env.AB_PROJECT;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || !work) throw Error("Disposable required");
const env = Object.fromEntries(
  fs
    .readFileSync(work + "/status.private.env", "utf8")
    .split("\n")
    .map((x) => x.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((x) => [x[1], x[2]]),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Local only");
const sql = (s) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_" + project,
      "psql",
      "-XqAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const fixtures = JSON.parse(fs.readFileSync(work + "/h03-fixtures.private.json", "utf8"));
const A = fixtures[0];
const rpc = async (n, b) => {
  const r = await fetch(env.API_URL + "/rest/v1/rpc/" + n, {
    method: "POST",
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(b),
  });
  const v = await r.json();
  if (!r.ok) throw Error("Source RPC " + n + " rejected " + v.code);
  return v;
};
// Fictitious administrative setup; pricing still checked by the native function.
sql(
  `UPDATE public.neroxa_storefront_products SET price=30 WHERE id=${q(A.p)};UPDATE public.neroxa_storefront_weekly_hours SET opens_at='00:00',closes_at='24:00' WHERE instance_id=${q(A.instance_id)};`,
);
const z = JSON.parse(
  sql(
    `SELECT to_jsonb(z) FROM public.neroxa_storefront_delivery_zones z WHERE instance_id=${q(A.instance_id)} AND active LIMIT 1`,
  ),
);
const item = {
  selection_contract: "GROUP_ADDONS_V1",
  product_id: A.p,
  group_addon_ids: [A.a],
  size_id: "pequena",
  crust_id: "recheada",
  quantity: 2,
  expected_unit_price: 32,
};
const payload = {
  organization_id: A.organization_id,
  instance_id: A.instance_id,
  store_domain: A.domain,
  client_cart_reference: "d".repeat(64),
  idempotency_key: crypto.randomUUID(),
  customer_name: "Pessoa DR completamente fictícia",
  customer_phone: "00000000123",
  fulfillment: "DELIVERY",
  payment_method: "CASH",
  address_street: "Rua fictícia DR",
  address_number: "123",
  address_neighborhood: z.neighborhoods[0],
  expected_delivery_fee: Number(z.delivery_fee),
  expected_total: 64 + Number(z.delivery_fee),
  items: [item],
};
const order = (await rpc("create_public_order", { p_order: payload }))[0];
const token = crypto.randomBytes(32).toString("base64url"),
  requestKey = crypto.randomUUID();
await rpc("neroxa_register_order_amendment_capability", {
  p_instance_id: A.instance_id,
  p_order_id: order.order_id,
  p_checkout_key: payload.idempotency_key,
  p_token_sha256: crypto.createHash("sha256").update(token).digest("hex"),
});
const append = {
  p_instance_id: A.instance_id,
  p_order_id: order.order_id,
  p_token: token,
  p_request_key: requestKey,
  p_items: [{ ...item, quantity: 1 }],
};
const amended = (await rpc("neroxa_append_order_items_with_capability", append))[0];
if (amended.payment_state !== "NOT_SETTLED") throw Error("Financial state not safe");
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const people = [];
const bridge = JSON.parse(fs.readFileSync(work + "/bridge.private.json", "utf8"));
for (let i = 0; i < 5; i++) {
  const email = "dr-" + i + "-" + project + "@ab.invalid",
    password = crypto.randomBytes(24).toString("base64url");
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (u.error) throw Error("Synthetic DR user");
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw Error("Source DR auth");
  people.push({ id: u.data.user.id, email, password, sourceToken: s.data.session.access_token });
  if (i < 3) {
    const f = fixtures[i];
    sql(
      `BEGIN;INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${q(f.organization_id)},${q(u.data.user.id)},'OWNER');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(f.instance_id)},${q(u.data.user.id)},'OWNER');COMMIT;`,
    );
  }
  if (i === 4)
    sql(
      `BEGIN;INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${q(bridge.org)},${q(u.data.user.id)},'OWNER');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${q(bridge.store)},${q(u.data.user.id)},'OWNER');COMMIT;`,
    );
}
fs.writeFileSync(
  work + "/dr-proof.private.json",
  JSON.stringify({ payload, order, append, amended, people }),
  { mode: 0o600 },
);
// No changes to native business functions. Test-only table gate freezes private/public
// operational writes, including service_role calls; source Auth/REST are then stopped.
sql(`CREATE TABLE neroxa_bridge.dr_freeze(singleton boolean PRIMARY KEY CHECK(singleton), frozen boolean NOT NULL);INSERT INTO neroxa_bridge.dr_freeze VALUES(true,false);REVOKE ALL ON neroxa_bridge.dr_freeze FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION neroxa_bridge.dr_write_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF (SELECT frozen FROM neroxa_bridge.dr_freeze WHERE singleton) THEN RAISE EXCEPTION 'DR_WRITE_FREEZE' USING ERRCODE='55000';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;REVOKE ALL ON FUNCTION neroxa_bridge.dr_write_gate() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE r record;BEGIN FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','private','neroxa_private','neroxa_bridge') AND c.relname<>'dr_freeze' LOOP EXECUTE format('CREATE TRIGGER zz_dr_write_freeze BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION neroxa_bridge.dr_write_gate()',r.nspname,r.relname);END LOOP;END $$;UPDATE neroxa_bridge.dr_freeze SET frozen=true;`);
console.log(
  "SOURCE synthetic GROUP delivery, versioned snapshots, proof and NOT_SETTLED append prepared and operational writes frozen.",
);
