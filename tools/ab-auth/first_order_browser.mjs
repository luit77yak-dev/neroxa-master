// Full browser -> HTTPS gateway -> native PostgreSQL/Auth/PostgREST. Synthetic data only.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
const work = process.env.AB_WORKDIR,
  project = process.env.AB_PROJECT;
if (!/^neroxa-ab-[0-9]+$/.test(project ?? "") || !work) throw Error("Disposable stack required");
const env = Object.fromEntries(
  fs
    .readFileSync(work + "/status.private.env", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="(.*)"$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (new URL(env.API_URL).hostname !== "127.0.0.1") throw Error("Loopback backend required");
const fixtures = JSON.parse(fs.readFileSync(work + "/h03-fixtures.private.json", "utf8")),
  actor = JSON.parse(fs.readFileSync(work + "/h03-actor.private.json", "utf8"));
const A = fixtures[0];
const { chromium } = createRequire(import.meta.url)(process.env.BROWSER_MODULE);
const consumer = path.resolve("delivery-consumer");
const checks = [],
  errors = [],
  blockedOrigins = new Set();
const check = (name, ok) => {
  checks.push({ name, passed: !!ok });
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) throw Error(name);
};
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
const profile = path.join(work, "first-browser-profile.private");
fs.mkdirSync(profile, { mode: 0o700 });
const shots = path.resolve("audits/ab-auth/results/first-browser");
fs.mkdirSync(shots, { recursive: true });
let server,
  context,
  complete = false,
  lost = null,
  drop = false,
  dropBefore = false,
  checkoutPosts = 0,
  originalPayload = null;
const api = async (resource, body) => {
  const r = await fetch(env.API_URL + "/rest/v1/" + resource, {
    method: "PATCH",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: "Bearer " + actor.token,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
};
const fixture = path.join(consumer, "h03.isolated.fixture.ts"),
  config = path.join(consumer, "vite.h03.config.ts");
try {
  fs.writeFileSync(
    fixture,
    `export const STOREFRONT_URL=${JSON.stringify(env.API_URL)};import {createClient} from '@supabase/supabase-js';export const supabase=createClient(${JSON.stringify(env.API_URL)},${JSON.stringify(env.ANON_KEY)},{auth:{persistSession:false,autoRefreshToken:false}});export function resolveStorefrontDomain(host:string){if(!['a.ab.invalid','b.ab.invalid','c.ab.invalid'].includes(host))throw Error('Unknown isolated host');return host;}`,
  );
  fs.writeFileSync(
    config,
    `import {defineConfig} from '@lovable.dev/vite-tanstack-config';import {readFileSync} from 'node:fs';export default defineConfig({tanstackStart:{server:{entry:'server'}},vite:{resolve:{alias:[{find:'@/integrations/storefront-backend/client',replacement:${JSON.stringify(fixture)}}]},server:{host:'127.0.0.1',port:4173,strictPort:true,allowedHosts:['a.ab.invalid','b.ab.invalid','c.ab.invalid'],https:{key:readFileSync(${JSON.stringify(work + "/checkout-ci-key.private.pem")}),cert:readFileSync(${JSON.stringify(work + "/checkout-ci-cert.private.pem")})}}}});`,
  );
  const fd = fs.openSync(work + "/first-vite.private.log", "a", 0o600);
  server = spawn(
    process.execPath,
    [consumer + "/node_modules/vite/bin/vite.js", "--config", config],
    {
      cwd: consumer,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        SUPABASE_URL: env.API_URL,
        NEROXA_DELIVERY_BACKEND_URL: env.API_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
        SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY,
        VITE_SUPABASE_URL: env.API_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: env.ANON_KEY,
        NEROXA_CHECKOUT_GATEWAY_ENABLED: "true",
        NEROXA_GROUP_ADDONS_V1_ENABLED: "true",
        NEROXA_REQUIRE_DURABLE_CHECKOUT_INTENTS: "true",
        NEROXA_CHECKOUT_RECOVERY_ENABLED: "true",
        NEROXA_CHECKOUT_AMENDMENTS_ENABLED: "true",
        VITE_NEROXA_CHECKOUT_GATEWAY: "true",
        VITE_NEROXA_GROUP_ADDONS_V1: "true",
        VITE_NEROXA_DURABLE_CHECKOUT_INTENTS: "true",
        VITE_NEROXA_CHECKOUT_AMENDMENTS: "true",
        NEROXA_CHECKOUT_RATE_LIMIT_SECRET: crypto.randomBytes(48).toString("hex"),
      },
    },
  );
  await new Promise((r) => setTimeout(r, 5000));
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_BIN,
      headless: true,
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
      args: ["--no-sandbox"],
    });
    await context.route("**/*", async (route) => {
      const r = route.request(),
        u = new URL(r.url());
      if (
        ["a.ab.invalid", "b.ab.invalid", "c.ab.invalid"].includes(u.hostname) &&
        u.port === "4173"
      ) {
        if (u.pathname === "/api/checkout" && r.method() === "POST") {
          checkoutPosts++;
          originalPayload = r.postDataJSON().p_order;
        }
        if (dropBefore && u.pathname === "/api/checkout" && r.method() === "POST") {
          dropBefore = false;
          return route.abort();
        }
        if (drop && u.pathname === "/api/checkout" && r.method() === "POST") {
          originalPayload = r.postDataJSON().p_order;
          drop = false;
          const response = await route.fetch();
          check("lost-response transport actually persisted via HTTPS", response.status() === 200);
          lost = await response.json();
          await route.abort();
          return;
        }
        return route.continue();
      }
      if (
        u.origin === new URL(env.API_URL).origin &&
        (u.pathname.startsWith("/auth/v1/") ||
          [
            "get_public_storefront_catalog",
            "get_admin_orders",
            "get_admin_order_detail",
            "update_admin_order_status",
            "neroxa_reconcile_checkout",
          ].some((name) => u.pathname.endsWith("/rpc/" + name)))
      )
        return route.continue();
      blockedOrigins.add(u.origin);
      return route.abort();
    });
    return context.pages()[0] ?? (await context.newPage());
  };
  let page = await launch();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://a.ab.invalid:4173/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Pizza H03 a", exact: true }).waitFor();
  check("real scoped catalog renders", true);

  const users = [actor];
  console.log("::add-mask::" + actor.password);
  const authAdmin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let index = 1; index <= 3; index++) {
    const email = "operational-" + crypto.randomUUID() + "@example.invalid",
      password = crypto.randomBytes(24).toString("base64url");
    console.log("::add-mask::" + password);
    const { data, error } = await authAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw Error("Native fake actor creation failed");
    if (index < 3)
      sql(
        `INSERT INTO public.neroxa_organization_members(organization_id,user_id,role) VALUES('${fixtures[index].organization_id}','${data.user.id}','OWNER');INSERT INTO public.neroxa_instance_members(instance_id,user_id,role) VALUES('${fixtures[index].instance_id}','${data.user.id}','OWNER');`,
      );
    users.push({ email, password });
  }
  const optGroup = crypto.randomUUID(),
    optAddon = crypto.randomUUID();
  sql(
    `INSERT INTO public.neroxa_storefront_addon_groups(id,instance_id,name,required,min_selections,max_selections) VALUES('${optGroup}','${A.instance_id}','Opcional Entrega',false,0,1);INSERT INTO public.neroxa_storefront_addons(id,group_id,name,price_delta) VALUES('${optAddon}','${optGroup}','Opcional pago fictício',3);INSERT INTO public.neroxa_storefront_product_addon_groups(product_id,group_id) VALUES('${A.p}','${optGroup}');`,
  );
  for (const [index, f] of fixtures.entries()) {
    const tz = ["America/Sao_Paulo", "America/Manaus", "Europe/Lisbon"][index];
    sql(
      `UPDATE public.neroxa_storefront_settings SET address_street='Rua loja fictícia ${index}',address_number='${100 + index}',address_neighborhood='Bairro loja ${index}',address_city='Cidade fictícia',address_state='SP' WHERE instance_id='${f.instance_id}';UPDATE public.neroxa_storefront_delivery_zones SET neighborhoods=ARRAY['Bairro Entrega ${index}'],delivery_fee=${4 + index * 4},minimum_order=0 WHERE instance_id='${f.instance_id}';UPDATE public.neroxa_storefront_availability SET timezone='${tz}' WHERE instance_id='${f.instance_id}';UPDATE public.neroxa_storefront_weekly_hours SET opens_at='${9 + index}:00',closes_at='${18 + index}:00' WHERE instance_id='${f.instance_id}' AND weekday<>extract(dow FROM clock_timestamp() AT TIME ZONE '${tz}');`,
    );
  }
  const resetPrice = await api("neroxa_storefront_products?id=eq." + A.p, { price: 30 });
  check("authorized fake owner sets initial price", resetPrice.status === 200);
  await page.reload({ waitUntil: "networkidle" });

  const customerPage = page;
  const screenshot = async (target, label) => {
    for (const [width, height] of [
      [360, 800],
      [390, 844],
      [412, 915],
      [768, 1024],
      [1440, 900],
    ]) {
      await target.setViewportSize({ width, height });
      check(
        label + " no document overflow " + width,
        await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      await target.screenshot({
        path: path.join(shots, label + "-" + width + ".png"),
        fullPage: true,
      });
    }
    await target.setViewportSize({ width: 390, height: 844 });
  };
  await screenshot(page, "catalog");
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Pizza H03 a", exact: true }) })
    .click();
  await page.getByText("Grande", { exact: true }).click();
  await page.getByRole("button", { name: /Próxima etapa/ }).click();
  await page.getByRole("button", { name: /^Recheada/ }).click();
  await page.getByText("Pago H03", { exact: false }).click();
  await page.getByText("Opcional pago fictício", { exact: false }).click();
  await screenshot(page, "configurator");
  await page.getByRole("button", { name: /Próxima etapa/ }).click();
  await page.getByRole("button", { name: /Adicionar ao carrinho/ }).click();
  if (!(await page.getByRole("heading", { name: "Carrinho", exact: true }).isVisible()))
    await page.getByRole("button", { name: "Abrir carrinho" }).click();
  // Cart quantity controls are accessible buttons with labels defined by the existing component.
  await page.getByRole("button", { name: "Aumentar", exact: true }).click();
  await screenshot(page, "cart");
  await page.getByRole("button", { name: "Continuar para checkout", exact: true }).click();
  await page.getByLabel(/Nome/).fill("Cliente Entrega fictício");
  await page.getByLabel(/Telefone/).fill("00000000002");
  await page.getByRole("button", { name: /Entrega.*Receba/ }).click();
  await page.getByLabel(/Rua/).fill("Rua Entrega fictícia");
  await page.getByLabel(/Número/).fill("100");
  await page.getByLabel(/Bairro/).selectOption("Bairro Entrega 0");
  await screenshot(page, "checkout");
  const initialOrders = Number(
    sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
  );
  const feeChange = await api("neroxa_storefront_delivery_zones?instance_id=eq." + A.instance_id, {
    delivery_fee: 7,
  });
  check("authenticated owner changes fee", feeChange.status === 200);
  await page.getByRole("button", { name: /Enviar pedido R\$/ }).click();
  await page.getByRole("alert").filter({ hasText: "O preço mudou" }).waitFor();
  check(
    "changed fee rejected without order",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) === initialOrders,
  );
  await page.getByRole("button", { name: "Revisar preços", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Valores atualizados" }).waitFor();
  check(
    "delivery total91 shown before consent",
    (await page.getByRole("button", { name: /Enviar pedido R\$/ }).innerText()).includes("91,00"),
  );
  const confirmation = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/checkout") && r.request().method() === "POST" && r.status() === 200,
  );
  await page.getByRole("button", { name: /Enviar pedido R\$/ }).click();
  lost = await (await confirmation).json();
  await page.getByRole("dialog", { name: /Acompanhar pedido #/ }).waitFor();
  check(
    "normal delivery opens tracking without technical intervention",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) ===
      initialOrders + 1,
  );
  const persisted = JSON.parse(
    sql(
      `SELECT jsonb_build_object('order',to_jsonb(o),'items',(SELECT jsonb_agg(to_jsonb(i)) FROM public.neroxa_order_items i WHERE i.order_id=o.id)) FROM public.neroxa_orders o WHERE o.id='${lost.order_id}'`,
    ),
  );
  check(
    "database authoritative delivery fields and GROUP snapshot",
    persisted.order.instance_id === A.instance_id &&
      persisted.order.subtotal === 84 &&
      persisted.order.delivery_fee === 7 &&
      persisted.order.total === 91 &&
      persisted.order.address_street === "Rua Entrega fictícia" &&
      persisted.order.address_number === "100" &&
      persisted.items[0].quantity === 2 &&
      persisted.items[0].unit_price === 42 &&
      persisted.items[0].selection_snapshot.contract === "GROUP_ADDONS_V1" &&
      persisted.items[0].selection_snapshot.version === 2,
  );
  await screenshot(page, "tracking");
  // Separate origin session/container for the proprietor: no administrative session in customer context.
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN,
    headless: true,
    args: ["--no-sandbox"],
  });
  const operatorContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  });
  let holdList = false,
    failList = false,
    releaseList,
    heldList;
  let heldReady = new Promise((resolve) => (heldList = resolve));
  await operatorContext.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === new URL(env.API_URL).origin && u.pathname.endsWith("/rpc/get_admin_orders")) {
      if (failList) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Falha fictícia de transporte" }),
        });
      }
      if (holdList && route.request().postDataJSON()?.p_instance_id === A.instance_id) {
        holdList = false;
        const response = await route.fetch();
        heldList();
        await new Promise((resolve) => (releaseList = resolve));
        return route.fulfill({ response });
      }
    }
    if (
      (u.hostname === "a.ab.invalid" && u.port === "4173") ||
      u.origin === new URL(env.API_URL).origin
    )
      return route.continue();
    return route.abort();
  });
  try {
    const panel = await operatorContext.newPage();
    panel.setDefaultTimeout(25000);
    panel.on("pageerror", (e) => errors.push(e.message));
    await panel.goto("https://a.ab.invalid:4173/admin/pedidos", { waitUntil: "networkidle" });
    const login = async (user) => {
      await panel.getByLabel("E-mail", { exact: true }).fill(user.email);
      await panel.getByLabel("Senha", { exact: true }).fill(user.password);
      await panel.getByRole("button", { name: "Entrar", exact: true }).click();
      await panel.getByLabel("Instância", { exact: true }).waitFor();
    };
    await login(users[0]);
    await panel.getByRole("button").filter({ hasText: "Cliente Entrega fictício" }).click();
    await panel
      .getByRole("region", { name: "Itens do pedido" })
      .getByText("2 × Pizza H03 a", { exact: true })
      .waitFor();
    check(
      "real authenticated panel shows GROUP items and delivery",
      await panel
        .locator("aside")
        .getByText(/Rua Entrega fictícia, 100/)
        .isVisible(),
    );
    await screenshot(panel, "panel");
    holdList = true;
    await panel.getByRole("button", { name: "Atualizar", exact: true }).click();
    await heldReady;
    await panel.getByLabel("Instância", { exact: true }).fill(fixtures[1].instance_id);
    await panel.getByText("Nenhum pedido encontrado.", { exact: true }).waitFor();
    releaseList();
    await new Promise((r) => setTimeout(r, 1000));
    check(
      "delayed A1 response cannot populate A2 panel",
      (await panel.getByRole("button").filter({ hasText: "Cliente Entrega fictício" }).count()) ===
        0 && (await panel.getByRole("region", { name: "Itens do pedido" }).count()) === 0,
    );
    await panel.getByLabel("Instância", { exact: true }).fill(A.instance_id);
    await panel.getByRole("button").filter({ hasText: "Cliente Entrega fictício" }).waitFor();
    failList = true;
    await panel.getByRole("button", { name: "Atualizar", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    check(
      "backend list failure clears stale private orders",
      (await panel.getByRole("button").filter({ hasText: "Cliente Entrega fictício" }).count()) ===
        0,
    );
    failList = false;
    await panel.getByRole("button", { name: "Atualizar", exact: true }).click();
    await panel.getByRole("button").filter({ hasText: "Cliente Entrega fictício" }).click();
    await panel
      .getByRole("region", { name: "Itens do pedido" })
      .getByText("2 × Pizza H03 a", { exact: true })
      .waitFor();
    const priorHistory = Number(
      sql(
        `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id='${lost.order_id}'`,
      ),
    );
    await panel.locator("aside").getByRole("button", { name: "Entregue", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    check(
      "invalid transition changes neither status nor history",
      sql(`SELECT status FROM public.neroxa_orders WHERE id='${lost.order_id}'`) === "RECEIVED" &&
        Number(
          sql(
            `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id='${lost.order_id}'`,
          ),
        ) === priorHistory,
    );
    for (const [code, label, message] of [
      ["CONFIRMED", "Confirmado", "Seu pedido foi confirmado"],
      ["PREPARING", "Em preparo", "A cozinha está preparando"],
      ["READY", "Pronto", "Seu pedido está pronto"],
      ["OUT_FOR_DELIVERY", "Saiu para entrega", "Seu pedido saiu para entrega"],
      ["DELIVERED", "Entregue", "Pedido entregue. Bom apetite!"],
    ]) {
      await panel.locator("aside").getByRole("button", { name: label, exact: true }).click();
      await customerPage.getByText(message, { exact: false }).waitFor({ timeout: 60000 });
      check(
        "visual panel advances " + code + " with matching customer tracking",
        sql(`SELECT status FROM public.neroxa_orders WHERE id='${lost.order_id}'`) === code,
      );
    }
    check(
      "one historical event for each valid transition",
      Number(
        sql(
          `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id='${lost.order_id}'`,
        ),
      ) ===
        priorHistory + 5,
    );
    const rpcAsPanel = (name, args) =>
      panel.evaluate(
        async ({ name, args }) => {
          const { supabase } = await import("/src/integrations/supabase/client.ts");
          const r = await supabase.rpc(name, args);
          return { data: r.data, code: r.error?.code };
        },
        { name, args },
      );
    const replay = await rpcAsPanel("update_admin_order_status", {
      p_order_id: lost.order_id,
      p_status: "DELIVERED",
      p_note: null,
    });
    check(
      "repeated final status does not duplicate history",
      !replay.code &&
        Number(
          sql(
            `SELECT count(*) FROM public.neroxa_order_status_history WHERE order_id='${lost.order_id}'`,
          ),
        ) ===
          priorHistory + 5,
    );
    const known = await rpcAsPanel("neroxa_reconcile_checkout", {
      p_instance_id: A.instance_id,
      p_checkout_key: originalPayload.idempotency_key,
    });
    check(
      "authorized reconciliation recognizes confirmed order without financial change",
      known.data?.outcome === "CONFIRMED" &&
        known.data?.order_id === lost.order_id &&
        Number(sql(`SELECT total FROM public.neroxa_orders WHERE id='${lost.order_id}'`)) === 91,
    );
    const unusedKey = crypto.randomUUID();
    const absent = await rpcAsPanel("neroxa_reconcile_checkout", {
      p_instance_id: A.instance_id,
      p_checkout_key: unusedKey,
    });
    check("operator fences a known absent key", absent.data?.outcome === "FENCED_ABSENT");
    const fenced = await customerPage.evaluate(
      async (payload) => {
        const r = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_order: payload }),
        });
        return r.status;
      },
      { ...originalPayload, idempotency_key: unusedKey },
    );
    check(
      "server fence rejects future creation and preserves one order",
      fenced === 410 &&
        Number(
          sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
        ) ===
          initialOrders + 1,
    );
    for (const [index, instance] of [
      [1, fixtures[1]],
      [2, fixtures[2]],
      [3, null],
    ]) {
      await panel.getByRole("button", { name: "Sair", exact: true }).click();
      await login(users[index]);
      if (instance) await panel.getByLabel("Instância", { exact: true }).fill(instance.instance_id);
      const denied = await rpcAsPanel("get_admin_order_detail", {
        p_instance_id: A.instance_id,
        p_order_id: lost.order_id,
      });
      check(
        "real authenticated foreign/outsider cannot read A1 detail " + index,
        denied.data === null,
      );
      const rejected = await rpcAsPanel("update_admin_order_status", {
        p_order_id: lost.order_id,
        p_status: "CONFIRMED",
        p_note: null,
      });
      check(
        "foreign identity cannot alter A1 " + index,
        rejected.code === "42501" &&
          sql(`SELECT status FROM public.neroxa_orders WHERE id='${lost.order_id}'`) ===
            "DELIVERED",
      );
      const deniedFence = await rpcAsPanel("neroxa_reconcile_checkout", {
        p_instance_id: A.instance_id,
        p_checkout_key: crypto.randomUUID(),
      });
      check("foreign identity cannot fence A1 " + index, deniedFence.code === "42501");
    }
    await panel.getByRole("button", { name: "Sair", exact: true }).click();
    check(
      "session ended clears operational data",
      await panel.getByLabel("Senha", { exact: true }).isVisible(),
    );
  } finally {
    await operatorContext.close();
    await browser.close();
  }
  const requestCount = checkoutPosts;
  await customerPage.evaluate(() => localStorage.clear());
  const tryWithoutVault = () =>
    customerPage.evaluate(async (payload) => {
      const { withDurableCheckoutIntent } =
        await import("/src/core/delivery/durable-checkout-intent.ts");
      try {
        await withDurableCheckoutIntent(
          payload.instance_id,
          payload,
          async (wire) => {
            await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ p_order: wire }),
            });
          },
          { storage: localStorage, locks: navigator.locks },
        );
        return false;
      } catch {
        return true;
      }
    }, originalPayload);
  check(
    "complete localStorage clearing blocks repeat in current session",
    (await tryWithoutVault()) && checkoutPosts === requestCount,
  );
  await customerPage.reload({ waitUntil: "networkidle" });
  check(
    "pending cookie denial detects erased vault after reload",
    (await tryWithoutVault()) && checkoutPosts === requestCount,
  );
  check(
    "storage loss tests create no extra delivery order",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) ===
      initialOrders + 1,
  );
  check("no JavaScript exceptions in actual consumer and panel", errors.length === 0);
  complete = true;
} finally {
  if (context) {
    if (!complete && context.pages()[0])
      await context
        .pages()[0]
        .screenshot({ path: path.join(shots, "failure.png"), fullPage: true })
        .catch(() => {});
    await context.close();
  }
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => {
      server.once("exit", r);
      setTimeout(r, 5000);
    });
  }
  fs.rmSync(fixture, { force: true });
  fs.rmSync(config, { force: true });
  const result = {
    classification: complete ? "PASS_DELIVERY_AND_PANEL_NATIVE" : "INCOMPLETE",
    productionApproved: false,
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    errors,
    blockedOrigins: [...blockedOrigins],
  };
  fs.writeFileSync(
    "audits/ab-auth/results/first-order-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log("FIRST_ORDER_BROWSER_RESULT=" + JSON.stringify(result));
}
