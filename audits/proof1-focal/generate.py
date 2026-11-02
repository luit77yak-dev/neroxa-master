"""Build a focused trusted-preparation harness from the byte-pinned bootstrap definitions."""
import hashlib
import json
import pathlib

root = pathlib.Path.cwd()
manifest = json.loads((root / 'audits/02a2/MANIFEST-02A2.json').read_text())
source = (root / 'tools/mission-02a3/run.mjs').read_bytes()
buyer = json.loads((root / 'audits/02a5/BUYER-PRE-GATE-MANIFEST.json').read_text())
assert hashlib.sha256(source).hexdigest() == buyer['bootstrap_sha256'], 'frozen bootstrap bytes changed'
text = source.decode()
marker = "try{if(!['master','legacy'].includes(profile)"
assert text.count(marker) == 1
prefix = text.split(marker, 1)[0]
assert "function masterFixture()" in prefix and "const sql=" in prefix and "const ids=" in prefix
suffix = r'''
try {
 if(profile!=='master'||!project?.startsWith('neroxa-02a3-')||!work)throw Error('Disposable explicit master context required');
 db='supabase_db_'+project;
 const inspect=JSON.parse(execFileSync('docker',['inspect',db],{encoding:'utf8'}))[0];
 for(const bindings of Object.values(inspect.HostConfig.PortBindings??{}))for(const binding of bindings??[])if(binding.HostIp!=='127.0.0.1')throw Error('Non-loopback database bind');
 env={};
 for(const line of fs.readFileSync(path.join(work,'status.private.env'),'utf8').split('\n')){const m=line.match(/^([A-Z_]+)="(.*)"$/);if(m)env[m[1]]=m[2];}
 url=env.API_URL;
 if(!url||new URL(url).hostname!=='127.0.0.1'||!env.ANON_KEY||!env.SERVICE_ROLE_KEY)throw Error('Local service identity/configuration incomplete');
 services.admin=createClient(url,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 report.versions={postgres:sql('SELECT version();'),node:process.version};
 report.stage='verified synthetic schema and tenant fixtures';
 execFileSync('python3',['tools/ab-auth/build_schema.py',path.join(work,'baseline.sql')],{stdio:'inherit'});
 sql(fs.readFileSync(path.join(work,'baseline.sql'),'utf8'));
 const schemaManifest=JSON.parse(fs.readFileSync('audits/02a2/MANIFEST-02A2.json'));
 for(const item of schemaManifest.masterProfile.predecessorOrder){const bytes=fs.readFileSync(item.path);if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Predecessor hash mismatch');sql(bytes.toString());}
 for(const alias of ['admin_A','admin_B','admin_C']){
   const email=alias.toLowerCase()+'@proof1.synthetic.invalid';
   const made=await services.admin.auth.admin.createUser({email,password:crypto.randomBytes(24).toString('base64url'),email_confirm:true});
   if(made.error)throw Error('Synthetic fixture identity creation failed: '+made.error.code);
   people[alias]={id:made.data.user.id};
 }
 masterFixture();
 report.stage='three focal assertions';
 const {proof1Focal}=await import('../../audits/proof1-focal/driver.mjs');
 await proof1Focal({sql,q,ids,people,services,env,url,report,api,rpc,crypto,fs,sleep});
 report.status='PASS PROVA1_FOCAL';
} catch(e) {report.status='FAIL';report.error={stage:report.stage,message:String(e.message).slice(0,220)};}
finally {for(const p of Object.values(people))if(p.client)await p.client.removeAllChannels().catch(()=>{});console.log('PROVA1_FOCAL_RESULT='+JSON.stringify(report));}
process.exitCode=report.status==='PASS PROVA1_FOCAL'?0:1;
'''
out = root / 'tools/mission-02a3/proof1-focal-generated.private.mjs'
out.write_text(prefix + suffix)
print(json.dumps({'bootstrap_sha256': hashlib.sha256(source).hexdigest(), 'generated': str(out), 'suite': 'three focal assertions only; privileged setup and snapshots'}))
