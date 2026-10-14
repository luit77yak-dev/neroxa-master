"""Sample runner resources every five seconds; no process names or credentials."""
import os,pathlib,json,time,shutil,signal
root=pathlib.Path(os.environ['RUNNER_TEMP']);out=pathlib.Path('audits/ab-auth/results/independent-resource-samples.json');running=True
samples=[]
def stop(*_):
 global running
 running=False
signal.signal(signal.SIGTERM,stop)
while running:
 disk=shutil.disk_usage(root);mem=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
 samples.append({'utcEpoch':int(time.time()),'diskUsedBytes':disk.used,'diskFreeBytes':disk.free,'memoryAvailableBytes':mem})
 e={'sampleIntervalSeconds':5,'sampledPeakDiskUsedBytes':max(x['diskUsedBytes'] for x in samples),'sampledMinMemoryAvailableBytes':min(x['memoryAvailableBytes'] for x in samples),'samples':samples}
 out.write_text(json.dumps(e,indent=2)+'\n');time.sleep(5)
