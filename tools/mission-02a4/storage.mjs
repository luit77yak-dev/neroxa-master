import crypto from 'node:crypto';
export async function imageStorage({services,people,ids,check,report,env,url}){
 const configured=await services.admin.storage.updateBucket('product-images',{public:false,allowedMimeTypes:['image/png'],fileSizeLimit:1048576});if(configured.error)throw Error('Native image bucket config rejected');
 const buckets=await services.admin.storage.listBuckets();const bucket=buckets.data?.find(b=>b.id==='product-images');if(!bucket||bucket.public||bucket.file_size_limit!==1048576||!bucket.allowed_mime_types?.includes('image/png'))throw Error('Private bucket/MIME/size preconditions missing');
 report.storageContract={bucket:'product-images',private:true,MIME:['image/png'],maxBytes:1048576,fixture:'1x1 fictional PNG',publicStorefrontAssets:'NOT RUN; signed/proxied successor needed'};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=','base64');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const x of ['B','C']){const seeded=await services.admin.storage.from('product-images').upload(ids[x+'store']+'/image.png',png,{contentType:'image/png'});if(seeded.error)throw Error('Foreign image bootstrap failed');}
 const wrap=async promise=>{const r=await promise;return{http:r.error?Number(r.error.statusCode??400):200,body:r.error?{code:r.error.error??r.error.name}:r.data}};
 for(const actor of ['admin_A','staff_A']){const st=people[actor].client.storage.from('product-images'),path=ids.Astore+'/'+actor+'.png';
 await check('02A4 own PNG upload',actor,'A','INSERT','ALLOW',()=>wrap(st.upload(path,png,{contentType:'image/png'})),r=>r.http===200);
 await check('02A4 own PNG download content',actor,'A','SELECT','ALLOW',async()=>{const r=await st.download(path);return{http:r.error?Number(r.error.statusCode):200,body:r.data?{sha:sha(Buffer.from(await r.data.arrayBuffer()))}:null}},r=>r.http===200&&r.body?.sha===sha(png));
 await check('02A4 own PNG replace',actor,'A','UPDATE','ALLOW',()=>wrap(st.update(path,png,{contentType:'image/png'})),r=>r.http===200);
 await check('02A4 MIME rejection',actor,'A','INSERT','DENY',()=>wrap(st.upload(ids.Astore+'/'+actor+'-mime.png',new Blob(['fake text']),{contentType:'text/plain'})),r=>r.http>=400,{deny:true,p0:true});
 await check('02A4 size rejection',actor,'A','INSERT','DENY',()=>wrap(st.upload(ids.Astore+'/'+actor+'-oversize.png',Buffer.alloc(1048577),{contentType:'image/png'})),r=>r.http>=400,{deny:true,p0:true});
 await check('02A4 own PNG delete',actor,'A','DELETE','ALLOW',()=>wrap(st.remove([path])),r=>r.http===200&&r.body?.length===1);
 }
 for(const actor of ['admin_A','staff_A','staff_none','common'])for(const x of ['B','C']){const st=people[actor].client.storage.from('product-images'),path=ids[x+'store']+'/image.png';
 for(const [op,fn] of [['SELECT',()=>st.download(path)],['INSERT',()=>st.upload(ids[x+'store']+'/foreign.png',png,{contentType:'image/png'})],['UPDATE',()=>st.update(path,png,{contentType:'image/png'})],['DELETE',()=>st.remove([path])]])await check('02A4 foreign PNG '+op,actor,x,op,'DENY',()=>wrap(fn()),r=>r.http>=400||(op==='DELETE'&&r.http===200&&r.body?.length===0),{deny:true,p0:true});}
 await check('02A4 native public URL denied','anon','B','SELECT','DENY',async()=>{const r=await fetch(url+'/storage/v1/object/public/product-images/'+ids.Bstore+'/image.png',{headers:{apikey:env.ANON_KEY}});return{http:r.status}},r=>r.http>=400,{deny:true,p0:true});
}
