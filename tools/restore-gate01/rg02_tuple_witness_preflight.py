#!/usr/bin/env python3
"""RG02 private tuple-witness *preflight*, NEVER provenance or GO proof.

Consumes only future, separately authorized source and isolated-restore
witnesses. There is no production connection or SQL in this module.
Same aggregate counts can hide swapped privileges: compare exact private
(role, object kind, canonical object identity, privilege, observed value).

This cannot authenticate the source capture, establish transaction/snapshot
coherence, validate that all roles/objects were enumerated, or prove rights
in RLS/SECURITY DEFINER contexts. Even exact tuple equality remains HOLD.
No raw identities, hashes, tuples, or input exception messages leave stdout.
"""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re

from rg02_local_effective_rights import KINDS

VERSION = 1
MAX_BYTES = 32 * 1024 * 1024
MAX_ROWS = 250_000
SHA256 = re.compile(r'[0-9a-f]{64}\Z')
CAPTURE = re.compile(r'[0-9a-f]{32}\Z')
PRIVILEGES = {
    'ROLE': {'MEMBER', 'USAGE', 'SET'},
    'SCHEMA': {'USAGE', 'CREATE'},
    'TABLE': {'SELECT', 'INSERT', 'UPDATE', 'DELETE',
              'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'},
    'FUNCTION': {'EXECUTE'},
    'SEQUENCE': {'USAGE', 'SELECT', 'UPDATE'},
    'PARAMETER': {'SET', 'ALTER SYSTEM'},
}
FIELDS = {
    'format_version', 'scope', 'capture_id', 'source_dump_sha256',
    'source_globals_sha256', 'declared_probe_kinds', 'rows',
}


def load(path):
    p = Path(path)
    if not p.is_file() or p.is_symlink() or not 0 < p.stat().st_size <= MAX_BYTES:
        raise ValueError('WITNESS_PRIVATE_FILE_INVALID')

    def unique(pairs):
        obj = {}
        for name, value in pairs:
            if name in obj:
                raise ValueError('WITNESS_JSON_DUPLICATE_FIELD')
            obj[name] = value
        return obj

    return json.loads(p.read_text(encoding='utf-8'), object_pairs_hook=unique)


def identity(value):
    # Avoid coercion, NULs and uncontrolled sizes. Strings are already
    # CANONICALIZED by an independently reviewed capture process.
    if (not isinstance(value, str) or not 0 < len(value) <= 1024
            or '\x00' in value or value != value.strip()):
        raise ValueError('WITNESS_IDENTITY_INVALID')
    return value


def validated(w, scope):
    if not isinstance(w, dict) or set(w) != FIELDS:
        raise ValueError('WITNESS_FIELDS_INVALID')
    if type(w['format_version']) is not int or w['format_version'] != VERSION:
        raise ValueError('WITNESS_VERSION_INVALID')
    if w['scope'] != scope:
        raise ValueError('WITNESS_SCOPE_INVALID')
    if not isinstance(w['capture_id'], str) or not CAPTURE.fullmatch(w['capture_id']):
        raise ValueError('WITNESS_CAPTURE_INVALID')
    for k in ('source_dump_sha256', 'source_globals_sha256'):
        v = w[k]
        if not isinstance(v, str) or not SHA256.fullmatch(v):
            raise ValueError('WITNESS_SOURCE_HASH_INVALID')
    kinds = w['declared_probe_kinds']
    if not isinstance(kinds, list) or len(kinds) != len(KINDS):
        raise ValueError('WITNESS_PROBE_DECLARATION_INVALID')
    if any(type(x) is not str for x in kinds) or set(kinds) != set(KINDS):
        raise ValueError('WITNESS_PROBE_DECLARATION_INVALID')
    if len(set(kinds)) != len(kinds):
        raise ValueError('WITNESS_PROBE_DECLARATION_DUPLICATED')
    rows = w['rows']
    if not isinstance(rows, list) or not 0 < len(rows) <= MAX_ROWS:
        raise ValueError('WITNESS_ROW_SET_INVALID')

    result = {}
    unmeasured = 0
    for row in rows:
        if not isinstance(row, list) or len(row) != 5:
            raise ValueError('WITNESS_ROW_FORMAT_INVALID')
        role = identity(row[0])
        kind = row[1]
        obj = identity(row[2])
        priv = row[3]
        value = row[4]
        if (type(kind) is not str or kind not in PRIVILEGES or
                type(priv) is not str or priv not in PRIVILEGES[kind]):
            raise ValueError('WITNESS_PRIVILEGE_KIND_INVALID')
        if value is not None and type(value) is not bool:
            raise ValueError('WITNESS_GRANT_VALUE_INVALID')
        key = (role, kind, obj, priv)
        if key in result:
            raise ValueError('WITNESS_DUPLICATE_TUPLE')
        result[key] = value
        unmeasured += (value is None)
    return result, unmeasured


def compare(source, target):
    a, src_unknown = validated(source, 'SOURCE')
    b, dst_unknown = validated(target, 'ISOLATED_RESTORE')
    for field in ('capture_id', 'source_dump_sha256', 'source_globals_sha256'):
        if source[field] != target[field]:
            raise ValueError('WITNESS_DECLARED_PREIMAGE_MISMATCH')
    src_keys = a.keys()
    dst_keys = b.keys()
    shared = src_keys & dst_keys
    mismatched = sum(a[k] != b[k] for k in shared)
    matched = len(shared) - mismatched
    source_only = len(src_keys - dst_keys)
    target_only = len(dst_keys - src_keys)
    # Do not include user-controlled field names, identifiers or hashes in JSON.
    return {
        'status': 'HOLD_TUPLE_COMPARISON_NOT_PROVENANCE',
        'source_rows': len(a),
        'target_rows': len(b),
        'common_tuples_equal_value': matched,
        'common_tuples_different_value_hold': mismatched,
        'source_only_tuples_hold': source_only,
        'target_only_tuples_hold': target_only,
        'source_unmeasured_values_hold': src_unknown,
        'target_unmeasured_values_hold': dst_unknown,
        'declared_capture_metadata_matches': True,
        'independent_source_snapshot_authentication': 'NOT_VERIFIED',
        'source_dump_and_globals_same_preimage': 'NOT_VERIFIED',
        'full_role_object_coverage': 'NOT_VERIFIED',
        'historical_source_effective_privileges': 'NOT_VERIFIED',
        'row_level_security_and_definer_semantics': 'NOT_VERIFIED',
        'reference_capture_executed': 'NO',
        'GLOBAL_ROLES': 'NOT_VERIFIED',
        'OWNER_ACL': 'NOT_VERIFIED',
        'REMOTE_WRITES': 'NONE',
        'SQL_RELEASE': 'NOT_RUN',
        'COMMERCIAL_GO': 'NO_GO',
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--target', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    result = compare(load(args.source), load(args.target))
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, sort_keys=True)
    print('RG02_TUPLE_WITNESS=HOLD_NOT_PROVENANCE')
    for field in ('source_rows', 'target_rows', 'common_tuples_equal_value',
                  'common_tuples_different_value_hold', 'source_only_tuples_hold',
                  'target_only_tuples_hold', 'source_unmeasured_values_hold',
                  'target_unmeasured_values_hold'):
        print('TUPLE_' + field.upper() + '=' + str(result[field]))
    print('SOURCE_SAME_PREIMAGE_AUTHENTICATED=NO')
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_TUPLE_WITNESS=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
