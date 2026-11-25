#!/usr/bin/env python3
"""Strict, read-only PostgreSQL 17 role-membership GRANT parser.

Only parse a SINGLE role, SINGLE member, optionally WITH ADMIN/INHERIT/SET
boolean options, and optionally GRANTED BY a single role. Do not execute SQL.
Unknown or ambiguous syntax returns None and remains a HOLD downstream.
"""
import re

from rg02_compare_runtime import IDENT, role_name

ROLE_GRANT = re.compile(
    r'^\s*GRANT\s+(' + IDENT + r')\s+TO\s+(' + IDENT + r')(?P<tail>[\s\S]*)$',
    re.I,
)
GRANTED_BY = re.compile(
    r'\s+GRANTED\s+BY\s+(' + IDENT + r')\s*$',
    re.I | re.S,
)
WITH = re.compile(r'^\s+WITH\s+([\s\S]+)$', re.I)
FLAG = re.compile(r'^\s*(ADMIN|INHERIT|SET)\s+(TRUE|FALSE|OPTION)\s*$', re.I)


def parse_membership(statement):
    """Return (granted, member, grantor_or_None, explicit_options), or None.

    The absence of GRANTED BY, or of a particular option, is not proof
    of its default/catalog value. The caller must keep those cases on HOLD.

    WITH ADMIN OPTION, INHERIT TRUE, SET FALSE is a supported PG17 dump.
    OPTION means TRUE (also valid for INHERIT/SET in PostgreSQL grammar).
    """
    m = ROLE_GRANT.fullmatch(statement)
    if m is None:
        return None
    tail = m.group('tail')
    by = GRANTED_BY.search(tail)
    grantor = role_name(by.group(1)) if by else None
    if by:
        tail = tail[:by.start()]
    opts = {}
    if tail.strip():
        w = WITH.fullmatch(tail)
        if w is None:
            return None
        for part in w.group(1).split(','):
            flag = FLAG.fullmatch(part)
            if flag is None:
                return None
            key = flag.group(1).lower() + '_option'
            if key in opts:
                return None
            opts[key] = flag.group(2).upper() != 'FALSE'
    return role_name(m.group(1)), role_name(m.group(2)), grantor, opts
