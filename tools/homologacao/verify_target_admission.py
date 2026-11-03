#!/usr/bin/env python3
"""F01/F02 homologation: closed target-bound admission static contract only."""
import hashlib
import json
import pathlib
import subprocess

ROOT=pathlib.Path(__file__).resolve().parents[2]
POLICY=ROOT/"audits/homologacao-f01-f02/target-admission.CLOSED.json"
SOURCE="b8a2087ad96dde4f90c04a7c10c31281d663e9f8"
INITIAL_AUDIT="f9465fe8fb5fa525d3c3781674e8e0b6d67bed99"
TARGET="nvbmzdgfretwnkdfqcap"
HUB="iefaoaqzltvpfabyeelj"

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def verify():
    subprocess.run(["git","merge-base","--is-ancestor",INITIAL_AUDIT,"HEAD"],
                   cwd=ROOT,check=True,capture_output=True)
    delta=set(subprocess.check_output(["git","diff","--name-only",INITIAL_AUDIT,"HEAD"],
                    cwd=ROOT,text=True).splitlines())
    expected={
      "audits/homologacao-f01-f02/target-admission.CLOSED.json",
      "audits/homologacao-f01-f02/ADMISSION-DECISION.md",
      "tools/homologacao/verify_target_admission.py",
      ".github/workflows/f01-f02-target-admission-static.yml"
    }
    assert delta==expected,sorted(delta^expected)
    p=json.loads(POLICY.read_text())
    assert p["decision"]=="STATIC_PREPARATION_ONLY"
    t=p["target"]
    assert t["project_ref"]==TARGET and t["project_ref"]!=HUB
    assert t["name"]=="neroxa-homologacao"
    assert t["region"]=="sa-east-1"
    assert t["postgres_major"]=="17"
    assert t["status_observed"]=="ACTIVE_HEALTHY"
    assert t["business_relations_observed"]==0 and t["migrations_observed"]==0
    assert t["extensions_observed"]["pgcrypto"]["installed_version"]=="1.3"
    assert t["extensions_observed"]["uuid-ossp"]["installed_version"]=="1.1"
    assert set(t["application_schemas_checked"])=={"public","private","neroxa_private"}
    source=p["frozen_source"]
    assert source["release_head"]==SOURCE
    assert source["source_target_project"]==HUB
    assert source["source_retargeting_authorized"] is False
    assert source["unit_count"]==33
    catalog=ROOT/"audits/ab-auth/master-catalog-20261009.json"
    assert sha256(catalog)==source["baseline_catalog_sha256"]
    assert len(json.loads(catalog.read_text())["relations"])==34
    manifest=json.loads((ROOT/source["release_manifest"]).read_text())
    assert manifest["target_project"]==HUB
    assert manifest["target_project"]!=TARGET
    assert manifest["execution_authorized"] is False and manifest["approval"] is None
    assert len(manifest["units"])==33
    for u in manifest["units"]:
        assert sha256(ROOT/u["path"])==u["sha256"]
        assert sha256(ROOT/u["source_path"])==u["source_sha256"]
    a=p["authorization"]
    assert a["state"]=="CLOSED"
    assert all(a[k] is None for k in (
        "founder_approval","approved_sha","approved_scope","reviewed_operator","approved_window"))
    assert all(a[k] is False for k in (
        "hosted_preflight","sql_read_only","schema_install","sql_release",
        "rpc_revoke","hosted_server","production_publish","paid_services"))
    transport=p["transport"]
    assert transport["state"]=="NOT_ADMITTED"
    assert transport["pinned_hostname_verified_by_tls"] is False
    assert transport["session_identity_verified"] is False
    assert all(transport[k] is None for k in (
        "ca_sha256","credential_source","signing_public_key","signed_grant",
        "environment_name","runtime_driver"))
    g=p["separate_gates"]
    assert set(g)=={"F01","F02"}
    assert g["F01"]["local_evidence_run"]==40212763636
    assert g["F02"]["local_evidence_run"]==40214203640
    assert all(g[k]["status"]=="BLOCKED_HOSTED" and
               g[k]["server_execution_authorized"] is False
               for k in ("F01","F02"))
    assert g["F02"]["consumer_cut_receipt"] is None
    assert p["production_equivalence"]=="NOT ESTABLISHED"
    assert p["commercial"]=="NOT AUTHORIZED"
    print("ADMISSION_STATIC=PASS; target=nvbmzdgfretwnkdfqcap; legacy=iefaoaqzltvpfabyeelj")
    print("RELEASE_33_HASHES=PASS; HISTORICAL_CATALOG_SHA256=PASS")
    print("F01=BLOCKED_HOSTED; F02=BLOCKED_HOSTED; CONSUMER_CUT=NOT_PROVEN")
    print("AUTHORIZATION=CLOSED; SQL_EXECUTION=NOT_RUN; TLS_CONNECT=NOT_RUN; DEPLOY=NOT_AUTHORIZED")

if __name__=="__main__":
    verify()
