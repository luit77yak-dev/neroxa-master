import os,json,pathlib,shutil,subprocess
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted'
assert pathlib.Path.cwd().as_posix().startswith('/home/runner/')
driver=subprocess.check_output(['docker','info','--format','{{.Driver}}'],text=True).strip()
free=shutil.disk_usage(os.environ['RUNNER_TEMP']).free
mem=int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
# overlay2 estimate: 8GiB image download/extraction + 5GiB volumes/services + 3GiB
# dependencies/logs + 10GiB safety; vfs cannot use this bound and is rejected.
r={'status':'PASS' if driver!='vfs' and free>=28*1024**3 and mem>=6*1024**3 and os.cpu_count()>=2 else 'BLOCKED','driver':driver,'free_bytes':free,'required_free_bytes':28*1024**3,'estimateGiB':{'images_peak':8,'services_volumes':5,'dependencies_logs':3,'safety':10},'available_memory_bytes':mem,'cpus':os.cpu_count(),'free_runner_basis':'PUBLIC repository; standard ubuntu-latest only; no artifacts/cache/larger runner'}
print('RESOURCE_PREFLIGHT='+json.dumps(r));assert r['status']=='PASS','BLOCKED resource preflight, no pull/start'
