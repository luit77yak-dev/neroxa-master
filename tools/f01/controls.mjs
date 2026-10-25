import crypto from 'node:crypto';
export async function f01Controls(c){
 const {ids,people,sql,q,api,rpc,check,empty,report,services}=c;
 report.f01={mapping:{A:'A1',B:'A2 same organization',C:'other organization'},source:process.env.MISSION_SOURCE_SHA,scope:'native disposable Master; existing PR37/38 + exact 02A4 fixes; no production approval'};
 const one=r=>r.http===200&&Array.isArray(r.body)&&r.body.length===1,inserted=r=>r.http===201&&r.body?.length===1;
 const denied=r=>[401,403].includes(r.http)&&r.body?.code==='42501';
 const scopedParentDenied=r=>denied(r)||(r.http===400&&r.body?.code==='23514'&&['product category must belong to the same instance','Instance and organization mismatch'].includes(r.body?.message));
 const actors=['admin_A','admin_B','admin_C','staff_A','staff_none','common','anon'];
 const owns=(a,x)=>a==='admin_'+x||a==='staff_A'&&x==='A';
 const targets=['A','B','C'];
 // The source fixture must actually encode same-organization A1/A2 and foreign C.
 const orgs=JSON.parse(sql(`SELECT jsonb_object_agg(id,organization_id) FROM neroxa_system_instances WHERE id IN (${targets.map(x=>q(ids[x+'store'])).join(',')});`));
 if(orgs[ids.Astore]!==orgs[ids.Bstore]||orgs[ids.Astore]===orgs[ids.Cstore])throw Error('A1/A2/C fixture lineage mismatch');report.f01.organizations=orgs;
 const definitions=[['neroxa_storefront_products','id','product',x=>({id:crypto.randomUUID(),instance_id:ids[x+'store'],category_id:null,name:'Synthetic F01',slug:'f01-'+crypto.randomUUID(),price:17}),{name:'Synthetic F01 edited',price:19}],['neroxa_storefront_delivery_zones','id','zone',x=>({id:crypto.randomUUID(),instance_id:ids[x+'store'],organization_id:x==='C'?ids.O2:ids.O1,name:'Synthetic F01 zone',neighborhoods:['Synthetic F01'],delivery_fee:7}),{name:'Synthetic F01 edited',delivery_fee:9}]];
 for(const [table,key,suffix,payload,patch] of definitions){
  for(const actor of actors)for(const x of targets){if(owns(actor,x))continue;
   for(const [op,method,body] of [['SELECT','GET',undefined],['UPDATE','PATCH',patch],['DELETE','DELETE',undefined]])await check('F01 '+table+' cross '+op,actor,x,op,'DENY',()=>api(actor,table+'?'+key+'=eq.'+ids[x+suffix],method,body),empty,{deny:true,p0:true});
   await check('F01 '+table+' cross INSERT valid payload',actor,x,'INSERT','DENY',()=>api(actor,table,'POST',payload(x)),table==='neroxa_storefront_products'?denied:scopedParentDenied,{deny:true,p0:true});
  }
  for(const x of targets)for(const actor of ['admin_'+x,...(x==='A'?['staff_A']:[])]){
   const row=payload(x),filter=table+'?'+key+'=eq.'+row[key];
   await check('F01 '+table+' own INSERT',actor,x,'INSERT','ALLOW',()=>api(actor,table,'POST',row),inserted);
   await check('F01 '+table+' own SELECT',actor,x,'SELECT','ALLOW',()=>api(actor,filter),one);
   await check('F01 '+table+' own UPDATE',actor,x,'UPDATE','ALLOW',()=>api(actor,filter,'PATCH',patch),r=>one(r)&&Object.entries(patch).every(([k,v])=>r.body[0][k]===v));
   await check('F01 '+table+' own DELETE',actor,x,'DELETE','ALLOW',()=>api(actor,filter,'DELETE'),one);
  }
 }
 // Use an owner-created vacancy for singleton settings, so foreign INSERT cannot
 // pass merely because the row already exists (unique violation is not a denial).
 for(const x of targets){const actor='admin_'+x,filter='neroxa_storefront_settings?instance_id=eq.'+ids[x+'store'];const original=await api(actor,filter);if(!one(original))throw Error('Own settings preimage absent');const row=original.body[0];
  for(const a of actors){if(owns(a,x))continue;
   await check('F01 settings cross SELECT',a,x,'SELECT','DENY',()=>api(a,filter),empty,{deny:true,p0:true});
   await check('F01 settings cross UPDATE',a,x,'UPDATE','DENY',()=>api(a,filter,'PATCH',{pickup_instructions:'UNAUTHORIZED'}),empty,{deny:true,p0:true});
   await check('F01 settings cross DELETE',a,x,'DELETE','DENY',()=>api(a,filter,'DELETE'),empty,{deny:true,p0:true});
  }
  await check('F01 settings own UPDATE',actor,x,'UPDATE','ALLOW',()=>api(actor,filter,'PATCH',{pickup_instructions:'Synthetic F01'}),r=>one(r)&&r.body[0].pickup_instructions==='Synthetic F01');
  await check('F01 settings own DELETE',actor,x,'DELETE','ALLOW',()=>api(actor,filter,'DELETE'),one);
  for(const a of actors)if(!owns(a,x))await check('F01 settings cross INSERT vacant valid singleton',a,x,'INSERT','DENY',()=>api(a,'neroxa_storefront_settings','POST',row),scopedParentDenied,{deny:true,p0:true});
  await check('F01 settings own INSERT restore preimage',actor,x,'INSERT','ALLOW',()=>api(actor,'neroxa_storefront_settings','POST',row),inserted);
 }
 // Financial tables intentionally have no client DML grants, even for owners.
 for(const actor of actors)for(const x of targets){const row={id:crypto.randomUUID(),organization_id:x==='C'?ids.O2:ids.O1,instance_id:ids[x+'store'],order_number:10000+Math.floor(Math.random()*10000000),customer_name:'Synthetic F01 denied',customer_phone:'00000000001',fulfillment:'PICKUP',payment_method:'CASH',subtotal:30,total:30};
  for(const [op,method,body] of [['INSERT','POST',row],['UPDATE','PATCH',{notes:'UNAUTHORIZED FINANCE'}],['DELETE','DELETE',undefined]])await check('F01 financial direct '+op,actor,x,op,'DENY RPC ONLY',()=>api(actor,'neroxa_orders'+(op==='INSERT'?'':'?id=eq.'+ids[x+'order']),method,body),denied,{deny:true,p0:true});
  const own=owns(actor,x);await check('F01 admin order detail scoped',actor,x,'RPC',own?'ALLOW':'DENY',()=>rpc(actor,'get_admin_order_detail',{p_instance_id:ids[x+'store'],p_order_id:ids[x+'order']}),own?r=>r.http===200&&r.body?.order?.id===ids[x+'order']:r=>[401,403].includes(r.http)||r.http===200&&r.body===null,{deny:!own,p0:!own});
  if(!own)await check('F01 foreign status RPC',actor,x,'RPC','DENY',()=>rpc(actor,'update_admin_order_status',{p_order_id:ids[x+'order'],p_status:'CONFIRMED',p_note:'UNAUTHORIZED'}),denied,{deny:true,p0:true});
 }
 for(const x of targets)sql(`BEGIN;SET LOCAL neroxa.implementation_write_path='official';INSERT INTO neroxa_system_domains(system_instance_id,domain,status) VALUES(${q(ids[x+'store'])},${q(x.toLowerCase()+'.synthetic.invalid')},'VERIFIED');COMMIT;`);
 for(const x of targets){const actor='admin_'+x;
  await check('F01 own status RPC',actor,x,'RPC','ALLOW',()=>rpc(actor,'update_admin_order_status',{p_order_id:ids[x+'order'],p_status:'CONFIRMED',p_note:'Synthetic F01 scoped'}),r=>r.http===200&&r.body?.id===ids[x+'order']);
  const expected=x==='A'?32:31;const payload={organization_id:x==='C'?ids.O2:ids.O1,instance_id:ids[x+'store'],store_domain:x.toLowerCase()+'.synthetic.invalid',idempotency_key:crypto.randomUUID(),customer_name:'Synthetic F01 buyer',customer_phone:'00000000007',fulfillment:'PICKUP',payment_method:'CASH',expected_total:expected,items:[{product_id:ids[x+'product'],quantity:1,unit_price:0.01,selection_contract:'GROUP_ADDONS_V1',group_addon_ids:[ids[x+'addon']],expected_unit_price:expected}]};
  await check('F01 legitimate order creation server-priced',actor,x,'RPC','ALLOW CHECKOUT',async()=>{const r=await services.admin.rpc('create_public_order',{p_order:payload});return {http:r.status,body:r.error??r.data}},r=>r.http===200&&(Array.isArray(r.body)?r.body[0]:r.body)?.total===expected);
 }
 report.f01.parentGuardObservation='Zone/settings payloads match existing instance/org and owner preimages. The SECURITY INVOKER guard may return 23514 because RLS hides the foreign parent. These are scoped-parent denials, not a claim of SQLSTATE 42501. Separate staff-without-grant INSERT and INSERT of products with valid nullable category test effective RLS rejection.';
 report.f01.financialWrites='client INSERT/UPDATE/DELETE denied intentionally; scoped status RPC and server-priced checkout tested instead of broadening privileges';
 report.f01.legacyPhoneRPC='F02 OPEN; no global phone revocation authorized or claimed by F01';
}
