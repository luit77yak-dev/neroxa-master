"""Reuse the exact reviewed 02A3 bootstrap; keep its original bytes unchanged."""
import pathlib,json,hashlib
root=pathlib.Path.cwd();m=json.loads((root/'audits/02a5/BUYER-PRE-GATE-MANIFEST.json').read_text())
p=root/'tools/mission-02a3/run.mjs';raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==m['bootstrap_sha256'];s=raw.decode()
# Preserve the same native platform and fixture bootstrap; compose old controls
# into one clone, avoiding five repeated stacks and duplicated baseline tests.
s=s.replace("if(process.env.MISSION02A4_STORAGE==='true'){const {imageStorage}=await import('../mission-02a4/storage.mjs');await imageStorage({services,people,ids,check,report,env,url,sql,q});}","")
needle="report.realtimeCoverage='NOT RUN in this matrix batch; separate focused job for M, legacy quarantine intentionally suspends order access';"
assert s.count(needle)==1
hook="""
 const context={sql,q,ids,people,services,env,url,report,api,rpc,check,digest,empty,one,fs,crypto,work,sleep,profile};
 const {f01Controls}=await import('../f01/controls.mjs');await f01Controls(context);
 const {imageStorage}=await import('../mission-02a4/storage.mjs');await imageStorage(context);
 const {addonControls}=await import('../mission-02a4/addons.mjs');await addonControls(context);
 await nativeRealtime(context);
 report.realtimeCoverage='native UPDATE A1 positive, A2/C negative, grant revoke, logout retained and reconnect; INSERT/DELETE events not covered';
"""
s=s.replace(needle,hook)
s=s.replace("'superuser',current_setting('is_superuser')", "'superuser',current_setting('is_superuser'),'bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)")
s=s.replace("r.body?.superuser==='off'", "r.body?.superuser==='off'&&r.body?.bypassrls===false")

s=s.replace("fs.mkdirSync('audits/02a3/results',{recursive:true});fs.writeFileSync('audits/02a3/results/'+profile+'.json',", "fs.mkdirSync(path.join(work,'f01-results'),{recursive:true});fs.writeFileSync(path.join(work,'f01-results',profile+'.json'),")

# Replace the initial A/B-only Realtime helper with an exact local derivative
# adding C to the initial isolation observation; logout/reconnect retains live B.
s=s.replace("from './native-realtime.mjs'","from './f01-native-realtime.private.mjs'")
r=(root/'tools/mission-02a3/native-realtime.mjs').read_text();a=r.index(' const reconnect=');pre,post=r[:a],r[a:]
pre=pre.replace('events={A:[],B:[]}','events={A:[],B:[],C:[]}').replace("['A','B']","['A','B','C']").replace('serverReady.size<2','serverReady.size<3').replace('expected:2','expected:3')
pre=pre.replace('${q(ids.Aorder)},${q(ids.Border)}','${q(ids.Aorder)},${q(ids.Border)},${q(ids.Corder)}')
needle="if(events.B.length)(report.p0s??=[]).push"
assert needle in pre
pre=pre.replace(needle,"emit({name:'Realtime C private event',phase:'candidate',status:events.A.length===0?'BLOCKED':events.C.length===0?'PASS':'FAIL',events:events.C.length});if(events.C.length)(report.p0s??=[]).push({name:'Realtime C private event',actor:'admin_A',target:'C',rows:events.C.length});"+needle)
(root/'tools/mission-02a3/f01-native-realtime.private.mjs').write_text(pre+post)
(root/'tools/mission-02a3/f01-generated.private.mjs').write_text(s)
print('F01 derivative generated; original bootstrap preserved; one local clone, no service or SQL executed by generator')
