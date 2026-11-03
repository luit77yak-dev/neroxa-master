#!/usr/bin/env python3
"""Compose the proven F01 runner in a derived disposable copy. Do not modify frozen sources."""
import hashlib
import pathlib
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=ROOT/"tools/mission-02a3/run.mjs"
TARGET=ROOT/"tools/mission-02a3/f01-generated.private.mjs"
pre=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
subprocess.run([sys.executable,str(ROOT/"tools/f01/generate.py")],cwd=ROOT,check=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==pre, "Original bootstrap mutated"
s=TARGET.read_text()
needle="if(process.env.MISSION_F01_FOCUS==='realtime-containment')"
assert s.count(needle)==1, "Frozen generator focus gate drift"
hook="""if(process.env.MISSION_F01_FOCUS==='f01-native-minimal'){
 const ctx={sql,q,ids,people,services,env,url,report,api,rpc,check,digest,empty,one,fs,crypto,work,sleep,profile};
 const {f01MinimalControls}=await import('../homologacao/f01_minimal_controls.mjs');
 await f01MinimalControls(ctx);
 const {realtimeContainment}=await import('../f01/realtime-containment.mjs');
 await realtimeContainment(ctx);
 if(report.f01Containment?.status!=='PASS CONTAINMENT ONLY')throw Error('F01 containment was not PASS');
 report.realtimeCoverage='private Postgres Changes contained; REST polling preserved';
}else """
s=s.replace(needle,hook+needle)
assert s.count("MISSION_F01_FOCUS==='f01-native-minimal'")==1
old_guard="for(const binds of Object.values(inspect.HostConfig.PortBindings??{}))for(const b of binds??[])if(b.HostIp!=='127.0.0.1')throw Error('Non-loopback database bind');"
assert s.count(old_guard)==1, "Frozen Docker preflight guard drift"
# Supersede the overly strict requested-IP-only metadata check with a
# stronger fail-closed verification of both requested and EFFECTIVE binds.
s=s.replace(old_guard,"execFileSync('python3',['tools/homologacao/verify_local_bindings.py'],{stdio:'inherit'});")
TARGET.write_text(s)
print("F01_DERIVED_DRIVER=PASS; original source SHA256="+pre+"; F02=EXCLUDED")
