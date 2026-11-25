#!/usr/bin/env python3
"""Classify PostgreSQL globals GRANT statements by *scope* only, never replay.

pg_dumpall --globals-only can include both role memberships and GRANT rights
ON PARAMETER (pg_parameter_acl). A parameter privilege GRANT must NOT be
counted as an unrecognized role membership or accepted as effective rights.
These recognizers are conservative; all parameter ACLs remain HOLD.
"""
import re

from rg02_membership_parser import parse_membership

START_GRANT = re.compile(r'^\s*GRANT\b', re.I)
PARAM_ANY = re.compile(r'^\s*GRANT\s+[\s\S]+?\s+ON\s+PARAMETER\b', re.I)
PARAM_PRIV = (
    r'(?:ALL(?:\s+PRIVILEGES)?|'
    r'(?:SET|ALTER\s+SYSTEM)(?:\s*,\s*(?:SET|ALTER\s+SYSTEM))?)'
)
PARAM_HEAD = re.compile(
    r'^\s*GRANT\s+' + PARAM_PRIV + r'\s+ON\s+PARAMETER\s+',
    re.I | re.S,
)
TO_ROLE = re.compile(r'\s+TO\s+(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9_$]*)(?=\s|$|;)', re.I)


def global_grant_scope(stmt):
    """Return one fixed, public-safe scope classification; no identifiers.

    'parameter_acl_shape_hold' is only a lexical shape, not a verified
    privilege, parameter, grantee, grantor, or source-vs-target equality.
    """
    if not isinstance(stmt, str):
        raise ValueError('GRANT_STATEMENT_TYPE')
    if not START_GRANT.match(stmt):
        return 'not_grant'
    # Parse exact single-role membership first, without interpreting text in
    # quoted role names as SQL clauses.
    if parse_membership(stmt) is not None:
        return 'role_membership'
    if PARAM_ANY.match(stmt):
        if PARAM_HEAD.match(stmt) and TO_ROLE.search(stmt):
            return 'parameter_acl_shape_hold'
        return 'parameter_acl_unparsed_hold'
    return 'role_or_other_grant_unparsed_hold'
