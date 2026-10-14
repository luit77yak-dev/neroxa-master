import crypto from 'node:crypto';
export async function tracking({sql,ids,check,api,rpc,q,services,report}){
 const token=crypto.randomBytes(32).toString('base64url'),wrong=crypto.randomBytes(32).toString('base64url'),key=crypto.randomUUID();console.log('::add-mask::'+token);console.log('::add-mask::'+wrong);
 sql(`UPDATE neroxa_orders SET idempotency_key=${q(key)} WHERE id=${q(ids.Aorder)};`);
 const backend=async(fn,args)=>{const r=await services.admin.rpc(fn,args);return{http:r.error?(r.error.code==='42501'?403:400):200,body:r.error?{code:r.error.code}:r.data}};
 report.trackingScope='Database server contract: backend_gateway is actual service-only server caller, never an Auth user simulation. Buyer HTTP Origin/domain/quota/issuance NOT RUN.';
 const reg={p_instance_id:ids.Astore,p_order_id:ids.Aorder,p_checkout_key:key,p_token_sha256:crypto.createHash('sha256').update(token).digest('hex')};
 await check('02A4 trusted checkout registration','backend_gateway','A','RPC','ALLOW BACKEND ONLY',()=>backend('neroxa_register_tracking_capability',reg),r=>r.http===200&&r.body===true);
 const details={p_instance_id:ids.Astore,p_order_id:ids.Aorder,p_token:token};
 await check('02A4 valid capability minimal A','backend_gateway','A','RPC','ALLOW BACKEND ONLY',()=>backend('neroxa_track_order_with_capability',details),r=>r.http===200&&r.body?.order_id===ids.Aorder&&!('customer_phone' in r.body)&&!('address_street' in r.body));
 await check('02A4 retry never reissues tracking token','backend_gateway','A','RPC','NO REISSUE',()=>backend('neroxa_register_tracking_capability',reg),r=>r.http===200&&r.body===false,{deny:true});
 for(const [name,args] of [['wrong token',{...details,p_token:wrong}],['A token target B',{p_instance_id:ids.Bstore,p_order_id:ids.Border,p_token:token}],['adulterated instance',{...details,p_instance_id:ids.Bstore}]])await check('02A4 tracking '+name,'backend_gateway','B','RPC','DENY',()=>backend('neroxa_track_order_with_capability',args),r=>r.http===403,{deny:true,p0:true});
 for(const actor of ['admin_A','staff_A','staff_none','common','anon'])await check('02A4 direct private RPC not exposed',actor,'A','RPC','DENY',()=>rpc(actor,'neroxa_track_order_with_capability',details),r=>[401,403].includes(r.http),{deny:true,p0:true});
 sql(`UPDATE private.neroxa_tracking_capabilities SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE order_id=${q(ids.Aorder)};`);
 await check('02A4 expired capability','backend_gateway','A','RPC','DENY',()=>backend('neroxa_track_order_with_capability',details),r=>r.http===403,{deny:true,p0:true});
 sql(`UPDATE private.neroxa_tracking_capabilities SET expires_at=clock_timestamp()+interval '1 day',revoked_at=clock_timestamp() WHERE order_id=${q(ids.Aorder)};`);
 await check('02A4 revoked capability','backend_gateway','A','RPC','DENY',()=>backend('neroxa_track_order_with_capability',details),r=>r.http===403,{deny:true,p0:true});
 // Open ALL seven weekdays, removing the prior operational 423 blocker.
 sql(`INSERT INTO neroxa_storefront_weekly_hours(instance_id,weekday,opens_at,closes_at) SELECT ${q(ids.Bstore)},d,'00:00','24:00' FROM generate_series(0,6) d ON CONFLICT(instance_id,weekday,opens_at) DO UPDATE SET closes_at='24:00';`);
 const open=sql(`SELECT private.neroxa_store_is_open(${q(ids.Bstore)},clock_timestamp());`);report.appendOpenControl={open:open==='t',authorizationProof:false};if(open!=='t')throw Error('02A4 open shop control failed');
 await check('02A4 anonymous phone append with shop OPEN','anon','B','RPC','DENY',()=>rpc('anon','append_public_order_items_with_payment',{p_order_id:ids.Border,p_customer_phone:'00000000001',p_items:[{product_id:ids.Bproduct,quantity:1}],p_payment_method:'CASH'}),r=>[401,403].includes(r.http),{deny:true,p0:true});
}
