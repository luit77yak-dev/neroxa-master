#!/usr/bin/env python3
"""RG02 cross-check matrix, HOLD only — no database access, SQL or secrets.

Consumes seven runner-private aggregate JSON receipts from the same isolated
RG02 attempt. Detects inconsistent counters or omitted evidence; records
observations, isolation-policy non-replays, and proof gaps separately.

No counter in this matrix proves effective access equivalence. Do not sum
unrelated populations or use this report to override the strict comparator.
"""
import argparse
import json
import os
from pathlib import Path

from rg02_local_effective_rights import KINDS as EFFECTIVE_KINDS, validate as validate_local_rights

REPORTS = {
    'catalog': 'HOLD_CATALOG_DIAGNOSTIC_ONLY',
    'targeted': 'HOLD_TARGETED_SQL_DIFF_OBSERVATION',
    'grantor': 'HOLD_GRANTOR_GLOBAL_EVIDENCE',
    'paths': 'HOLD_MEMBERSHIP_PATH_EVIDENCE',
    'edges': 'HOLD_SOURCE_GRANTS_AND_SYSTEM_ROLE_ENDPOINTS',
    'acl': 'HOLD_DIAGNOSTIC_ONLY',
    'effective': 'HOLD_LOCAL_EFFECTIVE_RIGHTS_ONLY',
}
ROLE_OUTCOMES = (
    'DECLARED_GRANTOR_OPTIONS_OBSERVED',
    'LOCAL_MEMBERSHIP_MISSING_HOLD',
    'LOCAL_MEMBERSHIP_AMBIGUOUS_HOLD',
    'LOCAL_OPTION_MISMATCH_HOLD',
    'SOURCE_GRANTOR_UNSPECIFIED_HOLD',
    'LOCAL_GRANTOR_UNRESOLVED_HOLD',
    'LOCAL_GRANTOR_MISMATCH_HOLD',
    'SOURCE_SYNTAX_UNRESOLVED_HOLD',
)
MAX_SAFE_COUNT = 1000000000


def count(d, name, optional=False):
    if not isinstance(d, dict):
        raise ValueError('EVIDENCE_SECTION_INVALID')
    if name not in d:
        if optional:
            return 0
        raise ValueError('EVIDENCE_REQUIRED_COUNT_MISSING')
    value = d[name]
    if type(value) is not int or not 0 <= value <= MAX_SAFE_COUNT:
        raise ValueError('EVIDENCE_COUNT_INVALID')
    return value


def section(report, field):
    if not isinstance(report, dict) or not isinstance(report.get(field), dict):
        raise ValueError('EVIDENCE_REQUIRED_SECTION_MISSING')
    return report[field]


def valid_report(report, status):
    if not isinstance(report, dict) or report.get('status') != status:
        raise ValueError('EVIDENCE_STATUS_INVALID')
    for key, expected in (
        ('GLOBAL_ROLES', 'NOT_VERIFIED'),
        ('OWNER_ACL', 'NOT_VERIFIED'),
        ('COMMERCIAL_GO', 'NO_GO'),
    ):
        if report.get(key) != expected:
            raise ValueError('EVIDENCE_GATE_INVARIANT_INVALID')


def must_equal(*values):
    if len(set(values)) != 1:
        raise ValueError('EVIDENCE_COUNTER_DISAGREEMENT')
    return values[0]


def produce(reports):
    if not isinstance(reports, dict) or set(reports) != set(REPORTS):
        raise ValueError('EVIDENCE_REQUIRED_REPORTS_MISSING')
    for name, status in REPORTS.items():
        valid_report(reports[name], status)

    catalog_members = section(reports['catalog'], 'membership_counts')
    catalog_login = section(reports['catalog'], 'login_counts')
    targeted_classes = section(reports['targeted'], 'by_class')
    grant_members = section(reports['grantor'], 'membership_counts')
    grant_acls = section(reports['grantor'], 'acl_counts')
    paths = section(reports['paths'], 'counts')
    edges = section(reports['edges'], 'counts')
    effective_populations = section(reports['effective'], 'populations')
    effective_rights = section(reports['effective'], 'rights')
    validate_local_rights({'scope':'ISOLATED_LOCAL_PG17_ONLY','major':17,
                           'populations':effective_populations,
                           'rights':effective_rights})

    # The local effective rights oracle and the role-path auditor must refer
    # to the same PG17 role population. This is NOT origin equivalence.
    must_equal(count(effective_populations,'roles'),
               count(paths,'LOCAL_ROLE_IDENTITIES'))
    memberships = must_equal(
        count(catalog_members,'MEMBERSHIPS_IN_SOURCE'),
        count(grant_members,'SOURCE_MEMBERSHIP_GRANTS'),
        count(paths,'SOURCE_GRANTS'),
        count(edges,'SOURCE_ROLE_GRANT_COMMANDS'),
    )
    param_acl = must_equal(
        count(catalog_members,'GLOBAL_PARAMETER_PRIVILEGE_GRANTS_HOLD',True),
        count(grant_members,'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD',True),
        count(paths,'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD',True),
        count(edges,'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD',True),
    )
    if count(edges,'SOURCE_GRANT_COMMANDS') != memberships + param_acl:
        raise ValueError('EVIDENCE_GLOBAL_GRANT_ACCOUNTING')
    if sum(count(grant_members,key,True) for key in ROLE_OUTCOMES) != memberships:
        raise ValueError('EVIDENCE_MEMBERSHIP_OUTCOMES_UNBALANCED')
    if count(edges,'SOURCE_GRANT_UNPARSED_HOLD',True) != count(
            grant_members,'SOURCE_SYNTAX_UNRESOLVED_HOLD',True):
        raise ValueError('EVIDENCE_GRANT_SYNTAX_DISAGREEMENT')
    missing = must_equal(
        count(grant_members,'LOCAL_MEMBERSHIP_MISSING_HOLD',True),
        count(edges,'SOURCE_DIRECT_EDGE_MISSING_HOLD',True),
        count(paths,'SOURCE_MEMBERSHIP_DIRECT_MISSING_HOLD',True),
    )
    matched = count(grant_members,'DECLARED_GRANTOR_OPTIONS_OBSERVED',True)
    if count(edges,'SOURCE_PAIRED_UNIQUE_GRANTS') != (
        count(edges,'SOURCE_DIRECT_EDGE_PRESENT_LOCAL',True) + missing):
        raise ValueError('EVIDENCE_DIRECT_EDGE_ACCOUNTING')
    # Missing identities or options cannot be reclassified as equivalent.
    if missing != count(edges,'MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD',True):
        raise ValueError('EVIDENCE_MISSING_IDENTITY_NOT_ALL_RESOLVED')
    member_declared = count(paths,'MEMBER_DECLARED_PATHS')
    member_seen = count(paths,'MEMBER_PATHS_OBSERVED_LOCAL')
    member_missing = count(paths,'MEMBER_PATHS_MISSING_LOCAL_HOLD')
    if member_declared != member_seen + member_missing:
        raise ValueError('EVIDENCE_MEMBER_PATHS_UNBALANCED')
    inherit_declared = count(paths,'INHERIT_DECLARED_PATHS')
    inherit_seen = count(paths,'INHERIT_PATHS_OBSERVED_LOCAL')
    inherit_missing = count(paths,'INHERIT_PATHS_MISSING_LOCAL_HOLD')
    if inherit_declared != inherit_seen + inherit_missing:
        raise ValueError('EVIDENCE_INHERIT_PATHS_UNBALANCED')
    set_declared = count(paths,'SET_DECLARED_PATHS')
    set_seen = count(paths,'SET_PATHS_OBSERVED_LOCAL')
    set_missing = count(paths,'SET_PATHS_MISSING_LOCAL_HOLD')
    if set_declared != set_seen + set_missing:
        raise ValueError('EVIDENCE_SET_PATHS_UNBALANCED')

    # All SQL differences are still strict-gate HOLD, including those matching
    # local catalog direct ACL after later grants. No effective-rights claim.
    raw_acl = must_equal(
        count(reports['acl'],'acl_raw_missing'),
        count(reports['targeted'],'exact_sql_diff_count'),
    )
    if any(type(v) is not int or v < 0 or v > MAX_SAFE_COUNT
           for v in targeted_classes.values()):
        raise ValueError('EVIDENCE_ACL_CLASS_INVALID')
    if sum(targeted_classes.values()) != raw_acl:
        raise ValueError('EVIDENCE_TARGETED_ACL_UNBALANCED')
    direct_consistent = count(
        targeted_classes,'LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED',True)
    role_flags_held = count(grant_members,'SOURCE_ELEVATED_FLAG_HOLDS')
    login_mismatch = sum(
        count(catalog_login,k,True) for k in (
            'LOGIN_EXPECTED_TRUE_LOCAL_FALSE_HOLD',
            'LOGIN_EXPECTED_FALSE_LOCAL_TRUE_HOLD',
            'LOGIN_ROLE_UNRESOLVED',
        ))
    acl_rows = count(grant_acls,'ACL_ROWS')
    owner_grantor_observed = count(grant_acls,'ACL_OWNER_GRANTOR_OBSERVED',True)
    if owner_grantor_observed > acl_rows or direct_consistent > raw_acl or matched > memberships:
        raise ValueError('EVIDENCE_OBSERVATION_OVERCOUNT')

    # Summed checks are *different role/target/privilege probes*, not a
    # percentage of source equivalence. Never compare these with source ACLs.
    local_checks = sum(count(effective_rights[k],'checked') for k in EFFECTIVE_KINDS)
    local_granted = sum(count(effective_rights[k],'granted') for k in EFFECTIVE_KINDS)
    # Numbers overlap across dimensions: deliberately no global summary score.
    return {
        'status':'HOLD_PROOF_MATRIX_NOT_EFFECTIVE_PRIVILEGE_EQUIVALENCE',
        'observed_local_metadata':{
            'declared_memberships_with_explicit_grantor_options_seen':matched,
            'explicit_member_paths_seen':member_seen,
            'explicit_inherit_paths_seen':inherit_seen,
            'explicit_set_paths_seen':set_seen,
            'owner_as_grantor_acl_rows_seen':owner_grantor_observed,
            'direct_acl_consistent_after_later_grant_seen':direct_consistent,
            'local_native_privilege_probes_checked':local_checks,
            'local_native_privilege_probes_granted':local_granted,
            'local_pg_has_role_set_true':count(effective_rights['role_set'],'granted'),
        },
        'non_replayed_isolation_policy':{
            'source_edges_missing_in_local_catalog':missing,
            'source_elevated_role_flags_not_replayed':role_flags_held,
            'source_parameter_privilege_commands_not_replayed':param_acl,
        },
        'unproven_or_unresolved':{
            'direct_acl_sql_differences_not_effective_proof':raw_acl,
            'login_flags_differ_or_unresolved':login_mismatch,
            'source_set_options_unspecified':count(
                paths,'SOURCE_SET_OPTION_UNSPECIFIED_HOLD',True),
            'source_role_grants_unparsed':count(
                grant_members,'SOURCE_SYNTAX_UNRESOLVED_HOLD',True),
            'explicit_member_paths_missing':member_missing,
            'explicit_inherit_paths_missing':inherit_missing,
            'explicit_set_paths_missing':set_missing,
            'source_effective_object_privileges':'NOT_PROVEN',
            'source_effective_role_set_privileges':'NOT_PROVEN',
            'local_effective_privilege_measurements':'LOCAL_ONLY_NOT_SOURCE_COMPARABLE',
            'source_effective_parameter_privileges':'NOT_PROVEN',
            'global_role_equivalence':'NOT_PROVEN',
            'owner_acl_equivalence':'NOT_PROVEN',
        },
        'evidence_scope':'Cross-check same-run local aggregate receipts; no privileges applied, no source effective access measured',
        'GLOBAL_ROLES':'NOT_VERIFIED',
        'OWNER_ACL':'NOT_VERIFIED',
        'SQL_RELEASE':'NOT_RUN',
        'REMOTE_WRITES':'NONE',
        'COMMERCIAL_GO':'NO_GO',
    }


def main():
    parser=argparse.ArgumentParser()
    for name in REPORTS:
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    reports={name:json.loads(Path(getattr(args,name)).read_text(encoding='utf-8'))
             for name in REPORTS}
    matrix=produce(reports)
    fd=os.open(args.out,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as file:
        json.dump(matrix,file,sort_keys=True,indent=2)
    print('RG02_PROOF_MATRIX=HOLD_CROSSCHECKED_NOT_EFFECTIVE_EQUIVALENCE')
    for category in ('observed_local_metadata','non_replayed_isolation_policy','unproven_or_unresolved'):
        for key,value in matrix[category].items():
            if type(value) is int:
                print('PROOF_MATRIX_'+key.upper()+'='+str(value))
    print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')


if __name__=='__main__':
    try:
        main()
    except (OSError,ValueError,UnicodeDecodeError,json.JSONDecodeError):
        print('RG02_PROOF_MATRIX=BLOCKED_PRIVATE_INPUT_OR_COUNTER_DISAGREEMENT')
        raise SystemExit(3)
