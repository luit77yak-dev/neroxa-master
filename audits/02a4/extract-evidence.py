from pathlib import Path
import json,csv,collections
root=Path(__file__).parent;e=root/'evidence';index=[]
for p in sorted(e.glob('*.log')):
 checks=[];summary=None
 for line in p.read_text(errors='replace').splitlines():
  for marker in ('MISSION02A3_SUMMARY=','REALTIME_CHECK=','CHECK='):
   if marker not in line:continue
   try:obj=json.loads(line.split(marker,1)[1])
   except ValueError:break
   if marker=='MISSION02A3_SUMMARY=':summary=obj
   else:checks.append(obj)
   break
 if not checks and not summary:continue
 (e/(p.stem+'-checks.json')).write_text(json.dumps(checks,indent=2)+'\n')
 if summary:(e/(p.stem+'-summary.json')).write_text(json.dumps(summary,indent=2)+'\n')
 index.append({'name':p.stem,'checks':len(checks),'byPhase':dict(collections.Counter(x.get('phase','unknown')+':'+x['status'] for x in checks)),'summary':bool(summary),'cleanup':'CLEANUP=PASS' in p.read_text()})
 for kind in ('positivos','negativos'):
  with (root/(p.stem+'-'+kind+'.csv')).open('w',newline='') as f:
   w=csv.writer(f,lineterminator='\n');w.writerow(['phase','case','actor','target','operation','expected','status','HTTP','SQLSTATE','rows','state_unchanged'])
   for x in checks:
    if ('DENY' in x.get('expected',''))!=(kind=='negativos'):continue
    w.writerow([x.get(k,'') for k in ['phase','name','actor','target','operation','expected','status','http','sqlstate','observedRows','stateUnchanged']])
(e/'execution-index.json').write_text(json.dumps(index,indent=2)+'\n');print(json.dumps(index,indent=2))
