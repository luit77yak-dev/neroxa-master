import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const work = process.env.AB_WORKDIR,
  project = process.env.AB_PROJECT;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "")) throw Error("Disposable only");
const env = Object.fromEntries(
  fs
    .readFileSync(work + "/status.private.env", "utf8")
    .split("\n")
    .flatMap((l) => {
      const m = l.match(/^([A-Z_]+)="(.*)"$/);
      return m ? [[m[1], m[2]]] : [];
    }),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Local backend required");
const actors = JSON.parse(fs.readFileSync(work + "/h03-actor.private.json", "utf8")),
  fixtures = JSON.parse(fs.readFileSync(work + "/h03-fixtures.private.json", "utf8"));
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
const checks = [];
let complete = false;
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  if (!ok) throw Error(name);
  console.log("PASS " + name);
};
const rpc = async (name, args, token = env.SERVICE_ROLE_KEY) => {
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
  const sharedKey = crypto.randomUUID(),
    orders = [];
  for (const f of fixtures) {
    const price = Number(
        sql(`SELECT price FROM public.neroxa_storefront_products WHERE id='${f.p}'`),
      ),
      zone = JSON.parse(
        sql(
          `SELECT jsonb_build_object('name',neighborhoods[1],'fee',delivery_fee) FROM public.neroxa_storefront_delivery_zones WHERE instance_id='${f.instance_id}' AND active ORDER BY sort_order,id LIMIT 1`,
        ),
      );
    const payload = {
      organization_id: f.organization_id,
      instance_id: f.instance_id,
      store_domain: f.domain,
      idempotency_key: sharedKey,
      client_cart_reference: "d".repeat(64),
      customer_name: "Cliente Matriz fictício",
      customer_phone: "00000000003",
      fulfillment: "DELIVERY",
      payment_method: "CASH",
      address_street: "Rua matriz fictícia",
      address_number: "123",
      address_neighborhood: zone.name,
      expected_total: price + Number(zone.fee),
      items: [
        {
          selection_contract: "GROUP_ADDONS_V1",
          product_id: f.p,
          group_addon_ids: [f.a],
          size_id: "pequena",
          quantity: 1,
          expected_unit_price: price,
        },
      ],
    };
    const created = await rpc("create_public_order", { p_order: payload });
    check(
      "real delivery per store " + f.domain,
      created.status === 200 && Number(created.data[0].total) === payload.expected_total,
    );
    orders.push({ f, payload, id: created.data[0].order_id });
    const proof = await rpc("neroxa_recover_group_order", {
      p_instance_id: f.instance_id,
      p_checkout_key: sharedKey,
      p_order: payload,
    });
    check(
      "same UUID scoped by store and exact proof " + f.domain,
      proof.status === 200 &&
        proof.data.instance_id === f.instance_id &&
        proof.data.order_id === created.data[0].order_id,
    );
  }
  check(
    "same idempotency UUID across stores gives distinct orders",
    new Set(orders.map((o) => o.id)).size === 3,
  );
  const a = orders[0],
    b = orders[1],
    c = orders[2];
  const before = sql(
    `SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${a.f.instance_id}'`,
  );
  for (const other of [b, c]) {
    const denied = await rpc("neroxa_recover_group_order", {
      p_instance_id: a.f.instance_id,
      p_checkout_key: sharedKey,
      p_order: other.payload,
    });
    check("cross shop proof denied " + other.f.domain, denied.status === 403);
    const mixed = await rpc("create_public_order", {
      p_order: {
        ...a.payload,
        idempotency_key: crypto.randomUUID(),
        items: [{ ...a.payload.items[0], group_addon_ids: [other.f.a] }],
      },
    });
    check("foreign addon denied " + other.f.domain, mixed.status === 400);
  }
  const badAddress = await rpc("create_public_order", {
    p_order: {
      ...a.payload,
      idempotency_key: crypto.randomUUID(),
      address_neighborhood: "Não atendido fictício",
    },
  });
  check("unserved area rejected", badAddress.status === 400);
  const forged = await rpc("create_public_order", {
    p_order: { ...a.payload, idempotency_key: crypto.randomUUID(), expected_total: 1 },
  });
  check("forged total rejected with real rollback", forged.status === 409);
  sql(`UPDATE public.neroxa_storefront_products SET active=false WHERE id='${a.f.p}'`);
  const inactive = await rpc("create_public_order", {
    p_order: { ...a.payload, idempotency_key: crypto.randomUUID() },
  });
  check("product disabled during purchase rejected", inactive.status === 400);
  sql(`UPDATE public.neroxa_storefront_products SET active=true WHERE id='${a.f.p}'`);
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=false WHERE instance_id='${a.f.instance_id}'`,
  );
  const closed = await rpc("create_public_order", {
    p_order: { ...a.payload, idempotency_key: crypto.randomUUID() },
  });
  check("store closing during purchase rejects order", closed.status === 423);
  sql(
    `UPDATE public.neroxa_storefront_availability SET enabled=true WHERE instance_id='${a.f.instance_id}'`,
  );
  check(
    "all rejected new purchases preserve database count",
    sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${a.f.instance_id}'`) ===
      before,
  );
  const token = crypto.randomBytes(32).toString("base64url");
  await rpc("neroxa_register_order_amendment_capability", {
    p_instance_id: a.f.instance_id,
    p_order_id: a.id,
    p_checkout_key: sharedKey,
    p_token_sha256: crypto.createHash("sha256").update(token).digest("hex"),
  });
  const args = {
    p_instance_id: a.f.instance_id,
    p_order_id: a.id,
    p_token: token,
    p_request_key: crypto.randomUUID(),
    p_items: a.payload.items,
  };
  const added = await rpc("neroxa_append_order_items_with_capability", args);
  check(
    "private GROUP append remains NOT_SETTLED",
    added.status === 200 &&
      added.data[0].payment_state === "NOT_SETTLED" &&
      Number(added.data[0].added_amount) === a.payload.items[0].expected_unit_price,
  );
  const itemCount = sql(`SELECT count(*) FROM public.neroxa_order_items WHERE order_id='${a.id}'`);
  const replay = await rpc("neroxa_append_order_items_with_capability", args);
  check(
    "append repeated receipt creates no extra items",
    replay.status === 200 &&
      sql(`SELECT count(*) FROM public.neroxa_order_items WHERE order_id='${a.id}'`) === itemCount,
  );
  const crossAppend = await rpc("neroxa_append_order_items_with_capability", {
    ...args,
    p_instance_id: b.f.instance_id,
    p_request_key: crypto.randomUUID(),
  });
  check(
    "private append capability cannot cross store",
    crossAppend.status === 403 &&
      sql(`SELECT count(*) FROM public.neroxa_order_items WHERE order_id='${a.id}'`) === itemCount,
  );
  const raceKey = crypto.randomUUID();
  const raced = await Promise.all([
    rpc("create_public_order", { p_order: { ...a.payload, idempotency_key: raceKey } }),
    rpc(
      "neroxa_reconcile_checkout",
      { p_instance_id: a.f.instance_id, p_checkout_key: raceKey },
      actors.token,
    ),
  ]);
  const count = Number(
    sql(
      `SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${a.f.instance_id}' AND idempotency_key='${raceKey}'`,
    ),
  );
  check(
    "concurrent operator fencing versus creation is serialized",
    (count === 1 && raced[0].status === 200 && raced[1].data.outcome === "CONFIRMED") ||
      (count === 0 && raced[0].status === 410 && raced[1].data.outcome === "FENCED_ABSENT"),
  );
  const audit = JSON.parse(
    sql(
      `SELECT to_jsonb(x) FROM private.neroxa_checkout_reconciliation x WHERE instance_id='${a.f.instance_id}' AND checkout_key='${raceKey}'`,
    ),
  );
  check(
    "reconciliation has actor and immutable scoped audit",
    !!audit.actor_id && audit.instance_id === a.f.instance_id,
  );
  const containers = JSON.parse(
    execFileSync("docker", ["inspect", "supabase_auth_" + project], { encoding: "utf8" }),
  );
  // Ask native GoTrue to issue a genuinely short-lived credential; never forge a positive auth identity or downgrade signing.
  const original = containers[0],
    name = "neroxa_expiry_auth_" + project,
    network = Object.keys(original.NetworkSettings.Networks)[0];
  const replicaEnv = original.Config.Env.filter(
    (e) => e.startsWith("GOTRUE_") || e.startsWith("API_EXTERNAL_URL="),
  ).filter((e) => !e.startsWith("GOTRUE_JWT_EXP="));
  replicaEnv.push("GOTRUE_JWT_EXP=2");
  let expired;
  try {
    execFileSync(
      "docker",
      [
        "run",
        "-d",
        "--name",
        name,
        "--network",
        network,
        "--label",
        "com.supabase.cli.project=" + project,
        "-p",
        "127.0.0.1::9999",
        ...replicaEnv.flatMap((e) => ["-e", e]),
        original.Config.Image,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const target = JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0],
      binding = target.NetworkSettings.Ports["9999/tcp"][0];
    if (binding.HostIp !== "127.0.0.1") throw Error("Loopback required");
    const url = "http://127.0.0.1:" + binding.HostPort;
    let ready = false;
    for (let n = 0; n < 20; n++) {
      try {
        ready = (await fetch(url + "/health")).ok;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!ready) throw Error("Native expiry Auth not ready");
    const signed = await fetch(url + "/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: actors.email, password: actors.password }),
      }),
      session = await signed.json();
    if (!signed.ok || !session.access_token || session.expires_in > 10)
      throw Error("Native short lease unavailable");
    const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url")),
      existing = JSON.parse(Buffer.from(actors.token.split(".")[1], "base64url"));
    check(
      "native GoTrue itself issues short-lived credential for real owner",
      claims.sub === existing.sub &&
        claims.role === "authenticated" &&
        claims.exp - claims.iat <= 10,
    );
    const healthy = await rpc(
      "get_admin_orders",
      { p_instance_id: a.f.instance_id },
      session.access_token,
    );
    check("short-lived native token authorized before expiry", healthy.status === 200);
    const wait = Math.max(0, claims.exp - Math.floor(Date.now() / 1000) + 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
    expired = session.access_token;
  } catch {
    throw Error(
      "Native short-lived Auth rehearsal failed; credentials and container config withheld",
    );
  } finally {
    try {
      execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
    } catch {}
  }
  fs.writeFileSync(work + "/expired.identity.private.json", JSON.stringify({ token: expired }), {
    mode: 0o600,
  });
  // Native JWT verification includes provider leeway/cache behavior. Observe it, never disable verification or alter its config.
  const expiryWaitStarted = Date.now(),
    deadline = Date.now() + 75000;
  let expiredResult;
  do {
    expiredResult = await rpc("get_admin_orders", { p_instance_id: a.f.instance_id }, expired);
    if (expiredResult.status === 401) break;
    await new Promise((r) => setTimeout(r, 1500));
  } while (Date.now() < deadline);
  console.log(
    "NATIVE_EXPIRY_OBSERVATION=" +
      JSON.stringify({
        http: expiredResult.status,
        observedAdditionalSeconds: Math.ceil((Date.now() - expiryWaitStarted) / 1000),
      }),
  );
  check("real PostgREST rejects signed local expired identity", expiredResult.status === 401);
  complete = true;
} finally {
  const result = {
    classification: complete ? "PASS_NATIVE_OPERATIONS" : "INCOMPLETE",
    productionApproved: false,
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
  };
  fs.writeFileSync(
    "audits/ab-auth/results/first-order-security.json",
    JSON.stringify(result, null, 2),
  );
  console.log("FIRST_ORDER_SECURITY_RESULT=" + JSON.stringify(result));
}
