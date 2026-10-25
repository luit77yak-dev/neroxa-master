import crypto from 'node:crypto';
// Real native Phoenix transport: test all event types, including DELETE where
// PostgreSQL old-row filtering can differ from ordinary RLS reads.
export async function f01RealtimeEvents({sql,q,ids,people,env,url,report,sleep}){
 const seen={INSERT:{A:[],B:[],C:[]},UPDATE:{A:[],B:[],C:[]},DELETE:{A:[],B:[],C:[]}},rows=Object.fromEntries(['A','B','C'].map(x=>[x,crypto.randomUUID()])),ready=new Set(),pending=new Map(),protocol=[];
 const emit=(name,status,details={})=>{const r={name,phase:'candidate',status,...details};report.checks.push(r);console.log('F01_REALTIME_EVENT='+JSON.stringify(r));};
 sql('ALTER TABLE public.neroxa_orders REPLICA IDENTITY FULL;');if(sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='neroxa_orders';")==='0')sql('ALTER PUBLICATION supabase_realtime ADD TABLE public.neroxa_orders;');
 const ws=new WebSocket(url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(env.ANON_KEY)+'&vsn=1.0.0');let serial=0,heartbeat;
 const send=(topic,event,payload)=>{const ref=String(++serial);ws.send(JSON.stringify({topic,event,payload,ref,join_ref:event==='phx_join'?ref:null}));return ref;};
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('F01 event socket deadline')),15000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('F01 event socket failed'));},{once:true});});
  ws.addEventListener('message',e=>{let m;try{m=JSON.parse(String(e.data));}catch{return;}
   if(m.event==='phx_reply'&&pending.has(m.ref)){pending.get(m.ref)(m);pending.delete(m.ref);}
   if(m.event==='system'&&m.payload?.status==='ok'&&m.payload?.extension==='postgres_changes')ready.add(m.topic);
   if(m.event==='postgres_changes'){const d=m.payload?.data,id=d?.record?.id??d?.old_record?.id,type=d?.type;protocol.push({topic:m.topic,type,id});if(seen[type])for(const x of ['A','B','C'])if(id===rows[x])seen[type][x].push({id,topic:m.topic});}
  });
  heartbeat=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)send('phoenix','heartbeat',{});},5000);
  for(const x of ['A','B','C']){const topic='realtime:f01-event-'+x;let answer;
   for(let attempt=0;attempt<4;attempt++){const ref=send(topic,'phx_join',{config:{broadcast:{ack:false,self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'neroxa_orders',filter:'instance_id=eq.'+ids[x+'store']}],private:false},access_token:people.admin_A.token});
    answer=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(ref);reject(Error('F01 event join deadline'));},30000);pending.set(ref,m=>{clearTimeout(t);resolve(m);});});
    if(answer.payload?.status==='ok')break;const reason=answer.payload?.response?.reason;if(typeof reason!=='string'||!reason.startsWith('InitializingProjectConnection:')||attempt===3)break;await sleep(5000);
   }
   if(answer?.payload?.status!=='ok')throw Error('F01 event channel not established');
  }
  const end=Date.now()+30000;while(ready.size<3&&Date.now()<end)await sleep(250);if(ready.size!==3)throw Error('F01 event server readiness incomplete');
  for(const type of ['INSERT','UPDATE','DELETE']){
   if(type==='INSERT')for(const [i,x] of ['A','B','C'].entries())sql(`INSERT INTO public.neroxa_orders(id,instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,subtotal,total,notes) VALUES(${q(rows[x])},${q(ids[x+'store'])},${q(x==='C'?ids.O2:ids.O1)},${20000000+i},'Synthetic Realtime F01','00000000001','PICKUP','CASH',1,1,'Synthetic event fixture');`);
   if(type==='UPDATE')sql(`UPDATE public.neroxa_orders SET notes='Synthetic updated event' WHERE id IN (${Object.values(rows).map(q).join(',')});`);
   if(type==='DELETE')sql(`DELETE FROM public.neroxa_orders WHERE id IN (${Object.values(rows).map(q).join(',')});`);
   const deadline=Date.now()+20000;while(!seen[type].A.length&&Date.now()<deadline)await sleep(250);await sleep(2000);
   const positive=seen[type].A.length>0;emit('Realtime '+type+' own A1',positive?'PASS':'BLOCKED',{events:seen[type].A.length});
   for(const x of ['B','C'])emit('Realtime '+type+' foreign '+x,!positive?'BLOCKED':seen[type][x].length?'FAIL':'PASS',{events:seen[type][x].length,positiveControl:positive,ids:seen[type][x].map(r=>r.id)});
  }
 }finally{if(heartbeat)clearInterval(heartbeat);ws.close();report.f01RealtimeEvents={seen,protocol,rows,actor:'admin_A',filter:'instance_id',transport:'native Phoenix, real Auth JWT; no mocks'};}
}
