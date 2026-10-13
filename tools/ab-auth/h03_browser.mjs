// Full browser -> HTTPS gateway -> native PostgreSQL/Auth/PostgREST. Synthetic data only.
import fs from "node:fs";
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
const profile = path.join(work, "browser-profile.private");
fs.mkdirSync(profile, { mode: 0o700 });
const shots = path.resolve("audits/ab-auth/results/browser");
fs.mkdirSync(shots, { recursive: true });
let server,
  context,
  complete = false,
  lost = null,
  drop = false;
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
const fixture = path.join(consumer, "h03.client.fixture.ts"),
  config = path.join(consumer, "vite.h03.config.ts");
try {
  fs.writeFileSync(
    fixture,
    `import {createClient} from '@supabase/supabase-js';export const supabase=createClient(${JSON.stringify(env.API_URL)},${JSON.stringify(env.ANON_KEY)},{auth:{persistSession:false,autoRefreshToken:false}});export function resolveStorefrontDomain(host:string){if(!['a.ab.invalid','b.ab.invalid','c.ab.invalid'].includes(host))throw Error('Unknown isolated host');return host;}`,
  );
  fs.writeFileSync(
    config,
    `import {defineConfig} from '@lovable.dev/vite-tanstack-config';import {readFileSync} from 'node:fs';export default defineConfig({tanstackStart:{server:{entry:'server'}},vite:{resolve:{alias:[{find:'@/integrations/storefront-backend/client',replacement:${JSON.stringify(fixture)}}]},server:{host:'127.0.0.1',port:4173,strictPort:true,allowedHosts:['a.ab.invalid','b.ab.invalid','c.ab.invalid'],https:{key:readFileSync(${JSON.stringify(work + "/checkout-ci-key.private.pem")}),cert:readFileSync(${JSON.stringify(work + "/checkout-ci-cert.private.pem")})}}}});`,
  );
  const fd = fs.openSync(work + "/h03-vite.private.log", "a", 0o600);
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
        if (drop && u.pathname === "/api/checkout" && r.method() === "POST") {
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
        u.pathname.endsWith("/rpc/get_public_storefront_catalog")
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
  const add = async () => {
    await page
      .getByRole("button")
      .filter({ has: page.getByRole("heading", { name: "Pizza H03 a", exact: true }) })
      .click();
    await page.getByRole("button", { name: /Próxima etapa/ }).click();
    await page.getByText("Gratuito H03", { exact: false }).click();
    await page.getByRole("button", { name: /Próxima etapa/ }).click();
    await page.getByRole("button", { name: /Adicionar ao carrinho/ }).click();
  };
  const checkout = async () => {
    if (
      !(await page
        .getByRole("heading", { name: "Carrinho", exact: true })
        .isVisible()
        .catch(() => false))
    ) {
      const header = page.getByRole("button", { name: "Abrir carrinho" });
      if (await header.isVisible()) await header.click();
      else await page.locator(".ppp-floating-cart button").click();
    }
    await page.getByRole("button", { name: /Finalizar/ }).click();
  };
  const customer = async () => {
    await page.getByLabel(/Nome/).fill("Cliente H04 fictício");
    await page.getByLabel(/Telefone/).fill("00000000001");
    await page.getByRole("button", { name: /Retirada/ }).click();
  };
  await add();
  await checkout();
  await customer();
  const before = Number(
    sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
  );
  const update = await api("neroxa_storefront_products?id=eq." + A.p, { price: 35 });
  check(
    "real authenticated owner price update",
    update.status === 200 &&
      update.data.length === 1 &&
      sql(`SELECT price FROM public.neroxa_storefront_products WHERE id='${A.p}'`) === "35.00",
  );
  await page.getByRole("button", { name: /(?:Enviar pedido|Recuperar tentativa) R\$/ }).click();
  await page.getByRole("alert").filter({ hasText: "O preço mudou" }).waitFor();
  check(
    "real SQL rejects stale price with no order",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) === before,
  );
  await page.getByRole("button", { name: "Revisar preços", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Valores atualizados" }).waitFor();
  check(
    "35 shown before new consent",
    (
      await page
        .getByRole("button", { name: /(?:Enviar pedido|Recuperar tentativa) R\$/ })
        .innerText()
    ).includes("35,00"),
  );
  drop = true;
  await page.getByRole("button", { name: /(?:Enviar pedido|Recuperar tentativa) R\$/ }).click();
  await page.getByRole("alert").waitFor();
  check(
    "order committed once despite lost response",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) ===
      before + 1 && lost?.order_id,
  );
  const priorKey = await page.evaluate(
    (instance) => JSON.parse(localStorage.getItem("neroxa:checkout-intent:v1:" + instance)).key,
    A.instance_id,
  );
  await context.close();
  context = null;
  page = await launch();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://a.ab.invalid:4173/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Recuperar tentativa" }).click();
  await customer();
  await page.getByRole("button", { name: /(?:Enviar pedido|Recuperar tentativa) R\$/ }).click();
  await page.getByRole("dialog", { name: /Acompanhar pedido #/ }).waitFor();
  check(
    "closed/reopened browser recovers same confirmed order",
    Number(
      sql(`SELECT count(*) FROM public.neroxa_orders WHERE instance_id='${A.instance_id}'`),
    ) ===
      before + 1 &&
      (await page.evaluate(
        (instance) => JSON.parse(localStorage.getItem("neroxa:checkout-intent:v1:" + instance)).key,
        A.instance_id,
      )) === priorKey,
  );
  check(
    "client PII absent from localStorage",
    await page.evaluate(() =>
      Object.values(localStorage).every(
        (v) =>
          !v.includes("Cliente H04 fictício") &&
          !v.includes("00000000001") &&
          !v.includes("Rua fictícia"),
      ),
    ),
  );
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [412, 915],
    [768, 1024],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    check(
      "real tracking no horizontal document overflow " + width,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    );
    await page.screenshot({ path: path.join(shots, "tracking-" + width + ".png"), fullPage: true });
  }
  const status = await fetch(env.API_URL + "/rest/v1/rpc/update_admin_order_status", {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: "Bearer " + actor.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_order_id: lost.order_id,
      p_status: "CONFIRMED",
      p_note: "Fixture H04",
    }),
  });
  check("real authenticated status transition", status.status === 200);
  await page
    .getByText("Seu pedido foi confirmado e vai entrar na preparação.", { exact: false })
    .waitFor({ timeout: 60000 });
  check("private proof tracking reflects backend status", true);
  check("no browser JavaScript exceptions", errors.length === 0);
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
    classification: complete ? "PASS_FIRST_ORDER_NATIVE" : "INCOMPLETE",
    productionApproved: false,
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    errors,
    blockedOrigins: [...blockedOrigins],
  };
  fs.writeFileSync("audits/ab-auth/results/h03-browser.json", JSON.stringify(result, null, 2));
  console.log("H03_BROWSER_RESULT=" + JSON.stringify(result));
}
