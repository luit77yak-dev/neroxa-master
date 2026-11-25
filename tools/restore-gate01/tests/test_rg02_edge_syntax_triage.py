#!/usr/bin/env python3
"""Synthetic-only PG17 role membership HOLD triage — no private source dump."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_edge_syntax_triage import analyze, syntax_class, main


def edge(granted='reader',member='worker',admin=False,inherit=True,set_role=True,grantor='owner'):
    return {'granted':granted,'member':member,'grantor':grantor,
            'admin_option':admin,'inherit_option':inherit,'set_option':set_role}


def cat(roles=('reader','worker','owner','other'),systems=('pg_monitor','pg_read_all_data'),edges=None):
    return {'roles':[{'name':x,'login':False} for x in roles],
            'system_role_names':list(systems),
            'memberships':([edge()] if edges is None else edges)}


SOURCE='CREATE ROLE reader; CREATE ROLE worker; GRANT reader TO worker WITH ADMIN FALSE, INHERIT TRUE GRANTED BY owner;'


class EdgeSyntaxTriageTests(unittest.TestCase):
    def test_observed_role_edge_is_counted_not_approved(self):
        x=analyze(SOURCE,cat())
        c=x['counts']
        self.assertEqual(c['SOURCE_DIRECT_EDGE_PRESENT_LOCAL'],1)
        self.assertEqual(c.get('SOURCE_DIRECT_EDGE_MISSING_HOLD',0),0)
        self.assertEqual(x['COMMERCIAL_GO'],'NO_GO')
        self.assertEqual(x['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(x['OWNER_ACL'],'NOT_VERIFIED')

    def test_missing_but_both_roles_exist(self):
        x=analyze(SOURCE,cat(edges=[]))['counts']
        self.assertEqual(x['SOURCE_DIRECT_EDGE_MISSING_HOLD'],1)
        self.assertEqual(x['MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD'],1)
        self.assertEqual(x['MISSING_EDGE_NO_CONFIRMED_PG_SYSTEM_ROLE_HOLD'],1)

    def test_missing_granted_role_is_held(self):
        x=analyze(SOURCE,cat(roles=('worker','owner'),edges=[]))['counts']
        self.assertEqual(x['MISSING_EDGE_GRANTED_IDENTITY_NOT_CATALOG_CONFIRMED_HOLD'],1)

    def test_missing_member_role_is_held(self):
        x=analyze(SOURCE,cat(roles=('reader','owner'),edges=[]))['counts']
        self.assertEqual(x['MISSING_EDGE_MEMBER_IDENTITY_NOT_CATALOG_CONFIRMED_HOLD'],1)

    def test_both_roles_missing_is_held(self):
        x=analyze(SOURCE,cat(roles=('owner',),edges=[]))['counts']
        self.assertEqual(x['MISSING_EDGE_BOTH_IDENTITIES_NOT_CATALOG_CONFIRMED_HOLD'],1)

    def test_system_role_in_filtered_snapshot_absence_is_not_actual_absence(self):
        source='CREATE ROLE worker; GRANT pg_monitor TO worker WITH ADMIN FALSE, INHERIT TRUE GRANTED BY owner;'
        counts=analyze(source,cat(edges=[edge(granted='pg_monitor')]))['counts']
        self.assertEqual(counts['SOURCE_ENDPOINTS_NOT_IN_FILTERED_ROLE_LIST'],1)
        self.assertEqual(counts['SOURCE_ENDPOINTS_SYSTEM_ROLE_CONFIRMED'],1)
        self.assertEqual(counts['SOURCE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'],0)
        self.assertEqual(counts['LOCAL_EDGE_ENDPOINTS_CONFIRMED_SYSTEM_ROLE'],1)
        self.assertEqual(counts['LOCAL_EDGE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'],0)

    def test_system_role_missing_edge_is_held_even_if_system_role_exists(self):
        source='CREATE ROLE worker; GRANT pg_monitor TO worker GRANTED BY owner;'
        c=analyze(source,cat(edges=[]))['counts']
        self.assertEqual(c['MISSING_EDGE_INVOLVES_CONFIRMED_PG_SYSTEM_ROLE_HOLD'],1)
        self.assertEqual(c['MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD'],1)
        self.assertEqual(c['SOURCE_DIRECT_EDGE_MISSING_HOLD'],1)

    def test_system_role_not_in_catalog_remains_absence_hold(self):
        source='CREATE ROLE worker; GRANT pg_unknown_xyz TO worker;'
        c=analyze(source,cat(edges=[]))['counts']
        self.assertEqual(c['SOURCE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'],1)
        self.assertEqual(c['MISSING_EDGE_GRANTED_IDENTITY_NOT_CATALOG_CONFIRMED_HOLD'],1)
        self.assertEqual(c.get('MISSING_EDGE_INVOLVES_CONFIRMED_PG_SYSTEM_ROLE_HOLD',0),0)

    def test_non_builtin_edge_outside_filtered_role_names_holds(self):
        c=analyze(SOURCE,cat(edges=[edge(),edge(granted='missing',member='worker')]))['counts']
        self.assertEqual(c['LOCAL_EDGE_ENDPOINTS_NOT_IN_FULL_LOCAL_CATALOG_HOLD'],1)

    def test_multi_granted_role_syntax_fingerprint(self):
        self.assertEqual(syntax_class('GRANT reader, other TO worker'),
                         'MULTI_GRANTED_ROLE_LIST_HOLD')

    def test_multi_member_role_syntax_fingerprint(self):
        self.assertEqual(syntax_class('GRANT reader TO worker, other'),
                         'MULTI_MEMBER_ROLE_LIST_HOLD')

    def test_object_grant_syntax_fingerprint(self):
        self.assertEqual(syntax_class('GRANT SELECT ON TABLE public.orders TO worker'),
                         'OBJECT_PRIVILEGE_GRANT_NOT_ROLE_HOLD')

    def test_options_syntax_fingerprint(self):
        self.assertEqual(syntax_class('GRANT reader TO worker WITH FOO TRUE'),
                         'MEMBERSHIP_OPTIONS_UNSUPPORTED_HOLD')

    def test_unsupported_grantor_syntax_fingerprint(self):
        self.assertEqual(syntax_class('GRANT reader TO worker GRANTED BY owner, other'),
                         'MEMBERSHIP_GRANTOR_UNSUPPORTED_HOLD')

    def test_one_unparsed_grant_counted_without_leaking(self):
        x=analyze(SOURCE+' GRANT reader, other TO worker;',cat())
        c=x['counts']
        self.assertEqual(c['SOURCE_GRANT_COMMANDS'],2)
        self.assertEqual(c['SOURCE_GRANT_UNPARSED_HOLD'],1)
        self.assertEqual(c['SYNTAX_MULTI_GRANTED_ROLE_LIST_HOLD'],1)
        self.assertEqual(c['SOURCE_DIRECT_EDGE_PRESENT_LOCAL'],1)
        self.assertNotIn('reader',json.dumps(x))
        self.assertNotIn('worker',json.dumps(x))

    def test_missing_system_roles_snapshot_is_not_assumed(self):
        t=cat(); del t['system_role_names']
        with self.assertRaisesRegex(ValueError,'SYSTEM_ROLE_CATALOG_MISSING_OR_INVALID'):
            analyze(SOURCE,t)

    def test_non_pg_system_role_name_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'SYSTEM_ROLE_CATALOG_MISSING_OR_INVALID'):
            analyze(SOURCE,cat(systems=('reader',)))

    def test_overlap_between_regular_and_system_roles_rejected(self):
        with self.assertRaisesRegex(ValueError,'ROLE_SNAPSHOT_OVERLAP'):
            analyze(SOURCE,cat(roles=('pg_monitor','reader','worker','owner')))

    def test_duplicate_source_role_edge_still_held_not_equivalent(self):
        x=analyze(SOURCE+' GRANT reader TO worker WITH ADMIN FALSE, INHERIT TRUE GRANTED BY owner;',cat())
        self.assertEqual(x['counts']['SOURCE_DUPLICATE_PAIR_HOLD'],1)
        self.assertEqual(x['counts']['SOURCE_PAIRED_UNIQUE_GRANTS'],0)
        self.assertEqual(x['COMMERCIAL_GO'],'NO_GO')

    def test_source_revoke_remains_hold(self):
        x=analyze(SOURCE+' REVOKE reader FROM worker;',cat())
        self.assertEqual(x['counts']['SOURCE_REVOKE_STILL_HOLD'],1)
        self.assertEqual(x['COMMERCIAL_GO'],'NO_GO')

    def test_password_rejected(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_PASSWORD_MATERIAL'):
            analyze(SOURCE+' ALTER ROLE worker WITH PASSWORD secret;',cat())

    def test_json_0600_and_stdout_redacted(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/'source.sql').write_text(SOURCE+' GRANT reader, other TO worker;')
            (root/'catalog.json').write_text(json.dumps(cat(edges=[])))
            argv=['prog','--source-roles',str(root/'source.sql'),
                  '--target-roles',str(root/'catalog.json'),
                  '--out',str(root/'private-report.json')]
            with patch.object(sys,'argv',argv),redirect_stdout(io.StringIO()) as output:
                main()
            self.assertEqual((root/'private-report.json').stat().st_mode & 0o777,0o600)
            self.assertNotIn('worker',output.getvalue())
            self.assertNotIn('reader',output.getvalue())
            self.assertNotIn('owner',output.getvalue())
            self.assertIn('COMMERCIAL_GO=NO_GO',output.getvalue())

    def test_21_known_edges_4_missing_not_interpreted_as_go(self):
        # Synthetic-only shape deliberately not matching production identifiers.
        roles=['owner']+[f'g{i}' for i in range(23)]+[f'm{i}' for i in range(23)]
        source=''.join(f'GRANT g{i} TO m{i} GRANTED BY owner;' for i in range(23))
        local_edges=[edge(granted=f'g{i}',member=f'm{i}') for i in range(19)]
        x=analyze(source,cat(roles=roles,edges=local_edges))['counts']
        self.assertEqual(x['SOURCE_GRANT_COMMANDS'],23)
        self.assertEqual(x['SOURCE_DIRECT_EDGE_MISSING_HOLD'],4)
        self.assertEqual(x['MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD'],4)
        self.assertEqual(x['SOURCE_DIRECT_EDGE_PRESENT_LOCAL'],19)

if __name__=='__main__':
    unittest.main()
