import json,pathlib,sys,collections
p=pathlib.Path(sys.argv[1]);report={}
if p.exists():
 for line in p.read_text(errors='replace').splitlines():
  if 'MISSION02A5_FINAL={' in line:
   report=json.loads(line.split('MISSION02A5_FINAL=',1)[1])
cases=(report.get('amendment') or {}).get('cases') or []
rows=[]
for n in range(1,19):
 id=f'SEC-{n:02d}';sub=[x for x in cases if x['id']==id];states={x['status'] for x in sub};status=next((x for x in ['FAIL','BLOCKED','NOT RUN','PASS'] if x in states),'NOT RUN');row=dict(id=id,status=status,observations=len(sub),official_contract='BLOCKED: official SEC definitions not supplied; mapping is provisional',details=sub);rows.append(row);print('F02_SEC_RESULT='+json.dumps(row))
print('F02_SEC_SUMMARY='+json.dumps(dict(source=report.get('source'),scope='PRE-GATE disposable provisional SEC mapping; NOT commercial approval',counts=dict(collections.Counter(x['status'] for x in rows)),gate='BLOCKED',post_gate=(report.get('revocation') or {}).get('status','NOT RUN'),f01='OPEN',f02='OPEN',commercial='NOT RELEASED',runner_status=report.get('status'),stage=report.get('stage'),error=report.get('error'))))

# A completed forensics report is mandatory; tee/cleanup cannot mask a failed Node process.
sys.exit(0 if report.get('status')=='PASS PARTIAL PRE-GATE' and (report.get('amendment') or {}).get('status','').startswith('PASS secure recut') and (report.get('revocation') or {}).get('status')=='PASS DISPOSABLE REVOCATION ONLY' else 1)
