import fs from 'node:fs';
import crypto from 'node:crypto';

const units = [
  ...JSON.parse(fs.readFileSync('audits/02a5/BUYER-PRE-GATE-MANIFEST.json')).sql,
  ...JSON.parse(fs.readFileSync('audits/02a5/F02-AMENDMENT-EXECUTION-MANIFEST.json')).units,
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const clean = x => JSON.stringify(x);

export async function proof1Focal(c) {
  const {sql,q,ids,services,report,rpc,crypto:crypt,sleep}=c;
  report.proof1={source:{master:process.env.MISSION_SOURCE_SHA,delivery:process.env.MISSION_DELIVERY_SHA},checks:[]};
  report.stage='install exact manifest units into disposable database';
  for (const u of units) {
    const bytes=fs.readFileSync(u.path);
    if (sha(bytes)!==u.sha256) throw Error('Manifest hash mismatch: '+u.path);
    sql("SET neroxa.mission02a2_disposable='on';"+bytes.toString('utf8'));
  }
  // Synthetic tenant domains and open hours needed by the existing checkout/capability guards.
  for (const x of ['A','B','C']) sql(`BEGIN; SET LOCAL neroxa.implementation_write_path='official';
    INSERT INTO neroxa_system_domains(system_instance_id,domain,status) VALUES(${q(ids[x+'store'])},'${x.toLowerCase()}.synthetic.invalid','VERIFIED') ON CONFLICT DO NOTHING;
    DELETE FROM neroxa_storefront_weekly_hours WHERE instance_id=${q(ids[x+'store'])};
    INSERT INTO neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT ${q(ids[x+'store'])},d,'00:00','24:00' FROM generate_series(0,6) d;
    COMMIT;`);
  const signatures=[
    ['public.get_public_order_status(uuid,text)','phone-read legacy RPC'],
    ['public.append_public_order_items_with_payment(uuid,text,jsonb,text)','phone-append legacy RPC'],
  ];
  report.stage='catalog-bound ACL cut';
  const observed=JSON.parse(sql(`SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'search_path',p.proconfig,'body_md5',md5(p.prosrc),'acl',coalesce(p.proacl::text,''),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('${signatures[0][0]}'::regprocedure,'${signatures[1][0]}'::regprocedure);`));
  const expectedBodies={'public.get_public_order_status(uuid,text)':'30881bd3c9ff32d39a1e3d9ee04f4dfe','public.append_public_order_items_with_payment(uuid,text,jsonb,text)':'758e73cb4d71f1ff8c22e46d32fe2da7'};
  if (!Array.isArray(observed)||observed.length!==2||observed.some(x=>x.owner!=='postgres'||!x.security_definer||!x.search_path?.some(v=>v==='search_path=public')||expectedBodies[x.signature]!==x.body_md5)||observed.some(x=>!x.anon_execute&&!x.authenticated_execute)) throw Error('BLOCKED: legacy function preimage does not match expected frozen catalog');
  const overloads=sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment')");
  if (overloads!=='2') throw Error('BLOCKED: legacy RPC overload inventory differs from the frozen catalog');
  const wrappers=sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND p.proname NOT IN ('get_public_order_status','append_public_order_items_with_payment') AND p.prosrc ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))");
  if (wrappers!=='0') throw Error('BLOCKED: legacy wrapper remains executable by anon/authenticated');
  for (const [signature] of signatures) sql(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`);
  sql("NOTIFY pgrst,'reload schema';"); await sleep(2000);
  report.proof1.acl={status:'PASS',before:observed,signatures:signatures.map(x=>x[0]),delta:'revoke EXECUTE only on two catalog-confirmed legacy overloads'};

  report.stage='synthetic checkout and capability issuance';
  const key=crypt.randomUUID();
  const payload={organization_id:ids.O1,instance_id:ids.Astore,store_domain:'a.synthetic.invalid',idempotency_key:key,customer_name:'Synthetic Prova 1',customer_phone:'00000000001',fulfillment:'PICKUP',payment_method:'CASH',items:[{product_id:ids.Aproduct,quantity:1}]};
  const created=await services.admin.rpc('create_public_order',{p_order:payload});
  if(created.error) throw Error('Synthetic checkout failed: '+created.error.code);
  const order=Array.isArray(created.data)?created.data[0]:created.data;
  if(!order?.order_id) throw Error('Synthetic checkout returned no order id');
  const token=crypt.randomBytes(32).toString('base64url');
  const tokenHash=crypt.createHash('sha256').update(token).digest('hex');
  for (const fn of ['neroxa_register_tracking_capability','neroxa_register_order_amendment_capability']) {
    const r=await services.admin.rpc(fn,{p_instance_id:ids.Astore,p_order_id:order.order_id,p_checkout_key:key,p_token_sha256:tokenHash});
    if(r.error) throw Error('Capability registration failed: '+fn+' '+r.error.code);
  }
  const snapshot=id=>JSON.parse(sql(`SELECT json_build_object('items',(SELECT json_agg(to_jsonb(i) ORDER BY i.id) FROM neroxa_order_items i WHERE i.order_id=${q(id)}),'order',(SELECT to_jsonb(o) FROM neroxa_orders o WHERE o.id=${q(id)}));`));
  const before=snapshot(ids.Border);
  report.stage='P0 negative read';
  const read=await rpc('anon','get_public_order_status',{p_order_id:ids.Border,p_customer_phone:'00000000001'});
  if(![401,403].includes(read.http)) throw Error('P0 legacy read was not denied');
  report.proof1.checks.push({id:'negative-read',status:'PASS',http:read.http,sqlstate:read.body?.code??null});
  report.stage='P0 negative write';
  const write=await rpc('anon','append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:[{product_id:ids.Bproduct,quantity:1}],p_payment_method:'CASH'});
  const after=snapshot(ids.Border);
  if(![401,403].includes(write.http)||clean(before)!==clean(after)) throw Error('P0 legacy write not denied without mutation');
  report.proof1.checks.push({id:'negative-write',status:'PASS',http:write.http,sqlstate:write.body?.code??null,stateUnchanged:true});
  report.stage='positive capability';
  const positiveBefore=snapshot(order.order_id);
  const tracked=await services.admin.rpc('neroxa_track_order_with_capability',{p_instance_id:ids.Astore,p_order_id:order.order_id,p_token:token});
  if(tracked.error||tracked.data?.order_id!==order.order_id) throw Error('Authorized tracking capability failed');
  const append=await services.admin.rpc('neroxa_append_order_items_with_capability',{p_instance_id:ids.Astore,p_order_id:order.order_id,p_token:token,p_request_key:crypt.randomUUID(),p_items:[{product_id:ids.Aproduct,quantity:1,unit_price:30}]});
  if(append.error) throw Error('Authorized amendment capability failed: '+append.error.code);
  const afterPositive=snapshot(order.order_id);
  const oldTotal=Number(positiveBefore.order.total),newTotal=Number(afterPositive.order.total);
  if(JSON.stringify(tracked.data).includes('customer_phone')||afterPositive.items?.length!==positiveBefore.items?.length+1||newTotal-oldTotal!==30||afterPositive.order.payment_method!==positiveBefore.order.payment_method) throw Error('Capability positive did not preserve one scoped, correctly priced mutation');
  report.proof1.checks.push({id:'positive-capability',status:'PASS',readOrder:tracked.data.order_id,appendRows:Array.isArray(append.data)?append.data.length:1,changedOnce:true,totalDelta:30,paymentPreserved:true});
  report.proof1.status='PASS';
}
