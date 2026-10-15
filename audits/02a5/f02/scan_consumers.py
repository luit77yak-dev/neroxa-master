#!/usr/bin/env python3
"""Read-only F02 inventory, never certifies live consumers or release readiness."""
import argparse,hashlib,json,pathlib,re,sys
from collections import Counter
SYMBOL=re.compile(r"\b(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)\b",re.I)
RPC=re.compile(r"\b(?:supabase|backend|candidate|transport|client)?\s*\.?\s*rpc\s*\(",re.I)
EXT={".ts",".tsx",".js",".mjs",".cjs",".py",".sql",".yml",".yaml",".sh"}
SKIP={".git","node_modules",".vercel",".supabase","dist","build","coverage","__pycache__","vendor","delivery-audited"}
def kind(p):
 s=p.as_posix()
 if s.startswith("tests/") or "/tests/" in s or ".test." in s:return "TEST_ONLY"
 if s.startswith("src/"):
  if "types.ts" in s or "routeTree.gen." in s:return "GENERATED_OR_TYPES"
  if s=="src/routes/painel.tsx":return "SUSPENDED_ROUTE_SOURCE"
  return "RUNTIME_SOURCE"
 if s.startswith("supabase/migrations/"):return "HISTORICAL_MIGRATION"
 if s.startswith("audits/"):return "AUDIT_OR_SQL_CANDIDATE"
 if s.startswith("tools/") or s.startswith("scripts/"):return "SCRIPT"
 if s.startswith(".github/workflows/"):return "WORKFLOW"
 return "OTHER_CODE"
def scan(root,repo):
 root=root.resolve()
 if not root.is_dir():raise ValueError("missing checkout "+repo)
 rows,seen=[],0
 for p in sorted(root.rglob("*")):
  if not p.is_file():continue
  r=p.relative_to(root)
  if any(part in SKIP for part in r.parts) or p.name.startswith(".env") or p.suffix.lower() not in EXT or p.is_symlink():continue
  if not p.resolve().is_relative_to(root):continue
  try: lines=p.read_text(encoding="utf-8").splitlines()
  except UnicodeDecodeError:continue
  seen+=1
  for no,line in enumerate(lines,1):
   found=set(s.lower() for s in SYMBOL.findall(line))
   for sym in sorted(found):rows.append(dict(repo=repo,path=r.as_posix(),line=no,symbol=sym,category=kind(r),classification="REVIEW_REQUIRED"))
   if RPC.search(line) and not found:rows.append(dict(repo=repo,path=r.as_posix(),line=no,symbol="other_or_dynamic_rpc",category=kind(r),classification="CHECK_INDIRECT"))
 return seen,rows
def main():
 p=argparse.ArgumentParser()
 p.add_argument("--master",type=pathlib.Path,required=True);p.add_argument("--delivery",type=pathlib.Path,required=True)
 p.add_argument("--master-sha",required=True);p.add_argument("--delivery-sha",required=True);p.add_argument("--output",type=pathlib.Path,required=True)
 a=p.parse_args()
 m,mr=scan(a.master,"master");d,dr=scan(a.delivery,"delivery")
 result=dict(status="STATIC_ONLY_NOT_RELEASE",external_consumers="UNKNOWN",consumer_disablement_certified=False,db_acl_tested=False,master_sha=a.master_sha,delivery_sha=a.delivery_sha,scanned_files={"master":m,"delivery":d},hits=mr+dr)
 a.output.parent.mkdir(parents=True,exist_ok=True)
 a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
 print(json.dumps({k:v for k,v in result.items() if k!="hits"}))
 for row in result["hits"]:print(json.dumps(row,ensure_ascii=False))
if __name__=="__main__":main()
