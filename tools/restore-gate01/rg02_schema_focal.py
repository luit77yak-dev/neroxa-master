"""Focal schema privilege reconciliation; private inputs, aggregate outputs only.

Projection is explanatory evidence, not a proof of source ACL provenance.
No global role replay. A transactional USAGE experiment is disposable only.
"""
from collections import Counter

APP = frozenset(("anon", "authenticated", "authenticator", "service_role"))
SCHEMA_CATALOG_SQL = b"""BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'name',n.nspname,'owner',o.rolname,'acl',
  coalesce((SELECT jsonb_agg(jsonb_build_object(
    'grantee',g.rolname,'public',a.grantee=0,'privilege',a.privilege_type))
    FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    LEFT JOIN pg_roles g ON g.oid=a.grantee),'[]'::jsonb)
)), '[]'::jsonb)::text
FROM pg_namespace n JOIN pg_roles o ON o.oid=n.nspowner
WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema';
ROLLBACK;
"""


def missing_app_schema(source, target):
    return sorted(k for k in source.keys() & target.keys()
                  if k[0] in APP and k[1] == "SCHEMA"
                  and source[k] is True and target[k] is False)


def inherited(role, globals_doc):
    result = {role}
    while True:
        extra = {granted for granted, member, _, _, inherit, _ in
                 globals_doc["memberships"] if inherit and member in result}
        if extra <= result:
            return result
        result.update(extra)


def projected_right(role, privilege, schema, globals_doc):
    paths = inherited(role, globals_doc)
    if globals_doc["roles"][role][1]:
        return True, "SUPERUSER"
    if privilege == "USAGE" and paths & {"pg_read_all_data", "pg_write_all_data"}:
        return True, "BUILTIN_DATA_ROLE"
    candidates = [a for a in schema["acl"] if a["privilege"] == privilege]
    if any(a["public"] for a in candidates):
        return True, "PUBLIC"
    if any(a["grantee"] == role for a in candidates):
        return True, "DIRECT_ACL"
    if any(a["grantee"] in paths for a in candidates):
        return True, "INHERITED_ACL"
    # pg_database_owner has implicit membership not encoded in pg_auth_members.
    if any(a["grantee"] == "pg_database_owner" for a in candidates):
        return None, "IMPLICIT_OWNER_HOLD"
    return False, "NO_PATH"


def classify(source, target, source_globals, target_globals, catalog):
    index = {s["name"]: s for s in catalog}
    if len(index) != len(catalog):
        raise ValueError("DUPLICATE_SCHEMA_CATALOG")
    counts = Counter()
    for role, _, schema, privilege in missing_app_schema(source, target):
        counts["PRIVILEGE_" + privilege] += 1
        row = index.get(schema)
        if row is None:
            counts["SCHEMA_MISSING_HOLD"] += 1
            continue
        src, reason = projected_right(role, privilege, row, source_globals)
        dst, _ = projected_right(role, privilege, row, target_globals)
        if dst is not False:
            counts["TARGET_PROJECTION_UNCERTAIN_HOLD"] += 1
        elif src is True:
            counts["SOURCE_PATH_CONSISTENT_" + reason] += 1
        elif src is False:
            counts["SOURCE_ACL_OR_PROVIDER_DIFFERENCE_HOLD"] += 1
        else:
            counts["SOURCE_PROJECTION_UNCERTAIN_HOLD"] += 1
    return counts


def ident(value):
    if not isinstance(value, str) or not value or "\x00" in value:
        raise ValueError("IDENTITY_INVALID")
    return '"' + value.replace('"', '""') + '"'


def experiment_sql(keys, witness):
    # No CREATE, memberships, grant options or elevated attributes.
    # Exact approved PG17 witness, same session, unconditional rollback.
    if not keys or any(k[0] not in APP or k[1] != "SCHEMA" or k[3] != "USAGE"
                       for k in keys):
        raise ValueError("USAGE_ONLY")
    begin = "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
    end = "\nROLLBACK;\n"
    if witness.count(begin) != 1 or not witness.endswith(end):
        raise ValueError("WITNESS_BOUNDARY")
    grants = "".join("GRANT USAGE ON SCHEMA " + ident(k[2]) + " TO " +
                     ident(k[0]) + ";\n" for k in keys)
    return (witness.replace(begin, "BEGIN;\n" + grants, 1)).encode()


def experiment_result(before, after, intended):
    changed = {k for k in before.keys() | after.keys()
               if k not in before or k not in after or before[k] != after[k]}
    expected = set(intended)
    fixed = {k for k in expected if before.get(k) is False and after.get(k) is True}
    return len(fixed), len(changed - expected), changed == expected and fixed == expected
