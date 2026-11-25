#!/usr/bin/env python3
"""RG02: prepare isolated *unprivileged* role identities; never import global rights."""
import argparse
import json
import os
import re
import sys
from pathlib import Path

from rg02_compare_runtime import statements, role_name, IDENT, role_metadata_kind
from rg02_global_grant_scope import global_grant_scope

MANAGED = {
    'postgres', 'anon', 'authenticated', 'service_role', 'authenticator',
    'dashboard_user', 'pgbouncer', 'supabase_admin', 'supabase_auth_admin',
    'supabase_storage_admin', 'supabase_realtime_admin',
    'supabase_replication_admin',
}
HIGH_RISK = ('SUPERUSER', 'CREATEROLE', 'CREATEDB', 'REPLICATION', 'BYPASSRLS')
CREATE = re.compile(r'^\s*CREATE\s+(?:ROLE|USER)\s+(' + IDENT + r')\s*$', re.I | re.S)
ALTER = re.compile(r'^\s*ALTER\s+(?:ROLE|USER)\s+(' + IDENT + r')\s+WITH\s+(.+)$', re.I | re.S)


def role_category(name):
    return 'managed' if name.lower() in MANAGED or name.lower().startswith('supabase_') else 'other'


def quoted(name):
    return '"' + name.replace('"', '""') + '"'


def prepare(text, existing):
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b', text, re.I):
        raise ValueError('SOURCE_PASSWORD_MATERIAL')
    if not isinstance(existing, list) or not all(isinstance(v, str) for v in existing):
        raise ValueError('TARGET_CATALOG_FORMAT')
    created = set()
    elevated = set()
    memberships = 0
    parameter_privilege_holds = 0
    metadata_holds = {'role_setting_hold': 0, 'role_comment_hold': 0}
    metadata_targets = set()
    unknown = 0
    for stmt in statements(text):
        m = CREATE.fullmatch(stmt)
        if m:
            name = role_name(m.group(1))
            if name in created:
                raise ValueError('DUPLICATE_SOURCE_ROLE')
            if (not name or len(name.encode('utf-8')) > 63 or '\x00' in name
                    or name.lower().startswith('pg_')):
                raise ValueError('UNSAFE_ROLE_NAME')
            created.add(name)
            continue
        m = ALTER.fullmatch(stmt)
        if m:
            name = role_name(m.group(1))
            opts = m.group(2)
            # Positive flags only; NOSUPERUSER/NOBYPASSRLS do not count as elevated.
            if any(re.search(r'(?<![A-Za-z0-9_])' + flag + r'\b', opts, re.I)
                   for flag in HIGH_RISK):
                elevated.add(name)
            continue
        held = role_metadata_kind(stmt)
        if held:
            metadata_holds[held[0]] += 1
            metadata_targets.add(held[1])
            continue
        if re.match(r'^\s*GRANT\b', stmt, re.I):
            scope = global_grant_scope(stmt)
            if scope.startswith('parameter_acl_'):
                parameter_privilege_holds += 1
            else:
                memberships += 1
            continue
        if re.match(r'^\s*REVOKE\b', stmt, re.I):
            # REVOKE scope remains a hold; never replay it or assume equality.
            memberships += 1
            continue
        if re.match(r'^\s*(SET\b|SELECT\s+pg_catalog\.set_config\s*\()', stmt, re.I):
            continue
        unknown += 1
    if not created or not elevated.issubset(created) or unknown:
        raise ValueError('ROLE_SOURCE_UNCLASSIFIED')
    if not metadata_targets.issubset(created):
        raise ValueError('ROLE_METADATA_TARGET_UNDECLARED')
    missing = created - set(existing)
    # Missing core operators indicate an incompatible PG17 bootstrap.
    if missing & {'postgres', 'supabase_admin'}:
        raise ValueError('RESERVED_BOOTSTRAP_ROLE_MISSING')
    # Other managed roles from the hash-verified globals may be represented by
    # disposable NOLOGIN shells ONLY. This does not import flags, memberships,
    # bypass rights, passwords or effective privileges from the source.
    lines = [
        'CREATE ROLE ' + quoted(name) +
        ' WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;'
        for name in sorted(missing)
    ]
    receipt = {
        'declared': len(created),
        'already_present': len(created & set(existing)),
        'missing': len(missing),
        'managed_identity_shells': sum(role_category(n) == 'managed' for n in missing),
        'source_elevated_roles_hold': len(elevated),
        'elevated_identity_shells': len(elevated & missing),
        'memberships_hold': memberships,
        'global_parameter_privilege_holds': parameter_privilege_holds,
        'role_setting_holds': metadata_holds['role_setting_hold'],
        'role_comment_holds': metadata_holds['role_comment_hold'],
        'role_metadata_applied': 0,
        'privileges_applied': 0,
        'memberships_applied': 0,
    }
    return ('\n'.join(lines) + '\n' if lines else ''), receipt


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source-roles', type=Path, required=True)
    p.add_argument('--existing-roles', type=Path, required=True)
    p.add_argument('--output-sql', type=Path, required=True)
    args = p.parse_args()
    sql, receipt = prepare(args.source_roles.read_text(encoding='utf-8'),
                           json.loads(args.existing_roles.read_text(encoding='utf-8')))
    fd = os.open(args.output_sql, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        out.write(sql)
    print('ROLE_IDENTITIES_SOURCE=CLASSIFIED; ' +
          '; '.join(k.upper() + '=' + str(v) for k, v in receipt.items()))
    print('ROLE_FLAGS_IMPORTED=NO; MEMBERSHIPS_IMPORTED=NO; ROLE_EQUIVALENCE=NOT_VERIFIED')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        reason = str(exc) if isinstance(exc, ValueError) and str(exc) in {
            'SOURCE_PASSWORD_MATERIAL', 'TARGET_CATALOG_FORMAT',
            'DUPLICATE_SOURCE_ROLE', 'UNSAFE_ROLE_NAME',
            'ROLE_SOURCE_UNCLASSIFIED', 'RESERVED_BOOTSTRAP_ROLE_MISSING',
            'ROLE_METADATA_TARGET_UNDECLARED'
        } else 'PRIVATE_INPUT_INVALID'
        print('RG02_ROLE_PLACEHOLDERS=BLOCKED:' + reason, file=sys.stderr)
        sys.exit(1)
