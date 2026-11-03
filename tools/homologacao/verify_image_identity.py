#!/usr/bin/env python3
"""Validate historical CONFIG sha256 through immutable registry MANIFEST digest.

Docker's containerd image store may report the manifest digest as image .Id.
Never silently accept an alternate identity: the registry config MUST match
the historical approved config sha256, and running container IDs MUST match
the locally inspected content-addressed image.
"""
import json
import os
import pathlib
import subprocess
import sys

ROOT=pathlib.Path(__file__).resolve().parents[2]
EXPECTED=json.loads((ROOT/"audits/02a5/EXPECTED-IMAGES.json").read_text())
PG_REF="supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5"
PG_TAG="supabase/postgres:17.11.0.004"

def command(*args):
    r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=65,check=False)
    if r.returncode:
        raise RuntimeError("image identity command blocked ("+args[0]+", exit "+str(r.returncode)+")")
    return r.stdout

def repository(ref):
    name=ref.split("@",1)[0]
    last=name.rsplit("/",1)[-1]
    if ":" in last:name=name.rsplit(":",1)[0]
    return name

def image_manifest_config(ref, depth=0):
    assert depth<3, "Unexpected nested registry index"
    manifest=json.loads(command("docker","buildx","imagetools","inspect","--raw",ref))
    config=manifest.get("config")
    if isinstance(config,dict):
        assert len(manifest.get("layers",[]))>0,"Empty image manifest"
        return config["digest"]
    matches=[m for m in manifest.get("manifests",[])
             if m.get("platform",{}).get("os")=="linux"
             and m.get("platform",{}).get("architecture")=="amd64"]
    assert len(matches)==1,"Expected exactly one linux/amd64 image manifest"
    return image_manifest_config(repository(ref)+"@"+matches[0]["digest"],depth+1)

def inspect_image(ref):
    value=json.loads(command("docker","--host=unix:///var/run/docker.sock",
                             "image","inspect",ref))
    assert len(value)==1
    return value[0]

def verify_one(tag, config_digest, container_id=None, preferred_ref=None):
    image=inspect_image(preferred_ref or tag)
    assert image["Architecture"]=="amd64" and image["Os"]=="linux"
    image_id=image["Id"]
    if container_id is not None:
        assert image_id==container_id,"Runtime container points to a different image"
    refs=[preferred_ref] if preferred_ref else image.get("RepoDigests") or []
    assert refs,"No immutable registry digest for "+tag
    confirmed=False
    for ref in refs:
        if "@sha256:" not in ref or repository(ref)!=repository(tag):
            continue
        cfg=image_manifest_config(ref)
        if cfg!=config_digest:
            continue
        registered_manifest="sha256:"+ref.split("@sha256:",1)[1]
        assert image_id in {config_digest,registered_manifest},(
            "Image ID neither approved config nor pinned manifest for "+tag)
        confirmed=True
        print("IMAGE_CONFIG_ID=PASS name="+tag+
              " config="+config_digest[:19]+" manifest="+registered_manifest[:19]+
              " local="+image_id[:19])
        break
    assert confirmed,"No immutable manifest matches approved CONFIG digest: "+tag

def main():
    assert os.environ.get("GITHUB_ACTIONS")=="true"
    assert os.environ.get("RUNNER_ENVIRONMENT")=="github-hosted"
    assert os.environ.get("AB_PROJECT","").startswith("neroxa-02a3-")
    mode=sys.argv[1] if len(sys.argv)==2 else ""
    assert mode in ("postgres","stack")
    if mode=="postgres":
        assert PG_TAG in EXPECTED
        verify_one(PG_TAG,EXPECTED[PG_TAG],preferred_ref=PG_REF)
        print("POSTGRES_DUAL_ID_VERIFIED=PASS; sha256 pin and CONFIG digest both anchored")
        return
    project=os.environ["AB_PROJECT"]
    seen={}
    for line in command("docker","--host=unix:///var/run/docker.sock","ps","--format","{{json .}}").decode().splitlines():
        v=json.loads(line)
        if v["Names"].endswith("_"+project):
            assert v["Image"] not in seen,"Duplicate service image"
            id_=command("docker","--host=unix:///var/run/docker.sock","inspect",
                        v["Names"],"--format","{{.Image}}").decode().strip()
            seen[v["Image"]]=id_
    assert set(seen)==set(EXPECTED),(
        "Expected six services but found a different project image inventory",
        sorted(seen.keys()))
    for tag,legacy_config in EXPECTED.items():
        if tag==PG_TAG:
            verify_one(tag,legacy_config,seen[tag],preferred_ref=PG_REF)
        else:
            verify_one(tag,legacy_config,seen[tag])
    print("LOCKED_LOCAL_IMAGES=PASS; six historical CONFIG digests confirmed via immutable manifests")
    print("IMAGE_STORE_FORMAT=dual-ID-compatible; content pin NOT relaxed")

if __name__=="__main__":
    main()
