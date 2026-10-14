"""Private per-stack EC signing keys. CLI 2.120.0 default EC key is shared."""
import os,pathlib,re,secrets,json,subprocess
p=pathlib.Path(os.environ['AB_WORKDIR'])/'supabase/config.toml';s=p.read_text();secret=secrets.token_urlsafe(48)
# Node is already installed by the workflow. All output is captured privately.
script=r'''
const {generateKeyPairSync,randomUUID,sign}=require('node:crypto');
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const kid=randomUUID();const jwk={...privateKey.export({format:'jwk'}),kid,alg:'ES256',use:'sig',key_ops:['sign','verify']};
const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const jwt=role=>{const h=enc({alg:'ES256',typ:'JWT',kid}),p=enc({role,iss:'supabase-demo',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400});const input=h+'.'+p;return input+'.'+sign('sha256',Buffer.from(input),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');};
process.stdout.write(JSON.stringify({keys:[jwk],anon:jwt('anon'),service:jwt('service_role')}));
'''
v=json.loads(subprocess.check_output(['node','-e',script],text=True));key=p.parent/'dr-signing.private.json';key.write_text(json.dumps(v['keys']));key.chmod(0o600)
# Replace the commented template entry rather than duplicate active signing_keys_path.
s=re.sub(r'^#?\s*signing_keys_path\s*=.*$','',s,flags=re.M)
s=re.sub(r'^\[auth\]\s*$', '[auth]\nsigning_keys_path = "dr-signing.private.json"\njwt_secret = "'+secret+'"\nanon_key = "'+v['anon']+'"\nservice_role_key = "'+v['service']+'"',s,flags=re.M)
if os.environ['DR_SIDE']=='target':s=re.sub(r'\b(54[0-9]{3})\b',lambda m:str(int(m[1])+1000),s)
p.write_text(s);p.chmod(0o600)
print('Independent private EC signing key and matching API JWTs configured; no shared CLI default signing key.')
