#!/usr/bin/env python3
"""Recover the one audited RG02 ciphertext artifact on a protected runner.
No production DB connection, no source global-role replay, no GO inference.
All private plaintext is confined to host/container tmpfs, never stdout.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import zipfile
from collections import Counter

from rg02_compare_runtime import extract
from rg02_residual_review import residual_report
from rg02_targeted_acl import analyze as analyze_direct_acl
from rg02_tuple_witness_preflight import PRIVILEGES
from rg02_schema_focal import (SCHEMA_CATALOG_SQL, classify, missing_app_schema,
                               experiment_sql, experiment_result)

RUN = "45909419074"
COMMIT = "3d3f8301666441fa1d9ce54e942d70464d19081a"
DIGEST = "3c30394da65911cd69642b3b4bb7f9d0c6a85e4a29660f1597c9d7d0f8786eaf"
ZIP_BYTES = 380354
CONFIRMATION = "RG02_RESTORE_CAPTURE_45909419074"
PROJECT = "iefaoaqzltvpfabyeelj"
ROLE = "neroxa_rg02_snapshot_reader"
IMAGE = "supabase/postgres:17.12.0.002"
ROOT = Path(__file__).resolve().parent
DB = "neroxa_rg02_probe"
FILES = {
    "dump": ("dump.custom.gpg", "database.dump", 3 * 1024**3),
    "globals": ("global-catalog.json.gpg", "source.globals.json", 8 * 1024**2),
    "tuples": ("source-tuple-witness.jsonl.gpg", "source.tuples.jsonl", 64 * 1024**2),
}
DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
HEX = re.compile(r"[0-9a-f]{64}\Z")


class Blocked(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Blocked(code)


def safe_env():
    return {k: v for k, v in os.environ.items()
            if k in ("PATH", "HOME", "LANG", "LC_ALL", "TZ")}


def cmd(argv, code, *, data=None, infile=None, outfile=None, timeout=60,
        env=None):
    # Never print argv, stderr, stdout, or raw exceptions.
    with open(os.devnull, "rb") as nullin:
        result = subprocess.run(argv, input=data,
            stdin=(None if data is not None else (infile or nullin)),
            stdout=outfile or subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout, env=safe_env() if env is None else env)
    if result.returncode:
        error = result.stderr.lower()
        for phrase, label in (
            (b"permission denied", "PERMISSION"),
            (b"must be owner", "OWNER"),
            (b"does not exist", "MISSING"),
            (b"already exists", "EXISTS"),
            (b"duplicate key", "DUPLICATE"),
            (b"invalid", "INVALID"),
        ):
            if phrase in error:
                print("RG02_CHILD_CATEGORY=" + label, flush=True)
                break
        raise Blocked(code)
    return result.stdout


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def strict_json(raw):
    def unique(pairs):
        d = {}
        for key, value in pairs:
            need(key not in d, "DUPLICATE_JSON_FIELD")
            d[key] = value
        return d
    return json.loads(raw, object_pairs_hook=unique)


def decrypt(src, dst, secret, home, max_bytes):
    with dst.open("xb") as out:
        cmd(["gpg", "--homedir", str(home), "--batch", "--no-tty",
             "--pinentry-mode", "loopback", "--passphrase-fd", "0",
             "--no-symkey-cache", "--decrypt", str(src)],
            "GPG_DECRYPT", data=secret+b"\n", outfile=out, timeout=90)
    need(0 < dst.stat().st_size <= max_bytes, "DECRYPT_SIZE")


def read_archive(archive, secret, root, *, digest=DIGEST, size=ZIP_BYTES):
    need(archive.is_file() and not archive.is_symlink() and
         archive.stat().st_size == size and sha(archive) == digest, "ZIP_INTEGRITY")
    names = {"manifest.json.gpg", *(v[0] for v in FILES.values())}
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        need(len(infos) == 4 and {i.filename for i in infos} == names,
             "ZIP_ENTRIES")
        for i in infos:
            need(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16)
                 and 0 < i.file_size <= size, "ZIP_ENTRY")
            with z.open(i) as src, (root/i.filename).open("xb") as dst:
                shutil.copyfileobj(src, dst)
    home = root/"gpg"; home.mkdir(mode=0o700)
    manifest = root/"manifest.json"
    decrypt(root/"manifest.json.gpg", manifest, secret, home, 32768)
    m = strict_json(manifest.read_bytes())
    need(isinstance(m, dict) and all(m.get(k) == v for k, v in {
        "format": 1, "scope": "NEW_READ_ONLY_SAME_PREIMAGE_STAGED",
        "github_source_commit": COMMIT, "github_protected_run_id": RUN,
        "project_ref": PROJECT, "source_role": ROLE, "pg_major": 17,
        "COMMERCIAL_GO": "NO_GO",
        "snapshot_import_contract": "1 exporter + pg_dump snapshot + 2 imported PG17 sessions",
        "preimage_vs_old_backup": "DIFFERENT_NEW_PREIMAGE",
    }.items()), "MANIFEST_IDENTITY")
    need(isinstance(m.get("capture_id"), str) and
         re.fullmatch(r"[0-9a-f]{32}", m["capture_id"]), "CAPTURE_ID")
    records = m["encrypted_objects"]
    need(isinstance(records, dict) and set(records) == set(FILES), "MANIFEST_FILES")
    total = 0
    for key, (encrypted, plain, limit) in FILES.items():
        rec = records[key]
        need(isinstance(rec, dict) and type(rec.get("plain_bytes")) is int
             and 0 < rec["plain_bytes"] <= limit and
             type(rec.get("cipher_bytes")) is int and
             rec["cipher_bytes"] == (root/encrypted).stat().st_size and
             isinstance(rec.get("sha256"), str) and HEX.fullmatch(rec["sha256"]),
             "MANIFEST_RECORD")
        total += rec["plain_bytes"]
    need(shutil.disk_usage(root).free > total + 128*1024**2, "PRIVATE_SPACE")
    for key, (encrypted, plain, limit) in FILES.items():
        rec = records[key]
        decrypt(root/encrypted, root/plain, secret, home, rec["plain_bytes"])
        need((root/plain).stat().st_size == rec["plain_bytes"] and
             sha(root/plain) == rec["sha256"], "OBJECT_INTEGRITY")
    with (root/"database.dump").open("rb") as f:
        need(f.read(5) == b"PGDMP", "DUMP_FORMAT")
    source = parse_tuples(root/"source.tuples.jsonl")
    globals_doc = parse_globals(root/"source.globals.json")
    need(type(records["tuples"].get("rows")) is int and
         len(source) == records["tuples"]["rows"] ==
         m["private_witness_shape"]["rows"] and
         len(globals_doc["roles"]) == m["private_witness_shape"]["roles"] and
         ROLE in globals_doc["roles"], "SOURCE_WITNESS_COUNTS")
    print("RG02_PINNED_ARTIFACT_AND_MANIFEST=PASS", flush=True)
    return m, globals_doc, source


def parse_tuples(path):
    need(0 < path.stat().st_size <= 64*1024**2, "TUPLE_SIZE")
    result = {}
    with path.open("rb") as f:
        for line in f:
            row = strict_json(line)
            need(isinstance(row, list) and len(row) == 5, "TUPLE_SHAPE")
            role, kind, obj, privilege, value = row
            need(all(type(x) is str and x and "\x00" not in x
                     for x in (role, kind, obj, privilege)) and
                 kind in PRIVILEGES and privilege in PRIVILEGES[kind] and
                 (value is None or type(value) is bool), "TUPLE_FIELDS")
            key = tuple(row[:4])
            need(key not in result, "TUPLE_DUPLICATE")
            result[key] = value
            need(len(result) <= 250000, "TUPLE_LIMIT")
    need(bool(result), "TUPLE_EMPTY")
    return result


def parse_globals(path):
    need(0 < path.stat().st_size <= 8*1024**2, "GLOBALS_SIZE")
    d = strict_json(path.read_bytes())
    need(d.get("format_version") == 1 and
         d.get("scope") == "SOURCE_GLOBAL_CATALOG_IN_SAME_SNAPSHOT",
         "GLOBALS_FORMAT")
    flags = ("login", "superuser", "inherit", "create_role", "create_db",
             "replication", "bypass_rls")
    roles = {}
    need(isinstance(d["roles"], list) and bool(d["roles"]), "GLOBALS_ROLES")
    for role in d["roles"]:
        name = role["name"]
        need(type(name) is str and 0 < len(name.encode()) <= 63 and
             "\x00" not in name and name not in roles and
             all(type(role.get(k)) is bool for k in flags), "ROLE_FIELDS")
        roles[name] = tuple(role[k] for k in flags)
    memberships = set()
    need(isinstance(d["memberships"], list), "MEMBERSHIP_FIELDS")
    for edge in d["memberships"]:
        need(edge["role"] in roles and edge["member"] in roles and
             (edge["grantor"] is None or edge["grantor"] in roles) and
             all(type(edge.get(k)) is bool for k in ("admin","inherit","set")),
             "MEMBERSHIP_FIELDS")
        value = tuple(edge[k] for k in ("role","member","grantor","admin","inherit","set"))
        need(value not in memberships, "MEMBERSHIP_DUPLICATE")
        memberships.add(value)
    acls = {}
    need(isinstance(d["parameter_acls"], list), "PARAMETER_FIELDS")
    for row in d["parameter_acls"]:
        name, acl = row["parameter"], row["acl"]
        need(type(name) is str and name not in acls and
             (acl is None or type(acl) is str), "PARAMETER_FIELDS")
        acls[name] = acl
    return {"roles": roles, "memberships": memberships, "parameters": acls}


def role_sql(source_roles, baseline):
    need(isinstance(baseline, list) and all(type(x) is str for x in baseline)
         and {"postgres", "supabase_admin"} <= set(baseline), "BASELINE_ROLES")
    missing = set(source_roles) - set(baseline)
    need(not any(n.lower().startswith("pg_") or any(ord(c)<32 for c in n)
                 for n in missing), "MISSING_SYSTEM_ROLE")
    return "".join('CREATE ROLE "'+n.replace('"','""')+
                   '" WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE '
                   'NOREPLICATION NOBYPASSRLS NOINHERIT;\n'
                   for n in sorted(missing)).encode()


def target_query(filename):
    sql = (ROOT/filename).read_text()
    line = "SET TRANSACTION SNAPSHOT :'snap';\n"
    need(sql.count(line) == 1, "TARGET_QUERY_CONTRACT")
    return sql.replace(line, "").encode()


def compare_tuples(a, b):
    out = Counter()
    for k in a.keys() | b.keys():
        if k not in b: state = "SOURCE_ONLY"
        elif k not in a: state = "TARGET_ONLY"
        elif a[k] is None or b[k] is None: state = "UNKNOWN"
        elif a[k] != b[k]: state = "DIFFERENT"
        else: state = "EQUAL"
        out[(k[1], state)] += 1
    return out



# Fixed labels only. Never print real role/object names, ACLs, or SQL.
# These buckets describe evidence, NOT authority to waive a difference.
APP_ROLES = frozenset(("anon", "authenticated", "authenticator", "service_role"))
PLATFORM_ROLES = frozenset(("postgres", "supabase_admin", "supabase_auth_admin",
    "supabase_storage_admin", "supabase_realtime_admin", "supabase_replication_admin",
    "dashboard_user", "pgbouncer"))


def role_bucket(name):
    if name == ROLE:
        return "TEMP_CAPTURE"
    if name in APP_ROLES:
        return "APP_API"
    if name in PLATFORM_ROLES:
        return "PLATFORM"
    if name.startswith("pg_"):
        return "SYSTEM"
    return "OTHER_REVIEW"


def tuple_delta(src, dst):
    counts = Counter()
    for k in src.keys() | dst.keys():
        if k not in dst:
            state = "SOURCE_ONLY_" + ("TRUE" if src[k] is True else
                    "FALSE" if src[k] is False else "UNKNOWN")
        elif k not in src:
            state = "TARGET_ONLY_" + ("TRUE" if dst[k] is True else
                    "FALSE" if dst[k] is False else "UNKNOWN")
        elif src[k] is None or dst[k] is None:
            state = "UNKNOWN"
        elif src[k] is True and dst[k] is False:
            state = "SOURCE_TRUE_TARGET_FALSE"
        elif src[k] is False and dst[k] is True:
            state = "SOURCE_FALSE_TARGET_TRUE"
        else:
            continue
        subject = role_bucket(k[0])
        # Object being the capture identity is not grounds to dismiss an
        # application subject's discrepancy, even for ROLE/SET/USAGE.
        counts[(subject, k[1], state)] += 1
    return counts


def report_access_delta(src, dst, source_globals, target_globals):
    counts = tuple_delta(src, dst)
    for (bucket, kind, state), count in sorted(counts.items()):
        print("RG02_DELTA_"+bucket+"_"+kind+"_"+state+"="+str(count))
    for bucket in ("TEMP_CAPTURE","APP_API","PLATFORM","SYSTEM","OTHER_REVIEW"):
        print("RG02_DELTA_"+bucket+"_TOTAL="+str(
            sum(n for (r, _, _),n in counts.items() if r==bucket)))
    print("RG02_DELTA_ALL_NONMATCHING="+str(sum(counts.values())))
    a,b=source_globals["roles"],target_globals["roles"]
    flags=("LOGIN","SUPERUSER","INHERIT","CREATE_ROLE","CREATE_DB","REPLICATION","BYPASS_RLS")
    role_counts=Counter()
    for name in a.keys() | b.keys():
        bucket=role_bucket(name)
        if name not in b: role_counts[bucket,"SOURCE_ONLY"]+=1
        elif name not in a: role_counts[bucket,"TARGET_ONLY"]+=1
        else:
            for flag, before, after in zip(flags,a[name],b[name]):
                if before != after:
                    role_counts[bucket,flag+("_SOURCE_TRUE" if before else "_TARGET_TRUE")]+=1
    for (bucket,label),count in sorted(role_counts.items()):
        print("RG02_GLOBAL_FLAG_"+bucket+"_"+label+"="+str(count))
    a,b=source_globals["memberships"],target_globals["memberships"]
    edge_counts=Counter()
    # Exact capture-only temporary grant, not a broad role-name exemption.
    for state,edges in (("SOURCE_ONLY",a-b),("TARGET_ONLY",b-a)):
        for granted,member,grantor,admin,inherit,setopt in edges:
            if (granted,member,admin,inherit,setopt)==(
                    "pg_read_all_data",ROLE,False,True,False):
                edge_counts[state,"EXACT_TEMP_READ_GRANT"]+=1
            else:
                edge_counts[state,role_bucket(member)+"_TO_"+role_bucket(granted)]+=1
    for (state,bucket),count in sorted(edge_counts.items()):
        print("RG02_GLOBAL_EDGE_"+state+"_"+bucket+"="+str(count))
    print("RG02_ACCESS_RECONCILIATION=CLASSIFIED_NOT_WAIVED")


def report_comparison(src, dst, source_globals, target_globals, source_schema, target_schema):
    counts = compare_tuples(src, dst)
    report_access_delta(src, dst, source_globals, target_globals)
    print("RG02_SOURCE_TUPLES="+str(len(src)))
    print("RG02_TARGET_TUPLES="+str(len(dst)))
    for kind in sorted(PRIVILEGES):
        print("RG02_TUPLE_"+kind+"=" + ";".join(
            k+":"+str(counts[kind,k]) for k in
            ("EQUAL","DIFFERENT","UNKNOWN","SOURCE_ONLY","TARGET_ONLY")))
    for label in ("roles", "parameters"):
        a,b = source_globals[label],target_globals[label]
        print("RG02_"+label.upper()+"_SOURCE_ONLY="+str(len(a.keys()-b.keys())))
        print("RG02_"+label.upper()+"_TARGET_ONLY="+str(len(b.keys()-a.keys())))
        print("RG02_"+label.upper()+"_DIFFERENT="+str(sum(a[k]!=b[k] for k in a.keys()&b.keys())))
    a,b=source_globals["memberships"],target_globals["memberships"]
    print("RG02_MEMBERSHIPS_SOURCE_ONLY="+str(len(a-b)))
    print("RG02_MEMBERSHIPS_TARGET_ONLY="+str(len(b-a)))
    for category in sorted(source_schema):
        a,b=source_schema[category],target_schema[category]
        print("RG02_SCHEMA_"+category.upper()+"_MISSING="+str(sum((a-b).values()))+
              ";EXTRA="+str(sum((b-a).values())))
    print("RG02_TUPLE_COMPARISON=COMPLETED_HOLD_NOT_EQUIVALENCE")
    print("GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED")


def restore(root, source_globals, source_tuples, container):
    d = DOCKER
    def docker(args, code, **kwargs):
        return cmd(d+args, code, **kwargs)
    def pg(sql, db="postgres", code="LOCAL_SQL", **kwargs):
        return docker(["exec","-i",container,"psql","-X","-qAt","-v","ON_ERROR_STOP=1",
                       "-h","/var/run/postgresql","-U","supabase_admin","-d",db],
                      code, data=sql, **kwargs)
    def transfer(src, dest):
        with src.open("rb") as f:
            docker(["exec","-i",container,"sh","-c","umask 077; cat > "+dest],
                   "TRANSFER", infile=f)
        actual = docker(["exec",container,"sha256sum",dest],"TRANSFER_HASH").split()[0]
        need(actual.decode()==sha(src), "TRANSFER_HASH")
    created = False
    try:
        env = safe_env(); env["POSTGRES_PASSWORD"] = secrets.token_hex(32)
        docker(["run","--pull=never","--rm","--detach","--name",container,
                "--network","none","--security-opt","no-new-privileges",
                "--tmpfs","/var/lib/postgresql/data:rw,nosuid,nodev,size=1536m",
                "--tmpfs","/tmp:rw,nosuid,nodev,size=128m","-e","POSTGRES_PASSWORD",IMAGE],
               "CONTAINER_START",env=env)
        created = True
        need(docker(["inspect","--format","{{.HostConfig.NetworkMode}}",container],
                    "NETWORK_INSPECT").strip()==b"none","NETWORK_NOT_ISOLATED")
        for _ in range(90):
            ready = subprocess.run(d+["exec",container,"pg_isready","-q","-h",
                 "/var/run/postgresql","-U","supabase_admin","-d","postgres"],
                 stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                 stderr=subprocess.DEVNULL,env=safe_env(),timeout=5)
            if ready.returncode==0: break
            time.sleep(2)
        else: raise Blocked("CONTAINER_READY")
        need(pg(b"SHOW server_version_num;").strip().startswith(b"17"),"PG17_VERSION")
        print("RG02_CONTAINER_NETWORK=NONE; PG17=PASS",flush=True)
        baseline = strict_json(pg(b"SELECT json_agg(rolname ORDER BY rolname) FROM pg_roles;"))
        statements = role_sql(source_globals["roles"],baseline)
        if statements: pg(statements,code="ROLE_SHELL_CREATE")
        print("RG02_ROLE_SHELLS=PASS; SOURCE_GLOBAL_FLAGS_OR_MEMBERSHIPS_REPLAYED=NO")
        pg(b"CREATE DATABASE neroxa_rg02_probe;",code="CREATE_LOCAL_DB")
        pg(b"CREATE EXTENSION IF NOT EXISTS supabase_vault WITH VERSION '0.3.1';",
           DB,"VAULT_CREATE")
        # Capture the exact local baseline after pre-provisioning Vault,
        # before importing any source objects. No raw schema leaves tmpfs.
        baseline_sql = docker(["exec",container,"pg_dump","--schema-only",
            "-h","/var/run/postgresql","-U","supabase_admin","-d",DB],
            "BASELINE_SCHEMA_EXPORT").decode()
        need(0<len(baseline_sql.encode())<=100663296,"BASELINE_SCHEMA_SIZE")
        transfer(root/"database.dump","/tmp/database.dump")
        listing = docker(["exec",container,"pg_restore","--list","/tmp/database.dump"],
                         "TOC_READ")
        pattern = rb"^[0-9]+; [0-9]+ [0-9]+ SCHEMA - vault "
        lines = listing.splitlines(keepends=True)
        need(sum(bool(re.match(pattern,line)) for line in lines)==1,"VAULT_TOC_COUNT")
        toc=root/"restore.filtered.list"
        toc.write_bytes(b"".join(line for line in lines if not re.match(pattern,line)))
        transfer(toc,"/tmp/restore.filtered.list")
        restore_args=["exec",container,"pg_restore","--exit-on-error","--single-transaction",
                      "--use-list=/tmp/restore.filtered.list","-h","/var/run/postgresql",
                      "-U","supabase_admin","-d",DB,"/tmp/database.dump"]
        docker(restore_args,"FULL_RESTORE",timeout=360)
        need(pg(b"SELECT extversion FROM pg_extension WHERE extname='supabase_vault';",
                DB).strip()==b"0.3.1","VAULT_VERSION")
        tables=pg(b"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema';",DB).strip()
        need(tables.isdigit() and int(tables)>0,"TABLE_COUNT")
        print("RG02_ISOLATED_FULL_RESTORE=PASS; VAULT_EXTENSION_VERSION=PASS")
        print("RG02_RESTORED_USER_TABLES="+tables.decode(),flush=True)
        for filename,dest in (("rg02_source_globals_same_snapshot.sql","target.globals.json"),
                              ("rg02_source_tuple_same_snapshot.sql","target.tuples.jsonl")):
            with (root/dest).open("xb") as out:
                pg(target_query(filename),DB,"TARGET_WITNESS",outfile=out,timeout=120)
        target_globals = parse_globals(root/"target.globals.json")
        target_tuples = parse_tuples(root/"target.tuples.jsonl")
        docker(["exec",container,"pg_restore","--schema-only",
                "--use-list=/tmp/restore.filtered.list","--file=/tmp/source-schema.sql",
                "/tmp/database.dump"],"SOURCE_SCHEMA_EXPORT")
        with (root/"source-schema.sql").open("xb") as out:
            docker(["exec",container,"cat","/tmp/source-schema.sql"],
                   "SOURCE_SCHEMA_TRANSFER",outfile=out)
        with (root/"target-schema.sql").open("xb") as out:
            docker(["exec",container,"pg_dump","--schema-only","-h","/var/run/postgresql",
                    "-U","supabase_admin","-d",DB],"TARGET_SCHEMA_EXPORT",outfile=out)
        for filename in ("source-schema.sql","target-schema.sql"):
            need(0<(root/filename).stat().st_size<=100663296,"SCHEMA_SIZE")
        source_sql=(root/"source-schema.sql").read_text()
        target_sql=(root/"target-schema.sql").read_text()
        report_comparison(source_tuples,target_tuples,source_globals,target_globals,
                          extract(source_sql),extract(target_sql))
        # Reuse the existing tested direct-ACL analyzer, but run it against
        # this exact new preimage and its isolated target, not old receipts.
        with (root/"target.catalog.json").open("xb") as out:
            pg((ROOT/"rg02_catalog_snapshot.sql").read_bytes(),DB,
               "TARGET_DIRECT_ACL_CATALOG",outfile=out,timeout=120)
        # Same pinned preimage and same restored instance, no source connection.
        # All raw witnesses remain private in tmpfs.
        schema_catalog = strict_json(pg(SCHEMA_CATALOG_SQL, DB, "SCHEMA_FOCAL_CATALOG"))
        focus = missing_app_schema(source_tuples, target_tuples)
        counts = classify(source_tuples, target_tuples, source_globals,
                          target_globals, schema_catalog)
        print("RG02_APP_SCHEMA_FOCAL_COUNT="+str(len(focus)))
        for category, number in sorted(counts.items()):
            print("RG02_APP_SCHEMA_"+category+"="+str(number))
        # Existing protected run 45943118524 demonstrated the exact six-USAGE
        # trial and rollback against this pinned capture. Do not rerun GRANTs.
        # A changed focal population is HOLD, never a reused PASS.
        need(len(focus)==6 and all(k[3]=="USAGE" for k in focus),
             "RESIDUAL_FOCAL_SCOPE_CHANGED")
        print("RG02_APP_SCHEMA_TRIAL=NOT_REPEATED_HISTORICAL_RUN_45943118524")
        print("RG02_APP_SCHEMA_RECONCILIATION=OBSERVED_NOT_AUTHORIZED")
        catalog_path=root/"target.catalog.json"
        need(0<catalog_path.stat().st_size<=64*1024**2,"TARGET_CATALOG_SIZE")
        acl_report=analyze_direct_acl(source_sql,target_sql,
                                      strict_json(catalog_path.read_bytes()))
        print("RG02_DIRECT_ACL_DIAGNOSTIC_TOTAL="+str(acl_report["exact_sql_diff_count"]))
        for key,value in acl_report["by_class"].items():
            print("RG02_DIRECT_ACL_"+key+"="+str(value))
        print("RG02_DIRECT_ACL_DIAGNOSTIC=OBSERVED_NOT_EQUIVALENCE")
        residual = residual_report(source_sql, target_sql, baseline_sql,
            source_globals, target_globals, source_tuples, target_tuples,
            strict_json(catalog_path.read_bytes()))
        for key, count in sorted(residual.items()):
            print("RG02_RESIDUAL_"+key+"="+str(count))
        print("RG02_RESIDUAL_SOURCE_GRANTOR_PROVENANCE=NOT_INDEPENDENTLY_CAPTURED")
        print("RG02_RESIDUAL_REVIEW=OBSERVATIONS_REQUIRE_APPROVAL")

    finally:
        if created:
            docker(["rm","-f",container],"CONTAINER_CLEANUP")
            print("RG02_CONTAINER_CLEANUP=PASS",flush=True)


def check_context():
    e=os.environ
    need(e.get("GITHUB_REPOSITORY")=="luit77yak-dev/neroxa-master" and
         e.get("GITHUB_REF")=="refs/heads/main" and e.get("GITHUB_REF_PROTECTED")=="true" and
         e.get("GITHUB_EVENT_NAME")=="workflow_dispatch" and e.get("GITHUB_RUN_ATTEMPT")=="1" and
         e.get("GITHUB_ACTOR") in ("luit77yak-dev","dev-luizt5") and
         e.get("RUNNER_ENVIRONMENT")=="github-hosted" and
         re.fullmatch(r"[0-9]{5,15}",e.get("GITHUB_RUN_ID","")) and
         e.get("RG02_RESTORE_CONFIRMATION")==CONFIRMATION and
         e.get("RG02_SOURCE_GATE")=="OPERATOR_APPROVED_PRIVATE_CAPTURE" and
         e.get("RG02_ESCROW_RECOVERY")=="EXTERNALLY_RECOVERABLE_KEY_CONFIRMED" and
         not any(k in e for k in ("RG02_SOURCE_PG_PASSWORD","RG02_SOURCE_CA_PEM","PGPASSWORD","SUPABASE_ACCESS_TOKEN")),
         "PROTECTED_CONTEXT")


def main():
    os.umask(0o077)
    try:
        check_context()
        need(len(sys.argv)==2,"ARGUMENTS")
        secret=os.environ.pop("RG02_CAPTURE_PASSPHRASE","").encode()
        need(32<=len(secret.decode())<=1024 and not any(x in secret for x in
             (b"\0",b"\r",b"\n")),"PASSPHRASE")
        need(cmd(["stat","-f","-c","%T","/dev/shm"],"TMPFS").strip()==b"tmpfs","TMPFS")
        with tempfile.TemporaryDirectory(prefix="rg02-restore-",dir="/dev/shm") as tmp:
            root=Path(tmp)
            _,globals_doc,tuples=read_archive(Path(sys.argv[1]),secret,root)
            del secret
            restore(root,globals_doc,tuples,"rg02-recovery-"+os.environ["GITHUB_RUN_ID"])
        print("RG02_PRIVATE_TMPFS_CLEANUP=PASS")
        print("SOURCE_INDEPENDENT_ATTESTATION=NOT_VERIFIED; VAULT_SECRET_READBACK=NOT_RUN")
        print("PRODUCTION_DATABASE_ACCESS=NONE; SQL_RELEASE=NOT_RUN; COMMERCIAL_GO=NO_GO")
        return 0
    except Blocked as exc:
        # Only audited constant reason codes are produced by need/cmd call sites.
        print("RG02_ISOLATED_RESTORE=BLOCKED_"+str(exc))
    except (OSError,ValueError,TypeError,KeyError,AttributeError,zipfile.BadZipFile,
            subprocess.SubprocessError):
        print("RG02_ISOLATED_RESTORE=BLOCKED_PRIVATE_ERROR")
    print("COMMERCIAL_GO=NO_GO")
    return 2


if __name__=="__main__":
    sys.exit(main())
