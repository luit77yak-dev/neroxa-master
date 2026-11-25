#!/usr/bin/env python3
"""Synthetic-only PostgreSQL 17 role membership grammar and safety tests."""
import unittest
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rg02_membership_parser import parse_membership
from rg02_grantor_global_evidence import global_role_coverage
from rg02_catalog_reconcile import parse_membership as parse_catalog_membership
from rg02_catalog_reconcile import inspect_membership_options


def target(role_names=('group_role','worker'), edge=True, admin=True, inherit=False, setting=False, grantor='owner_role'):
    return {
        'roles': [{'name':name,'login':False} for name in role_names],
        'memberships': ([{
            'granted':'group_role','member':'worker','grantor':grantor,
            'admin_option':admin,'inherit_option':inherit,'set_option':setting
        }] if edge else []),
    }


class PG17MembershipSyntaxTests(unittest.TestCase):
    def test_mixed_admin_option_inherit_set_and_grantor(self):
        x=parse_membership(
            'GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE, SET FALSE GRANTED BY owner_role')
        self.assertEqual(x,('group_role','worker','owner_role', {
            'admin_option':True, 'inherit_option':False,'set_option':False}))

    def test_dump_with_admin_option_and_inherit_true(self):
        x=parse_membership(
            'GRANT group_role TO worker WITH ADMIN OPTION, INHERIT TRUE GRANTED BY owner_role')
        self.assertEqual(x[3],{'admin_option':True,'inherit_option':True})

    def test_admin_false_supported(self):
        x=parse_membership('GRANT group_role TO worker WITH ADMIN FALSE, INHERIT TRUE, SET TRUE')
        self.assertEqual(x[3],{'admin_option':False,'inherit_option':True,'set_option':True})

    def test_admin_true_supported(self):
        x=parse_membership('GRANT group_role TO worker WITH ADMIN TRUE, INHERIT FALSE, SET FALSE')
        self.assertEqual(x[3],{'admin_option':True,'inherit_option':False,'set_option':False})

    def test_single_admin_option_supported(self):
        x=parse_membership('GRANT group_role TO worker WITH ADMIN OPTION')
        self.assertEqual(x[3],{'admin_option':True})

    def test_inherit_and_set_without_admin(self):
        x=parse_membership('GRANT group_role TO worker WITH INHERIT FALSE, SET FALSE')
        self.assertEqual(x[3],{'inherit_option':False,'set_option':False})

    def test_explicit_option_alias(self):
        x=parse_membership('GRANT group_role TO worker WITH INHERIT OPTION, SET OPTION')
        self.assertEqual(x[3],{'inherit_option':True,'set_option':True})

    def test_reordered_options(self):
        x=parse_membership('GRANT group_role TO worker WITH SET FALSE, ADMIN OPTION, INHERIT FALSE')
        self.assertEqual(x[3],{'set_option':False,'admin_option':True,'inherit_option':False})

    def test_quoted_identifiers_with_escaped_quotes(self):
        x=parse_membership('GRANT "Group""Role" TO "Worker A" WITH ADMIN OPTION, INHERIT FALSE GRANTED BY "Owner B"')
        self.assertEqual(x[0],'Group"Role')
        self.assertEqual(x[1],'Worker A')
        self.assertEqual(x[2],'Owner B')
        self.assertTrue(x[3]['admin_option'])

    def test_grant_without_options_remains_unspecified(self):
        x=parse_membership('GRANT group_role TO worker')
        self.assertEqual(x[2],None)
        self.assertEqual(x[3],{})

    def test_grantor_without_options(self):
        x=parse_membership('GRANT group_role TO worker GRANTED BY owner_role')
        self.assertEqual(x[2],'owner_role')
        self.assertEqual(x[3],{})

    def test_lowercase_and_whitespace(self):
        x=parse_membership('grant  group_role to worker with admin option, inherit false granted by owner_role')
        self.assertEqual(x[3],{'admin_option':True,'inherit_option':False})

    def test_duplicate_option_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role TO worker WITH ADMIN OPTION, ADMIN TRUE'))

    def test_unknown_option_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role TO worker WITH NEWCAP TRUE'))

    def test_ambiguous_multimember_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role TO worker, other_worker WITH ADMIN OPTION'))

    def test_multi_role_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role, group2 TO worker'))

    def test_sql_comment_or_extra_command_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role TO worker; DROP ROLE worker'))
        self.assertIsNone(parse_membership('GRANT group_role TO worker -- trailing comment'))

    def test_object_privilege_grant_rejected(self):
        self.assertIsNone(parse_membership('GRANT SELECT ON TABLE public.orders TO worker'))

    def test_unsupported_grantor_syntax_rejected(self):
        self.assertIsNone(parse_membership('GRANT group_role TO worker GRANTED BY owner_role, other_role'))

    def test_pg17_source_parses_for_grantor_audit_and_catalog(self):
        sql='GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE, SET FALSE GRANTED BY owner_role;'
        evidence=global_role_coverage(sql,target())
        self.assertEqual(evidence['DECLARED_GRANTOR_OPTIONS_OBSERVED'],1)
        self.assertEqual(evidence['SOURCE_MEMBERSHIP_GRANTS'],1)
        self.assertEqual(evidence['SOURCE_SYNTAX_UNRESOLVED_HOLD'],0)
        catalog=inspect_membership_options(sql,target())
        self.assertEqual(catalog['EXPLICIT_OPTIONS_MATCH_CATALOG'],1)
        self.assertEqual(catalog['MEMBERSHIP_SYNTAX_UNRESOLVED'],0)

    def test_pg17_option_mismatch_is_held(self):
        sql='GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE, SET FALSE GRANTED BY owner_role;'
        t=target(setting=True)
        evidence=global_role_coverage(sql,t)
        self.assertEqual(evidence['LOCAL_OPTION_MISMATCH_HOLD'],1)
        self.assertEqual(inspect_membership_options(sql,t)['MEMBERSHIP_OPTION_DIFFERENCE'],1)

    def test_three_missing_edges_classified_without_import(self):
        sql=(
            'GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE GRANTED BY owner_role;'
            'GRANT absent_group TO worker WITH INHERIT FALSE GRANTED BY owner_role;'
            'GRANT group_role TO absent_member WITH SET FALSE GRANTED BY owner_role;'
        )
        t=target(edge=False)
        result=global_role_coverage(sql,t)
        self.assertEqual(result['SOURCE_MEMBERSHIP_GRANTS'],3)
        self.assertEqual(result['LOCAL_MEMBERSHIP_MISSING_HOLD'],3)
        self.assertEqual(result['LOCAL_MEMBERSHIP_EDGE_ABSENT_BOTH_ROLES_PRESENT_HOLD'],1)
        self.assertEqual(result['LOCAL_MEMBERSHIP_GRANTED_ROLE_ABSENT_HOLD'],1)
        self.assertEqual(result['LOCAL_MEMBERSHIP_MEMBER_ROLE_ABSENT_HOLD'],1)
        self.assertNotIn('group_role',json.dumps(dict(result)))

    def test_both_identities_missing_is_a_hold(self):
        t=target(role_names=(),edge=False)
        result=global_role_coverage('GRANT group_role TO worker;',t)
        self.assertEqual(result['LOCAL_MEMBERSHIP_BOTH_ROLES_ABSENT_HOLD'],1)

    def test_role_snapshot_shape_fails_closed(self):
        t=target();del t['roles']
        with self.assertRaisesRegex(ValueError,'CATALOG_ROLES'):
            global_role_coverage('GRANT group_role TO worker;',t)

    def test_missing_grantor_never_equivalent(self):
        sql='GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE, SET FALSE;'
        result=global_role_coverage(sql,target())
        self.assertEqual(result['SOURCE_GRANTOR_UNSPECIFIED_HOLD'],1)
        self.assertEqual(result['DECLARED_GRANTOR_OPTIONS_OBSERVED'],0)

    def test_catalog_adapter_preserves_existing_interface(self):
        x=parse_catalog_membership('GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE GRANTED BY owner_role')
        self.assertEqual(x,('group_role','worker',{'admin_option':True,'inherit_option':False}))

    def test_pg17_diagnostics_keep_go_closed(self):
        from rg02_grantor_global_evidence import diagnose
        sql='GRANT group_role TO worker WITH ADMIN OPTION, INHERIT FALSE, SET FALSE GRANTED BY owner_role;'
        catalog={'functions':[], 'relations':[]}
        report=diagnose(sql,target(),catalog)
        self.assertEqual(report['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(report['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(report['COMMERCIAL_GO'],'NO_GO')
        self.assertEqual(report['membership_counts']['DECLARED_GRANTOR_OPTIONS_OBSERVED'],1)


if __name__=='__main__':
    unittest.main()
