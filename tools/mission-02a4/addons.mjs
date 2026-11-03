import crypto from 'node:crypto';
export async function addonControls({check,api,empty,ids,sql,q,people}){
 for(const actor of ['admin_A','staff_A'])for(const [table,key] of [['neroxa_storefront_addon_groups','group'],['neroxa_storefront_addons','addon']])for(const x of ['A','B','C'])await check('02A4 addon scoped '+table,actor,x,'SELECT',x==='A'?'ALLOW':'DENY',()=>api(actor,table+'?id=eq.'+ids[x+key]),x==='A'?r=>r.http===200&&r.body?.length===1:empty,{deny:x!=='A',p0:x!=='A'});
 const id=crypto.randomUUID();await check('02A4 staff own addon INSERT','staff_A','A','INSERT','ALLOW',()=>api('staff_A','neroxa_storefront_addons','POST',{id,group_id:ids.Agroup,name:'Synthetic own extra',price_delta:2}),r=>r.http===201&&r.body?.length===1);
 await check('02A4 staff own addon UPDATE','staff_A','A','UPDATE','ALLOW',()=>api('staff_A','neroxa_storefront_addons?id=eq.'+id,'PATCH',{price_delta:3}),r=>r.http===200&&r.body?.[0]?.price_delta===3);
 await check('02A4 addon cross-parent WITH CHECK','staff_A','B','UPDATE','DENY',()=>api('staff_A','neroxa_storefront_addons?id=eq.'+id,'PATCH',{group_id:ids.Bgroup}),r=>[400,403].includes(r.http),{deny:true,p0:true});
 await check('02A4 staff own addon DELETE','staff_A','A','DELETE','ALLOW',()=>api('staff_A','neroxa_storefront_addons?id=eq.'+id,'DELETE'),r=>r.http===200&&r.body?.length===1);
 sql(`UPDATE neroxa_instance_members SET active=false WHERE instance_id=${q(ids.Astore)} AND user_id=${q(people.staff_A.id)};`);
 await check('02A4 addon revoked grant same JWT','staff_A','A','SELECT','DENY',()=>api('staff_A','neroxa_storefront_addons?id=eq.'+ids.Aaddon),empty,{deny:true,p0:true});sql(`UPDATE neroxa_instance_members SET active=true WHERE instance_id=${q(ids.Astore)} AND user_id=${q(people.staff_A.id)};`);
}
