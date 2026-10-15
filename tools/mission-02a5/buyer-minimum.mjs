import http from 'node:http';
export async function buyerMinimum(c){
 const {sql,q,ids,people,services,env,url,report,api,rpc,check,digest,empty,one,fs,crypto}=c;
 report.stage='baseline P0';
 await check('F01 baseline staff_none PATCH B','staff_none','B','UPDATE','DENY',()=>api('staff_none','neroxa_storefront_availability?instance_id=eq.'+ids.Bstore,'PATCH',{enabled:false}),empty,{phase:'baseline',deny:true});
 sql(`UPDATE neroxa_storefront_availability SET enabled=true WHERE instance_id=${q(ids.Bstore)};`);
 await check('F02 baseline anonymous phone tracking','anon','B','RPC','DENY',()=>rpc('anon','get_public_order_status',{p_order_id:ids.Border,p_customer_phone:'00000000001'}),r=>[401,403].includes(r.http)||r.body===null,{phase:'baseline',deny:true});
 const bucket=await services.admin.storage.createBucket('product-images',{public:false,fileSizeLimit:1048576,allowedMimeTypes:['image/png']});if(bucket.error)throw Error('Native Storage bootstrap failed');
 report.stage='exact pre-gate candidate';
 const m=JSON.parse(fs.readFileSync('audits/02a5/BUYER-PRE-GATE-MANIFEST.json'));
 for(const unit of m.sql){const body=fs.readFileSync(unit.path);if(crypto.createHash('sha256').update(body).digest('hex')!==unit.sha256)throw Error('Candidate hash drift');sql("SET neroxa.mission02a2_disposable='on';"+body.toString());}
 c.resetDigests();
 sql(`NOTIFY pgrst,'reload schema';`);await new Promise(r=>setTimeout(r,2000));
 for(const x of ['A','B','C'])sql(`BEGIN;SET LOCAL neroxa.implementation_write_path='official';INSERT INTO neroxa_system_domains(system_instance_id,domain,status) VALUES(${q(ids[x+'store'])},${q(x.toLowerCase()+'.synthetic.invalid')},'VERIFIED');DELETE FROM neroxa_storefront_weekly_hours WHERE instance_id=${q(ids[x+'store'])};INSERT INTO neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT ${q(ids[x+'store'])},g,'00:00','24:00' FROM generate_series(0,6) g;COMMIT;`);
 await check('F01 authorized own availability positive','admin_B','B','SELECT','ALLOW',()=>api('admin_B','neroxa_storefront_availability?instance_id=eq.'+ids.Bstore),one);
 await check('F01 own availability UPDATE positive','admin_B','B','UPDATE','ALLOW',()=>api('admin_B','neroxa_storefront_availability?instance_id=eq.'+ids.Bstore,'PATCH',{enabled:true}),one);
 await check('F01 candidate staff_none PATCH B','staff_none','B','UPDATE','DENY',()=>api('staff_none','neroxa_storefront_availability?instance_id=eq.'+ids.Bstore,'PATCH',{enabled:false}),empty,{deny:true,p0:true});
 for(const x of ['B','C'])await check('admin_A foreign orders','admin_A',x,'SELECT','DENY',()=>api('admin_A','neroxa_orders?id=eq.'+ids[x+'order']),empty,{deny:true,p0:true});
 if(report.p0s?.length)throw Error('P0 foreign data access; stop candidate');
 await check('admin_A own orders positive','admin_A','A','SELECT','ALLOW',()=>api('admin_A','neroxa_orders?id=eq.'+ids.Aorder),one);
 // Actual committed checkout RPC, existing request key retry, real server-only issuance.
 report.stage='checkout RPC to capability to buyer HTTP';
 sql(`DELETE FROM neroxa_storefront_product_addon_groups WHERE product_id=${q(ids.Aproduct)};`);
 const key=crypto.randomUUID();const payload={organization_id:ids.O1,instance_id:ids.Astore,store_domain:'a.synthetic.invalid',idempotency_key:key,customer_name:'Synthetic Buyer',customer_phone:'00000000001',fulfillment:'PICKUP',payment_method:'CASH',items:[{product_id:ids.Aproduct,quantity:1}]};
 const created=await services.admin.rpc('create_public_order',{p_order:payload});if(created.error)throw Error('Checkout RPC failed: '+created.error.code);
 const order=Array.isArray(created.data)?created.data[0]:created.data;if(!order?.order_id||Number(order.total)!==30)throw Error('Actual checkout result invalid');
 const retried=await services.admin.rpc('create_public_order',{p_order:payload});const replay=Array.isArray(retried.data)?retried.data[0]:retried.data;if(retried.error||replay.order_id!==order.order_id)throw Error('Checkout idempotency failed');
 const {issueTrackingOnce}=await import('../../delivery-candidate/src/server/tracking-issuance.ts');
 const register=async hash=>{const r=await services.admin.rpc('neroxa_register_tracking_capability',{p_instance_id:ids.Astore,p_order_id:order.order_id,p_checkout_key:key,p_token_sha256:hash});if(r.error)throw Error('Registration failed');return r.data;};
 const token=await issueTrackingOnce(register);if(!token||await issueTrackingOnce(register)!==undefined)throw Error('One-time issuance failed');
 report.checkout={status:'PASS committed RPC+shared issuance; not TanStack browser E2E',order_id:order.order_id,total:30,retrySameOrder:true,tokenIssuedOnce:true,ordersForKey:sql(`SELECT count(*) FROM neroxa_orders WHERE idempotency_key=${q(key)};`)};
 const {privateTrackingDependencies}=await import('../../delivery-candidate/src/server/private-tracking-backend.ts');
 const {handlePrivateTrackingRequest}=await import('../../delivery-candidate/src/server/private-tracking.ts');
 const runtime={NEROXA_PRIVATE_TRACKING_ENABLED:'true',NEROXA_BACKEND_MODE:'homologation',NEROXA_TEST_PROJECT_REF:'local-disposable',NEROXA_TRACKING_PROXY_CONTRACT:'direct-canonical-host-v1',SUPABASE_URL:url,NEROXA_DELIVERY_BACKEND_URL:url,NEROXA_TRACKING_CANONICAL_DOMAINS:'a.synthetic.invalid,b.synthetic.invalid,c.synthetic.invalid',NEROXA_TRACKING_QUOTA_SECRET:crypto.randomBytes(32).toString('hex')};
 const deps=privateTrackingDependencies(runtime,services.admin);
 // Simulated trusted direct edge: only three explicitly configured canonical hosts.
 const server=http.createServer(async(req,res)=>{try{const host=req.headers.host;if(!['a.synthetic.invalid','b.synthetic.invalid','c.synthetic.invalid'].includes(host)){res.writeHead(403,{'Content-Type':'application/json'});res.end('{"error":"Canonical host unavailable"}');return;}const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413);res.end();return;}chunks.push(chunk);}const request=new Request('https://'+host+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});const result=await handlePrivateTrackingRequest(request,deps);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch{res.writeHead(503);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port+'/api/order-track';report.buyer=[];
 const request=(host,secret,overrides={})=>new Promise((resolve,reject)=>{
  const outgoing=http.request(address,{method:'POST',headers:{Host:host,Origin:'https://'+host,'Content-Type':'application/json',Authorization:'Bearer '+secret,...overrides}},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{try{resolve({http:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString()),noStore:response.headers['cache-control']?.includes('no-store')});}catch{reject(Error('Non-JSON harness response; no secret payload logged'));}});});
  outgoing.on('error',reject);outgoing.end(JSON.stringify({order_id:order.order_id}));
 });
 try {
  const positive=await request('a.synthetic.invalid',token);if(positive.http!==200||positive.body.order_id!==order.order_id||JSON.stringify(positive.body).includes('customer_')||!positive.noStore)throw Error('Buyer HTTP positive failed');report.buyer.push({case:'real HTTP A positive',status:'PASS',http:200,instance_id:ids.Astore,body:positive.body});
  for(const actor of ['anon','admin_A'])await check('direct private tracking RPC denied',actor,'A','RPC','DENY',()=>rpc(actor,'neroxa_track_order_with_capability',{p_instance_id:ids.Astore,p_order_id:order.order_id,p_token:token}),r=>[401,403].includes(r.http),{deny:true,p0:true});
  for(const [name,host,secret,headers] of [['missing token','a.synthetic.invalid','',{}],['wrong token','a.synthetic.invalid','x'.repeat(43),{}],['same-org cross B','b.synthetic.invalid',token,{}],['cross C','c.synthetic.invalid',token,{}],['spoofed proxy','a.synthetic.invalid',token,{'X-Forwarded-Host':'b.synthetic.invalid'}],['foreign Origin','a.synthetic.invalid',token,{Origin:'https://b.synthetic.invalid'}]]){
   const before=digest();const quotaBefore=sql('SELECT coalesce(sum(hits),0) FROM private.neroxa_tracking_ingress;');const r=await request(host,secret,headers);const after=digest();if(r.http!==403||JSON.stringify(before)!==JSON.stringify(after))throw Error('Buyer HTTP denied case failed: '+name);report.buyer.push({case:name,status:'PASS',http:r.http,body:r.body,before,after,quotaBefore,quotaAfter:sql('SELECT coalesce(sum(hits),0) FROM private.neroxa_tracking_ingress;'),sideEffects:'business and capabilities unchanged; durable quota accounting separately captured'});
  }
  sql(`UPDATE private.neroxa_tracking_capabilities SET revoked_at=clock_timestamp() WHERE order_id=${q(order.order_id)};`);const revokedBefore=digest();const revoked=await request('a.synthetic.invalid',token);const revokedAfter=digest();if(revoked.http!==403||JSON.stringify(revokedBefore)!==JSON.stringify(revokedAfter))throw Error('Revoked token allowed');report.buyer.push({case:'revoked capability',status:'PASS',http:revoked.http,before:revokedBefore,after:revokedAfter});
  sql(`UPDATE private.neroxa_tracking_capabilities SET revoked_at=NULL,created_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE order_id=${q(order.order_id)};`);const expiredBefore=digest();const expired=await request('a.synthetic.invalid',token);const expiredAfter=digest();if(expired.http!==403||JSON.stringify(expiredBefore)!==JSON.stringify(expiredAfter))throw Error('Expired token allowed');report.buyer.push({case:'expired capability',status:'PASS',http:expired.http,before:expiredBefore,after:expiredAfter});
  const quotaArgs={p_fingerprint:'f'.repeat(64)};const reserved=await Promise.all(Array.from({length:125},()=>services.admin.rpc('neroxa_tracking_reserve_ingress',quotaArgs)));const allowed=reserved.filter(r=>!r.error&&r.data===true).length;if(allowed!==120)throw Error('Durable concurrent quota cap failed');report.buyer.push({case:'durable quota125 concurrent;120 allowed',status:'PASS',allowed,denied:125-allowed});
  const fp=crypto.createHmac('sha256',runtime.NEROXA_TRACKING_QUOTA_SECRET).update('tracking-ingress:v1:a.synthetic.invalid').digest('hex');sql(`UPDATE private.neroxa_tracking_ingress SET hits=120 WHERE fingerprint=${q(fp)};`);const blocked=await request('a.synthetic.invalid',token);if(blocked.http!==429)throw Error('HTTP quota failure');report.buyer.push({case:'real HTTP durable quota exhaustion',status:'PASS',http:blocked.http});
 }finally{await new Promise(r=>server.close(r));}
 report.checkout={status:'PASS RPC+shared adapter only; not TanStack browser E2E',order_id:order.order_id,total:30,retrySameOrder:true,tokenIssuedOnce:true,ordersForKey:sql(`SELECT count(*) FROM neroxa_orders WHERE idempotency_key=${q(key)};`)};
 report.f02='NOT YET OBSERVED';
 report.releaseGate='BLOCKED; phone consumer gate intentionally not applied; never certify this prefix as release M';
 report.coverageNotRun=['TanStack checkout route and confirmation hydration','checkout first-call concurrency','Storage upload CRUD','Realtime/logout/reconnect','amendment financial','T1'];
 // Preserve unresolved direct-phone access as an observed FAIL, not fabricate disablement.
 const f02=await check('F02 pre-gate direct phone RPC remains unresolved','anon','B','RPC','DENY',()=>rpc('anon','get_public_order_status',{p_order_id:ids.Border,p_customer_phone:'00000000001'}),r=>[401,403].includes(r.http)||r.body===null,{phase:'pre-gate-observation',deny:true});
 report.f02Observed={http:f02.http,order_id:f02.body?.order_id??f02.body?.id??null,status:f02.body?.status??null,has_phone:!!(f02.body?.customer_phone),has_address:!!(f02.body?.address_street)};
 report.f02=report.checks.at(-1).status==='FAIL'?'FAIL CONFIRMED P0 direct phone remains accessible':'PASS observed denial only; gate not certified';
}
