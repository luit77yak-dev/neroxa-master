import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const docker = (args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const lit = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const instances = [1, 2, 3].map((n) => `b0000000-0000-4000-8000-00000000000${n}`);
const organizations = [1, 1, 2].map((n) => `a0000000-0000-4000-8000-00000000000${n}`);
const ids = (prefix) => [1, 2, 3].map((n) => `${prefix}0000000-0000-4000-8000-00000000000${n}`);
const categories = ids("d"),
  products = ids("e"),
  orders = ids("f");

export async function prepareSecurity({ work, project, psql, check }) {
  const env = Object.fromEntries(
    fs
      .readFileSync(work + "/status.private.env", "utf8")
      .split("\n")
      .flatMap((l) => {
        const m = l.match(/^([A-Z_]+)="(.*)"$/);
        return m ? [[m[1], m[2]]] : [];
      }),
  );
  if (!["127.0.0.1", "localhost"].includes(new URL(env.API_URL).hostname))
    throw Error("Local Auth URL required");
  for (const k of ["ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (!env[k]) throw Error("Local synthetic key missing");
    console.log("::add-mask::" + env[k]);
  }
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const people = [];
  for (let i = 0; i < 4; i++) {
    const email = `restore-${i}-${project}@rehearsal.invalid`,
      password = crypto.randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw Error("Disposable Auth provisioning failed");
    const client = createClient(env.API_URL, env.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw Error("Disposable Auth sign-in failed");
    const token = signed.data.session.access_token;
    console.log("::add-mask::" + token);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    check(
      `Auth issued identity ${i}`,
      claims.sub === created.data.user.id &&
        claims.role === "authenticated" &&
        claims.aal === "aal1",
    );
    people.push({ id: created.data.user.id, token, email, password });
  }
  // Historical rehearsal already applied phase1 and phase2 verbatim.
  for (const file of [
    "instance-membership-foundation",
    "store-product-category-guard",
    "storefront-tenant-integrity",
    "storefront-parent-instance-guard",
    "store-isolation-policies",
    "storefront-settings-zones-rls",
    "storefront-admin-rpc",
    "storefront-rpcs-phase2",
    "store-isolation-runtime-hardening",
  ]) {
    psql("postgres", fs.readFileSync(`audits/sql/${file}.candidate.sql`, "utf8"));
    check("security candidate " + file, true);
  }
  let sql = "BEGIN; SET LOCAL neroxa.implementation_write_path='official';";
  for (let i = 0; i < 3; i++) {
    sql += `INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES(${lit(organizations[i])},${lit(people[i].id)},'OPERATOR');
    INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES(${lit(instances[i])},${lit(people[i].id)},'OPERATOR');
    INSERT INTO public.neroxa_storefront_categories(id,instance_id,name,slug) VALUES(${lit(categories[i])},${lit(instances[i])},'Categoria fictícia','restore-${i}');
    INSERT INTO public.neroxa_storefront_products(id,instance_id,category_id,name,slug,price) VALUES(${lit(products[i])},${lit(instances[i])},${lit(categories[i])},'Produto fictício','restore-${i}',30);
    INSERT INTO public.neroxa_orders(id,instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,subtotal,total) VALUES(${lit(orders[i])},${lit(instances[i])},${lit(organizations[i])},1,'Cliente fictício','00000000001','PICKUP','CASH',30,30);
    INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,quantity,unit_price,line_total) VALUES(${lit(orders[i])},${lit(products[i])},'Produto fictício',1,30,30);
    INSERT INTO public.neroxa_order_status_history(order_id,to_status,note) VALUES(${lit(orders[i])},'RECEIVED','Histórico fictício');`;
  }
  sql += `CREATE FUNCTION public.restore_runtime_identity() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT jsonb_build_object('role',current_user,'uid',auth.uid(),'aal',auth.jwt()->>'aal','superuser',current_setting('is_superuser')) $$;
  REVOKE ALL ON FUNCTION public.restore_runtime_identity() FROM PUBLIC,anon,service_role;
  GRANT EXECUTE ON FUNCTION public.restore_runtime_identity() TO authenticated; COMMIT;`;
  psql("postgres", sql);
  return { people, env }; // JWTs stay only in memory, never in artifacts.
}

export async function startRestoredRest({ project, restoreDb }) {
  const name = "neroxa_restore_rest_" + project;
  const original = JSON.parse(docker(["inspect", "supabase_rest_" + project]))[0];
  const env = original.Config.Env.filter((x) => x.startsWith("PGRST_")).map((x) => {
    if (!x.startsWith("PGRST_DB_URI=")) return x;
    const url = new URL(x.slice("PGRST_DB_URI=".length));
    url.pathname = "/" + restoreDb;
    return "PGRST_DB_URI=" + url.toString();
  });
  if (!env.some((x) => x.startsWith("PGRST_DB_URI=")))
    throw Error("Local REST database URI missing");
  const network = Object.keys(original.NetworkSettings.Networks)[0];
  try {
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      network,
      "--label",
      "com.supabase.cli.project=" + project,
      "-p",
      "127.0.0.1::3000",
      ...env.flatMap((x) => ["-e", x]),
      original.Config.Image,
    ]);
    const target = JSON.parse(docker(["inspect", name]))[0];
    const binding = target.NetworkSettings.Ports["3000/tcp"]?.[0];
    if (binding?.HostIp !== "127.0.0.1") throw Error("Target REST must bind loopback");
    return { name, url: "http://127.0.0.1:" + binding.HostPort, image: original.Config.Image };
  } catch {
    try {
      docker(["rm", "-f", name]);
    } catch {
      /* Main workflow verifies project cleanup. */
    }
    throw Error("Restored disposable REST startup failed (details withheld)");
  }
}

export async function validateSecurity({ security, url, check, psql, restoreDb }) {
  const request = async (actor, resource, method = "GET", body) => {
    const token = actor === 4 ? security.env.ANON_KEY : security.people[actor].token;
    const r = await fetch(url + "/" + resource, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        apikey: security.env.ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  };
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await request(0, "rpc/restore_runtime_identity", "POST", {});
      ready = r.status === 200 && r.body.uid === security.people[0].id;
    } catch {
      /* Startup only, no mutation retried. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check("restored PostgREST verifies real Auth JWT", ready);
  for (let actor = 0; actor < 5; actor++) {
    if (actor < 4) {
      const r = await request(actor, "rpc/restore_runtime_identity", "POST", {});
      check(
        `restored JWT role and uid ${actor}`,
        r.status === 200 &&
          r.body.role === "authenticated" &&
          r.body.uid === security.people[actor].id &&
          r.body.superuser === "off",
      );
    }
    for (let shop = 0; shop < 3; shop++) {
      for (const table of [
        "neroxa_storefront_settings",
        "neroxa_storefront_delivery_zones",
        "neroxa_storefront_products",
        "neroxa_orders",
      ]) {
        const key = table === "neroxa_orders" ? "id" : "instance_id",
          value = table === "neroxa_orders" ? orders[shop] : instances[shop];
        const r = await request(actor, `${table}?${key}=eq.${value}`);
        const own = actor === shop;
        check(
          `restored ${table} actor ${actor} shop ${shop}`,
          own
            ? r.status === 200 &&
                Array.isArray(r.body) &&
                (table.endsWith("delivery_zones")
                  ? r.body.length === [2, 1, 1][shop]
                  : r.body.length > 0)
            : (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) ||
                r.status === 401 ||
                r.status === 403,
        );
      }
      if (actor === shop) continue;
      for (const method of ["PATCH", "DELETE"]) {
        const before = psql(restoreDb, fs.readFileSync("tools/ab-auth/restore_data.sql", "utf8"));
        const r = await request(
          actor,
          `neroxa_storefront_settings?instance_id=eq.${instances[shop]}`,
          method,
          method === "PATCH" ? { description: "DENIED" } : undefined,
        );
        check(
          `restored foreign ${method} actor ${actor} shop ${shop}`,
          (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) ||
            r.status === 401 ||
            r.status === 403,
        );
        check(
          `foreign ${method} leaves data unchanged ${actor}/${shop}`,
          before === psql(restoreDb, fs.readFileSync("tools/ab-auth/restore_data.sql", "utf8")),
        );
      }
      const r = await request(actor, "rpc/update_admin_order_status", "POST", {
        p_order_id: orders[shop],
        p_status: "CONFIRMED",
      });
      check(`restored foreign status RPC ${actor}/${shop}`, r.status === 401 || r.status === 403);
    }
  }
  for (let shop = 0; shop < 3; shop++) {
    const r = await request(shop, "rpc/update_admin_order_status", "POST", {
      p_order_id: orders[shop],
      p_status: "CONFIRMED",
    });
    check(
      `restored authorized status and history ${shop}`,
      r.status === 200 &&
        r.body.id === orders[shop] &&
        r.body.status === "CONFIRMED" &&
        psql(
          restoreDb,
          `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id=${lit(orders[shop])} AND to_status='CONFIRMED'`,
        ) === "1",
    );
  }
}

export async function startRestoredAuth({ project, restoreDb, security, check }) {
  const name = "neroxa_restore_auth_" + project;
  const source = JSON.parse(docker(["inspect", "supabase_auth_" + project]))[0];
  const env = source.Config.Env.filter(
    (x) => x.startsWith("GOTRUE_") || x.startsWith("API_EXTERNAL_URL="),
  ).map((x) => {
    if (!x.startsWith("GOTRUE_DB_DATABASE_URL=")) return x;
    const uri = new URL(x.slice("GOTRUE_DB_DATABASE_URL=".length));
    uri.pathname = "/" + restoreDb;
    return "GOTRUE_DB_DATABASE_URL=" + uri.toString();
  });
  if (!env.some((x) => x.startsWith("GOTRUE_DB_DATABASE_URL=")))
    throw Error("Auth target database URI missing");
  try {
    docker([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      Object.keys(source.NetworkSettings.Networks)[0],
      "--label",
      "com.supabase.cli.project=" + project,
      "-p",
      "127.0.0.1::9999",
      ...env.flatMap((x) => ["-e", x]),
      source.Config.Image,
    ]);
    const target = JSON.parse(docker(["inspect", name]))[0];
    const binding = target.NetworkSettings.Ports["9999/tcp"]?.[0];
    if (binding?.HostIp !== "127.0.0.1") throw Error("Restored Auth must bind loopback");
    const url = "http://127.0.0.1:" + binding.HostPort;
    let ready = false;
    for (let n = 0; n < 30; n++) {
      try {
        ready = (await fetch(url + "/health")).ok;
      } catch {
        /* Readiness only. */
      }
      if (ready) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    check("restored GoTrue health", ready);
    for (let i = 0; i < security.people.length; i++) {
      const person = security.people[i];
      const response = await fetch(url + "/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: person.email, password: person.password }),
      });
      const body = await response.json();
      if (!response.ok || !body.access_token) throw Error("Restored Auth sign-in failed");
      console.log("::add-mask::" + body.access_token);
      const claims = JSON.parse(
        Buffer.from(body.access_token.split(".")[1], "base64url").toString(),
      );
      check(
        "restored Auth emits valid identity " + i,
        claims.sub === person.id && claims.role === "authenticated" && claims.aal === "aal1",
      );
      person.token = body.access_token;
      delete person.password;
    }
    return { name, url, image: source.Config.Image };
  } catch {
    try {
      docker(["rm", "-f", name]);
    } catch {
      /* Workflow verifies cleanup. */
    }
    throw Error("Restored Auth validation failed (details withheld)");
  }
}
