#!/usr/bin/env python3
"""Validate PG17 isolated-only effective privilege probe, HOLD without source oracle.

Input must be a *single* object of aggregate counts from tracked READ ONLY SQL.
Never print raw input, SQL, names, roles, function identities or object paths.
This module cannot assert SOURCE effective privileges or commercial GO.
"""
import argparse
import json
import os
from pathlib import Path

KINDS = (
    'role_member', 'role_usage', 'role_set',
    'schema_usage', 'schema_create',
    'table_select', 'table_insert', 'table_update', 'table_delete',
    'table_truncate', 'table_references', 'table_trigger', 'table_maintain',
    'function_execute', 'sequence_usage', 'sequence_select', 'sequence_update',
    'parameter_set', 'parameter_alter_system',
)
POPULATIONS = ('roles', 'schemas', 'tables', 'functions', 'sequences', 'parameters')
MAX_COUNT = 500000000


def number(value):
    if type(value) is not int or value < 0 or value > MAX_COUNT:
        raise ValueError('EFFECTIVE_WITNESS_COUNT_INVALID')
    return value


def expected_checks(kind, counts):
    roles = counts['roles']
    if kind.startswith('role_'):
        return roles * (roles - 1)
    objkind = kind.split('_', 1)[0]
    population = {'schema':'schemas', 'table':'tables', 'function':'functions',
                  'sequence':'sequences', 'parameter':'parameters'}.get(objkind)
    if population is None:
        raise ValueError('EFFECTIVE_WITNESS_KIND_INVALID')
    return roles * counts[population]


def validate(raw):
    if not isinstance(raw, dict) or set(raw) != {
            'scope','major','populations','rights'}:
        raise ValueError('EFFECTIVE_WITNESS_SHAPE_INVALID')
    if raw['scope'] != 'ISOLATED_LOCAL_PG17_ONLY' or raw['major'] != 17:
        raise ValueError('EFFECTIVE_WITNESS_PG17_SCOPE_INVALID')
    p = raw['populations']
    rights = raw['rights']
    if not isinstance(p, dict) or set(p) != set(POPULATIONS):
        raise ValueError('EFFECTIVE_WITNESS_POPULATIONS_INVALID')
    if not isinstance(rights, dict) or set(rights) != set(KINDS):
        raise ValueError('EFFECTIVE_WITNESS_RIGHTS_INVALID')
    populations = {name:number(p[name]) for name in POPULATIONS}
    if populations['roles'] == 0:
        raise ValueError('EFFECTIVE_WITNESS_NO_ROLES')
    if sum(populations.values()) > MAX_COUNT:
        raise ValueError('EFFECTIVE_WITNESS_SIZE_LIMIT')
    result = {}
    for kind in KINDS:
        row = rights[kind]
        if not isinstance(row, dict) or set(row) != {
                'checked','granted','denied','unknown'}:
            raise ValueError('EFFECTIVE_WITNESS_CHECK_SHAPE')
        values = {key:number(row[key]) for key in ('checked','granted','denied','unknown')}
        if (values['checked'] != expected_checks(kind,populations)
                or values['checked'] !=
                values['granted'] + values['denied'] + values['unknown']):
            raise ValueError('EFFECTIVE_WITNESS_CHECKS_NOT_BALANCED')
        result[kind] = values
    return {
        'status':'HOLD_LOCAL_EFFECTIVE_RIGHTS_ONLY',
        'populations':populations,
        'rights':result,
        'source_effective_privileges':'NOT_MEASURED',
        'source_parameter_privileges':'NOT_MEASURED',
        'rls_row_predicate_semantics':'NOT_MEASURED',
        'security_definer_execution_context':'NOT_MEASURED',
        'column_level_privileges':'NOT_MEASURED',
        'source_role_flags_and_memberships':'NOT_REPLAYED',
        'limitations':'This is a bounded PG17-local privilege oracle, not a same-preimage source-vs-target equality proof',
        'GLOBAL_ROLES':'NOT_VERIFIED',
        'OWNER_ACL':'NOT_VERIFIED',
        'SQL_RELEASE':'NOT_RUN',
        'REMOTE_WRITES':'NONE',
        'COMMERCIAL_GO':'NO_GO',
    }


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',required=True)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    raw=json.loads(Path(args.input).read_text(encoding='utf-8'))
    report=validate(raw)
    fd=os.open(args.out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(report,file,sort_keys=True,indent=2)
    print('RG02_LOCAL_EFFECTIVE_RIGHTS=HOLD_LOCAL_ONLY')
    print('RG02_LOCAL_EFFECTIVE_ROLES='+str(report['populations']['roles']))
    for kind in KINDS:
        x=report['rights'][kind]
        print('EFFECTIVE_'+kind.upper()+'_CHECKED='+str(x['checked']))
        print('EFFECTIVE_'+kind.upper()+'_GRANTED='+str(x['granted']))
        print('EFFECTIVE_'+kind.upper()+'_UNKNOWN='+str(x['unknown']))
    print('SOURCE_EFFECTIVE_PRIVILEGES=NOT_MEASURED')
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__=='__main__':
    try:
        main()
    except (OSError,ValueError,UnicodeDecodeError,json.JSONDecodeError):
        print('RG02_LOCAL_EFFECTIVE_RIGHTS=BLOCKED_PRIVATE_INPUT_OR_INVALID_COUNTS')
        raise SystemExit(3)
