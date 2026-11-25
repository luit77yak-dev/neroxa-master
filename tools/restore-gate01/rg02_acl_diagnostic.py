#!/usr/bin/env python3
"""RG02 read-only diagnostic: classify SQL ACL mismatches without granting GO.

All identifiers and SQL remain private; only aggregate, allowlisted counters leave
this process. Syntax matches never count as proof of effective privileges.
"""
import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path

from rg02_compare_runtime import statements, extract, ROLE_FLAGS, IDENT, role_name

TOKEN = re.compile(
    r'"(?:[^"]|"")*"|\'(?:[^\']|\'\')*\'|[A-Za-z_][A-Za-z_0-9$]*|'
    r'[0-9]+|[,.();=+*/-]|\S', re.S
)
KEYWORDS = frozenset('GRANT REVOKE ALL PRIVILEGES ON TABLE TABLES SEQUENCE SEQUENCES '
                    'SCHEMA SCHEMAS FUNCTION FUNCTIONS PROCEDURE ROUTINE TYPE TYPES '
                    'DATABASE DOMAIN LANGUAGE FOREIGN SERVER USAGE EXECUTE SELECT INSERT '
                    'UPDATE DELETE TRUNCATE REFERENCES TRIGGER MAINTAIN CONNECT CREATE '
                    'TEMPORARY TEMP TO FROM PUBLIC WITH OPTION ADMIN GRANTED BY CASCADE '
                    'RESTRICT IN'.split())
SAFE_PUNCTUATION = frozenset(',.();=+*/-')


def canonical_acl(sql):
    """Detect a narrow class of text-equivalent GRANT/REVOKE forms only.

    This does not parse or validate effective ACL semantics, GRANT order,
    role inheritance, implicit defaults or catalog grants. It cannot emit PASS.
    """
    toks = TOKEN.findall(sql)
    if not toks or toks[0].upper() not in ('GRANT', 'REVOKE'):
        return None
    if not any(t.upper() == 'ON' for t in toks) or not any(
            t.upper() in ('TO', 'FROM') for t in toks):
        return None
    result = []
    for item in toks:
        if item.startswith("'"):
            # SQL literals are not valid in this small ACL token normalizer.
            return None
        if item.startswith('"'):
            unquoted = item[1:-1].replace('""', '"')
            if re.fullmatch('[a-z_][a-z_0-9$]*', unquoted):
                result.append(unquoted)
            else:
                result.append(item)
        elif re.fullmatch('[A-Za-z_][A-Za-z_0-9$]*', item):
            result.append(item.upper() if item.upper() in KEYWORDS else item.lower())
        elif item.isdecimal() or item in SAFE_PUNCTUATION:
            result.append(item)
        else:
            return None
    norm = []
    for i, item in enumerate(result):
        if item == 'PRIVILEGES' and i > 0 and result[i - 1] == 'ALL':
            continue
        if item == 'TABLE' and i > 0 and result[i - 1] == 'ON':
            # In standard GRANT, bare ON refers to TABLE.
            continue
        norm.append(item)
    return tuple(norm)


def acl_category(sql):
    op = 'GRANT' if re.match(r'^\s*GRANT\b', sql, re.I) else 'REVOKE'
    patterns = (
        ('DEFAULT', r'\bALTER\s+DEFAULT\s+PRIVILEGES\b'),
        ('SCHEMA', r'\bON\s+SCHEMA\b'),
        ('SEQUENCE', r'\bON\s+SEQUENCE\b'),
        ('FUNCTION', r'\bON\s+(?:FUNCTION|PROCEDURE|ROUTINE)\b'),
        ('TYPE', r'\bON\s+(?:TYPE|DOMAIN)\b'),
        ('DATABASE', r'\bON\s+DATABASE\b'),
        ('TABLE', r'\bON\s+(?:TABLE\b|[^\s]+\s+TO\b|[^\s]+\s+FROM\b)'),
    )
    kind = next((name for name, pat in patterns if re.search(pat, sql, re.I | re.S)), 'OTHER')
    return f'{op}_{kind}'


def role_unparsed_categories(sql):
    counts = Counter()
    for stmt in statements(sql):
        if re.match(r'^\s*GRANT\b', stmt, re.I):
            if re.search(r'\bWITH\s+(?:INHERIT|SET|ADMIN)\b', stmt, re.I):
                counts['MEMBERSHIP_WITH_OPTIONS'] += 1
            elif re.search(r'\bTO\b', stmt, re.I):
                counts['MEMBERSHIP_BASIC_OR_GRANTOR'] += 1
            else:
                counts['MEMBERSHIP_OTHER'] += 1
        elif re.match(r'^\s*REVOKE\b', stmt, re.I):
            counts['REVOKE_MEMBERSHIP'] += 1
        elif re.match(r'^\s*ALTER\s+(ROLE|USER)\b[^;]*\bWITH\b', stmt, re.I | re.S):
            opts = re.sub(r'^\s*ALTER\s+(?:ROLE|USER)\s+' + IDENT + r'\s+WITH\s+', '', stmt, flags=re.I | re.S)
            residual = re.sub(r'\b(?:NO)?(?:SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB|REPLICATION|LOGIN|INHERIT)\b', '', opts, flags=re.I)
            if residual.strip():
                counts['ROLE_ATTRIBUTE_EXTRA_OPTIONS'] += 1
        elif re.match(r'^\s*ALTER\s+(ROLE|USER)\b', stmt, re.I):
            if not re.search(r'\bSET\b', stmt, re.I):
                counts['ROLE_OTHER_ALTER_FORM'] += 1
    return counts


def attribute_mismatch_summary(source_roles_sql, target_roles):
    source = {}
    for stmt in statements(source_roles_sql):
        m = re.fullmatch(r'\s*ALTER\s+(?:ROLE|USER)\s+(' + IDENT + r')\s+WITH\s+(.+)', stmt, re.I | re.S)
        if not m:
            continue
        name = role_name(m.group(1))
        flags = source.setdefault(name, {})
        for word, field in ROLE_FLAGS.items():
            occurrences = list(re.finditer(r'\b(NO)?' + word + r'\b', m.group(2), re.I))
            if occurrences:
                flags[field] = not bool(occurrences[-1].group(1))
    targets = {r.get('name'): r for r in target_roles.get('roles', [])}
    result = Counter()
    for name, flags in source.items():
        for field, expected in flags.items():
            if name in targets and targets[name].get(field) != expected:
                result[field.upper()] += 1
    return result


def diagnose(source_sql, target_sql, source_roles_sql, target_roles):
    src = extract(source_sql)['grant_acl']
    dst = extract(target_sql)['grant_acl']
    exact_missing = src - dst
    exact_extra = dst - src
    src_canon, dst_canon = Counter(), Counter()
    src_unparsed = dst_unparsed = 0
    for statement, count in src.items():
        value = canonical_acl(statement)
        if value is None:
            src_unparsed += count
        else:
            src_canon[value] += count
    for statement, count in dst.items():
        value = canonical_acl(statement)
        if value is None:
            dst_unparsed += count
        else:
            dst_canon[value] += count
    normalized_missing = src_canon - dst_canon
    normalized_extra = dst_canon - src_canon
    raw_categories = Counter()
    for statement, count in exact_missing.items():
        raw_categories[acl_category(statement)] += count
    role_types = role_unparsed_categories(source_roles_sql)
    role_attrs = attribute_mismatch_summary(source_roles_sql, target_roles)
    return {
        'status': 'HOLD_DIAGNOSTIC_ONLY',
        'acl_raw_missing': sum(exact_missing.values()),
        'acl_raw_extra': sum(exact_extra.values()),
        'acl_token_normalized_missing': sum(normalized_missing.values()),
        'acl_token_normalized_extra': sum(normalized_extra.values()),
        'acl_source_unparsed': src_unparsed,
        'acl_target_unparsed': dst_unparsed,
        'acl_missing_category_counts': dict(sorted(raw_categories.items())),
        'roles_statement_category_counts': dict(sorted(role_types.items())),
        'role_attribute_mismatch_by_flag': dict(sorted(role_attrs.items())),
        'limitations': 'Lexical similarity is not effective privilege equivalence; defaults/grantors/inheritance and catalog checks remain pending',
        'GLOBAL_ROLES': 'NOT_VERIFIED',
        'OWNER_ACL': 'NOT_VERIFIED',
        'SQL_RELEASE': 'NOT_RUN',
        'COMMERCIAL_GO': 'NO_GO',
    }


def main():
    parser = argparse.ArgumentParser()
    for key in ('source-sql', 'target-sql', 'source-roles', 'target-roles', 'out'):
        parser.add_argument('--' + key, required=True)
    args = parser.parse_args()
    r = diagnose(Path(args.source_sql).read_text(), Path(args.target_sql).read_text(),
                 Path(args.source_roles).read_text(), json.loads(Path(args.target_roles).read_text()))
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(r, stream, sort_keys=True, indent=2)
    # Only safe, finite field names and aggregate integers are logged.
    print('RG02_ACL_DIAGNOSTIC=HOLD_NO_PRIVILEGE_EQUIVALENCE')
    for field in ('acl_raw_missing', 'acl_raw_extra', 'acl_token_normalized_missing',
                  'acl_token_normalized_extra', 'acl_source_unparsed', 'acl_target_unparsed'):
        print(field.upper() + '=' + str(r[field]))
    for root in ('acl_missing_category_counts', 'roles_statement_category_counts',
                 'role_attribute_mismatch_by_flag'):
        for k, v in r[root].items():
            print(root.upper() + '_' + k + '=' + str(v))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        print('RG02_ACL_DIAGNOSTIC=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
