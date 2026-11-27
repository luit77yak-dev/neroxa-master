"""Residual RG02 review: fixed aggregate outputs only, no approval inference.

The source dump does not contain an independently captured source ACL grantor
catalog. Even owner grantors observed in the restored catalog cannot prove
source grantor equality. No source connection or grant replay is performed.
"""
from collections import Counter
from rg02_compare_runtime import extract, statements, normalized
from rg02_acl_ordered import parse_event
from rg02_targeted_acl import snapshot_index, final_expected
from rg02_grantor_global_evidence import acl_provenance

CAPTURE = "neroxa_rg02_snapshot_reader"
PREFLIGHT = "neroxa_f02_preflight"
APP = frozenset(("anon", "authenticated", "authenticator", "service_role"))
PLATFORM = frozenset(("postgres", "supabase_admin", "supabase_auth_admin",
    "supabase_storage_admin", "supabase_realtime_admin",
    "supabase_replication_admin", "dashboard_user", "pgbouncer"))
FLAGS = ("LOGIN", "SUPERUSER", "INHERIT", "CREATE_ROLE", "CREATE_DB",
         "REPLICATION", "BYPASS_RLS")


def bucket(role):
    if role == CAPTURE:
        return "CAPTURE"
    if role == PREFLIGHT:
        return "F02_PREFLIGHT"
    if role in APP:
        return "APP_API"
    if role in PLATFORM:
        return "PLATFORM"
    if role is None:
        return "UNKNOWN"
    if role.startswith("pg_"):
        return "SYSTEM"
    return "OTHER_REVIEW"


def residual_report(source_sql, target_sql, baseline_sql, source, target,
                    source_tuples, target_tuples, catalog):
    counts = Counter()
    s, t, b = (extract(sql) for sql in (source_sql, target_sql, baseline_sql))
    extra = t["owner"] - s["owner"]
    counts["OWNER_SOURCE_MISSING"] = sum((s["owner"] - t["owner"]).values())
    counts["OWNER_TARGET_EXTRA"] = sum(extra.values())
    counts["OWNER_EXTRA_EXACT_BASELINE"] = sum((extra & b["owner"]).values())
    counts["OWNER_EXTRA_NOT_IN_BASELINE_HOLD"] = sum((extra - b["owner"]).values())
    # Compare actual identity + option tuple, not merely edge counts.
    for state, edges in (("SOURCE_ONLY", source["memberships"] - target["memberships"]),
                         ("TARGET_ONLY", target["memberships"] - source["memberships"])):
        for granted, member, grantor, admin, inherit, setopt in edges:
            key = ("EDGE_" + state + "_" + bucket(member) + "_TO_" +
                   bucket(granted) + "_GRANTOR_" + bucket(grantor))
            counts[key] += 1
            for opt, value in (("ADMIN", admin), ("INHERIT", inherit), ("SET", setopt)):
                if value:
                    counts[key + "_" + opt + "_TRUE"] += 1
            if (granted, member, admin, inherit, setopt) == (
                    "pg_read_all_data", CAPTURE, False, True, False):
                counts["EDGE_" + state + "_EXACT_TEMP_READ"] += 1
    for role in source["roles"].keys() | target["roles"].keys():
        if role not in source["roles"] or role not in target["roles"]:
            counts["ROLE_" + bucket(role) + "_IDENTITY_HOLD"] += 1
            continue
        for flag, before, after in zip(FLAGS, source["roles"][role], target["roles"][role]):
            if before != after:
                counts["ROLE_" + bucket(role) + "_" + flag +
                       ("_SOURCE_TRUE" if before else "_TARGET_TRUE")] += 1
    # Report whether the known preflight identity (not an execution role) has
    # direct object ownership or ACL dependencies, or effective write rights.
    # This deliberately covers only the catalog and witness classes available.
    for part in ("functions", "relations"):
        for obj in catalog[part]:
            if obj["owner"] == PREFLIGHT:
                counts["F02_PREFLIGHT_OBJECT_OWNER"] += 1
            for acl in obj["acl"]:
                if acl["grantee"] == PREFLIGHT:
                    counts["F02_PREFLIGHT_DIRECT_ACL"] += 1
                if acl["grantor"] == PREFLIGHT:
                    counts["F02_PREFLIGHT_ACL_GRANTOR"] += 1
    for k, value in source_tuples.items():
        if k[0] != PREFLIGHT or value is not True:
            continue
        if k[1] == "TABLE" and k[3] in ("INSERT", "UPDATE", "DELETE", "TRUNCATE", "TRIGGER", "MAINTAIN"):
            counts["F02_PREFLIGHT_SOURCE_TABLE_WRITE_OR_MAINTAIN"] += 1
        if k[1] == "SCHEMA" and k[3] == "CREATE":
            counts["F02_PREFLIGHT_SOURCE_SCHEMA_CREATE"] += 1
        if k[1] == "ROLE" and k[3] == "SET":
            counts["F02_PREFLIGHT_SOURCE_SET_ROLE"] += 1
        if k[1] == "FUNCTION" and k[3] == "EXECUTE":
            counts["F02_PREFLIGHT_SOURCE_FUNCTION_EXECUTE"] += 1
    # Fixed schema buckets only; unknown names must stay under review.
    known_schemas = {"public": "PUBLIC_APP", "auth": "AUTH", "storage": "STORAGE",
                     "vault": "VAULT", "realtime": "REALTIME",
                     "extensions": "EXTENSIONS", "graphql": "GRAPHQL",
                     "graphql_public": "GRAPHQL_PUBLIC",
                     "supabase_functions": "PLATFORM_FUNCTIONS"}
    for k in source_tuples.keys() | target_tuples.keys():
        if (k[0] in APP and k[1] == "SCHEMA" and k[3] == "USAGE" and
                source_tuples.get(k) is True and target_tuples.get(k) is False):
            counts["APP_USAGE_" + known_schemas.get(k[2], "OTHER_HOLD")] += 1
        if k[0] == PREFLIGHT and k[1] != "PARAMETER" and (
                k not in source_tuples or k not in target_tuples or
                source_tuples[k] is None or target_tuples[k] is None or
                source_tuples[k] != target_tuples[k]):
            counts["F02_PREFLIGHT_NONPARAMETER_TUPLE_DELTA_HOLD"] += 1
    counts.setdefault("F02_PREFLIGHT_NONPARAMETER_TUPLE_DELTA_HOLD", 0)
    # All measured grantors in destination, and specifically the residual ACL
    # statements. Source ordered SQL is not a direct source grantor catalog.
    counts.update(acl_provenance(catalog))
    remaining = s["grant_acl"] - t["grant_acl"]
    index = snapshot_index(catalog)
    ordered = statements(source_sql)
    for pos, stmt in enumerate(ordered):
        key = normalized(stmt)
        if remaining[key] <= 0:
            continue
        remaining[key] -= 1
        counts["FOCAL_ACL_STATEMENTS"] += 1
        event = parse_event(stmt)
        if event is None or event["op"] != "REVOKE":
            counts["FOCAL_ACL_UNPARSED_HOLD"] += 1
            continue
        expected, reason = final_expected(event, ordered[pos+1:])
        objs = index.get((event["kind"], event["identity"]), [])
        if expected is None or len(objs) != 1:
            counts["FOCAL_ACL_OBJECT_OR_ORDER_HOLD"] += 1
            continue
        obj = objs[0]
        observed = [a for a in obj["acl"] if
                    (a["is_public"], a["grantee"]) == event["grantee"] and
                    a["privilege"].upper() in expected]
        counts["FOCAL_ACL_TARGET_GRANTOR_ROWS"] += len(observed)
        for row in observed:
            grantor = row["grantor"]
            if not grantor:
                counts["FOCAL_ACL_TARGET_GRANTOR_UNKNOWN_HOLD"] += 1
            elif grantor == obj["owner"]:
                counts["FOCAL_ACL_TARGET_OWNER_GRANTOR"] += 1
            else:
                counts["FOCAL_ACL_TARGET_NONOWNER_GRANTOR_HOLD"] += 1
    if sum(remaining.values()):
        raise ValueError("RESIDUAL_ACL_ACCOUNTING")
    for key in ("F02_PREFLIGHT_OBJECT_OWNER", "F02_PREFLIGHT_DIRECT_ACL",
                "F02_PREFLIGHT_ACL_GRANTOR", "F02_PREFLIGHT_SOURCE_TABLE_WRITE_OR_MAINTAIN",
                "F02_PREFLIGHT_SOURCE_SCHEMA_CREATE", "F02_PREFLIGHT_SOURCE_SET_ROLE",
                "F02_PREFLIGHT_SOURCE_FUNCTION_EXECUTE",
                "FOCAL_ACL_TARGET_GRANTOR_UNKNOWN_HOLD", "FOCAL_ACL_TARGET_NONOWNER_GRANTOR_HOLD"):
        counts.setdefault(key, 0)
    return counts
