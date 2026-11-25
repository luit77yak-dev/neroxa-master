#!/usr/bin/env python3
"""RG02 catalog-only REVOKE and membership diagnostic (never a GO gate).

The only database interaction is a separate, fixed, read-only catalog SELECT.
This module consumes that saved snapshot and SQL from the already audited dump.
No SQL statements from the dump are executed, and identifiers never reach logs.
"""
import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path

from rg02_compare_runtime import statements, role_name, IDENT
from rg02_membership_parser import parse_membership as parse_membership_pg17

# PostgreSQL 17 ACL rights, including MAINTAIN on tables.
RIGHTS = {
    'FUNCTION': ('EXECUTE',),
    'TABLE': ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
              'REFERENCES', 'TRIGGER', 'MAINTAIN'),
}
REVOKE = re.compile(
    r'^\s*REVOKE\s+(?P<option>GRANT\s+OPTION\s+FOR\s+)?'
    r'(?P<rights>ALL(?:\s+PRIVILEGES)?|[A-Z_,\s]+?)\s+'
    r'ON\s+(?P<kind>FUNCTION|TABLE)\s+(?P<identity>.+)\s+'
    r'FROM\s+(?P<grantee>' + IDENT + r')'
    r'(?:\s+GRANTED\s+BY\s+' + IDENT + r')?'
    r'(?:\s+(?:RESTRICT|CASCADE))?\s*$', re.I | re.S)
WORD = re.compile(r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9$]*|[0-9]+|[.(),\[\]]')


def identity_key(value):
    """Identity tokens with SQL identifier case folded, *not* type synonyms.

    Reject symbols, string literals, comments and ambiguous syntax. A failed
    match is HOLD, not permission to omit an object.
    """
    tokens = []
    offset = 0
    for match in WORD.finditer(value):
        if value[offset:match.start()].strip():
            return None
        token = match.group()
        if token.startswith('"'):
            ident = token[1:-1].replace('""', '"')
            tokens.append(('id', ident))
        elif re.fullmatch('[A-Za-z_][A-Za-z_0-9$]*', token):
            tokens.append(('id', token.lower()))
        else:
            tokens.append(('symbol', token))
        offset = match.end()
    if value[offset:].strip() or not tokens:
        return None
    # Exclude unqualified names and unrelated value expressions.
    if len(tokens) < 3 or tokens[1] != ('symbol', '.'):
        return None
    return tuple(tokens)


def revoke_request(statement):
    match = REVOKE.fullmatch(statement)
    if match is None:
        return None
    kind = match.group('kind').upper()
    target = identity_key(match.group('identity'))
    if target is None:
        return None
    raw_rights = match.group('rights').strip()
    if re.fullmatch(r'ALL(?:\s+PRIVILEGES)?', raw_rights, re.I):
        rights = RIGHTS[kind]
    else:
        rights = tuple(part.strip().upper() for part in raw_rights.split(','))
        if not rights or len(rights) != len(set(rights)) or any(
                part not in RIGHTS[kind] for part in rights):
            return None
    grantee = match.group('grantee')
    is_public = grantee.upper() == 'PUBLIC' and not grantee.startswith('"')
    return {
        'kind': kind,
        'identity': target,
        'rights': rights,
        'grantee': None if is_public else role_name(grantee),
        'is_public': is_public,
        'option_only': bool(match.group('option')),
    }


def inspect_revocations(source_sql, catalog):
    objects = {}
    for kind, field in (('FUNCTION', 'functions'), ('TABLE', 'relations')):
        entries = catalog.get(field)
        if not isinstance(entries, list):
            raise ValueError('CATALOG_FORMAT')
        for obj in entries:
            if not isinstance(obj, dict) or not isinstance(obj.get('acl'), list):
                raise ValueError('CATALOG_FORMAT')
            key = identity_key(obj.get('identity', ''))
            if key is not None:
                objects.setdefault((kind, key), []).append(obj)
    counts = Counter()
    for statement in statements(source_sql):
        if not re.match(r'^\s*REVOKE\b', statement, re.I):
            continue
        # The source is the pg_restore schema SQL. Source syntax is never run.
        if not re.search(r'\bON\s+(?:FUNCTION|TABLE)\b', statement, re.I):
            continue
        counts['REVOKES_IN_SCOPE'] += 1
        parsed = revoke_request(statement)
        if parsed is None:
            counts['SOURCE_SYNTAX_UNRESOLVED'] += 1
            continue
        candidates = objects.get((parsed['kind'], parsed['identity']), [])
        if len(candidates) != 1:
            counts['OBJECT_UNRESOLVED_OR_AMBIGUOUS'] += 1
            continue
        obj = candidates[0]
        acl_rows = obj['acl']
        valid = True
        for entry in acl_rows:
            if not isinstance(entry, dict) or not isinstance(entry.get('privilege'), str) or not isinstance(entry.get('is_public'), bool) or not isinstance(entry.get('grantable'), bool):
                valid = False
                break
        if not valid:
            counts['CATALOG_ACL_FORMAT_UNRESOLVED'] += 1
            continue
        relevant = [e for e in acl_rows
                    if e['is_public'] == parsed['is_public']
                    and (parsed['is_public'] or e.get('grantee') == parsed['grantee'])
                    and e['privilege'].upper() in parsed['rights']]
        if parsed['option_only']:
            still = any(e['grantable'] for e in relevant)
        else:
            still = bool(relevant)
        if still:
            counts['DIRECT_OR_DEFAULT_GRANT_PRESENT_HOLD'] += 1
        else:
            # Only checks target's direct/default ACL, not inherited effective rights.
            counts['DIRECT_OR_DEFAULT_ABSENCE_OBSERVED'] += 1
    return counts


def parse_membership(stmt):
    """Retain existing (role, member, explicit_options) interface safely."""
    parsed = parse_membership_pg17(stmt)
    if parsed is None:
        return None
    role, member, _grantor, options = parsed
    return role, member, options


def inspect_membership_options(source_roles, target_roles):
    edges = {}
    for e in target_roles.get('memberships', []):
        if not isinstance(e, dict) or not all(k in e for k in ('granted', 'member', 'admin_option', 'inherit_option', 'set_option')):
            raise ValueError('MEMBERSHIP_CATALOG_INCOMPLETE')
        edges.setdefault((e['granted'], e['member']), []).append(e)
    counts = Counter()
    for stmt in statements(source_roles):
        if not re.match(r'^\s*GRANT\b', stmt, re.I):
            continue
        counts['MEMBERSHIPS_IN_SOURCE'] += 1
        parsed = parse_membership(stmt)
        if parsed is None:
            counts['MEMBERSHIP_SYNTAX_UNRESOLVED'] += 1
            continue
        granted, member, opts = parsed
        edge = edges.get((granted, member), [])
        if len(edge) != 1:
            counts['MEMBERSHIP_MISSING_OR_AMBIGUOUS'] += 1
        elif any(edge[0][key] is not expected for key, expected in opts.items()):
            counts['MEMBERSHIP_OPTION_DIFFERENCE'] += 1
        elif opts:
            counts['EXPLICIT_OPTIONS_MATCH_CATALOG'] += 1
        else:
            counts['MEMBERSHIP_EXISTS_OPTIONS_UNSPECIFIED'] += 1
    return counts



def inspect_login_hold(source_roles, target_roles):
    """Classify unreplayed LOGIN flags by direction; never modify role privileges."""
    seen = {}
    pattern = re.compile(r'^\s*ALTER\s+(?:ROLE|USER)\s+(' + IDENT +
                         r')\s+WITH\s+(.+)$', re.I | re.S)
    for stmt in statements(source_roles):
        m = pattern.fullmatch(stmt)
        if m is None:
            continue
        flags = list(re.finditer(r'\b(NO)?LOGIN\b', m.group(2), re.I))
        if flags:
            seen[role_name(m.group(1))] = not bool(flags[-1].group(1))
    actual = {r['name']: r.get('login') for r in target_roles.get('roles', [])
              if isinstance(r, dict) and isinstance(r.get('name'), str)}
    counts = Counter()
    for role, expected in seen.items():
        if role not in actual or not isinstance(actual[role], bool):
            counts['LOGIN_ROLE_UNRESOLVED'] += 1
        elif actual[role] != expected:
            if expected:
                counts['LOGIN_EXPECTED_TRUE_LOCAL_FALSE_HOLD'] += 1
            else:
                counts['LOGIN_EXPECTED_FALSE_LOCAL_TRUE_HOLD'] += 1
    return counts


def diagnose(source_sql, source_roles, catalog, target_roles):
    rev = inspect_revocations(source_sql, catalog)
    members = inspect_membership_options(source_roles, target_roles)
    logins = inspect_login_hold(source_roles, target_roles)
    return {
        'status': 'HOLD_CATALOG_DIAGNOSTIC_ONLY',
        'revoke_counts': dict(sorted(rev.items())),
        'membership_counts': dict(sorted(members.items())),
        'login_counts': dict(sorted(logins.items())),
        'interpretation': 'ACL direct/default absence only; no proof of role inheritance, owner rights or privilege equivalence',
        'GLOBAL_ROLES': 'NOT_VERIFIED',
        'OWNER_ACL': 'NOT_VERIFIED',
        'SQL_RELEASE': 'NOT_RUN',
        'COMMERCIAL_GO': 'NO_GO',
    }


def main():
    p = argparse.ArgumentParser()
    for name in ('source-sql', 'source-roles', 'catalog-json', 'target-roles', 'out'):
        p.add_argument('--' + name, required=True)
    args = p.parse_args()
    catalog = json.loads(Path(args.catalog_json).read_text())
    roles = json.loads(Path(args.target_roles).read_text())
    if not isinstance(catalog, dict) or not isinstance(roles, dict):
        raise ValueError('PRIVATE_INPUT_INVALID')
    result = diagnose(Path(args.source_sql).read_text(), Path(args.source_roles).read_text(), catalog, roles)
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(result, f, sort_keys=True, indent=2)
    print('RG02_CATALOG_PROBE=HOLD_DIRECT_ACL_ONLY')
    for group in ('revoke_counts', 'membership_counts', 'login_counts'):
        for key, value in result[group].items():
            print(group.upper() + '_' + key + '=' + str(value))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_CATALOG_PROBE=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
