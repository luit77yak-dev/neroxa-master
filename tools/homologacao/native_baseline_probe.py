#!/usr/bin/env python3
"""Native PostgreSQL historical baseline probe. Disposable local Docker ONLY."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXPECTED_BASE_SQL = "231a3664711b6286ae3655845ee184d4bdd50fba370b0af9de1ab1b704b6aa8c"
SOURCE = "b8a2087ad96dde4f90c04a7c10c31281d663e9f8"

def run(*args, stdin=None):
    r = subprocess.run(list(args), input=stdin, capture_output=True, check=False)
    if r.returncode:
        raise RuntimeError("disposable local command failed: " + args[0] + "; exit=" + str(r.returncode))
    return r.stdout.decode("utf-8", errors="replace").strip()

def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true"
    assert os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    project = os.environ["AB_PROJECT"]
    rid = os.environ["GITHUB_RUN_ID"]
    assert re.fullmatch(r"neroxa-02a3-[0-9]+-buyer", project) and project == f"neroxa-02a3-{rid}-buyer"
    work = pathlib.Path(os.environ["AB_WORKDIR"]).resolve()
    assert work.parent == pathlib.Path(os.environ["RUNNER_TEMP"]).resolve()
    assert not (work / "supabase/.temp/project-ref").exists()
    assert not (work / "supabase/migrations").exists()
    assert not (work / "supabase/seed.sql").exists()
    assert os.environ.get("SUPABASE_URL") is None
    assert os.environ.get("DATABASE_URL") is None
    assert os.environ.get("PGHOST") is None
    assert os.environ.get("PGPASSWORD") is None
    assert os.environ.get("SUPABASE_ACCESS_TOKEN") is None
    policy = json.loads((ROOT / "audits/homologacao-f01-f02/target-admission.CLOSED.json").read_text())
    assert policy["target"]["project_ref"] == "nvbmzdgfretwnkdfqcap"
    assert policy["authorization"]["state"] == "CLOSED"
    assert policy["authorization"]["sql_release"] is False
    assert policy["authorization"]["schema_install"] is False
    # This local test does NOT interpret the hosted DDL prohibition as a block on ephemeral local SQL.
    db = "supabase_db_" + project
    info = json.loads(run("docker", "--host=unix:///var/run/docker.sock", "inspect", db))[0]
    expected = json.loads((ROOT / "audits/02a5/EXPECTED-IMAGES.json").read_text())
    assert info["Config"]["Labels"]["com.supabase.cli.project"] == project
    assert info["Image"] in {
        expected["supabase/postgres:17.11.0.004"],
        "sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5",
    }, "Docker image identity differs from both manifest/config pins"
    assert info["State"]["Running"] is True
    def sql(query, *, quiet=True):
        cmd = [
            "docker", "--host=unix:///var/run/docker.sock", "exec", "-i", db,
            "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"
        ]
        return run(*cmd, stdin=query.encode()).strip()

    version = sql("SHOW server_version;")
    assert version.startswith("17.11"), "PostgreSQL minor version drift"
    assert sql("SELECT to_regclass('auth.users') IS NOT NULL;") == "t"
    assert sql("SELECT to_regclass('storage.objects') IS NOT NULL;") == "t"

    # Exact historical generator + SHA. Inputs have no client rows or auth users.
    output = work / "f01-f02-historical-base.sql"
    run(sys.executable, str(ROOT / "tools/ab-auth/build_schema.py"), str(output))
    assert hashlib.sha256(output.read_bytes()).hexdigest() == EXPECTED_BASE_SQL
    sql(output.read_text())
    assert sql("SELECT count(*) FROM public.neroxa_orders;") == "0"
    assert sql("SELECT count(*) FROM auth.users;") == "0"
    assert sql("SELECT to_regclass('public.neroxa_organizations') IS NOT NULL AND to_regclass('public.neroxa_system_instances') IS NOT NULL AND to_regclass('public.neroxa_orders') IS NOT NULL AND to_regclass('public.neroxa_order_items') IS NOT NULL;") == "t"
    assert sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'neroxa_%' AND relkind IN ('r','v');") == "34"

    # These are EXPECTED UNSAFE / INCOMPLETE baseline signals, not F01/F02 approval.
    f01_incomplete = sql("SELECT to_regclass('public.neroxa_instance_members') IS NULL AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='neroxa_orders' AND policyname LIKE 'organization %') >= 2;")
    assert f01_incomplete == "t", "F01 baseline assumptions drift"
    f02_incomplete = sql("SELECT to_regprocedure('public.get_public_order_status(uuid,text)') IS NOT NULL AND to_regprocedure('public.append_public_order_items_with_payment(uuid,text,jsonb,text)') IS NOT NULL AND to_regprocedure('public.neroxa_track_order_with_capability(uuid,uuid,text)') IS NULL AND to_regclass('private.neroxa_tracking_capabilities') IS NULL;")
    assert f02_incomplete == "t", "F02 baseline assumptions drift"
    assert sql("SELECT has_function_privilege('anon','public.get_public_order_status(uuid,text)','EXECUTE') AND has_function_privilege('anon','public.append_public_order_items_with_payment(uuid,text,jsonb,text)','EXECUTE');") == "t", "Historical legacy permissions drift"

    print("DISPOSABLE_BASE_INSTALL=PASS; PROJECT=RUN_ID_SCOPED; POSTGRES="+version[:18])
    print("BASE_SHA256="+EXPECTED_BASE_SQL+"; APPLICATION_RELATIONS=34; AUTH_USERS=0; ORDERS=0")
    print("F01_HISTORICAL_BASELINE=UNSAFE; F02_HISTORICAL_BASELINE=UNSAFE")
    print("F01_HOSTED_TEST=NOT_RUN; F02_HOSTED_TEST=NOT_RUN; F01_F02_CORRECTIONS=NOT_INSTALLED")
    print("PRODUCTION_TARGET=UNTOUCHED; SQL_REMOTE=NOT_RUN; SQL_LOCAL_DISPOSABLE_ONLY")
if __name__ == "__main__":
    main()
