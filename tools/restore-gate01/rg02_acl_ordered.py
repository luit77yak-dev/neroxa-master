#!/usr/bin/env python3
"""RG02 ordered ACL diagnostic: read only, HOLD only, sanitized counters.

A later GRANT can explain why an earlier REVOKE's privilege is present in a
restored catalog. This module never treats that explanation as equivalence.
Grantor scope, default privileges, role inheritance and actual source catalog
remain unverified. No source SQL is executed.
"""
import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path

from rg02_compare_runtime import statements, IDENT, role_name
from rg02_catalog_reconcile import RIGHTS, identity_key, revoke_request, inspect_revocations

GRANT = re.compile(
    r'^\s*GRANT\s+(?P<rights>ALL(?:\s+PRIVILEGES)?|[A-Z_,\s]+?)\s+'
    r'ON\s+(?P<kind>FUNCTION|TABLE)\s+(?P<identity>.+)\s+'
    r'TO\s+(?P<grantee>' + IDENT + r')'
    r'(?P<option>\s+WITH\s+GRANT\s+OPTION)?'
    r'(?:\s+GRANTED\s+BY\s+' + IDENT + r')?\s*$',
    re.I | re.S
)
START = re.compile(r'^\s*(?:REVOKE|GRANT)\b', re.I)
SCOPE = re.compile(r'\bON\s+(FUNCTION|TABLE)\b', re.I)


def scope_kind(stmt):
    found = SCOPE.search(stmt)
    return found.group(1).upper() if found else None


def parse_rights(raw, kind):
    if re.fullmatch(r'ALL(?:\s+PRIVILEGES)?', raw.strip(), re.I):
        return frozenset(RIGHTS[kind])
    result = [p.strip().upper() for p in raw.split(',')]
    if not result or len(result) != len(set(result)) or any(
            right not in RIGHTS[kind] for right in result):
        return None
    return frozenset(result)


def parse_event(stmt):
    """Parse only one-grantee FUNCTION/TABLE GRANT or REVOKE without grantor.

    Anything else stays unresolved, never silently treated as a matching event.
    """
    if re.search(r'\bGRANTED\s+BY\b', stmt, re.I):
        return None
    if re.match(r'^\s*REVOKE\b', stmt, re.I):
        p = revoke_request(stmt)
        if p is None:
            return None
        return {
            'op': 'REVOKE', 'kind': p['kind'],
            'identity': p['identity'],
            'grantee': (p['is_public'], p['grantee']),
            'rights': frozenset(p['rights']),
            'option_only': p['option_only'], 'with_option': False,
        }
    m = GRANT.fullmatch(stmt)
    if m is None:
        return None
    kind = m.group('kind').upper()
    identity = identity_key(m.group('identity'))
    rights = parse_rights(m.group('rights'), kind)
    if identity is None or rights is None:
        return None
    grantee = m.group('grantee')
    is_public = grantee.upper() == 'PUBLIC' and not grantee.startswith('"')
    return {
        'op': 'GRANT', 'kind': kind, 'identity': identity,
        'grantee': (is_public, None if is_public else role_name(grantee)),
        'rights': rights, 'option_only': False,
        'with_option': bool(m.group('option')),
    }


def order_category(index, event, events):
    """For a REVOKE, classify only the *last* later supported SQL events.

    This is a heuristic based on explicit commands, not a simulated PostgreSQL
    ACL evaluator. Any later unparsed command for the same object class is HOLD.
    """
    later = events[index + 1:]
    if any(obj is None and kind == event['kind'] for kind, obj, _ in later):
        return 'UNPARSED_LATER_ACL_HOLD'
    state = {right: False for right in event['rights']}
    later_matching_grant = False
    for kind, other, _ in later:
        if other is None or (other['kind'], other['identity'], other['grantee']) != (
                event['kind'], event['identity'], event['grantee']):
            continue
        for right in event['rights'] & other['rights']:
            if other['op'] == 'GRANT':
                later_matching_grant = True
                if event['option_only']:
                    # Ordinary GRANT does not necessarily restore grantability.
                    if other['with_option']:
                        state[right] = True
                else:
                    state[right] = True
            elif other['op'] == 'REVOKE':
                if event['option_only'] or not other['option_only']:
                    state[right] = False
    if not later_matching_grant:
        return 'NO_LATER_MATCHING_GRANT'
    if all(state.values()):
        return 'LAST_SUPPORTED_EVENT_GRANT_ALL'
    if any(state.values()):
        return 'LAST_SUPPORTED_EVENT_GRANT_PARTIAL'
    return 'LATER_GRANT_OVERRIDDEN_OR_OPTION_HOLD'


def analyze(source_sql, catalog):
    parsed = []
    for stmt in statements(source_sql):
        if START.match(stmt) and scope_kind(stmt):
            p = parse_event(stmt)
            parsed.append((scope_kind(stmt), p, stmt))
    counts = Counter()
    for idx, (kind, event, stmt) in enumerate(parsed):
        if not re.match(r'^\s*REVOKE\b', stmt, re.I):
            continue
        counts['REVOKES_IN_SCOPE'] += 1
        if event is None:
            counts['SOURCE_REVOKE_UNPARSED_HOLD'] += 1
            continue
        category = order_category(idx, event, parsed)
        counts[category] += 1
        # The same PG17 snapshot used by the already existing catalog auditor.
        # Cross-tabulate *observations*, not inferred final privileges.
        observed = inspect_revocations(stmt + ';', catalog)
        if observed['DIRECT_OR_DEFAULT_GRANT_PRESENT_HOLD']:
            counts['CATALOG_PRESENT_' + category] += 1
        elif observed['DIRECT_OR_DEFAULT_ABSENCE_OBSERVED']:
            counts['CATALOG_ABSENT_' + category] += 1
        else:
            counts['CATALOG_UNRESOLVED_' + category] += 1
    return {
        'status': 'HOLD_ORDERED_ACL_DIAGNOSTIC',
        'aggregate_counts': dict(sorted(counts.items())),
        'limitations': 'SQL order only; grantors, inheritance, defaults, owners and effective-privilege equivalence remain unproved',
        'GLOBAL_ROLES': 'NOT_VERIFIED',
        'OWNER_ACL': 'NOT_VERIFIED',
        'SQL_RELEASE': 'NOT_RUN',
        'COMMERCIAL_GO': 'NO_GO',
    }


def main():
    p = argparse.ArgumentParser()
    for arg in ('source-sql', 'catalog-json', 'out'):
        p.add_argument('--' + arg, required=True)
    args = p.parse_args()
    catalog = json.loads(Path(args.catalog_json).read_text())
    if not isinstance(catalog, dict):
        raise ValueError('INVALID_CATALOG')
    result = analyze(Path(args.source_sql).read_text(), catalog)
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, sort_keys=True, indent=2)
    print('RG02_ORDERED_ACL=HOLD_DIAGNOSTIC_ONLY')
    for name, count in result['aggregate_counts'].items():
        print('ORDERED_ACL_' + name + '=' + str(count))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_ORDERED_ACL=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
