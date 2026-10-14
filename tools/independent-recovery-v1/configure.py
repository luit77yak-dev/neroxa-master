"""Two unlinked native stacks; CLI 2.120.0 supports auth secret configuration."""
import os,pathlib,re,secrets,json,base64,hmac,hashlib,time
p=pathlib.Path(os.environ['AB_WORKDIR'])/'supabase/config.toml';s=p.read_text()
secret=secrets.token_urlsafe(48)
def enc(x):return base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).rstrip(b'=')
def jwt(role):
 h=enc({'alg':'HS256','typ':'JWT'});b=enc({'role':role,'iss':'supabase-demo','iat':int(time.time()),'exp':int(time.time())+86400});t=h+b'.'+b
 return (t+b'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),t,hashlib.sha256).digest()).rstrip(b'=')).decode()
s=re.sub(r'^\[auth\]\s*$', '[auth]\njwt_secret = "'+secret+'"\nanon_key = "'+jwt('anon')+'"\nservice_role_key = "'+jwt('service_role')+'"',s,flags=re.M)
if os.environ['DR_SIDE']=='target':
 s=re.sub(r'\b(54[0-9]{3})\b',lambda m:str(int(m[1])+1000),s)
p.write_text(s);p.chmod(0o600)
print('Synthetic signing credentials configured privately; no remote link or application SQL.')
