import {createClient} from '@supabase/supabase-js';
import crypto from 'node:crypto';
export async function f01Storage({ids,people,url,env,check}){
 const anon=createClient(url,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');
 const wrap=async p=>{const r=await p;return {http:r.error?Number(r.error.statusCode??400):200,body:r.error?{code:r.error.error??r.error.name}:r.data};};
 // Supplement the existing A/staff -> B/C matrix with reverse direction,
 // anonymous access, and positive controls on both B and C native Storage.
 for(const x of ['B','C']){const st=people['admin_'+x].client.storage.from('product-images'),path=ids[x+'store']+'/f01-own.png';
  await check('F01 Storage own PNG create','admin_'+x,x,'INSERT','ALLOW',()=>wrap(st.upload(path,png,{contentType:'image/png'})),r=>r.http===200);
  await check('F01 Storage own PNG read bytes','admin_'+x,x,'SELECT','ALLOW',async()=>{const r=await st.download(path);return {http:r.error?Number(r.error.statusCode):200,body:r.data?{sha:crypto.createHash('sha256').update(Buffer.from(await r.data.arrayBuffer())).digest('hex')}:null};},r=>r.http===200&&r.body?.sha===crypto.createHash('sha256').update(png).digest('hex'));
  await check('F01 Storage own PNG edit','admin_'+x,x,'UPDATE','ALLOW',()=>wrap(st.update(path,png,{contentType:'image/png'})),r=>r.http===200);
  await check('F01 Storage own PNG delete','admin_'+x,x,'DELETE','ALLOW',()=>wrap(st.remove([path])),r=>r.http===200&&r.body?.length===1);
 }
 // A existing own fixture, plus B/C image.png created by the old matrix.
 const fixtures={A:ids.Astore+'/f01-existing.png',B:ids.Bstore+'/image.png',C:ids.Cstore+'/image.png'};
 await check('F01 Storage A target fixture','admin_A','A','INSERT','ALLOW',()=>wrap(people.admin_A.client.storage.from('product-images').upload(fixtures.A,png,{contentType:'image/png'})),r=>r.http===200);
 for(const actor of ['admin_B','admin_C','anon','staff_none','common'])for(const x of ['A','B','C']){
  if(actor==='admin_'+x||['staff_none','common'].includes(actor)&&x!=='A')continue;
  const st=(actor==='anon'?anon:people[actor].client).storage.from('product-images');
  const ops=[['SELECT',()=>st.download(fixtures[x])],['INSERT',()=>st.upload(ids[x+'store']+'/f01-denied-'+actor+'.png',png,{contentType:'image/png'})],['UPDATE',()=>st.update(fixtures[x],png,{contentType:'image/png'})],['DELETE',()=>st.remove([fixtures[x]])]];
  for(const [op,fn] of ops)await check('F01 Storage reverse/anonymous PNG '+op,actor,x,op,'DENY',()=>wrap(fn()),r=>r.http>=400||op==='DELETE'&&r.http===200&&r.body?.length===0,{deny:true,p0:true});
 }
}
