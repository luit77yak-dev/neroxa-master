"""Print fixed sanitized platform diagnostics, never raw startup logs or keys."""
import os,pathlib,re,json
r=pathlib.Path(os.environ['AB_WORKDIR'])
for name in ['start.private.log','proxy.private.log']:
 p=r/name
 if p.exists():
  rows=[]
  for line in p.read_text(errors='replace').splitlines():
   if re.search(r'ERROR|failed|502|loopback-proxy',line,re.I):
    if re.search(r'password|token|secret|key|eyJ',line,re.I):line='Sensitive diagnostic withheld'
    line=re.sub(r'https?://\S+','<url>',line)
    rows.append(line[:240])
  print(json.dumps({'source':name,'errors':rows[-6:]}))
