#!/usr/bin/env python3
"""F02 independent disposable derived driver, exact frozen SQL sources."""
import hashlib,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
source=ROOT/"tools/mission-02a3/run.mjs"
target=ROOT/"tools/mission-02a3/buyer-generated.private.mjs"
baseline=hashlib.sha256(source.read_bytes()).hexdigest()
for file in ("tools/mission-02a5/generate-buyer-run.py",
             "audits/02a5/f02-amendment/generate.py"):
    subprocess.run([sys.executable,str(ROOT/file)],cwd=ROOT,check=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==baseline
script=target.read_text()
old="for(const binds of Object.values(inspect.HostConfig.PortBindings??{}))for(const b of binds??[])if(b.HostIp!=='127.0.0.1')throw Error('Non-loopback database bind');"
assert script.count(old)==1, "Original bootstrap guard changed"
script=script.replace(old,"execFileSync('python3',['tools/homologacao/verify_local_bindings.py'],{stdio:'inherit'});")
for expected in ("await secureAmendment(","await integratedCheckout(","await revokeDisposable("):
    assert script.count(expected)==1,expected
target.write_text(script)
print("F02_DERIVED_DRIVER=PASS; source_sha256="+baseline+"; F01=NOT_RUN; SQL=LOCAL_ONLY")
