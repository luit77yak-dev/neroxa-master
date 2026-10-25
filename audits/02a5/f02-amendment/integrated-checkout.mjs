import http from 'node:http';
/** Real RPC adapters shared with the server routes; no mocked authorization/backend. */
export async function integratedCheckout(c){
 const {sql,q,ids,services,url,report,rpc,digest,crypto}=c;
 report.stage='integrated checkout tracking amendment HTTP';
 const {handleCheckoutWithBackend}=await import('../../../delivery-candidate/src/server/checkout-backend.ts');
 const {handlePrivateTrackingRequest}=await import('../../../delivery-candidate/src/server/private-tracking.ts');
 const {privateTrackingDependencies}=await import('../../../delivery-candidate/src/server/private-tracking-backend.ts');
 const {handleOrderAmendmentRequest}=await import('../../../delivery-candidate/src/server/order-amendment.ts');
 const {orderAmendmentDependencies}=await import('../../../delivery-candidate/src/server/order-amendment-backend.ts');
 const env={NEROXA_PRIVATE_TRACKING_ENABLED:'true',NEROXA_BACKEND_MODE:'homologation',NEROXA_TEST_PROJECT_REF:'local-disposable',NEROXA_TRACKING_PROXY_CONTRACT:'direct-canonical-host-v1',SUPABASE_URL:url,NEROXA_DELIVERY_BACKEND_URL:url,NEROXA_TRACKING_CANONICAL_DOMAINS:'a.synthetic.invalid,b.synthetic.invalid,c.synthetic.invalid',NEROXA_TRACKING_QUOTA_SECRET:crypto.randomBytes(32).toString('hex'),NEROXA_CHECKOUT_RATE_LIMIT_SECRET:crypto.randomBytes(32).toString('hex'),NEROXA_CHECKOUT_GATEWAY_ENABLED:'true',NEROXA_CHECKOUT_AMENDMENTS_ENABLED:'true',NEROXA_GROUP_ADDONS_V1_ENABLED:'true'};
 const out=report.integrated={status:'RUNNING',scope:'shared real server handlers over HTTP + native PostgreSQL; not hydrated browser or production',cases:[]};
 const emit=(name,details={})=>out.cases.push({name,status:'PASS',...details});
 const server=http.createServer(async(req,res)=>{try{
  const host=req.headers.host;if(!env.NEROXA_TRACKING_CANONICAL_DOMAINS.split(',').includes(host)){res.writeHead(403);res.end('{}');return;}
  const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>65536){res.writeHead(413);res.end('{}');return;}chunks.push(b);}
  const request=new Request('https://'+host+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});
  const result=req.url==='/api/checkout'?await handleCheckoutWithBackend(request,env,services.admin):req.url==='/api/order-track'?await handlePrivateTrackingRequest(request,privateTrackingDependencies(env,services.admin)):req.url==='/api/order-amend'?await handleOrderAmendmentRequest(request,orderAmendmentDependencies(env,services.admin)):Response.json({}, {status:404});
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
 }catch{res.writeHead(503);res.end('{}');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=(path,body,host='a.synthetic.invalid',token)=>new Promise((resolve,reject)=>{
  const r=http.request('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{Host:host,Origin:'https://'+host,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{try{resolve({http:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString()),noStore:res.headers['cache-control']?.includes('no-store')});}catch{reject(Error('Non-JSON integration response; body withheld'));}});});r.on('error',reject);r.end(JSON.stringify(body));
 });
 const items=[{product_id:ids.Aproduct,quantity:1,unit_price:0.01,selection_contract:'GROUP_ADDONS_V1',group_addon_ids:[ids.Aaddon],expected_unit_price:31}];
 const payload=(phone,key=crypto.randomUUID())=>({organization_id:ids.O1,instance_id:ids.Astore,store_domain:'a.synthetic.invalid',idempotency_key:key,customer_name:'Synthetic Integrated Buyer',customer_phone:phone,fulfillment:'PICKUP',payment_method:'CASH',items});
 const finance=id=>JSON.parse(sql(`SELECT jsonb_build_object('total',o.total,'subtotal',o.subtotal,'line_sum',(SELECT sum(line_total) FROM neroxa_order_items WHERE order_id=o.id),'items',(SELECT count(*) FROM neroxa_order_items WHERE order_id=o.id),'history',(SELECT count(*) FROM neroxa_order_status_history WHERE order_id=o.id),'operations',(SELECT count(*) FROM private.neroxa_order_amendment_operations WHERE order_id=o.id)) FROM neroxa_orders o WHERE o.id=${q(id)};`));
 const business=()=>{const d=digest();delete d['private.neroxa_tracking_ingress'];delete d['private.neroxa_checkout_quota_counters'];return d;};
 const deny=async(name,fn,status=403)=>{const before=business();const r=await fn();const after=business();if(r.http!==status||JSON.stringify(before)!==JSON.stringify(after))throw Error('Integrated negative failed: '+name);emit(name,{http:r.http,before,after});return r;};
 try{
  const p=payload('00000000007');const created=await request('/api/checkout',{p_order:p});const order=created.body;
  if(created.http!==200||order.total!==31||!created.noStore||!order.order_id||!/^[A-Za-z0-9_-]{43}$/.test(order.tracking_token??'')||!/^[A-Za-z0-9_-]{43}$/.test(order.amendment_token??'')||order.tracking_token===order.amendment_token)throw Error('Integrated checkout did not return valid separate capabilities');
  const initial=finance(order.order_id);if(initial.total!==31||initial.line_sum!==31)throw Error('Server price reconciliation failed');emit('checkout HTTP server pricing and separate capabilities',{http:200,finance:initial});
  const replay=await request('/api/checkout',{p_order:p});if(replay.http!==200||replay.body.order_id!==order.order_id||replay.body.tracking_token||replay.body.amendment_token)throw Error('Checkout replay reissued credentials');emit('checkout same-key retry no credential reissuance',{ordersForKey:Number(sql(`SELECT count(*) FROM neroxa_orders WHERE idempotency_key=${q(p.idempotency_key)};`))});if(out.cases.at(-1).ordersForKey!==1)throw Error('Duplicate checkout order');
  const tracking=await request('/api/order-track',{order_id:order.order_id},'a.synthetic.invalid',order.tracking_token);if(tracking.http!==200||tracking.body.order_id!==order.order_id||tracking.body.total!==31||!tracking.noStore||JSON.stringify(tracking.body).includes('customer_'))throw Error('Integrated private tracking failed');emit('checkout-issued token authorizes private tracking',{http:200});
  for(const target of ['B','C'])await deny('checkout-issued token cannot track '+target,()=>request('/api/order-track',{order_id:ids[target+'order']},target.toLowerCase()+'.synthetic.invalid',order.tracking_token));
  await deny('missing tracking capability',()=>request('/api/order-track',{order_id:order.order_id}));
  const amend={order_id:order.order_id,token:order.amendment_token,request_key:crypto.randomUUID(),items};const amended=await request('/api/order-amend',amend);const after=finance(order.order_id);
  if(amended.http!==200||amended.body.total!==62||amended.body.added_amount!==31||amended.body.payment_state!=='NOT_SETTLED'||after.history-initial.history!==1||after.operations!==1||after.line_sum!==after.subtotal||after.total!==62)throw Error('Integrated amendment financial/history failed');emit('checkout-issued amendment token financial/history consistent',{http:200,before:initial,after});
  const retried=await request('/api/order-amend',amend);if(retried.http!==200||JSON.stringify(finance(order.order_id))!==JSON.stringify(after))throw Error('Integrated amendment retry mutated');emit('integrated amendment idempotency',{http:200});
  for(const target of ['B','C'])await deny('checkout-issued token cannot amend '+target,()=>request('/api/order-amend',{...amend,order_id:ids[target+'order'],request_key:crypto.randomUUID()},target.toLowerCase()+'.synthetic.invalid'));
  await deny('tracking capability cannot amend',()=>request('/api/order-amend',{...amend,token:order.tracking_token,request_key:crypto.randomUUID()}));
  for(const actor of ['anon','admin_A'])await deny('combined registration RPC denied '+actor,()=>rpc(actor,'neroxa_register_buyer_capabilities',{p_instance_id:ids.Astore,p_order_id:order.order_id,p_checkout_key:p.idempotency_key,p_tracking_sha256:'a'.repeat(64),p_amendment_sha256:'b'.repeat(64)}));
  const concurrentPayload=payload('00000000009');const pair=await Promise.all([request('/api/checkout',{p_order:concurrentPayload}),request('/api/checkout',{p_order:concurrentPayload})]);
  if(pair.some(r=>r.http!==200)||pair[0].body.order_id!==pair[1].body.order_id||pair.filter(r=>r.body.tracking_token&&r.body.amendment_token).length!==1||Number(sql(`SELECT count(*) FROM neroxa_orders WHERE idempotency_key=${q(concurrentPayload.idempotency_key)};`))!==1)throw Error('Concurrent first checkout or atomic issuance failed');emit('concurrent first checkout one order and one credential pair',{http:pair.map(r=>r.http)});
  // Real SQL fault injection scoped to a synthetic phone: fail second registration.
  // No RPC mock and no production/default grant change. Always remove this fixture.
  sql(`CREATE FUNCTION private.f02_test_reject_amend_cap() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN IF EXISTS(SELECT 1 FROM public.neroxa_orders WHERE id=NEW.order_id AND customer_phone='00000000008') THEN RAISE EXCEPTION 'Synthetic registration failure' USING ERRCODE='22023'; END IF; RETURN NEW; END $$; CREATE TRIGGER f02_test_reject_amend_cap BEFORE INSERT ON private.neroxa_order_amendment_capabilities FOR EACH ROW EXECUTE FUNCTION private.f02_test_reject_amend_cap();`);
  const failedPayload=payload('00000000008');let failed;
  try{failed=await request('/api/checkout',{p_order:failedPayload});}finally{sql('DROP TRIGGER f02_test_reject_amend_cap ON private.neroxa_order_amendment_capabilities; DROP FUNCTION private.f02_test_reject_amend_cap();');}
  const residual=JSON.parse(sql(`SELECT jsonb_build_object('orders',count(*),'tracking',(SELECT count(*) FROM private.neroxa_tracking_capabilities WHERE order_id IN (SELECT id FROM neroxa_orders WHERE idempotency_key=${q(failedPayload.idempotency_key)})),'amendment',(SELECT count(*) FROM private.neroxa_order_amendment_capabilities WHERE order_id IN (SELECT id FROM neroxa_orders WHERE idempotency_key=${q(failedPayload.idempotency_key)}))) FROM neroxa_orders WHERE idempotency_key=${q(failedPayload.idempotency_key)};`));
  if(failed.http!==503||residual.orders!==1||residual.tracking!==0||residual.amendment!==0)throw Error('Partial credential issuance after real SQL registration failure');
  const recovered=await request('/api/checkout',{p_order:failedPayload});if(recovered.http!==200||!recovered.body.tracking_token||!recovered.body.amendment_token||Number(sql(`SELECT count(*) FROM neroxa_orders WHERE idempotency_key=${q(failedPayload.idempotency_key)};`))!==1)throw Error('Registration retry did not recover same committed order');emit('real second-registration failure rolls back both credentials; same-key retry recovers',{firstHTTP:503,retryHTTP:200,residual});
  out.status='PASS_INTEGRATED_SHARED_HANDLERS';out.legacyGate='BLOCKED: external distributed consumers unverified; no receipt or GUC fabricated';
 }finally{await new Promise(r=>server.close(r));console.log('F02_INTEGRATION_SUMMARY='+JSON.stringify(out));}
}
