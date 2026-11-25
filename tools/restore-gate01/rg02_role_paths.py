#!/usr/bin/env python3
"""RG02: HOLD-only comparison of declared PG17 role-membership paths.

The source is hash-audited, password-free pg_dumpall globals SQL; it is NEVER
executed. The target is the read-only, local pg_auth_members catalog snapshot
of the isolated PG17 restore. Both are runner-private files. This module only
prints fixed aggregate counters and writes a private mode-0600 JSON receipt.

A matched membership path is NOT a proof of effective object privileges:
source role flags, ownership, default ACLs and source catalog are NOT replayed.
"""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import re

from rg02_compare_runtime import IDENT, role_name, statements
from rg02_membership_parser import parse_membership

CREATE = re.compile(r'^\s*CREATE\s+(?:ROLE|USER)\s+(' + IDENT + r')\s*$', re.I | re.S)
SOURCE_LIMIT = 4096


def closure(edges, origins):
    """Membership reachability (no self-pairs). Edge direction: member -> role."""
    adjacent = defaultdict(set)
    for granted, member in edges:
        adjacent[member].add(granted)
    paths = set()
    for root in origins:
        seen = {root}
        pending = [root]
        while pending:
            for next_role in adjacent.get(pending.pop(), ()):
                if next_role in seen:
                    continue
                seen.add(next_role)
                pending.append(next_role)
                if next_role != root:
                    paths.add((root, next_role))
    return paths


def source_edges(source_roles):
    if not isinstance(source_roles, str):
        raise ValueError('SOURCE_NOT_TEXT')
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b',
                 source_roles, re.I):
        raise ValueError('SOURCE_PASSWORD_MATERIAL')
    declared = set()
    rows = {}
    counts = Counter()
    revoke_seen = False
    for stmt in statements(source_roles):
        m = CREATE.fullmatch(stmt)
        if m:
            declared.add(role_name(m.group(1)))
            continue
        if re.match(r'^\s*REVOKE\b', stmt, re.I):
            revoke_seen = True
            counts['SOURCE_REVOKE_HOLD'] += 1
        if not re.match(r'^\s*GRANT\b', stmt, re.I):
            continue
        counts['SOURCE_GRANTS'] += 1
        parsed = parse_membership(stmt)
        if parsed is None:
            counts['SOURCE_UNPARSED_GRANTS_HOLD'] += 1
            continue
        granted, member, grantor, options = parsed
        if granted == member:
            counts['SOURCE_SELF_GRANT_HOLD'] += 1
            continue
        key = (granted, member)
        if key in rows:
            counts['SOURCE_DUPLICATE_PAIR_HOLD'] += 1
            rows[key] = None
        else:
            rows[key] = (grantor, options)
        if grantor is None:
            counts['SOURCE_GRANTOR_UNSPECIFIED_HOLD'] += 1
        for field in ('inherit_option', 'set_option'):
            if field not in options:
                counts['SOURCE_' + field.upper() + '_UNSPECIFIED_HOLD'] += 1
    counts['SOURCE_DECLARE_ROLE_IDENTITIES'] = len(declared)
    counts['SOURCE_UNIQUE_ROLE_GRANTS'] = sum(row is not None for row in rows.values())
    if counts['SOURCE_GRANTS'] == 0:
        raise ValueError('NO_ROLE_MEMBERSHIPS_IN_SOURCE')
    origins = declared | {value for pair in rows for value in pair}
    if len(origins) > SOURCE_LIMIT:
        raise ValueError('SOURCE_GRAPH_TOO_LARGE')
    if revoke_seen:
        # A REVOKE could invalidate an earlier grant. Do not infer final paths.
        counts['PROJECTION_UNSAFE_REVOKE_HOLD'] = 1
        return {}, origins, counts
    clean = {key: value for key, value in rows.items() if value is not None}
    return clean, origins, counts


def target_edges(target_roles):
    if not isinstance(target_roles, dict):
        raise ValueError('LOCAL_CATALOG_NOT_OBJECT')
    roles = target_roles.get('roles')
    memberships = target_roles.get('memberships')
    if not isinstance(roles, list) or not isinstance(memberships, list):
        raise ValueError('LOCAL_CATALOG_ARRAY_MISSING')
    names = set()
    for role in roles:
        if not isinstance(role, dict) or not isinstance(role.get('name'), str):
            raise ValueError('LOCAL_ROLE_INVALID')
        if role['name'] in names:
            raise ValueError('LOCAL_ROLE_DUPLICATE')
        names.add(role['name'])
    if len(names) > SOURCE_LIMIT:
        raise ValueError('LOCAL_GRAPH_TOO_LARGE')
    rows = {}
    external_endpoints = 0
    for edge in memberships:
        if not isinstance(edge, dict):
            raise ValueError('LOCAL_EDGE_INVALID')
        granted = edge.get('granted')
        member = edge.get('member')
        grantor = edge.get('grantor')
        if not isinstance(granted, str) or not isinstance(member, str):
            raise ValueError('LOCAL_EDGE_IDENTITY_INVALID')
        if granted == member:
            raise ValueError('LOCAL_EDGE_SELF_MEMBERSHIP')
        # The workflow excludes pg_* roles from the role-attribute snapshot
        # but does NOT filter those built-in memberships. Those catalog edges
        # are valid for reachability; hold their missing role metadata only.
        if granted not in names or member not in names:
            external_endpoints += 1
        if grantor is not None and not isinstance(grantor, str):
            raise ValueError('LOCAL_EDGE_GRANTOR_INVALID')
        opts = {}
        for k in ('admin_option', 'inherit_option', 'set_option'):
            if not isinstance(edge.get(k), bool):
                raise ValueError('LOCAL_EDGE_OPTION_INVALID')
            opts[k] = edge[k]
        key = (granted, member)
        if key in rows:
            raise ValueError('LOCAL_EDGE_DUPLICATE')
        rows[key] = (grantor, opts)
    return rows, names, external_endpoints


def assess(source_roles, target):
    source, origins, src_counts = source_edges(source_roles)
    local, identities, external_endpoints = target_edges(target)
    results = Counter(src_counts)
    results['LOCAL_ROLE_IDENTITIES'] = len(identities)
    results['LOCAL_ROLE_EDGES'] = len(local)
    results['LOCAL_EDGE_ENDPOINT_OUTSIDE_ROLES_SNAPSHOT_HOLD'] = external_endpoints
    results['SOURCE_ROLE_IDENTITIES_ABSENT_LOCAL_HOLD'] = len(origins - identities)
    results['SOURCE_MEMBERSHIP_DIRECT_MISSING_HOLD'] = sum(
        pair not in local for pair in source)
    # Unknown source grantors and unspecified option defaults remain HOLD.
    for pair, (grantor, options) in source.items():
        observed = local.get(pair)
        if observed is None:
            continue
        got_grantor, got_options = observed
        if grantor is None:
            results['SOURCE_GRANTOR_NOT_DECLARED_HOLD'] += 1
        elif grantor != got_grantor:
            results['MEMBERSHIP_GRANTOR_MISMATCH_HOLD'] += 1
        else:
            results['MEMBERSHIP_GRANTOR_OBSERVED'] += 1
        for opt, expected in options.items():
            if got_options[opt] != expected:
                results['MEMBERSHIP_' + opt.upper() + '_DIFF_HOLD'] += 1
            else:
                results['MEMBERSHIP_' + opt.upper() + '_OBSERVED'] += 1

    for name, key in (
        ('MEMBER', None),
        ('INHERIT', 'inherit_option'),
        ('SET', 'set_option'),
    ):
        expected = {edge for edge, (_, opts) in source.items()
                    if key is None or opts.get(key) is True}
        observed = {edge for edge, (_, opts) in local.items()
                    if key is None or opts[key] is True}
        src_paths = closure(expected, origins)
        local_paths = closure(observed, origins)
        results[name + '_DECLARED_PATHS'] = len(src_paths)
        results[name + '_PATHS_OBSERVED_LOCAL'] = len(src_paths & local_paths)
        results[name + '_PATHS_MISSING_LOCAL_HOLD'] = len(src_paths - local_paths)
    # No semantic equality verdict: only under-approximated source paths are
    # evaluated, because unspecified role flags/options and global grants hold.
    return {
        'status': 'HOLD_MEMBERSHIP_PATH_EVIDENCE',
        'counts': dict(sorted(results.items())),
        'scope': 'PG17 declared role-member reachability; INHERIT and SET paths only when all edges explicitly TRUE',
        'limitations': 'Conservative subset, NOT source effective rights: source grants may be unparsed; role attributes and elevated privileges are intentionally unimported',
        'GLOBAL_ROLES': 'NOT_VERIFIED',
        'OWNER_ACL': 'NOT_VERIFIED',
        'COMMERCIAL_GO': 'NO_GO',
        'REMOTE_WRITES': 'NONE',
        'SQL_RELEASE': 'NOT_RUN',
    }


def main():
    p = argparse.ArgumentParser()
    for x in ('source-roles', 'target-roles', 'out'):
        p.add_argument('--' + x, required=True)
    args = p.parse_args()
    result = assess(Path(args.source_roles).read_text(encoding='utf-8'),
                    json.loads(Path(args.target_roles).read_text(encoding='utf-8')))
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(result, f, sort_keys=True, indent=2)
    print('RG02_ROLE_PATHS=HOLD_DIAGNOSTIC_ONLY')
    for name, count in result['counts'].items():
        print('ROLE_PATHS_' + name + '=' + str(count))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_ROLE_PATHS=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
