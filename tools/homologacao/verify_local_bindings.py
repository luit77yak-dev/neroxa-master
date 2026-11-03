#!/usr/bin/env python3
"""Fail closed on effective published addresses, not only Docker request metadata."""
import json
import os
import subprocess

def docker(*args):
    r=subprocess.run(["docker","--host=unix:///var/run/docker.sock",*args],
                     stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False,timeout=15)
    if r.returncode:raise RuntimeError("Docker scope verification failed")
    return r.stdout.decode()

project=os.environ["AB_PROJECT"]
assert os.environ.get("GITHUB_ACTIONS")=="true"
assert os.environ.get("RUNNER_ENVIRONMENT")=="github-hosted"
assert project=="neroxa-02a3-"+os.environ["MISSION_RUN_ID"]+"-buyer"
network=os.environ["AB_NETWORK"]
assert network=="neroxa-02a5-"+os.environ["MISSION_RUN_ID"]+"-buyer"
net=json.loads(docker("network","inspect",network))[0]
assert net["Driver"]=="bridge" and net["Options"].get(
    "com.docker.network.bridge.host_binding_ipv4")=="127.0.0.1", "Bridge loopback default missing"
names=[x.strip() for x in docker("ps","--format","{{.Names}}",
    "--filter","label=com.supabase.cli.project="+project).splitlines() if x.strip()]
assert len(names)==6,("Unexpected service count",len(names))
published=0; dbpublished=0
for name in names:
    assert name.endswith("_"+project), "Container outside disposable project"
    obj=json.loads(docker("inspect",name))[0]
    assert obj["Config"]["Labels"].get("com.supabase.cli.project")==project
    assert obj["State"]["Running"] is True
    requested=obj["HostConfig"].get("PortBindings") or {}
    effective=obj["NetworkSettings"].get("Ports") or {}
    container_pub=0
    for port,bindings in requested.items():
        assert isinstance(bindings,list) and bindings,"Empty requested published binding"
        for b in bindings:
            assert b.get("HostIp","") in ("","127.0.0.1"),"Unsafe requested address "+name+" "+port
        actual=effective.get(port)
        assert isinstance(actual,list) and actual,"Published port lacks effective host address"
        for b in actual:
            assert b.get("HostIp")=="127.0.0.1","Unsafe effective host address "+name+" "+port
            assert str(b.get("HostPort","")).isdigit(),"Published port missing actual host port"
        container_pub+=1
    for port,actual in effective.items():
        if actual is None:continue
        assert port in requested,"Unexpected implicit publication "+name+" "+port
        for b in actual:
            assert b.get("HostIp")=="127.0.0.1","Non-loopback effective exposure"
    if name.startswith("supabase_db_"):
        assert container_pub>0,"Database port not bound locally"
        dbpublished+=1
    published+=container_pub
    print("LOCAL_BINDING_PROOF="+json.dumps({
        "service":name.split("_"+project)[0],
        "published_port_count":container_pub,
        "requested_ips":sorted(set(b.get("HostIp","") for v in requested.values() for b in v)),
        "effective_ips":sorted(set(b.get("HostIp") for v in effective.values()
                                   if v for b in v)),
        "status":"PASS"
    },sort_keys=True))
assert dbpublished==1 and published>0
print("LOOPBACK_ONLY=PASS; checked 6 services, Docker effective host bindings and bridge default")
