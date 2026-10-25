import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {consumerInventory} from './consumer-inventory.mjs';
import {integratedCheckout} from './integrated-checkout.mjs';
/** Explicitly scoped rehearsal. This never asserts production consumer disablement. */
export async function revokeDisposable(c){
 const {sql,q,ids,rpc,digest,report,url,work}=c;
 report.stage='isolated consumer preconditions and revocation';
 const scope='THIS_RUN_LOCAL_CLONE_ONLY; NOT production cutover or SEC-18 approval';
 const out=report.revocation={scope,status:'RUNNING',cases:[],externalConsumers:'BLOCKED: published food/mvp legacy version remains; other consumers unverified'};
 if(process.env.MISSION_REVOKE_SCOPE!=='THIS_RUN_LOCAL_CLONE_ONLY'||process.env.GITHUB_ACTIONS_SCOPE!=='disposable-workflow')throw Error('No explicit disposable rehearsal scope');
 if(process.env.AB_PROJECT!==`neroxa-02a3-${process.env.MISSION_RUN_ID}-buyer`||!/^\d+$/.test(process.env.MISSION_RUN_ID??'')||new URL(url).hostname!=='127.0.0.1')throw Error('Disposable identity/loopback mismatch');
 if(fs.existsSync(work+'/supabase/.temp/project-ref'))throw Error('Linked remote project forbidden');
 const network=JSON.parse(execFileSync('docker',['network','inspect',process.env.AB_NETWORK],{encoding:'utf8'}))[0];
 const containers=Object.values(network.Containers??{});if(containers.length!==6||containers.some(x=>!x.Name.endsWith('_'+process.env.AB_PROJECT)))throw Error('Unexpected consumer/container in isolated network');
 if(report.integrated?.status!=='PASS_INTEGRATED_SHARED_HANDLERS'||report.integrated.cases.length!==15)throw Error('Secure replacement controls not proven');
 out.consumerInventory=consumerInventory();out.network={name:network.Name,containers:containers.map(x=>x.Name).sort(),scope};
 // Observe wrappers before mutation; do not declare unknown SQL consumers migrated.
 const wrappers=JSON.parse(sql(`SELECT coalesce(jsonb_agg(p.oid::regprocedure::text),'[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','neroxa_private') AND p.proname NOT IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment') AND p.prosrc ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)';`));
 if(wrappers.length)throw Error('Unmigrated SQL wrappers: '+wrappers.join(','));out.sqlWrappers=wrappers;
 const manifest=JSON.parse(fs.readFileSync('audits/02a5/f02-amendment/REVOCATION-MANIFEST.json','utf8'));
 const units=manifest.units.map(unit=>{const bytes=fs.readFileSync(unit.path);if(crypto.createHash('sha256').update(bytes).digest('hex')!==unit.sha256)throw Error('Revocation candidate hash drift');return {...unit,bytes};});
 out.preconditions={secureReplacement:'15/15 real native/HTTP cases passed before ACL change',sources:'exact candidate commits; zero static phone RPC callers; one server-only create caller',runtime:'six known services, loopback-only test UID and isolated bridge; only synthetic HTTP consumers in this run',sqlWrappers:'none observed',externalConsumers:'NOT SATISFIED; excluded from THIS_RUN_LOCAL_CLONE_ONLY'};
 console.log('F02_LOCAL_REVOCATION_PRECONDITIONS='+JSON.stringify({scope,...out.preconditions}));
 // This session setting represents ONLY the consumers inside this isolated clone.
 // Never export this scoped observation as a global disablement receipt.
 for(const unit of units)sql("SET neroxa.mission02a2_disposable='on';SET neroxa.legacy_phone_consumers_disabled='on';"+unit.bytes.toString('utf8'));
 out.units=units.map(({bytes,...unit})=>unit);
 sql("NOTIFY pgrst,'reload schema';");await new Promise(r=>setTimeout(r,2000));
 const catalog=()=>JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment','create_public_order');`));
 out.catalog=catalog();if(!out.catalog?.length||out.catalog.some(x=>x.anon||x.authenticated))throw Error('Inherited public execution remains');
 const names=new Set(out.catalog.map(x=>x.name));for(const name of ['get_public_order_status','append_public_order_items_with_payment','create_public_order'])if(!names.has(name))throw Error('Historical vulnerable object missing');
 out.absentOptionalNames=['append_public_order_items'].filter(x=>!names.has(x));
 const business=()=>{const d=digest();delete d['private.neroxa_tracking_ingress'];delete d['private.neroxa_checkout_quota_counters'];return d;};
 const items=[{product_id:'91000000-0000-4000-8000-000000000299',quantity:1,unit_price:0.01}];
 if(Number(sql(`SELECT count(*) FROM neroxa_orders WHERE id=${q(ids.Border)} AND customer_phone='00000000001';`))!==1||Number(sql(`SELECT count(*) FROM neroxa_storefront_products WHERE id=${q(items[0].product_id)} AND instance_id=${q(ids.Bstore)};`))!==1)throw Error('Negative fixture absent or invalid');
 const payloads=[['create_public_order',{p_order:{organization_id:ids.O1,instance_id:ids.Astore,store_domain:'a.synthetic.invalid',idempotency_key:crypto.randomUUID(),customer_name:'Synthetic ACL Buyer',customer_phone:'00000000007',fulfillment:'PICKUP',payment_method:'CASH',expected_total:31,items:[{product_id:ids.Aproduct,quantity:1,selection_contract:'GROUP_ADDONS_V1',group_addon_ids:[ids.Aaddon],expected_unit_price:31}]}}],['get_public_order_status',{p_order_id:ids.Border,p_customer_phone:'00000000001'}],['append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:items,p_payment_method:'CASH'}]];
 if(names.has('append_public_order_items'))payloads.push(['append_public_order_items',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:items}]);
 for(const actor of ['anon','admin_A'])for(const [name,payload] of payloads){const before=business(),r=await rpc(actor,name,payload),after=business();if(![401,403].includes(r.http)||r.body?.code!=='42501'||JSON.stringify(before)!==JSON.stringify(after))throw Error('Legacy authorization denial failed: '+actor+' '+name);out.cases.push({actor,rpc:name,status:'PASS',http:r.http,sqlstate:r.body.code,before,after});}
 const {finalServiceCut}=await import('./final-service-cut.mjs');await finalServiceCut(c);
 report.integratedBeforeRevocation=report.integrated;
 await integratedCheckout(c);out.positiveAfter=report.integrated;
 if(out.positiveAfter.status!=='PASS_INTEGRATED_SHARED_HANDLERS'||out.positiveAfter.cases.length!==15)throw Error('Secure flows regressed after revocation');
 out.status='PASS DISPOSABLE REVOCATION ONLY';
 console.log('F02_LOCAL_REVOCATION_SUMMARY='+JSON.stringify(out));
}
