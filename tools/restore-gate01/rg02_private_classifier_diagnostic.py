#!/usr/bin/env python3
"""Read-only, offline classification diagnosis. Never emits SQL or role names."""
from pathlib import Path
from collections import Counter
import hashlib
import os
import re
import stat

SOURCE=Path("/root/.local/share/neroxa/commercial-recovery/pre-release.h5Br8bwm/roles-no-passwords.private.sql")
EXPECTED="614c1e69975c0003f41e6e3596870482a88755dc4332b0a128eb3b5a0088a568"
IDENT=r'(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9_$]*)'
CREATE=re.compile(r'^\s*CREATE\s+(?:ROLE|USER)\s+('+IDENT+r')\s*$',re.I|re.S)
ALTER=re.compile(r'^\s*ALTER\s+(?:ROLE|USER)\s+('+IDENT+r')\s+WITH\s+(.+)$',re.I|re.S)
HIGH_RISK=('SUPERUSER','CREATEROLE','CREATEDB','REPLICATION','BYPASSRLS')

def statements(src):
    # Mirrors the exact splitter from rg02_compare_runtime.py.
    src=re.sub(r'(?im)^\s*\\(?:restrict|unrestrict)\b[^\n]*$','',src)
    found,buf,i,state,tag=[],[],0,'normal',''
    while i<len(src):
        c=src[i]
        if state=='line':
            if c=='\n': state='normal';buf.append(' ')
        elif state=='block':
            if src.startswith('*/',i):state='normal';i+=1
        elif state=='single':
            buf.append(c)
            if c=="'" and src[i+1:i+2]=="'":buf.append("'");i+=1
            elif c=="'":state='normal'
        elif state=='double':
            buf.append(c)
            if c=='"' and src[i+1:i+2]=='"':buf.append('"');i+=1
            elif c=='"':state='normal'
        elif state=='dollar':
            if src.startswith(tag,i):buf.append(tag);i+=len(tag)-1;state='normal'
            else:buf.append(c)
        elif src.startswith('--',i):state='line';i+=1
        elif src.startswith('/*',i):state='block';i+=1
        elif c=="'":state='single';buf.append(c)
        elif c=='"':state='double';buf.append(c)
        elif c=='$':
            m=re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$',src[i:])
            if m:tag=m.group();state='dollar';buf.append(tag);i+=len(tag)-1
            else:buf.append(c)
        elif c==';':
            value=''.join(buf).strip()
            if value:found.append(value)
            buf=[]
        else:buf.append(c)
        i+=1
    if state not in ('normal','line') or ''.join(buf).strip():raise ValueError('UNTERMINATED_SQL')
    return found

def role_name(v):
    return v[1:-1].replace('""','"') if v.startswith('"') else v.lower()

def category(stmt):
    s=stmt.lstrip()
    # Only fixed, allowlisted categories. No SQL fragments, names, or hashes.
    for pat,label in [
      (r'^ALTER\s+(ROLE|USER)\b[\s\S]*\bSET\b','ALTER_ROLE_SET'),
      (r'^ALTER\s+(ROLE|USER)\b[\s\S]*\bRESET\b','ALTER_ROLE_RESET'),
      (r'^ALTER\s+(ROLE|USER)\b','ALTER_ROLE_OTHER_FORM'),
      (r'^CREATE\s+(ROLE|USER)\b','CREATE_ROLE_WITH_OPTIONS'),
      (r'^COMMENT\s+ON\s+ROLE\b','COMMENT_ON_ROLE'),
      (r'^(GRANT|REVOKE)\b','GRANT_REVOKE_OTHER'),
      (r'^ALTER\s+DEFAULT\s+PRIVILEGES\b','DEFAULT_PRIVILEGES'),
      (r'^SELECT\b','SELECT_OTHER'),
      (r'^SET\b','SET_OTHER'),
      (r'^\\','PSQL_DIRECTIVE'),
      (r'^(CREATE|ALTER|DROP|REASSIGN|COMMENT)\b','OTHER_DDL')]:
        if re.match(pat,s,re.I):return label
    return 'OTHER_UNRECOGNIZED'

def main():
    if not SOURCE.is_file() or SOURCE.is_symlink() or SOURCE.stat().st_uid!=os.geteuid() or stat.S_IMODE(SOURCE.stat().st_mode)&0o077:
        raise ValueError('PRIVATE_SOURCE_UNAVAILABLE')
    if not 0<SOURCE.stat().st_size<=1048576:raise ValueError('PRIVATE_SIZE_INVALID')
    content=SOURCE.read_bytes()
    if hashlib.sha256(content).hexdigest()!=EXPECTED:raise ValueError('SOURCE_SHA256_MISMATCH')
    sql=content.decode('utf-8')
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b',sql,re.I):
        raise ValueError('PASSWORD_MATERIAL')
    created,elevated,altered=set(),set(),set()
    counts,cats=Counter(),Counter()
    parsed=statements(sql)
    for item in parsed:
        m=CREATE.fullmatch(item)
        if m:
            name=role_name(m.group(1))
            if name in created:counts['DUPLICATE_CREATE']+=1
            created.add(name);counts['CREATE_ROLE']+=1;continue
        m=ALTER.fullmatch(item)
        if m:
            name,opts=role_name(m.group(1)),m.group(2)
            altered.add(name);counts['ALTER_ROLE_WITH']+=1
            if any(re.search(r'(?<![A-Za-z0-9_])'+flag+r'\b',opts,re.I) for flag in HIGH_RISK):
                elevated.add(name);counts['ALTER_ELEVATED_FLAG']+=1
            continue
        if re.match(r'^\s*(GRANT|REVOKE)\b',item,re.I):counts['GRANT_REVOKE']+=1;continue
        if re.match(r'^\s*(SET\b|SELECT\s+pg_catalog\.set_config\s*\()',item,re.I):counts['SAFE_SETTING']+=1;continue
        counts['UNKNOWN']+=1;cats[category(item)]+=1
    print('RG02_PRIVATE_DIAG=PASS')
    print('SOURCE_SHA256=PASS')
    print('SOURCE_STATEMENTS='+str(len(parsed)))
    for key in ['CREATE_ROLE','ALTER_ROLE_WITH','ALTER_ELEVATED_FLAG','GRANT_REVOKE','SAFE_SETTING','DUPLICATE_CREATE','UNKNOWN']:
        print(key+'='+str(counts[key]))
    print('ELEVATED_ALTER_WITHOUT_CREATE='+str(len(elevated-created)))
    print('ALTER_WITHOUT_CREATE='+str(len(altered-created)))
    for key in sorted(cats):print('UNKNOWN_CATEGORY_'+key+'='+str(cats[key]))
    reason='UNKNOWN_STATEMENTS' if counts['UNKNOWN'] else 'ELEVATED_WITHOUT_CREATE' if elevated-created else 'NO_CREATE_ROLES' if not created else 'OTHER_UNEXPECTED'
    print('RG02_CLASSIFIER_BLOCK_REASON='+reason)
    print('SQL_EXECUTED=NO; NETWORK=NONE; REMOTE_WRITES=NONE; NAMES_PRINTED=NO')

if __name__=='__main__':
    try:main()
    except (ValueError,UnicodeDecodeError,OSError) as e:
        allowed={'PRIVATE_SOURCE_UNAVAILABLE','PRIVATE_SIZE_INVALID','SOURCE_SHA256_MISMATCH','PASSWORD_MATERIAL','UNTERMINATED_SQL'}
        reason=str(e) if isinstance(e,ValueError) and str(e) in allowed else 'PRIVATE_INPUT_INVALID'
        print('RG02_PRIVATE_DIAG=BLOCKED:'+reason)
        print('SQL_EXECUTED=NO; NETWORK=NONE; REMOTE_WRITES=NONE; NAMES_PRINTED=NO')
        raise SystemExit(1)
