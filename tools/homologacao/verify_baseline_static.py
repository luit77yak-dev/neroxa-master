#!/usr/bin/env python3
"""Verify the *historical* F01/F02 baseline source without running any SQL."""
from __future__ import annotations
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE_SHA = "e7ed111d73ec8d63b514db8c39059d6b87ae97be74d54e0d682d38bc0e4cf858"
RELEASE_SOURCE_REF = "b8a2087ad96dde4f90c04a7c10c31281d663e9f8"
HOMOLOGATION_PROJECT = "nvbmzdgfretwnkdfqcap"
SOURCE_RELEASE_PROJECT = "iefaoaqzltvpfabyeelj"

def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify() -> None:
    # The reviewed PR51 source must remain an ancestor and its files unchanged.
    subprocess.run(
        ["git", "merge-base", "--is-ancestor", RELEASE_SOURCE_REF, "HEAD"],
        cwd=ROOT, check=True, capture_output=True
    )
    modified = subprocess.check_output(
        ["git", "diff", "--name-only", RELEASE_SOURCE_REF, "HEAD"],
        cwd=ROOT, text=True
    ).splitlines()
    assert set(modified) == {
        "tools/homologacao/verify_baseline_static.py",
        "audits/homologacao-f01-f02/README.md",
        ".github/workflows/f01-f02-baseline-static.yml",
    }, "Frozen PR51 source scope changed"
    source_path = ROOT / "audits/ab-auth/source.json"
    catalog_path = ROOT / "audits/ab-auth/master-catalog-20261009.json"
    source = json.loads(source_path.read_text())
    catalog = json.loads(catalog_path.read_text())
    assert source["sha256"] == SOURCE_SHA
    assert digest(catalog_path) == SOURCE_SHA
    assert source["production_equivalence"].startswith("NOT established")
    assert len(catalog["relations"]) == source["relations"] == 34
    assert len(catalog["functions"]) == source["functions"] == 50
    assert len(catalog["policies"]) == source["policies"] == 99
    assert {s["name"] for s in catalog["schemas"]} == {"private", "public"}
    assert "data" not in catalog and "rows" not in catalog
    tables = {t["name"] for t in catalog["relations"]}
    required = {
        "neroxa_orders", "neroxa_order_items", "neroxa_system_instances",
        "neroxa_organizations", "neroxa_organization_members",
        "neroxa_storefront_settings", "neroxa_storefront_delivery_zones",
    }
    assert required <= tables, sorted(required - tables)
    # Missing prior-era objects are expected from later release SQL, NOT safe defaults.
    columns = {(v["table"], v["name"]) for v in catalog["columns"]}
    assert ("neroxa_storefront_settings", "instance_id") not in columns
    assert ("neroxa_storefront_delivery_zones", "instance_id") not in columns
    assert ("neroxa_order_items", "selection_snapshot") not in columns

    manifest = json.loads((ROOT / "audits/02a5/hosted-release/MANIFEST.json").read_text())
    assert manifest["target_project"] == SOURCE_RELEASE_PROJECT
    assert manifest["target_project"] != HOMOLOGATION_PROJECT
    assert manifest["execution_authorized"] is False
    assert manifest["approval"] is None
    units = manifest["units"]
    assert len(units) == 33 and [u["order"] for u in units] == list(range(1, 34))
    for unit in units:
        post = ROOT / unit["path"]
        raw = ROOT / unit["source_path"]
        assert post.is_file() and raw.is_file(), unit["order"]
        assert digest(post) == unit["sha256"], unit["order"]
        assert digest(raw) == unit["source_sha256"], unit["order"]

    # Existing reviewed generator creates SQL for *disposable local clones* only.
    with tempfile.TemporaryDirectory(prefix="neroxa-f01-f02-static-") as td:
        output = pathlib.Path(td) / "baseline.sql"
        subprocess.run(
            [sys.executable, str(ROOT / "tools/ab-auth/build_schema.py"), str(output)],
            cwd=ROOT, check=True, capture_output=True, text=True
        )
        generated = output.read_text()
        assert generated.startswith("BEGIN;\n")
        assert generated.rstrip().endswith("COMMIT;")
        assert "CREATE TABLE" in generated and "CREATE POLICY" in generated
        print("BASELINE_SQL_SHA256=" + digest(output))
        print("BASELINE_SQL_BYTES=" + str(output.stat().st_size))
    print("F01_BASELINE_SOURCE=STATIC_PASS; F02_RELEASE_SOURCES=STATIC_PASS; UNITS=33")
    print("CATALOG=34 relations/50 functions/99 policies; captured snapshot only")
    print("HOMOLOGATION_PROJECT=DIFFERENT; HOSTED_COMPATIBILITY=BLOCKED")
    print("SQL_EXECUTION=NOT_RUN; DATABASE_CONNECTION=NOT_RUN; RELEASE=NOT_APPROVED")

if __name__ == "__main__":
    verify()
