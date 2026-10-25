import fs from 'node:fs';
import crypto from 'node:crypto';
export async function realtimeContainment(c){
 const {sql,q,ids,people,env,url,report,sleep,api,check,empty}=c;
 report.stage='F01 private Realtime containment';
 const target=['neroxa_orders','neroxa_order_items','neroxa_order_status_history'];
 const out=report.f01Containment={status:'RUNNING',source:process.env.MISSION_SOURCE_SHA,reuses:'40211924855: 1193 candidate PASS, two DELETE leaks; 40211243895: UPDATE revoke/logout controls',cases:[],scope:'private Postgres Changes suspended; scoped REST polling retained; no production change'};
 const emit=(name,status,details={})=>{const row={name,phase:'candidate',status,...details};out.cases.push(row);report.checks.push(row);console.log('F01_CONTAINMENT_CASE='+JSON.stringify(row));};
 // Harmless fixture is an independent live transport control, not private data.
 sql(`CREATE TABLE public.f01_realtime_control(id uuid PRIMARY KEY,marker text NOT NULL);ALTER TABLE public.f01_realtime_control ENABLE ROW LEVEL SECURITY;GRANT SELECT ON public.f01_realtime_control TO authenticated;CREATE POLICY f01_control_read ON public.f01_realtime_control FOR SELECT TO authenticated USING(true);ALTER TABLE public.f01_realtime_control REPLICA IDENTITY FULL;ALTER PUBLICATION supabase_realtime ADD TABLE public.f01_realtime_control;INSERT INTO public.f01_realtime_control VALUES('92000000-0000-4000-8000-000000000001','before');`);
 // Reproduce only the old test's publication setup to prove that existing live
 // subscriptions are cut off; no production membership is presumed.
 sql('ALTER TABLE public.neroxa_orders REPLICA IDENTITY FULL;');if(sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='neroxa_orders';")==='0')sql('ALTER PUBLICATION supabase_realtime ADD TABLE public.neroxa_orders;');
 const frames=[],controls=[],ready=new Set(),pending=new Map();let n=0,beat;const ws=new WebSocket(url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(env.ANON_KEY)+'&vsn=1.0.0');
 const send=(topic,event,payload)=>{const ref=String(++n);ws.send(JSON.stringify({topic,event,payload,ref,join_ref:event==='phx_join'?ref:null}));return ref;};
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Containment socket deadline')),15000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('Containment socket error'));},{once:true});});
  ws.addEventListener('message',e=>{let m;try{m=JSON.parse(String(e.data));}catch{return;}
   if(m.event==='phx_reply'&&pending.has(m.ref)){pending.get(m.ref)(m);pending.delete(m.ref);}
   if(m.event==='system'&&m.payload?.status==='ok'&&m.payload?.extension==='postgres_changes')ready.add(m.topic);
   if(m.event==='postgres_changes'){const d=m.payload?.data;if(d?.table==='f01_realtime_control')controls.push(d.record?.marker);else if(target.includes(d?.table))frames.push({topic:m.topic,type:d.type,table:d.table,id:d.record?.id??d.old_record?.id,keys:Object.keys(d.old_record??{})});}
  });
  beat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)send('phoenix','heartbeat',{});},5000);
  async function join(name,table,token,filter){const topic='realtime:f01-contain-'+name;let answer;
   for(let attempt=0;attempt<4;attempt++){const ref=send(topic,'phx_join',{config:{broadcast:{ack:false,self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table,...(filter?{filter}:{})}],private:false},access_token:token});answer=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(ref);reject(Error('Containment join deadline'));},30000);pending.set(ref,m=>{clearTimeout(t);resolve(m);});});if(answer.payload?.status==='ok')break;const reason=answer.payload?.response?.reason;if(typeof reason!=='string'||!reason.startsWith('InitializingProjectConnection:')||attempt===3)break;await sleep(5000);}
   return {topic,ok:answer.payload?.status==='ok'};
  }
  for(const x of ['A','B','C'])if(!(await join(x,'neroxa_orders',people.admin_A.token,'instance_id=eq.'+ids[x+'store'])).ok)throw Error('Existing private subscription not established');
  if(!(await join('control','f01_realtime_control',people.admin_A.token)).ok)throw Error('Positive control subscription unavailable');
  const start=Date.now()+30000;while(ready.size<4&&Date.now()<start)await sleep(250);if(ready.size<4)throw Error('Native subscriptions not ready');
  sql(`UPDATE public.neroxa_orders SET notes='Synthetic before containment' WHERE id=${q(ids.Aorder)};`);const beforeDeadline=Date.now()+20000;while(!frames.some(r=>r.id===ids.Aorder)&&Date.now()<beforeDeadline)await sleep(250);if(!frames.some(r=>r.id===ids.Aorder))throw Error('Pre-gate own event control missing');emit('Realtime pre-containment own UPDATE proves live private subscription','PASS');
  const manifest=JSON.parse(fs.readFileSync('tools/f01/CONTAINMENT-MANIFEST.json'));const body=fs.readFileSync(manifest.path);if(crypto.createHash('sha256').update(body).digest('hex')!==manifest.sha256)throw Error('Containment SQL hash drift');
  const metadata=()=>sql("SELECT md5(coalesce(string_agg(c.oid::text||coalesce(c.relacl::text,'')||c.relrowsecurity::text,'|' ORDER BY c.oid),'')) FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'storage'::regnamespace);");
  const beforeMeta=metadata(),beforeData=c.digest();sql("SET neroxa.mission02a2_disposable='on';"+body.toString('utf8'));
  if(beforeMeta!==metadata()||JSON.stringify(beforeData)!==JSON.stringify(c.digest()))throw Error('Containment changed ACL/RLS/data');
  out.sql={path:manifest.path,sha256:manifest.sha256,dataAndGrantsPreserved:true};
  const published=JSON.parse(sql("SELECT coalesce(jsonb_agg(tablename ORDER BY tablename),'[]'::jsonb) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public';"));if(target.some(t=>published.includes(t)))throw Error('Private table still published');out.publicationAfter=published;emit('Private orders/items/history absent from publication; ACL/RLS/data unchanged','PASS');
  // Same live connection plus a new authenticated and an anonymous subscription.
  out.newAuthenticatedJoin=await join('fresh-B','neroxa_orders',people.admin_B.token);out.anonymousJoin=await join('anon','neroxa_orders',env.ANON_KEY);
  await sleep(2000);const baseline=frames.length;
  const orders=Object.fromEntries(['A','B','C'].map(x=>[x,crypto.randomUUID()]));
  for(const type of ['INSERT','UPDATE','DELETE']){
   if(type==='INSERT')for(const [i,x] of ['A','B','C'].entries())sql(`INSERT INTO public.neroxa_orders(id,instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,subtotal,total) VALUES(${q(orders[x])},${q(ids[x+'store'])},${q(x==='C'?ids.O2:ids.O1)},${21000000+i},'Synthetic containment','00000000001','PICKUP','CASH',1,1);`);
   if(type==='UPDATE')sql(`UPDATE public.neroxa_orders SET notes='Synthetic contained update' WHERE id IN (${Object.values(orders).map(q).join(',')});`);
   if(type==='DELETE')sql(`DELETE FROM public.neroxa_orders WHERE id IN (${Object.values(orders).map(q).join(',')});`);
   sql(`UPDATE public.f01_realtime_control SET marker=${q(type)};`);const deadline=Date.now()+20000;while(!controls.includes(type)&&Date.now()<deadline)await sleep(250);await sleep(3000);
   const live=controls.includes(type),events=frames.slice(baseline);emit('Realtime transport positive after '+type,live?'PASS':'BLOCKED');emit('Private '+type+' blocked on retained/fresh/anonymous subscriptions',!live?'BLOCKED':events.length?'FAIL':'PASS',{events:events.length,frames:events});
  }
  for(const x of ['A','B','C']){await check('F01 post-containment own REST polling','admin_'+x,x,'SELECT','ALLOW',()=>api('admin_'+x,'neroxa_orders?id=eq.'+ids[x+'order']),r=>r.http===200&&r.body?.length===1);}
  for(const x of ['B','C'])await check('F01 post-containment foreign REST polling','admin_A',x,'SELECT','DENY',()=>api('admin_A','neroxa_orders?id=eq.'+ids[x+'order']),empty,{deny:true,p0:true});
  const logout=await people.admin_A.client.auth.signOut();const sid=JSON.parse(Buffer.from(people.admin_A.token.split('.')[1],'base64url')).session_id;const absent=sql(`SELECT NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=${q(sid)}::uuid);`)==='t';if(logout.error||!absent)throw Error('Actual Auth logout not proven');await check('F01 post-containment stale JWT REST denied','admin_A','A','SELECT','DENY',()=>api('admin_A','neroxa_orders?id=eq.'+ids.Aorder),empty,{deny:true,p0:true});
  out.status=out.cases.every(r=>r.status==='PASS')?'PASS CONTAINMENT ONLY':'BLOCKED';
 }finally{if(beat)clearInterval(beat);ws.close();out.frames=frames;out.transportControls=controls;console.log('F01_CONTAINMENT_SUMMARY='+JSON.stringify(out));}
}
