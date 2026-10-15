// Forensic PRE-GATE ONLY. A confirmed mutation is FAIL P0, never release approval.
export async function appendProbe({sql,q,ids,people,report,rpc,digest}) {
 const snapshot=()=>({business:digest(),sessions:JSON.parse(sql("SELECT jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(s)::text,E'\\n' ORDER BY to_jsonb(s)::text),''))) FROM auth.sessions s;")),finance:JSON.parse(sql(`SELECT jsonb_build_object('order',to_jsonb(o),'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) FROM neroxa_order_items i WHERE order_id=o.id),'item_sum',(SELECT sum(line_total) FROM neroxa_order_items WHERE order_id=o.id),'item_count',(SELECT count(*) FROM neroxa_order_items WHERE order_id=o.id)) FROM neroxa_orders o WHERE id=${q(ids.Border)};`))});
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 report.stage='PG-04 append pre-gate forensic probe';
 report.source={master:process.env.MISSION_SOURCE_SHA,delivery:'4ce88959a751066f96da4cbab8d1fc9ac29bb320',run:process.env.MISSION_RUN_ID,profile:'BUYER-PRE-GATE Master ONLY; NOT integrated Delivery enum profile'};
 report.actorIdentities=Object.fromEntries(Object.entries(people).map(([alias,p])=>[alias,{auth_uid:p.id,role:'authenticated'}]));
 report.actorIdentities.anon={auth_uid:null,role:'anon',credential:'disposable anon key, not service_role'};
 // Capture wrong-phone denial first. It must neither mutate nor return an order.
 const wrongBefore=snapshot();
 const wrong=await rpc('anon','append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000999',p_items:[{product_id:ids.Bproduct,quantity:1}],p_payment_method:'CASH'});
 const wrongAfter=snapshot();
 const denied=[400,401,403,404].includes(wrong.http)&&equal(wrongBefore,wrongAfter);
 report.append={wrongPhone:{status:denied?'PASS':'FAIL',polarity:'negative',actor:'anon',http:wrong.http,sqlstate:wrong.body?.code??null,before:wrongBefore,after:wrongAfter},retry:'NOT RUN; legacy contract has no request key; no unsafe compensating writes',deliveryEnum:'NOT RUN; separate incompatible profile'};
 if(!denied)throw Error('Wrong-phone append denial/integrity failed; stop probes');
 const before=snapshot();
 const response=await rpc('anon','append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:[{product_id:ids.Bproduct,quantity:1,unit_price:0.01,line_total:0.01}],p_payment_method:'CASH'});
 const after=snapshot();
 const changed=!equal(before,after);
 const leaked=response.http>=200&&response.http<300&&Array.isArray(response.body)&&response.body.some(x=>x.order_id===ids.Border);
 const deniedCorrectly=[401,403].includes(response.http)&&!changed;
 report.append.authorizedPriceObservation={status:leaked&&changed&&Number(after.finance.order.total)-Number(before.finance.order.total)===30&&Number(after.finance.item_sum)-Number(before.finance.item_sum)===30?'PASS OBSERVED PRICE ONLY':'NOT VERIFIED',submittedUnitPrice:0.01,catalogPrice:30,legitimateAuthorization:'NOT RUN; unauthorized append never proves legitimate financial workflow'};
 report.append.phoneAttack={status:deniedCorrectly?'PASS':'FAIL',severity:leaked||changed?'P0':'UNCLASSIFIED',polarity:'negative security test',actor:'anon',auth_uid:null,target:'B',http:response.http,sqlstate:response.body?.code??null,returnedOrder:leaked,stateUnchanged:!changed,before,after,exceptions:'none expected; no compensating restore; clone discarded'};
 report.append.integrity={scope:'all public/private/neroxa_private tables via digest; storage.objects/buckets; auth.sessions; quota accounting excluded from business digest',T1:'NOT RUN',status:changed?'FAIL observed unauthorized mutation':'PASS limited observation'};
 console.log('F02_APPEND_PRE_GATE='+JSON.stringify({source:report.source,...report.append}));
 if(leaked||changed){report.securityApproval='FAIL P0; STOP APPROVAL';report.f02='FAIL CONFIRMED P0 phone read and append; no release gate';}
}
