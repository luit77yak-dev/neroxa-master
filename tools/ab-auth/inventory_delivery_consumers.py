"""Static consumer evidence across explicit checkouts. Never certify runtime compatibility."""
import argparse, json, pathlib, re, subprocess
parser=argparse.ArgumentParser()
parser.add_argument('--master',required=True)
parser.add_argument('--delivery',required=True)
parser.add_argument('--output',required=True)
a=parser.parse_args()
legacy={'organizations','organization_settings','delivery_zones','orders','order_items','products','categories','product_sizes','product_prices','product_addons','product_addon_links','store_hours','special_hours','product_crusts'}
rpcs={'create_public_order','get_public_storefront_catalog','get_public_storefront_context','get_public_order_status','append_public_order_items_with_payment','get_admin_orders','update_admin_order_status','update_order_status','get_supplier_panel_context','neroxa_checkout_reserve_quota','neroxa_register_order_amendment_capability','neroxa_append_order_items_with_capability'}
entries=[]
for repo,root in [('master',a.master),('delivery',a.delivery)]:
 root=pathlib.Path(root)
 ref=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
 paths=subprocess.check_output(['git','-C',str(root),'ls-files'],text=True).splitlines()
 for name in paths:
  p=root/name
  if not p.is_file() or p.suffix not in {'.ts','.tsx','.js','.mjs','.sql'}:continue
  kind='runtime' if name.startswith(('src/','supabase/functions/')) else 'migration' if name.startswith('supabase/migrations/') else 'candidate' if name.startswith('audits/sql/') else 'test_or_audit'
  lines=p.read_text(errors='replace').splitlines()
  for n,line in enumerate(lines,1):
   symbols=set(re.findall(r'\bneroxa_[A-Za-z0-9_]+\b',line))
   symbols|={s for s in rpcs if s in line}
   symbols|={s for s in legacy if re.search(r'[\"\x27]'+s+r'[\"\x27]',line)}
   storage=bool(re.search(r'(?:localStorage|sessionStorage|storefrontLocalKey)',line))
   if not symbols and not storage:continue
   context='\n'.join(lines[max(0,n-6):n+7])
   entries.append(dict(repo=repo,ref=ref,path=name,line=n,kind=kind,symbols=sorted(symbols),operations=sorted(set(re.findall(r'\b(select|insert|update|upsert|delete|rpc)\s*\(',context))),instance_nearby='instance_id' in context or 'instanceId' in context,organization_nearby='organization_id' in context,storage_reference=storage,compatibility='MANUAL_REVIEW_REQUIRED',runtime_verified=False))
# Historical DB bodies need separate scanning; source references alone miss SQL consumers.
root=pathlib.Path(a.master)
catalog=json.loads((root/'audits/ab-auth/master-catalog-20261009.json').read_text())
functions=[]
for f in catalog['functions']:
 body=f['definition']
 symbols=sorted(set(re.findall(r'\bneroxa_[A-Za-z0-9_]+\b',body)))
 if symbols or any(s in body for s in rpcs):functions.append(dict(schema=f['schema'],name=f['name'],signature=f['signature'],definer=f['definer'],owner=f['owner'],symbols=symbols,dynamic_sql=bool(re.search(r'\bexecute\b',body,re.I)),source='historical_catalog_20261009',runtime_verified=False))
p=pathlib.Path(a.output);p.parent.mkdir(parents=True,exist_ok=True)
p.write_text(json.dumps(dict(scope='Tracked code in explicit candidates plus historical SQL bodies; no excerpts/secrets/data; occurrences are not independent consumers.',references=entries,historical_functions=functions,external_consumers_complete=False),indent=2)+'\n')
print(json.dumps({'references':len(entries),'runtime_references':sum(e['kind']=='runtime' for e in entries),'historical_functions':len(functions),'output':str(p)}))
