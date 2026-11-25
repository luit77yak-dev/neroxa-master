#!/usr/bin/env python3
"""RG02: compare private schema metadata replay and global roles without running roles SQL."""
import argparse, collections, hashlib, hmac, json, os, re, sys
from pathlib import Path

ROLE_FLAGS = {"SUPERUSER": "superuser", "BYPASSRLS": "bypassrls",
              "CREATEROLE": "createrole", "CREATEDB": "createdb",
              "REPLICATION": "replication", "LOGIN": "login", "INHERIT": "inherit"}
IDENT = r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9_$]*)'

# Session defaults and role comments are metadata holds, NEVER executed/imported.
ROLE_SET = re.compile(r'^\s*ALTER\s+(?:ROLE|USER)\s+(' + IDENT +
                      r')\s+SET\s+[A-Za-z_][A-Za-z_0-9.]*\s+' +
                      r'(?:(?:TO|=)\s+.+|FROM\s+CURRENT)\s*$', re.I | re.S)
ROLE_COMMENT = re.compile(r"^\s*COMMENT\s+ON\s+(?:ROLE|USER)\s+(" + IDENT +
                          r")\s+IS\s+(?:NULL|'(?:[^']|'')*')\s*$", re.I | re.S)

def role_metadata_kind(statement):
    for kind, pattern in (('role_setting_hold', ROLE_SET), ('role_comment_hold', ROLE_COMMENT)):
        match = pattern.fullmatch(statement)
        if match:
            return kind, role_name(match.group(1))
    return None


def statements(src):
    src = re.sub(r'(?im)^\s*\\(?:restrict|unrestrict)\b[^\n]*$', '', src)
    found, buf, i, state, tag = [], [], 0, 'normal', ''
    while i < len(src):
        c = src[i]
        if state == 'line':
            if c == '\n': state = 'normal'; buf.append(' ')
        elif state == 'block':
            if src.startswith('*/', i): state = 'normal'; i += 1
        elif state == 'single':
            buf.append(c)
            if c == "'" and src[i+1:i+2] == "'": buf.append("'"); i += 1
            elif c == "'": state = 'normal'
        elif state == 'double':
            buf.append(c)
            if c == '"' and src[i+1:i+2] == '"': buf.append('"'); i += 1
            elif c == '"': state = 'normal'
        elif state == 'dollar':
            if src.startswith(tag, i):
                buf.append(tag); i += len(tag)-1; state = 'normal'
            else: buf.append(c)
        elif src.startswith('--', i): state = 'line'; i += 1
        elif src.startswith('/*', i): state = 'block'; i += 1
        elif c == "'": state = 'single'; buf.append(c)
        elif c == '"': state = 'double'; buf.append(c)
        elif c == '$':
            m = re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$', src[i:])
            if m: tag = m.group(); state = 'dollar'; buf.append(tag); i += len(tag)-1
            else: buf.append(c)
        elif c == ';':
            value = ''.join(buf).strip()
            if value: found.append(value)
            buf = []
        else: buf.append(c)
        i += 1
    if state not in ('normal', 'line') or ''.join(buf).strip():
        raise ValueError('UNTERMINATED_SQL')
    return found

def normalized(statement):
    return re.sub(r'\s+', ' ', statement).strip().rstrip(';')

def kind(stmt):
    x = stmt.upper().lstrip()
    if re.match(r'^ALTER DEFAULT PRIVILEGES\b', x): return 'default_acl'
    if re.match(r'^(GRANT|REVOKE)\b', x): return 'grant_acl'
    if re.match(r'^(CREATE|ALTER) POLICY\b', x): return 'policy'
    if re.match(r'^ALTER TABLE\b', x) and re.search(r'\b(?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY\b', x): return 'rls'
    if re.match(r'^ALTER\b', x) and re.search(r'\bOWNER TO\b', x): return 'owner'
    return None

def extract(sql):
    result = {k: collections.Counter() for k in ('owner','grant_acl','policy','rls','default_acl')}
    for stmt in statements(sql):
        cat = kind(stmt)
        if cat: result[cat][normalized(stmt)] += 1
    return result

def role_name(value):
    return value[1:-1].replace('""', '"') if value.startswith('"') else value.lower()

def compare_roles(text, target):
    seen, created, memberships, unknown = {}, set(), set(), 0
    metadata_holds = collections.Counter()
    metadata_targets = set()
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b', text, re.I):
        raise ValueError('PASSWORD_MATERIAL')
    for stmt in statements(text):
        m = re.fullmatch(r'\s*CREATE\s+(?:ROLE|USER)\s+('+IDENT+r')\s*', stmt, re.I | re.S)
        if m:
            created.add(role_name(m.group(1))); continue
        m = re.fullmatch(r'\s*ALTER\s+(?:ROLE|USER)\s+('+IDENT+r')\s+WITH\s+(.+)', stmt, re.I | re.S)
        if m:
            name = role_name(m.group(1)); options = m.group(2)
            flags = seen.setdefault(name, {})
            for keyword, attr in ROLE_FLAGS.items():
                v = list(re.finditer(r'\b(NO)?'+keyword+r'\b', options, re.I))
                if v: flags[attr] = not bool(v[-1].group(1))
            leftover = re.sub(r'\b(?:NO)?(?:SUPERUSER|BYPASSRLS|CREATEROLE|CREATEDB|REPLICATION|LOGIN|INHERIT)\b', '', options, flags=re.I).strip()
            if leftover: unknown += 1
            continue
        m = re.fullmatch(r'\s*GRANT\s+('+IDENT+r')\s+TO\s+('+IDENT+r')(\s+WITH\s+ADMIN\s+OPTION)?(?:\s+GRANTED\s+BY\s+'+IDENT+r')?\s*', stmt, re.I | re.S)
        if m:
            memberships.add((role_name(m.group(1)),role_name(m.group(2)),bool(m.group(3)))); continue
        held = role_metadata_kind(stmt)
        if held:
            metadata_holds[held[0]] += 1
            metadata_targets.add(held[1])
            continue
        if re.match(r'^\s*(SET\b|SELECT\s+pg_catalog\.set_config\s*\()', stmt, re.I): continue
        unknown += 1
    remote = {r['name']:r for r in target.get('roles', [])}
    edges = {(e['granted'],e['member'],e['admin_option']) for e in target.get('memberships', [])}
    missing = sum(name not in remote for name in created)
    mismatches = sum(1 for name, attrs in seen.items() for attr, expected in attrs.items()
                     if name in remote and remote[name].get(attr) != expected)
    unverified_flags = sum(1 for name in created if set(seen.get(name,{})) != set(ROLE_FLAGS.values()))
    unknown += len(metadata_targets - created)
    missing_edges = len(memberships-edges)
    elevated = sum(1 for attrs in seen.values() if any(attrs.get(x) for x in ('superuser','bypassrls','createrole','createdb','replication')))
    return dict(declared=len(created), privileged_role_holds=elevated,
                membership_holds=len(memberships), missing_roles=missing,
                role_flag_differences=mismatches, missing_memberships=missing_edges,
                unknown_role_statements=unknown, incomplete_flag_sets=unverified_flags,
                role_setting_holds=metadata_holds['role_setting_hold'],
                role_comment_holds=metadata_holds['role_comment_hold'])

def main():
    p=argparse.ArgumentParser()
    for arg in ('source-sql','target-sql','source-roles','target-roles','out'): p.add_argument('--'+arg,required=True)
    a=p.parse_args()
    source=extract(Path(a.source_sql).read_text())
    target=extract(Path(a.target_sql).read_text())
    items={}
    for cat, expected in source.items():
        actual=target[cat]
        items[cat] = {'source_statements':sum(expected.values()),
                      'matched_statements':sum((expected & actual).values()),
                      'missing_statements':sum((expected-actual).values()),
                      'extra_target_statements':sum((actual-expected).values())}
    roles=compare_roles(Path(a.source_roles).read_text(),json.loads(Path(a.target_roles).read_text()))
    total_missing=sum(x['missing_statements'] for x in items.values())
    status='MATCHED_EXPECTED_STATEMENTS' if not total_missing else 'HOLD_DIFFERENCES'
    # Extra target metadata may be supplied by the Supabase image baseline:
    # do not infer complete object equivalence or global roles recovery.
    report={'object_statement_comparison':status,'by_type':items,'role_comparison':roles,
            'coverage':'SOURCE_METADATA_SQL_VS_POSTRESTORE_PG_DUMP',
            'limitations':'Statement comparison is conservative, not a full effective-privilege proof',
            'GLOBAL_ROLES':'NOT_VERIFIED','OWNER_ACL':'NOT_VERIFIED',
            'REMOTE_WRITES':'NONE','SQL_RELEASE':'NOT_RUN','COMMERCIAL_GO':'NO_GO'}
    out=Path(a.out)
    out.write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
    os.chmod(out,0o600)
    print('OBJECT_METADATA_DIFF='+status)
    for name, values in items.items():
        print(name.upper()+'_MISSING='+str(values['missing_statements']))
    print('ROLE_MISSING='+str(roles['missing_roles'])+
          '; ROLE_ATTRIBUTE_DIFF='+str(roles['role_flag_differences'])+
          '; MEMBERSHIP_MISSING='+str(roles['missing_memberships'])+
          '; PRIVILEGED_ROLE_HOLDS='+str(roles['privileged_role_holds'])+
          '; UNKNOWN_ROLE_STMTS='+str(roles['unknown_role_statements'])+
          '; ROLE_SETTING_HOLDS='+str(roles['role_setting_holds'])+
          '; ROLE_COMMENT_HOLDS='+str(roles['role_comment_holds']))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; REMOTE_WRITES=NONE')
    return 0 if status=='MATCHED_EXPECTED_STATEMENTS' else 2

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,UnicodeDecodeError,ValueError,json.JSONDecodeError) as exc:
        print('RG02_OBJECT_DIFF=BLOCKED; PRIVATE_INPUT_OR_SYNTAX_INVALID',file=sys.stderr)
        sys.exit(3)
