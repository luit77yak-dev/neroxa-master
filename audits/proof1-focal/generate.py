"""Build the focused harness from the byte-pinned historical disposable bootstrap."""
import hashlib, json, pathlib
root=pathlib.Path.cwd()
manifest=json.loads((root/'audits/02a2/MANIFEST-02A2.json').read_text())
source=(root/'tools/mission-02a3/run.mjs').read_bytes()
expected='b3af7a3fbecf6bd648fa0433b43b1afd931ba48b54bf9fc688aefd4f27aa47ba'
# Historical bootstrap hash is independently pinned in the buyer-pre-gate manifest.
buyer=json.loads((root/'audits/02a5/BUYER-PRE-GATE-MANIFEST.json').read_text())
assert hashlib.sha256(source).hexdigest()==buyer['bootstrap_sha256']
text=source.decode()
needle=" const bucket=await services.admin.storage.createBucket"
assert text.count(needle)==1
text=text.split(needle,1)[0]
text += """
 report.mission='PROVA1_FOCAL';report.stage='focused P0 checks';
 const {proof1Focal}=await import('../../audits/proof1-focal/driver.mjs');
 await proof1Focal({sql,q,ids,people,services,env,url,report,api,rpc,crypto,fs,sleep});
 report.status='PASS PROVA1_FOCAL';
} catch(e) {report.status='FAIL';report.error={stage:report.stage,message:String(e.message).slice(0,220)};}
finally {for(const p of Object.values(people))await p.client.removeAllChannels().catch(()=>{});console.log('PROVA1_FOCAL_RESULT='+JSON.stringify(report));}
process.exitCode=report.status==='PASS PROVA1_FOCAL'?0:1;
"""
out=root/'tools/mission-02a3/proof1-focal-generated.private.mjs'
out.write_text(text)
print(json.dumps({'bootstrap_sha256':hashlib.sha256(source).hexdigest(),'generated':str(out),'suite':'focal driver only'}))
