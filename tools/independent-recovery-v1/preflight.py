"""CI-only resource gate, before downloads. No credential or environment dump."""
import json,os,pathlib,shutil,socket,subprocess
r=pathlib.Path(os.environ['RUNNER_TEMP']); total,used,free=shutil.disk_usage(r)
# One shared image set 6 GiB, two data volumes 4 GiB each, private archives
# 2 GiB, package/build/browser 5 GiB, safety margin 5 GiB. Measured gate 26 GiB.
need=26*1024**3
mem=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
cpus=os.cpu_count(); ports=[54321,54322,55321,55322,56321]
for port in ports:
 with socket.socket() as s:s.bind(('127.0.0.1',port))
e={'freeBytes':free,'requiredBytes':need,'availableMemoryBytes':mem,'requiredMemoryBytes':6*1024**3,'cpus':cpus,'ports':ports,'imagesGiB':6,'volumesGiB':8,'archivesGiB':2,'buildGiB':5,'marginGiB':5,'passed':free>=need and mem>=6*1024**3 and cpus>=2}
p=pathlib.Path('audits/ab-auth/results');p.mkdir(parents=True,exist_ok=True);(p/'independent-resources.json').write_text(json.dumps(e,indent=2)+'\n')
print(json.dumps(e));assert e['passed'],'Insufficient resources: stop before downloads; use larger free disposable runner or reduce verified platform scope.'
