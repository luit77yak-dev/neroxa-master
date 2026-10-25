// ARTIFICIAL process fixture. Never loads libpq, connects, or executes SQL.
import fs from 'node:fs';
const channel=process.env.TEST_CHANNEL,mode=process.env.TEST_MODE,role=process.env.TEST_ROLE,start=process.env.TEST_START;
let pending='',timer;
const stages=(codes,rows=[])=>rows.join('\n')+(rows.length?'\n':'')+codes.map((s,i)=>`NEROXA_STAGE_${i}_${s}`).join('\n')+'\n';
const emit=(marker,text,err='')=>{if(err)process.stderr.write(err,()=>setTimeout(()=>process.stdout.write(text+marker+'\n'),3));else process.stdout.write(text+marker+'\n');};
const state=()=>{try{return fs.readFileSync(channel,'utf8');}catch{return 'idle';}};
process.stdin.on('data',b=>{
 pending+=b.toString();const frame=/NEROXA_FRAME_[a-f0-9]{48}/.exec(pending);if(!frame)return;
 const q=pending.slice(0,frame.index),marker=frame[0];pending='';
 if(q.includes("'business_write'")) {
  const row={db:'postgres',actor:role,session_actor:role,pid:process.env.TEST_SIDE==='A'?1001:1002,start,clock:new Date().toISOString(),read_only:'on',ssl:true,tls:'TLSv1.3',role:{rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolinherit:false,rolcanlogin:true},database_create:false,schema_create:0,memberships:0,owns_business:0,business_write:0,business_read:0,definer_execute:0};
  if(mode==='bypass')row.role.rolbypassrls=true;
  emit(marker,stages(['00000','00000','00000'],[JSON.stringify(row)]));
 } else if(q.includes('\nSELECT pg_catalog.pg_sleep(3);\n')) {
  emit(marker,stages(['00000','00000','57014','00000']),'ERROR:  57014: canceling statement due to statement timeout\n');
 } else if(q.includes('\nSELECT pg_catalog.pg_sleep(4);\n')) {
  fs.writeFileSync(channel,'waiting');timer=setInterval(()=>{if(state()!=='cancelled')return;clearInterval(timer);fs.writeFileSync(channel,'idle');
   const code=mode==='booleanOnly'?'00000':'57014',cause=mode==='wrongCause'?'statement timeout':'user request';
   emit(marker,stages(['00000','00000',code,'00000']),code==='57014'?`ERROR:  57014: canceling statement due to ${cause}\n`:'');
  },5);
 } else if(q.includes('SELECT pg_catalog.pg_cancel_backend(a.pid)')) {
  fs.writeFileSync(channel,'cancelled');emit(marker,stages(['00000','00000','00000'],['t']));
 } else if(q.includes("'wait_active'")) {
  const active=state()==='waiting';emit(marker,stages(['00000','00000','00000'],[JSON.stringify({pid:1001,start,state:active?'active':'idle',transaction_open:active,wait_active:active})]));
 } else if(q.includes("'signature'")) {
  emit(marker,stages(['00000','00000','00000'],[JSON.stringify([{signature:'SYNTHETIC_MISSING_FUNCTION',present:false}])]));
 } else {process.stderr.write('Unexpected fixture input\n');process.exit(1);}
});
process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0);});
