// F01 ONLY: native Auth/RLS and instance-scoped checks. No F02 RPC revocation.
export async function f01MinimalControls(c) {
  const {sql,q,ids,people,api,rpc,check,empty,one,report}=c;
  if (c.profile !== 'master') throw new Error('F01 requires Master candidate');
  const identities=['A','B','C'];
  const orgs=JSON.parse(sql(`SELECT jsonb_object_agg(id,organization_id) FROM public.neroxa_system_instances WHERE id IN (${identities.map(x=>q(ids[x+'store'])).join(',')});`));
  if(orgs[ids.Astore]!==orgs[ids.Bstore]||orgs[ids.Astore]===orgs[ids.Cstore]) throw new Error('A1/A2/C fixture topology drift');
  const start=report.checks.length;
  async function probe(name,actor,x,operation,allow,fn,predicate,{deny=false,p0=false}={}){
    await check('F01 FOCAL '+name,actor,x,operation,allow?'ALLOW':'DENY',fn,predicate,{phase:'candidate',deny,p0});
    const result=report.checks.at(-1);
    if(result?.status!=='PASS') throw new Error('F01 focal failed: '+name);
  }
  const order=x=>'neroxa_orders?id=eq.'+ids[x+'order'];
  const product=x=>'neroxa_storefront_products?id=eq.'+ids[x+'product'];
  const availability=x=>'neroxa_storefront_availability?instance_id=eq.'+ids[x+'store'];
  const rowEnabled=x=>sql(`SELECT enabled FROM public.neroxa_storefront_availability WHERE instance_id=${q(ids[x+'store'])};`);
  // Positive real Auth identity / own-store read. Cross-store A1→A2 and A1→C denied.
  for(const x of identities) await probe('own order SELECT '+x,'admin_'+x,x,'SELECT',true,()=>api('admin_'+x,order(x)),one);
  for(const x of ['B','C']){
    await probe('A1 foreign order SELECT '+x,'admin_A',x,'SELECT',false,()=>api('admin_A',order(x)),empty,{deny:true,p0:true});
    await probe('A1 foreign product SELECT '+x,'admin_A',x,'SELECT',false,()=>api('admin_A',product(x)),empty,{deny:true,p0:true});
    await probe('A1 foreign order UPDATE '+x,'admin_A',x,'UPDATE',false,()=>api('admin_A',order(x),'PATCH',{notes:'DENIED F01'}),empty,{deny:true,p0:true});
    await probe('A1 foreign product UPDATE '+x,'admin_A',x,'UPDATE',false,()=>api('admin_A',product(x),'PATCH',{name:'DENIED F01'}),empty,{deny:true,p0:true});
  }
  // Platform admin without instance grant must NOT gain rights to B.
  await probe('staff_none no grant reads B','staff_none','B','SELECT',false,()=>api('staff_none',availability('B')),empty,{deny:true,p0:true});
  await probe('staff_none no grant changes B','staff_none','B','UPDATE',false,()=>api('staff_none',availability('B'),'PATCH',{enabled:false}),empty,{deny:true,p0:true});
  await probe('A1 foreign availability SELECT B','admin_A','B','SELECT',false,()=>api('admin_A',availability('B')),empty,{deny:true,p0:true});
  await probe('A1 foreign availability UPDATE B','admin_A','B','UPDATE',false,()=>api('admin_A',availability('B'),'PATCH',{enabled:false}),empty,{deny:true,p0:true});
  if(rowEnabled('B')!=='t') throw new Error('P0: foreign B availability changed');
  // Positive legitimate operation and restoration of synthetic preimage.
  await probe('B own availability SELECT','admin_B','B','SELECT',true,()=>api('admin_B',availability('B')),one);
  await probe('B own availability UPDATE','admin_B','B','UPDATE',true,()=>api('admin_B',availability('B'),'PATCH',{enabled:false}),r=>one(r)&&r.body[0].enabled===false);
  if(rowEnabled('B')!=='f') throw new Error('B legitimate availability update was not persisted');
  await probe('B own availability RESTORE','admin_B','B','UPDATE',true,()=>api('admin_B',availability('B'),'PATCH',{enabled:true}),r=>one(r)&&r.body[0].enabled===true);
  if(rowEnabled('B')!=='t') throw new Error('B legitimate availability not restored');
  await probe('A own product SELECT','admin_A','A','SELECT',true,()=>api('admin_A',product('A')),one);
  // Effective per-instance revocation on the same Auth token, restored before Realtime checks.
  sql(`UPDATE public.neroxa_instance_members SET active=false WHERE instance_id=${q(ids.Astore)} AND user_id=${q(people.staff_A.id)};`);
  try {
    await probe('staff_A revoked live token SELECT A','staff_A','A','SELECT',false,()=>api('staff_A',availability('A')),empty,{deny:true,p0:true});
  } finally {
    sql(`UPDATE public.neroxa_instance_members SET active=true WHERE instance_id=${q(ids.Astore)} AND user_id=${q(people.staff_A.id)};`);
  }
  const selected=report.checks.slice(start);
  if(selected.length!==20 || selected.some(x=>x.status!=='PASS')) throw new Error('F01 focal count or status drift: '+selected.length);
  report.f01Focal={status:'PASS LOCAL ONLY',checks:selected.length,source:'frozen PR51 with audited candidate hashes',syntheticFixtures:true,hosted:false,f02:'NOT_RUN'};
  console.log('F01_FOCAL_SUMMARY='+JSON.stringify(report.f01Focal));
}
