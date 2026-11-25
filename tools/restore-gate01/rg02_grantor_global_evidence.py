#!/usr/bin/env python3
"""RG02 grantor + global roles coverage only; never import privileges or grant GO.

Runs against confidential, already saved snapshots from a network-isolated PG17
container. Report/output may contain only fixed aggregate keys and integers.
"""
import argparse
from collections import Counter
import json
import os
import re
from pathlib import Path
from rg02_compare_runtime import IDENT, role_name, statements
from rg02_local_roles_prepare import HIGH_RISK
from rg02_membership_parser import parse_membership

ALTER = re.compile(r'^\s*ALTER\s+(?:ROLE|USER)\s+(' + IDENT + r')\s+WITH\s+(.+)$', re.I|re.S)

def acl_provenance(catalog):
    if not isinstance(catalog, dict):
        raise ValueError('CATALOG_TYPE')
    c = Counter()
    for part in ('functions','relations'):
        objects = catalog.get(part)
        if not isinstance(objects,list):
            raise ValueError('CATALOG_OBJECTS')
        for obj in objects:
            if not isinstance(obj,dict) or not isinstance(obj.get('acl'),list):
                raise ValueError('CATALOG_OBJECT')
            owner = obj.get('owner')
            if not isinstance(owner,str) or not owner:
                c['OBJECT_OWNER_UNRESOLVED_HOLD'] += 1
            for entry in obj['acl']:
                if not isinstance(entry,dict) or 'grantor' not in entry:
                    raise ValueError('ACL_GRANTOR_MISSING')
                if not isinstance(entry.get('privilege'),str) or not isinstance(entry.get('is_public'),bool):
                    raise ValueError('ACL_FORMAT')
                c['ACL_ROWS'] += 1
                g = entry['grantor']
                if not isinstance(g,str) or not g:
                    c['ACL_GRANTOR_UNRESOLVED_HOLD'] += 1
                elif not isinstance(owner,str) or not owner:
                    c['ACL_OWNER_UNKNOWN_HOLD'] += 1
                elif g == owner:
                    c['ACL_OWNER_GRANTOR_OBSERVED'] += 1
                else:
                    c['ACL_NONOWNER_GRANTOR_OBSERVED_HOLD'] += 1
    return c

def global_role_coverage(source,target):
    if re.search(r'\bPASSWORD\b|SCRAM-SHA-256\$|\bmd5[a-f0-9]{32}\b',source,re.I):
        raise ValueError('SOURCE_PASSWORD')
    if not isinstance(target,dict) or not isinstance(target.get('memberships'),list):
        raise ValueError('CATALOG_MEMBERSHIPS')
    edges = {}
    for edge in target['memberships']:
        if not isinstance(edge,dict) or not all(
                key in edge for key in ('granted','member','grantor','admin_option','inherit_option','set_option')):
            raise ValueError('EDGE_FORMAT')
        if not all(isinstance(edge[k],bool) for k in ('admin_option','inherit_option','set_option')):
            raise ValueError('EDGE_OPTIONS')
        edges.setdefault((edge['granted'],edge['member']),[]).append(edge)
    c = Counter()
    elevated = set()
    for stmt in statements(source):
        a = ALTER.fullmatch(stmt)
        if a and any(re.search(r'(?<![A-Za-z0-9_])' + flag + r'\b',a.group(2),re.I)
                     for flag in HIGH_RISK):
            elevated.add(role_name(a.group(1)))
        if re.match(r'^\s*REVOKE\b',stmt,re.I):
            c['SOURCE_REVOKE_HOLD'] += 1
        if not re.match(r'^\s*GRANT\b',stmt,re.I):
            continue
        c['SOURCE_MEMBERSHIP_GRANTS'] += 1
        parsed = parse_membership(stmt)
        if parsed is None:
            c['SOURCE_SYNTAX_UNRESOLVED_HOLD'] += 1
            continue
        granted,member,grantor,opts = parsed
        candidates = edges.get((granted,member),[])
        if not candidates:
            c['LOCAL_MEMBERSHIP_MISSING_HOLD'] += 1
        elif len(candidates)!=1:
            c['LOCAL_MEMBERSHIP_AMBIGUOUS_HOLD'] += 1
        else:
            actual = candidates[0]
            if any(actual[k] is not v for k,v in opts.items()):
                c['LOCAL_OPTION_MISMATCH_HOLD'] += 1
            elif grantor is None:
                c['SOURCE_GRANTOR_UNSPECIFIED_HOLD'] += 1
            elif not isinstance(actual['grantor'],str) or not actual['grantor']:
                c['LOCAL_GRANTOR_UNRESOLVED_HOLD'] += 1
            elif actual['grantor'] != grantor:
                c['LOCAL_GRANTOR_MISMATCH_HOLD'] += 1
            else:
                c['DECLARED_GRANTOR_OPTIONS_OBSERVED'] += 1
    c['SOURCE_ELEVATED_FLAG_HOLDS'] = len(elevated)
    return c

def diagnose(source,target,catalog):
    return {
      'status':'HOLD_GRANTOR_GLOBAL_EVIDENCE',
      'acl_counts':dict(sorted(acl_provenance(catalog).items())),
      'membership_counts':dict(sorted(global_role_coverage(source,target).items())),
      'limits':'Grantor provenance and local membership only; original effective rights and privileged role equivalence not proven',
      'GLOBAL_ROLES':'NOT_VERIFIED','OWNER_ACL':'NOT_VERIFIED',
      'SQL_RELEASE':'NOT_RUN','COMMERCIAL_GO':'NO_GO'
    }

def main():
    p=argparse.ArgumentParser()
    for x in ('source-roles','target-roles','catalog-json','out'):
        p.add_argument('--'+x,required=True)
    args=p.parse_args()
    report=diagnose(Path(args.source_roles).read_text(),
                    json.loads(Path(args.target_roles).read_text()),
                    json.loads(Path(args.catalog_json).read_text()))
    fd=os.open(args.out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:
        json.dump(report,stream,indent=2,sort_keys=True)
    print('RG02_GRANTOR_GLOBAL=HOLD_ONLY')
    for section in ('acl_counts','membership_counts'):
        for key,value in report[section].items():
            print(section.upper()+'_'+key+'='+str(value))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')

if __name__=='__main__':
    try:
        main()
    except (OSError,ValueError,UnicodeDecodeError,json.JSONDecodeError):
        print('RG02_GRANTOR_GLOBAL=BLOCKED_PRIVATE_INPUT')
        raise SystemExit(3)
