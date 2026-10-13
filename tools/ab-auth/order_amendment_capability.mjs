// Isolated proof for BUYER authorization of item additions. This program is
// invoked ONLY after the 275-case Auth matrix and gateway SQL revocations pass.
// No production connection, credentials, tables or real customer data.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const root=process.cwd();
const project=process.env.AB_PROJECT, work=process.env.AB_WORKDIR;
const reportPath=path.resolve("audits/ab-auth/results/order-amendment-capability.json");
const report={
  classification:"INCONCLUSIVO",stage:"preflight",productionCompatibility:false,
  checks:[],
  limitations:[
    "Service-only capability RPCs are exercised against real but disposable Auth/PostgREST/PG.",
    "This test does not prove UI, checkout token delivery, TanStack /api/order-amend, Vercel edge or historical order recovery.",
    "The buyer-token feature is opt-in and MUST NOT activate before revoking phone-only public mutations.",
    "Payment state is NOT_SETTLED; there is no captured payment or supplier approval workflow in this candidate."
  ],
};
function check(label,ok){
  report.checks.push({label,passed:!!ok});
  console.log((ok?"PASS ":"FAIL ")+label);
  if(!ok)throw Error("Isolated amendment assertion failed: "+label);
}
function getEnv(file){
  const env={};
  for(const line of fs.readFileSync(file,"utf8").split("\n")){
    const m=line.match(/^([A-Z_]+)="(.*)"$/);
    if(m)env[m[1]]=m[2];
  }
  return env;
}
function sql(db,statement){
  try{return execFileSync("docker",["exec","-i",db,"psql","-X","-q","-A","-t",
    "-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],
    {input:statement,encoding:"utf8",stdio:["pipe","pipe","pipe"],timeout:30000}).trim();
  }catch{throw Error("Isolated PostgreSQL statement failed");}
}
try{
  if(!project?.startsWith("neroxa-ab-") || process.env.CI!=="true" ||
    !work || !fs.existsSync(path.join(work,"status.private.env")))
    throw Error("Explicit disposable Auth/PostgREST stack required");
  const env=getEnv(path.join(work,"status.private.env"));
  const base=new URL(env.API_URL??"");
  if(!["localhost","127.0.0.1"].includes(base.hostname) ||
    !env.SERVICE_ROLE_KEY || !env.ANON_KEY)
    throw Error("No network except local Supabase");
  const db="supabase_db_"+project;
  const url=new URL("/rest/v1/",base);
  const rest=async (key,token,rpc,body)=>{
    const response=await fetch(new URL(rpc,url),{
      method:"POST",headers:{
        apikey:key,Authorization:"Bearer "+token,
        "Content-Type":"application/json",Prefer:"return=representation"
      },body:JSON.stringify(body)
    });
    let data=null;
    try{data=await response.json();}catch{}
    return {status:response.status,data};
  };
  const service=(rpc,body)=>rest(env.SERVICE_ROLE_KEY,env.SERVICE_ROLE_KEY,rpc,body);
  const anon=(rpc,body)=>rest(env.ANON_KEY,env.ANON_KEY,rpc,body);
  const verified={};
  report.stage="apply-only-to-clone";
  const migration=fs.readFileSync("audits/sql/order-amendment-capability.candidate.sql","utf8");
  sql(db,migration);
  sql(db,"NOTIFY pgrst, 'reload schema';");
  check("Anonymous capability registration EXECUTE disabled",sql(db,
    "SELECT has_function_privilege('anon','public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)','EXECUTE')")==="f");
  check("Authenticated capability registration EXECUTE disabled",sql(db,
    "SELECT has_function_privilege('authenticated','public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)','EXECUTE')")==="f");
  check("Anonymous secured append EXECUTE disabled",sql(db,
    "SELECT has_function_privilege('anon','public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')")==="f");
  check("Authenticated secured append EXECUTE disabled",sql(db,
    "SELECT has_function_privilege('authenticated','public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')")==="f");
  check("Server role secured append EXECUTE granted",sql(db,
    "SELECT has_function_privilege('service_role','public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')")==="t");

  const contexts={};
  for(const alias of ["a","b","c"]){
    const ctx=await service("rpc/get_public_storefront_context",
      {p_domain:alias+".ab.invalid"});
    check("Live local test store "+alias,ctx.status===200&&
      Array.isArray(ctx.data)&&ctx.data.length===1);
    contexts[alias]=ctx.data[0];
    const item=sql(db,"SELECT id::text FROM public.neroxa_storefront_products WHERE instance_id='"+
      contexts[alias].instance_id+"'::uuid AND active ORDER BY id LIMIT 1;");
    check("Live local test product "+alias,/^[0-9a-f-]{36}$/.test(item));
    verified[alias]=item;
  }
  check("Fixtures A/B share organization, not store",
    contexts.a.organization_id===contexts.b.organization_id&&
    contexts.a.instance_id!==contexts.b.instance_id);
  check("Fixture C belongs to other organization",
    contexts.c.organization_id!==contexts.b.organization_id);

  function newOrder(alias,key){
    return {
      instance_id:contexts[alias].instance_id,
      organization_id:contexts[alias].organization_id,
      store_domain:contexts[alias].domain,
      idempotency_key:key,
      customer_name:"Synthetic amendment "+alias,
      customer_phone:"00000000888",
      fulfillment:"PICKUP",payment_method:"CASH",
      items:[{product_id:verified[alias],quantity:1}]
    };
  }
  const create=async (alias,key)=>{
    const response=await service("rpc/create_public_order",{p_order:newOrder(alias,key)});
    check("Server create synthetic order "+alias,response.status===200 &&
      Array.isArray(response.data)&&response.data[0]?.order_id);
    return response.data[0];
  };
  const kA=crypto.randomUUID(), kB=crypto.randomUUID();
  const a=await create("a",kA), b=await create("b",kB);
  const token=()=>crypto.randomBytes(32).toString("base64url");
  const h=secret=>crypto.createHash("sha256").update(secret).digest("hex");
  const aToken=token(),bToken=token(),bBad=token();
  const register=(alias,id,key,hash)=>service("rpc/neroxa_register_order_amendment_capability",{
    p_instance_id:contexts[alias].instance_id,
    p_order_id:id,p_checkout_key:key,p_token_sha256:hash
  });
  const regA=await register("a",a.order_id,kA,h(aToken));
  check("A capability registered once by server",regA.status===200 && regA.data===true);
  const duplicate=await register("a",a.order_id,kA,h(badToken()));
  function badToken(){return token();}
  check("Duplicate registration cannot rotate existing capability",
    duplicate.status===200&&duplicate.data===false);
  const regB=await register("b",b.order_id,kB,h(bToken));
  check("B capability registered independently",regB.status===200&&regB.data===true);

  const wrongShopRegister=await register("b",a.order_id,kA,h(token()));
  check("Cannot register other-instance order",
    [400,401,403].includes(wrongShopRegister.status));
  const guessedCheckoutKey=await register("b",b.order_id,crypto.randomUUID(),h(token()));
  check("Checkout idempotency key required for registration",
    [400,401,403].includes(guessedCheckoutKey.status));

  const payload=()=>[{product_id:verified.a,quantity:1,unit_price:0.01}];
  const append=(alias,id,secret,requestKey,items)=>
    service("rpc/neroxa_append_order_items_with_capability",{
      p_instance_id:contexts[alias].instance_id,p_order_id:id,
      p_token:secret,p_request_key:requestKey,p_items:items
    });
  const deniedAnon=await anon("rpc/neroxa_append_order_items_with_capability",{
    p_instance_id:contexts.a.instance_id,p_order_id:a.order_id,p_token:aToken,
    p_request_key:crypto.randomUUID(),p_items:payload()
  });
  check("Anon cannot invoke secured append even with token",
    [401,403].includes(deniedAnon.status)&&deniedAnon.data?.code==="42501");

  const admin=createClient(base.toString(),env.SERVICE_ROLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const pw=crypto.randomBytes(24).toString("base64url");
  const createdUser=await admin.auth.admin.createUser({
    email:"amend-"+project+"@ab.invalid",password:pw,email_confirm:true
  });
  if(createdUser.error)throw Error("Disposable Auth user create failed");
  const client=createClient(base.toString(),env.ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const login=await client.auth.signInWithPassword({
    email:"amend-"+project+"@ab.invalid",password:pw
  });
  if(login.error||!login.data.session)throw Error("Disposable Auth login failed");
  const deniedAuth=await rest(env.ANON_KEY,login.data.session.access_token,
    "rpc/neroxa_append_order_items_with_capability",{
      p_instance_id:contexts.a.instance_id,p_order_id:a.order_id,p_token:aToken,
      p_request_key:crypto.randomUUID(),p_items:payload()
    });
  check("Authenticated cannot invoke secured append even with token",
    [401,403].includes(deniedAuth.status)&&deniedAuth.data?.code==="42501");

  report.stage="capability-authorization";
  const key=crypto.randomUUID();
  const p=payload();
  const before=Number(sql(db,"SELECT count(*) FROM public.neroxa_order_items WHERE order_id='"+
    a.order_id+"'::uuid;"));
  const wrongToken=await append("a",a.order_id,bBad,crypto.randomUUID(),p);
  check("Incorrect bearer token refused",wrongToken.data?.code==="42501"&&
    [400,401,403].includes(wrongToken.status));
  const wrongInstance=await append("b",a.order_id,aToken,crypto.randomUUID(),p);
  check("Cross-instance even with correct token refused",
    wrongInstance.data?.code==="42501");
  const invalidProduct=await append("a",a.order_id,aToken,crypto.randomUUID(),[
    {product_id:verified.b,quantity:1}
  ]);
  check("Cross-shop product cannot be added",invalidProduct.status>=400);
  const invalidQty=await append("a",a.order_id,aToken,crypto.randomUUID(),[
    {product_id:verified.a,quantity:0}
  ]);
  check("Zero quantity fails instead of silently changing to 1",
    invalidQty.data?.code==="22023");
  const invalidArray=await append("a",a.order_id,aToken,crypto.randomUUID(),[]);
  check("Empty item list rejected",invalidArray.data?.code==="22023");
  check("Denied amendments leave order lines unchanged",
    Number(sql(db,"SELECT count(*) FROM public.neroxa_order_items WHERE order_id='"+
      a.order_id+"'::uuid;"))===before);

  const allowed=await append("a",a.order_id,aToken,key,p);
  check("Token-authorized addition accepted",
    allowed.status===200&&Array.isArray(allowed.data)&&allowed.data.length===1);
  const first=allowed.data[0];
  check("Server computes addition amount, ignoring claimed browser price",
    Number(first.added_amount)===Number(sql(db,"SELECT price FROM public.neroxa_storefront_products WHERE id='"+
      verified.a+"'::uuid;")));
  check("Amendment reports not-settled payment",
    first.payment_state==="NOT_SETTLED");
  check("Amendment does not change order payment_method",
    sql(db,"SELECT payment_method FROM public.neroxa_orders WHERE id='"+
      a.order_id+"'::uuid;")==="CASH");

  const replay=await append("a",a.order_id,aToken,key,p);
  check("Replay identical idempotency key returns same prior total",
    replay.status===200&&Number(replay.data?.[0]?.total)===Number(first.total));
  const conflict=await append("a",a.order_id,aToken,key,[
    {product_id:verified.a,quantity:2}
  ]);
  check("Reusing key for different amendment rejected",
    conflict.data?.code==="22023");
  check("No duplicate line from replay or conflicting key",
    Number(sql(db,"SELECT count(*) FROM public.neroxa_order_items WHERE order_id='"+
      a.order_id+"'::uuid;"))===before+1);

  const parallelKey=crypto.randomUUID();
  const parallel=await Promise.all(Array.from({length:6},
    ()=>append("a",a.order_id,aToken,parallelKey,p)));
  check("Concurrent idempotent addition accepted by all callers",
    parallel.every(x=>x.status===200&&x.data?.[0]?.payment_state==="NOT_SETTLED"));
  check("Concurrent idempotent replay inserts exactly one additional item",
    Number(sql(db,"SELECT count(*) FROM public.neroxa_order_items WHERE order_id='"+
      a.order_id+"'::uuid;"))===before+2);

  const cOrdersBefore=Number(sql(db,"SELECT count(*) FROM public.neroxa_orders WHERE instance_id='"+
    contexts.c.instance_id+"'::uuid;"));

  // Token lifetime and revocation: test-only database updates, never remote.
  // Simulate a capability issued two hours ago; preserve CHECK expires > issued.
  sql(db,"UPDATE private.neroxa_order_amendment_capabilities SET created_at=clock_timestamp()-interval '3 hours', expires_at=clock_timestamp()-interval '1 second' WHERE order_id='"+
    a.order_id+"'::uuid;");
  const expired=await append("a",a.order_id,aToken,crypto.randomUUID(),p);
  check("Expired token refused",expired.data?.code==="42501");
  sql(db,"UPDATE private.neroxa_order_amendment_capabilities SET expires_at=clock_timestamp()+interval '1 hour',revoked_at=clock_timestamp() WHERE order_id='"+
    a.order_id+"'::uuid;");
  const revoked=await append("a",a.order_id,aToken,crypto.randomUUID(),p);
  check("Revoked token refused",revoked.data?.code==="42501");

  // A different store, independent capability, order set to PREPARING.
  sql(db,"UPDATE public.neroxa_orders SET status='CONFIRMED' WHERE id='"+
    b.order_id+"'::uuid;");
  const addedConfirmed=await append("b",b.order_id,bToken,crypto.randomUUID(),[
    {product_id:verified.b,quantity:1}
  ]);
  check("CONFIRMED order still accepts token-authorized additions",
    addedConfirmed.status===200);
  sql(db,"UPDATE public.neroxa_orders SET status='PREPARING' WHERE id='"+
    b.order_id+"'::uuid;");
  const preparing=await append("b",b.order_id,bToken,crypto.randomUUID(),[
    {product_id:verified.b,quantity:1}
  ]);
  check("PREPARING order requires supplier approval workflow",
    preparing.data?.code==="22023");
  sql(db,"UPDATE public.neroxa_orders SET status='READY' WHERE id='"+
    b.order_id+"'::uuid;");
  const ready=await append("b",b.order_id,bToken,crypto.randomUUID(),[
    {product_id:verified.b,quantity:1}
  ]);
  check("READY order cannot append automatically",ready.data?.code==="22023");
  check("Separate organization C had no new orders or changes",
    Number(sql(db,"SELECT count(*) FROM public.neroxa_orders WHERE instance_id='"+
      contexts.c.instance_id+"'::uuid;"))===cOrdersBefore);

  report.stage="done";
  report.summary={
    checksPassed:report.checks.filter(c=>c.passed).length,
    checksFailed:report.checks.filter(c=>!c.passed).length,
    capabilityStored:"SHA256 only",
    concurrentReplayWorkers:6,
    buyerPhoneNotAnAuthorizationFactor:true,
    paymentCaptureTested:false,
    deployed:false
  };
}catch(error){
  report.classification="REPROVADO";
  report.error={stage:report.stage,message:String(error.message).slice(0,200)};
}finally{
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  console.log("DISPOSABLE_AMENDMENT_CAPABILITY_RESULT="+JSON.stringify({
    classification:report.classification,stage:report.stage,
    passed:report.checks.filter(x=>x.passed).length,
    failed:report.checks.filter(x=>!x.passed).length
  }));
}
if(report.classification==="REPROVADO")process.exitCode=1;
