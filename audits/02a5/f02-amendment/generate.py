import pathlib
p=pathlib.Path('tools/mission-02a3/buyer-generated.private.mjs')
s=p.read_text();needle=" report.status='PASS PARTIAL PRE-GATE';";assert s.count(needle)==1
insert="""
 const {secureAmendment}=await import('../../audits/02a5/f02-amendment/run.mjs');
 await secureAmendment({sql,q,ids,people,services,env,url,report,api,rpc,check,digest,empty,one,fs,crypto,work,resetDigests:()=>{digestTables=undefined}});
 const {integratedCheckout}=await import('../../audits/02a5/f02-amendment/integrated-checkout.mjs');
 await integratedCheckout({sql,q,ids,services,url,report,rpc,digest,crypto});
 const {revokeDisposable}=await import('../../audits/02a5/f02-amendment/revoke-disposable.mjs');
 await revokeDisposable({sql,q,ids,services,url,report,rpc,digest,crypto,work});
"""
p.write_text(s.replace(needle,insert+needle))
