import fs from "node:fs";
import crypto from "node:crypto";

const instance = "b0000000-0000-4000-8000-000000000001";
const order = "f0000000-0000-4000-8000-000000000001";
const dataSql = fs.readFileSync("tools/ab-auth/restore_data.sql", "utf8");
const rpc = async (url, security, name, body, actor = 0) => {
  const token = actor === "anon" ? security.env.ANON_KEY : security.people[actor].token;
  const r = await fetch(url + "/rpc/" + name, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      apikey: security.env.ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

export async function freezeSource({ psql, security, check }) {
  psql("postgres", fs.readFileSync("tools/ab-auth/recovery_freeze.sql", "utf8"));
  psql("postgres", "NOTIFY pgrst,'reload schema'");
  const url = security.env.API_URL + "/rest/v1";
  let ready = false;
  for (let n = 0; n < 30; n++) {
    const r = await rpc(url, security, "get_admin_orders", { p_instance_id: instance });
    ready = r.status === 200 && Array.isArray(r.body) && r.body.some((x) => x.id === order);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check("operational source authorized JWT reads before failure", ready);
  // Simulated incident starts a protected recovery window; never alter production.
  psql("postgres", "UPDATE private.ab_recovery_control SET frozen=true WHERE singleton;");
  const before = psql("postgres", dataSql);
  const blocked = await rpc(url, security, "update_admin_order_status", {
    p_order_id: order,
    p_status: "CONFIRMED",
  });
  check("operational source freezes authorized RPC writes", blocked.body?.code === "55000");
  check("operational source denied write is atomic", before === psql("postgres", dataSql));
}

export async function resumeTarget({ psql, security, url, restoreDb, check }) {
  const before = psql(restoreDb, dataSql);
  const blocked = await rpc(url, security, "update_admin_order_status", {
    p_order_id: order,
    p_status: "CONFIRMED",
  });
  check("operational restored target remains frozen", blocked.body?.code === "55000");
  check("operational restored frozen write leaves no changes", before === psql(restoreDb, dataSql));
  // Local recovery executor releases ONLY the verified clone, source stays frozen.
  psql(restoreDb, "UPDATE private.ab_recovery_control SET frozen=false WHERE singleton;");
  check(
    "operational source remains frozen",
    psql("postgres", "SELECT frozen FROM private.ab_recovery_control") === "t",
  );
  check(
    "operational target explicitly resumed",
    psql(restoreDb, "SELECT frozen FROM private.ab_recovery_control") === "f",
  );
}

export async function rollForward({ psql, security, url, restoreDb, check }) {
  const payload = {
    organization_id: "a0000000-0000-4000-8000-000000000001",
    instance_id: instance,
    store_domain: "recovery-a1.invalid",
    customer_name: "Synthetic recovery buyer",
    customer_phone: "00000000009",
    fulfillment: "PICKUP",
    payment_method: "CASH",
    idempotency_key: crypto.randomUUID(),
    items: [{ product_id: "e0000000-0000-4000-8000-000000000001", quantity: 1, unit_price: 1 }],
  };
  // Core RPC recovery check, not a certification of the private gateway release gate.
  const created = await rpc(url, security, "create_public_order", { p_order: payload }, "anon");
  check(
    "operational roll-forward creates server-priced order",
    created.status === 200 && Number(created.body?.[0]?.total) === 30,
  );
  const id = created.body[0].order_id;
  const retry = await rpc(url, security, "create_public_order", { p_order: payload }, "anon");
  check(
    "operational roll-forward retry is idempotent",
    retry.status === 200 && retry.body?.[0]?.order_id === id,
  );
  const wrong = await rpc(url, security, "get_admin_orders", { p_instance_id: instance }, 1);
  check(
    "operational roll-forward order hidden from sibling shop",
    wrong.status === 200 && Array.isArray(wrong.body) && wrong.body.length === 0,
  );
  const own = await rpc(url, security, "get_admin_orders", { p_instance_id: instance });
  check(
    "operational roll-forward order visible to authorized operator",
    own.status === 200 && own.body.some((x) => x.id === id),
  );
  const updated = await rpc(url, security, "update_admin_order_status", {
    p_order_id: id,
    p_status: "CONFIRMED",
  });
  check(
    "operational roll-forward status and audit work",
    updated.status === 200 &&
      updated.body.status === "CONFIRMED" &&
      psql(
        restoreDb,
        `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id='${id}' AND to_status='CONFIRMED'`,
      ) === "1",
  );
  const integrity = psql(restoreDb, fs.readFileSync("tools/ab-auth/restore_integrity.sql", "utf8"));
  check(
    "operational roll-forward has zero FK orphans",
    integrity.split("\n").every((x) => x.endsWith("|0")),
  );
  check(
    "operational independent settings retained after resume",
    psql(
      restoreDb,
      "SELECT count(DISTINCT hero_title) FROM public.neroxa_storefront_settings WHERE instance_id IN ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002')",
    ) === "2",
  );
}
