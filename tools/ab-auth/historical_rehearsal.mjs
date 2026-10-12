import fs from "node:fs";
import { execFileSync } from "node:child_process";

const work = process.env.AB_WORKDIR;
const project = process.env.AB_PROJECT;
if (!work || !/^neroxa-rehearsal-[0-9]+$/.test(project)) throw new Error("Disposable rehearsal context required");
const db = "supabase_db_" + project;
const inspect = JSON.parse(execFileSync("docker", ["inspect", db], {encoding:"utf8"}))[0];
for (const binds of Object.values(inspect.HostConfig.PortBindings ?? {}))
  for (const b of binds ?? []) if (b.HostIp !== "127.0.0.1") throw new Error("Database exposed beyond loopback");
const sql = (statement) => execFileSync("docker", ["exec","-i",db,"psql","-X","-q","-A","-t","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"], {input:statement,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const count = (table) => Number(sql("SELECT count(*) FROM public."+table+";"));
const result = {stage:"bootstrap",status:"FAIL",productionTouched:false,checks:[]};
const check = (name,condition,detail) => {result.checks.push({name,passed:!!condition,detail});if(!condition)throw Error(name+": "+detail)};
const save = () => {fs.mkdirSync("audits/rehearsal/results",{recursive:true});fs.writeFileSync("audits/rehearsal/results/report.json",JSON.stringify(result,null,2));};
try {
 const baseline = work+"/baseline.sql";
 execFileSync("python3",["tools/ab-auth/build_schema.py",baseline],{stdio:"inherit"});
 sql(fs.readFileSync(baseline,"utf8"));
 check("historical relations",Number(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'neroxa_%' AND c.relkind IN ('r','v');"))===34,"expected 34");
 result.stage="fixture";
 const fixture=fs.readFileSync("audits/sql/historical-two-store-rehearsal.fixture.sql","utf8");
 // Historical trigger requires the same official-writer context used by existing A/B tests.
 sql("BEGIN; SET LOCAL neroxa.implementation_write_path = 'official';\n"+fixture.replace(/^BEGIN;\s*/,"").replace(/COMMIT;[\s\S]*$/,"")+"\nCOMMIT;");
 check("three historical instances",count("neroxa_system_instances")===3,"expected 3");
 check("two historical settings",count("neroxa_storefront_settings")===2,"expected 2");
 check("three historical zones",count("neroxa_storefront_delivery_zones")===3,"expected 3");
 const before=sql("SELECT (SELECT count(*) FROM public.neroxa_storefront_settings)::text || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones)::text");
 result.stage="phase1";
 const phase1=fs.readFileSync("audits/sql/storefront-instance-phase1.candidate.sql","utf8");
 // Apply the existing candidate verbatim; includes conservative backfill.
 sql(phase1);
 const a="a0000000-0000-4000-8000-000000000001",b="a0000000-0000-4000-8000-000000000002",b1="b0000000-0000-4000-8000-000000000003";
 const n=(table,where)=>Number(sql("SELECT count(*) FROM public."+table+" WHERE "+where+";"));
 check("B1 settings automatically mapped",n("neroxa_storefront_settings",`organization_id='${b}' AND instance_id='${b1}'`)===1,"unique instance backfill");
 check("B1 zone automatically mapped",n("neroxa_storefront_delivery_zones",`organization_id='${b}' AND instance_id='${b1}'`)===1,"unique instance backfill");
 check("A settings deliberately unresolved",n("neroxa_storefront_settings",`organization_id='${a}' AND instance_id IS NULL`)===1,"ambiguous settings must remain null");
 check("A zones deliberately unresolved",n("neroxa_storefront_delivery_zones",`organization_id='${a}' AND instance_id IS NULL`)===2,"ambiguous zones must remain null");
 result.stage="phase2-block";
 const phase2=fs.readFileSync("audits/sql/storefront-instance-phase2-cutover.candidate.sql","utf8");
 let error="";
 try {sql(phase2);}catch(e){error=String(e.stderr||e.message).slice(0,1500);}
 check("phase2 rejects ambiguity",error.includes("Unresolved instance_id rows"),"expected explicit unresolved-row exception; received "+error.slice(0,220));
 check("phase2 atomic rollback preserved PK",sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.neroxa_storefront_settings'::regclass AND contype='p';").includes("organization_id"),"legacy PK should remain");
 check("phase2 preserves fixture counts",before===sql("SELECT (SELECT count(*) FROM public.neroxa_storefront_settings)::text || ':' || (SELECT count(*) FROM public.neroxa_storefront_delivery_zones)::text"),"no rows lost");
 check("phase2 leaves instance nullable",sql("SELECT attnotnull FROM pg_attribute WHERE attrelid='public.neroxa_storefront_settings'::regclass AND attname='instance_id';")==="f","NOT NULL cutover must not happen");
 result.stage="done";result.status="PASS";
} catch(e){result.error=String(e.message).slice(0,1000);process.exitCode=1;} finally {save();console.log(JSON.stringify(result,null,2));}
