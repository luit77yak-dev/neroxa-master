#!/usr/bin/env python3
"""Read-only inventory of repository consumers of instance-scoped storefront data."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "audits" / "legacy-consumers-inventory.generated.json"
TABLES = ("neroxa_storefront_settings", "neroxa_storefront_delivery_zones")
TOKENS = ("organization_id", "instance_id", "onConflict", "get_public_storefront_catalog")
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql", ".py"}
SKIP = {"node_modules", ".git", "dist", "build", "coverage", ".next", "results"}
entries = []
for path in sorted(ROOT.rglob("*")):
    if not path.is_file() or path.suffix not in EXTENSIONS or any(p in SKIP for p in path.parts):
        continue
    if path == Path(__file__).resolve():
        continue
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (UnicodeError, OSError):
        continue
    for number, line in enumerate(lines, 1):
        if not any(t in line for t in TABLES):
            continue
        before = lines[max(0, number - 7):number - 1]
        after = lines[number:min(len(lines), number + 6)]
        context = "\n".join(before + [line] + after)
        operations = [x for x in ("select", "insert", "update", "delete", "upsert", "from", "rpc") if re.search(r"\b" + x + r"\b", context, re.I)]
        entries.append({
            "path": str(path.relative_to(ROOT)),
            "line": number,
            "table": [t for t in TABLES if t in line],
            "operations_nearby": operations,
            "instance_id_nearby": "instance_id" in context,
            "organization_id_nearby": "organization_id" in context,
            "on_conflict_instance_nearby": bool(re.search(r'onConflict\s*:\s*["\x27]instance_id', context)),
            "excerpt": line.strip()[:240],
        })
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({
    "scope": "Repository source only; external consumers, DB dependencies and production not audited",
    "matches": entries,
    "total": len(entries),
}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Found {len(entries)} direct table references in repository source.")
for item in entries:
    print(f"{item['path']}:{item['line']} {','.join(item['table'])} instance_nearby={item['instance_id_nearby']}")
print(f"Report: {OUTPUT.relative_to(ROOT)}")
