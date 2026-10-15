// Mission 02A.5 — synthetic real-browser pre-gate smoke; no production access.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const work=process.env.AB_WORKDIR, project=process.env.AB_PROJECT;
const delivery=path.resolve("delivery-candidate");
const report={scope:"REAL_CHROMIUM_COMPILED_DELIVERY_NATIVE_SUPABASE",status:"NOT RUN",stage:"preflight",
  source:{master:process.env.MISSION_SOURCE_SHA,delivery:process.env.MISSION_DELIVERY_SHA},
  checks:[],failure:null,legacy_p0:"OPEN",gate:"BLOCKED",post_gate:"NOT RUN",productionApproved:false};
const check=(name,ok)=>{report.checks.push({name,status:ok?"PASS":"FAIL"});if(!ok)throw Error(name);};
let server,context,fd;
try {
 if(!/^neroxa-02a3-[0-9]+-buyer$/.test(project??"")||!work)throw Error("Isolated disposable project ID required");
 if(!fs.existsSync(path.join(delivery,".output/server/index.mjs")))throw Error("Normal candidate TanStack compiled server missing");
 const env=Object.fromEntries(fs.readFileSync(path.join(work,"status.private.env"),"utf8")
    .split("\n").map(x=>x.match(/^([A-Z_]+)="(.*)"$/)).filter(Boolean).map(x=>[x[1],x[2]]));
 const backend=new URL(env.API_URL||"");
 if(backend.hostname!=="127.0.0.1"||backend.protocol!=="http:"||!backend.port)throw Error("Local backend only");
 check("compiled TanStack candidate is present",true);
 const clientAssetDir=path.join(delivery,".output/public/assets");
 const assets=fs.readdirSync(clientAssetDir).filter(x=>x.endsWith(".js"));
 check("no local service credential appears in browser assets",
   assets.every(x=>!fs.readFileSync(path.join(clientAssetDir,x),"utf8").includes(env.SERVICE_ROLE_KEY)));
 const cert=fs.readFileSync(path.join(work,"f02-browser-cert.private.pem"),"utf8"),
       key=fs.readFileSync(path.join(work,"f02-browser-key.private.pem"),"utf8");
 const runtime={
   ...process.env, SUPABASE_URL:env.API_URL,NEROXA_DELIVERY_BACKEND_URL:env.API_URL,
   SUPABASE_SERVICE_ROLE_KEY:env.SERVICE_ROLE_KEY,SUPABASE_PUBLISHABLE_KEY:env.ANON_KEY,
   NEROXA_BACKEND_MODE:"homologation",NEROXA_TEST_PROJECT_REF:"local-disposable",
   NEROXA_CHECKOUT_GATEWAY_ENABLED:"true",NEROXA_REQUIRE_DURABLE_CHECKOUT_INTENTS:"true",
   NEROXA_CHECKOUT_RECOVERY_ENABLED:"true",NEROXA_CHECKOUT_AMENDMENTS_ENABLED:"true",
   NEROXA_PRIVATE_TRACKING_ENABLED:"true",NEROXA_GROUP_ADDONS_V1_ENABLED:"true",
   NEROXA_TRACKING_PROXY_CONTRACT:"direct-canonical-host-v1",
   NEROXA_TRACKING_CANONICAL_DOMAINS:"a.synthetic.invalid,b.synthetic.invalid,c.synthetic.invalid",
   NEROXA_TRACKING_QUOTA_SECRET:crypto.randomBytes(48).toString("hex"),
   NEROXA_CHECKOUT_RATE_LIMIT_SECRET:crypto.randomBytes(48).toString("hex"),
   NITRO_HOST:"127.0.0.1",NITRO_PORT:"4173",NITRO_SSL_CERT:cert,NITRO_SSL_KEY:key
 };
 report.stage="compiled SSR local startup";
 fd=fs.openSync(path.join(work,"f02-browser-runtime.private.log"),"a",0o600);
 server=spawn(process.execPath,[path.join(delivery,".output/server/index.mjs")],
   {cwd:delivery,env:runtime,stdio:["ignore",fd,fd]});
 await new Promise(r=>setTimeout(r,4500));
 if(server.exitCode!==null)throw Error("Compiled SSR exited during startup");
 const {chromium}=createRequire(import.meta.url)(process.env.BROWSER_MODULE);
 context=await chromium.launchPersistentContext(path.join(work,"f02-browser-profile.private"),{
   executablePath:process.env.CHROME_BIN,headless:true,ignoreHTTPSErrors:true,
   viewport:{width:390,height:844},args:["--no-sandbox"]});
 const page=context.pages()[0]??await context.newPage();
 const blocked=new Set(),legacy=[];
 await context.route("**/*",async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==="a.synthetic.invalid"&&u.port==="4173")return route.continue();
   if(u.origin===backend.origin&&/^(\/rest\/v1\/|\/auth\/v1\/)/.test(u.pathname)){
     if(/\/rpc\/(?:get_public_order_status|append_public_order_items(?:_with_payment)?)$/.test(u.pathname))legacy.push(u.pathname);
     return route.continue();
   }
   blocked.add(u.origin);return route.abort();
 });
 report.stage="real storefront hydration and candidate catalog";
 const catalog=page.waitForResponse(x=>x.url().includes("/rpc/get_public_storefront_catalog"),{timeout:30000});
 await page.goto("https://a.synthetic.invalid:4173/",{waitUntil:"domcontentloaded",timeout:30000});
 const response=await catalog;
 check("real browser fetched native local catalog",response.status()===200);
 await page.getByText("Synthetic A",{exact:false}).first().waitFor({state:"visible",timeout:25000});
 check("real hydrated React storefront resolved synthetic shop A",true);
 check("no phone-only legacy RPC contacted by browser",legacy.length===0);
 check("all browser egress blocked except synthetic SSR and loopback REST/Auth",
   [...blocked].every(x=>!/^https?:\/\/(?:[a-z0-9.-]*supabase\.co)/i.test(x)));
 report.status="PASS BROWSER HYDRATION PRE-GATE ONLY";
 report.stage="complete smoke";
 report.catalogStatus=response.status();
 report.browserErrors="NOT_ASSESSED";
 report.checkoutSubmit="NOT RUN";
 report.trackingCapability="NOT RUN";
 report.amendmentCapability="NOT RUN";
 report.storageRealtimeLogout="NOT RUN";
} catch(e){
 report.status="FAIL BROWSER PRE-GATE";
 report.failure={stage:report.stage,message:String(e?.message||e).slice(0,250).replace(/eyJ[A-Za-z0-9._-]+/g,"<jwt>")};
} finally {
 if(context)await context.close().catch(()=>{});
 if(server){server.kill("SIGTERM");await new Promise(r=>{server.once("exit",r);setTimeout(r,2000)});}
 if(fd!==undefined)fs.closeSync(fd);
 console.log("F02_BROWSER_NATIVE_RESULT="+JSON.stringify(report));
}
if(!report.status.startsWith("PASS"))process.exitCode=1;
