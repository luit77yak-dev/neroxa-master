#!/usr/bin/env python3
"""RG02: reconcile ONLY strict SQL ACL differences with disposable PG17 catalogs.

Source: previously verified schema SQL. Target: pg_dump schema SQL and a
read-only catalog snapshot from the restored offline PG17 instance.
No source SQL is executed. This is evidence triage, NEVER an effective-rights
proof or a route to GO. Unparsed statements and uncertain grantors fail closed.
"""
import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path

from rg02_compare_runtime import extract, normalized, statements
from rg02_acl_ordered import parse_event, scope_kind

START_ACL = re.compile(r'^\s*(?:GRANT|REVOKE)\b', re.I)
POSSIBLE_SCOPE = re.compile(r'\bON\s+(?:ALL\s+)?(?:FUNCTIONS?|TABLES?)\b', re.I)
SCOPED = frozenset(('FUNCTION', 'TABLE'))


def snapshot_index(catalog):
    if not isinstance(catalog, dict):
        raise ValueError('CATALOG_NOT_OBJECT')
    idx = {}
    # Distinguish duplicated catalog identities (overloaded functions etc).
    from rg02_catalog_reconcile import identity_key
    for kind, field in (('FUNCTION', 'functions'), ('TABLE', 'relations')):
        objs = catalog.get(field)
        if not isinstance(objs, list):
            raise ValueError('CATALOG_ARRAY_MISSING')
        for obj in objs:
            if not isinstance(obj, dict) or not isinstance(obj.get('acl'), list):
                raise ValueError('CATALOG_ACL_INVALID')
            key = identity_key(obj.get('identity',''))
            if key is None:
                continue  # Object identity cannot be proved; lookup will HOLD.
            for acl in obj['acl']:
                if (not isinstance(acl, dict) or
                    not isinstance(acl.get('is_public'), bool) or
                    not isinstance(acl.get('privilege'), str) or
                    not isinstance(acl.get('grantable'), bool) or
                    (acl['is_public'] and acl.get('grantee') is not None) or
                    (not acl['is_public'] and not isinstance(acl.get('grantee'), str))):
                    raise ValueError('CATALOG_ACL_INVALID')
            idx.setdefault((kind,key), []).append(obj)
    return idx


def final_expected(event, later):
    """Expected direct ACL bits after an explicit REVOKE for one beneficiary.

    This does not model implicit grants, ownership, grantor paths or inherited
    effective rights. An ambiguous later ACL command of the same object *class*
    causes HOLD, even when it might target a different object.
    """
    expected = {right: False for right in event['rights']}
    later_grant = False
    scope = (event['kind'],event['identity'],event['grantee'])
    for stmt in later:
        if not START_ACL.match(stmt):
            continue
        kind = scope_kind(stmt)
        if kind not in SCOPED:
            # Syntax like ON ALL FUNCTIONS IN SCHEMA could affect this object.
            if POSSIBLE_SCOPE.search(stmt):
                return None, 'UNSUPPORTED_LATER_ACL_HOLD'
            continue
        parsed = parse_event(stmt)
        if parsed is None:
            if kind == event['kind']:
                return None, 'UNSUPPORTED_LATER_ACL_HOLD'
            continue
        if (parsed['kind'],parsed['identity'],parsed['grantee']) != scope:
            continue
        for privilege in event['rights'] & parsed['rights']:
            if parsed['op'] == 'GRANT':
                later_grant = True
                if not event['option_only'] or parsed['with_option']:
                    expected[privilege] = True
            elif parsed['op'] == 'REVOKE':
                if event['option_only'] or not parsed['option_only']:
                    expected[privilege] = False
    return expected, ('LATER_GRANT' if later_grant else 'FINAL_REVOKE')


def compare_direct(event, expected, snapshot):
    candidates = snapshot.get((event['kind'],event['identity']),[])
    if len(candidates) != 1:
        return 'OBJECT_UNRESOLVED_HOLD'
    acl = candidates[0]['acl']
    observed = {}
    for right in event['rights']:
        entries = [row for row in acl
                   if row['privilege'].upper()==right
                   and row['is_public']==event['grantee'][0]
                   and (event['grantee'][0] or row['grantee']==event['grantee'][1])]
        observed[right] = (any(row['grantable'] for row in entries)
                           if event['option_only'] else bool(entries))
    # Direct/default privileges observed from aclexplode (NOT effective rights).
    different = sum(observed[r] != expectation for r, expectation in expected.items())
    if different == 0:
        return 'CATALOG_DIRECT_CONSISTENT_OBSERVED'
    if different == len(expected):
        return 'CATALOG_DIRECT_CONFLICT_HOLD'
    return 'CATALOG_DIRECT_PARTIAL_CONFLICT_HOLD'


def analyze(source, target, catalog):
    """Classify exactly the same source-minus-target statements as strict RG02.

    The output carries aggregate counts only, never identifiers, SQL or secrets.
    """
    source_acl = extract(source)['grant_acl']
    target_acl = extract(target)['grant_acl']
    missing = source_acl - target_acl
    remaining = missing.copy()
    all_source = statements(source)
    catalog_idx = snapshot_index(catalog)
    counts = Counter()
    for position, stmt in enumerate(all_source):
        key = normalized(stmt)
        if remaining[key] <= 0:
            continue
        remaining[key] -= 1
        event = parse_event(stmt) if START_ACL.match(stmt) else None
        if not re.match(r'^\s*REVOKE\b',stmt,re.I):
            counts['NON_REVOKE_SQL_DIFF_HOLD'] += 1
        elif event is None or event['op'] != 'REVOKE':
            counts['UNPARSED_SOURCE_DIFF_HOLD'] += 1
        else:
            expected, reason = final_expected(event,all_source[position+1:])
            if expected is None:
                counts[reason] += 1
            else:
                verdict = compare_direct(event,expected,catalog_idx)
                counts[reason+'__'+verdict] += 1
    if sum(remaining.values()) != 0 or sum(counts.values()) != sum(missing.values()):
        raise ValueError('DIFF_ACCOUNTING_INVALID')
    return {
        'status':'HOLD_TARGETED_SQL_DIFF_OBSERVATION',
        'exact_sql_diff_count':sum(missing.values()),
        'by_class':dict(sorted(counts.items())),
        'scope':'ONLY_SOURCE_MINUS_TARGET_GRANT_ACL',
        'limit':'Snapshot observes direct/default ACL bits only; grantor, inheritance, ownership, source effective rights and membership are NOT VERIFIED',
        'GLOBAL_ROLES':'NOT_VERIFIED',
        'OWNER_ACL':'NOT_VERIFIED',
        'SQL_RELEASE':'NOT_RUN',
        'COMMERCIAL_GO':'NO_GO'
    }


def main():
    parser=argparse.ArgumentParser()
    for name in ('source-sql','target-sql','catalog-json','out'):
        parser.add_argument('--'+name,required=True)
    args=parser.parse_args()
    catalog=json.loads(Path(args.catalog_json).read_text())
    result=analyze(Path(args.source_sql).read_text(),
                   Path(args.target_sql).read_text(),catalog)
    fd=os.open(args.out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as stream:
        json.dump(result,stream,indent=2,sort_keys=True)
    print('RG02_TARGETED_ACL=HOLD_DIRECT_ONLY')
    print('TARGETED_EXACT_SQL_DIFF='+str(result['exact_sql_diff_count']))
    for name,count in result['by_class'].items():
        # Every output key is a fixed code-generated category, never source data.
        print('TARGETED_'+name+'='+str(count))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__=='__main__':
    try:
        main()
    except (OSError,ValueError,UnicodeDecodeError,json.JSONDecodeError):
        print('RG02_TARGETED_ACL=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
