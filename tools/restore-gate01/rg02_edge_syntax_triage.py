#!/usr/bin/env python3
"""RG02: fail-closed, aggregate-only triage of remaining global ROLE grants.

Reads the audited password-free source globals and isolated local PG17 catalog
already saved on a private runner. No SQL is executed. This is not an
effective privilege comparison and can never grant commercial GO.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re

from rg02_compare_runtime import IDENT, role_name, statements
from rg02_membership_parser import parse_membership
from rg02_role_paths import target_edges

IDENT_LIST = re.compile(r'^' + IDENT + r'(?:\s*,\s*' + IDENT + r')+$', re.I | re.S)
ROLE_GRANT_HEAD = re.compile(r'^\s*GRANT\s+(.*?)\s+TO\s+(.*)$', re.I | re.S)
TAIL_FIRST = re.compile(r'^\s*(' + IDENT + r')(.*)$', re.I | re.S)
SOURCE_DECLARED = re.compile(r'^\s*CREATE\s+(?:ROLE|USER)\s+(' + IDENT + r')\s*$', re.I | re.S)


def syntax_class(stmt):
    """Classify unsupported GRANT forms without logging user-supplied strings."""
    m = ROLE_GRANT_HEAD.fullmatch(stmt)
    if m is None:
        return 'GRANT_MISSING_SINGLE_TO_OR_OTHER_FORM_HOLD'
    lhs, rhs = m.group(1).strip(), m.group(2).strip()
    if re.search(r'\bON\s+(?:DATABASE|SCHEMA|TABLE|FUNCTION|SEQUENCE|ALL)\b',lhs,re.I):
        return 'OBJECT_PRIVILEGE_GRANT_NOT_ROLE_HOLD'
    if IDENT_LIST.fullmatch(lhs):
        return 'MULTI_GRANTED_ROLE_LIST_HOLD'
    if not re.fullmatch(IDENT, lhs, re.I|re.S):
        return 'GRANTED_ROLE_EXPRESSION_UNSUPPORTED_HOLD'
    part = TAIL_FIRST.fullmatch(rhs)
    if part is None:
        return 'MEMBER_IDENTITY_UNSUPPORTED_HOLD'
    tail = part.group(2).strip()
    if tail.startswith(','):
        return 'MULTI_MEMBER_ROLE_LIST_HOLD'
    if tail.upper().startswith('WITH'):
        return 'MEMBERSHIP_OPTIONS_UNSUPPORTED_HOLD'
    if tail.upper().startswith('GRANTED'):
        return 'MEMBERSHIP_GRANTOR_UNSUPPORTED_HOLD'
    return 'OTHER_ROLE_GRANT_SYNTAX_UNRESOLVED_HOLD'


def analyze(source_sql, target_catalog):
    if not isinstance(source_sql, str):
        raise ValueError('SOURCE_TYPE_INVALID')
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b',
                 source_sql, re.I):
        raise ValueError('SOURCE_PASSWORD_MATERIAL')
    # The normal roles[] list intentionally excludes the pg_* system roles;
    # only the new, private system_role_names snapshot can establish presence.
    if not isinstance(target_catalog, dict):
        raise ValueError('LOCAL_CATALOG_INVALID')
    system_roles = target_catalog.get('system_role_names')
    if not isinstance(system_roles, list) or any(
            not isinstance(x, str) or not x.startswith('pg_') for x in system_roles):
        raise ValueError('SYSTEM_ROLE_CATALOG_MISSING_OR_INVALID')
    if len(set(system_roles)) != len(system_roles):
        raise ValueError('DUPLICATE_SYSTEM_ROLE')
    local, regular, outside_edges = target_edges(target_catalog)
    if set(system_roles) & regular:
        raise ValueError('ROLE_SNAPSHOT_OVERLAP')
    full_catalog = regular | set(system_roles)
    counts = Counter()
    parsed_pairs = {}
    source_declared = set()
    source_endpoints = set()
    for stmt in statements(source_sql):
        m = SOURCE_DECLARED.fullmatch(stmt)
        if m:
            source_declared.add(role_name(m.group(1)))
            continue
        if re.match(r'^\s*REVOKE\b',stmt,re.I):
            counts['SOURCE_REVOKE_STILL_HOLD'] += 1
            continue
        if not re.match(r'^\s*GRANT\b',stmt,re.I):
            continue
        counts['SOURCE_GRANT_COMMANDS'] += 1
        parsed = parse_membership(stmt)
        if parsed is None:
            counts['SOURCE_GRANT_UNPARSED_HOLD'] += 1
            counts['SYNTAX_'+syntax_class(stmt)] += 1
            continue
        granted, member, grantor, options = parsed
        if granted == member:
            counts['SOURCE_SELF_GRANT_HOLD'] += 1
            continue
        source_endpoints.update((granted, member))
        pair = (granted, member)
        if pair in parsed_pairs:
            counts['SOURCE_DUPLICATE_PAIR_HOLD'] += 1
            parsed_pairs[pair] = None
        else:
            parsed_pairs[pair] = (grantor, options)
    counts['SOURCE_PARSED_GRANT_COMMANDS'] = (
        counts['SOURCE_GRANT_COMMANDS'] -
        counts['SOURCE_GRANT_UNPARSED_HOLD'])
    counts['SOURCE_PAIRED_UNIQUE_GRANTS'] = sum(
        val is not None for val in parsed_pairs.values())
    counts['SYSTEM_ROLE_NAMES_IN_PRIVATE_CATALOG'] = len(system_roles)
    counts['LOCAL_EDGES_WITH_ENDPOINT_OUTSIDE_FILTERED_ROLE_LIST'] = outside_edges

    # Distinguish omission from filtered roles[] and actual absence, but never
    # infer that a built-in exists without system_role_names evidence.
    source_referred = source_endpoints | source_declared
    counts['SOURCE_ENDPOINTS_NOT_IN_FILTERED_ROLE_LIST'] = len(source_referred - regular)
    counts['SOURCE_ENDPOINTS_SYSTEM_ROLE_CONFIRMED'] = len(
        (source_referred - regular) & set(system_roles))
    counts['SOURCE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'] = len(
        source_referred - full_catalog)
    counts['LOCAL_EDGE_ENDPOINTS_CONFIRMED_SYSTEM_ROLE'] = sum(
        bool({granted, member} & set(system_roles))
        for granted, member in local if granted not in regular or member not in regular)
    counts['LOCAL_EDGE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'] = sum(
        granted not in full_catalog or member not in full_catalog
        for granted, member in local)

    for pair, proof in parsed_pairs.items():
        if proof is None:
            continue
        if pair in local:
            counts['SOURCE_DIRECT_EDGE_PRESENT_LOCAL'] += 1
            continue
        counts['SOURCE_DIRECT_EDGE_MISSING_HOLD'] += 1
        left, right = pair
        if left in full_catalog and right in full_catalog:
            counts['MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD'] += 1
        elif left not in full_catalog and right not in full_catalog:
            counts['MISSING_EDGE_BOTH_IDENTITIES_NOT_CATALOG_CONFIRMED_HOLD'] += 1
        elif left not in full_catalog:
            counts['MISSING_EDGE_GRANTED_IDENTITY_NOT_CATALOG_CONFIRMED_HOLD'] += 1
        else:
            counts['MISSING_EDGE_MEMBER_IDENTITY_NOT_CATALOG_CONFIRMED_HOLD'] += 1
        if left in system_roles or right in system_roles:
            counts['MISSING_EDGE_INVOLVES_CONFIRMED_PG_SYSTEM_ROLE_HOLD'] += 1
        else:
            counts['MISSING_EDGE_NO_CONFIRMED_PG_SYSTEM_ROLE_HOLD'] += 1

    if counts['SOURCE_GRANT_COMMANDS'] == 0:
        raise ValueError('NO_SOURCE_ROLE_GRANTS')
    if counts['SOURCE_DIRECT_EDGE_MISSING_HOLD'] + counts['SOURCE_DIRECT_EDGE_PRESENT_LOCAL'] != counts['SOURCE_PAIRED_UNIQUE_GRANTS']:
        raise ValueError('EDGE_ACCOUNTING_FAILED')
    return {
        'status':'HOLD_SOURCE_GRANTS_AND_SYSTEM_ROLE_ENDPOINTS',
        'counts':dict(sorted(counts.items())),
        'limitations':'Syntax shape and catalog edge presence only; NO replay of source grants, owner rights, inheritance equivalence or effective privilege proof',
        'GLOBAL_ROLES':'NOT_VERIFIED',
        'OWNER_ACL':'NOT_VERIFIED',
        'SQL_RELEASE':'NOT_RUN',
        'REMOTE_WRITES':'NONE',
        'COMMERCIAL_GO':'NO_GO'
    }


def main():
    p=argparse.ArgumentParser()
    for name in ('source-roles','target-roles','out'):
        p.add_argument('--'+name,required=True)
    args=p.parse_args()
    report=analyze(Path(args.source_roles).read_text(encoding='utf-8'),
                   json.loads(Path(args.target_roles).read_text(encoding='utf-8')))
    fd=os.open(args.out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as output:
        json.dump(report,output,sort_keys=True,indent=2)
    print('RG02_EDGE_SYNTAX_TRIAGE=HOLD_DIAGNOSTIC_ONLY')
    for key,value in report['counts'].items():
        print('EDGE_SYNTAX_'+key+'='+str(value))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__=='__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_EDGE_SYNTAX_TRIAGE=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
