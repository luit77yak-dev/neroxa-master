"""Reuse exact native Auth/catalog/fixture bootstrap, not historical candidate assertions."""
import pathlib,hashlib,json
root=pathlib.Path.cwd();m=json.loads((root/'audits/02a5/BUYER-PRE-GATE-MANIFEST.json').read_text());original=(root/'tools/mission-02a3/run.mjs').read_bytes();assert hashlib.sha256(original).hexdigest()==m['bootstrap_sha256']
text=original.decode().split(' const bucket=await services.admin.storage.createBucket')[0]
assert text.endswith('\n') or 'Real Auth effective PostgreSQL identity' in text
# Include private capability tables in business snapshots; quota is audited separately.
text=text.replace("schemaname='public' OR (schemaname='storage'", "schemaname='public' OR (schemaname='private' AND tablename<>'neroxa_tracking_ingress') OR (schemaname='neroxa_private') OR (schemaname='storage'")
text += '''
 report.mission='02A5-FINAL';report.profile='BUYER-PRE-GATE; NOT release M';
 const {buyerMinimum}=await import('../mission-02a5/buyer-minimum.mjs');
 await buyerMinimum({sql,q,ids,people,services,env,url,report,api,rpc,check,digest,empty,one,fs,crypto,work,resetDigests:()=>{digestTables=undefined}});
 report.status='PASS PARTIAL PRE-GATE';
} catch(e) {report.status='FAIL';report.error={stage:report.stage,message:String(e.message).slice(0,220)};}
finally {for(const p of Object.values(people))await p.client.removeAllChannels().catch(()=>{});console.log('MISSION02A5_FINAL='+JSON.stringify(report));}
process.exitCode=report.status==='PASS PARTIAL PRE-GATE'?0:1;
'''
out=root/'tools/mission-02a3/buyer-generated.private.mjs';out.write_text(text)
print('Generated reviewed pre-gate bootstrap; no phone release gate is applied or certified.')
