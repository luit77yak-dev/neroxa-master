#!/usr/bin/env python3
"""Synthetic-only tests: pg_dumpall parameter privileges are not role grants."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_global_grant_scope import global_grant_scope
from rg02_membership_parser import parse_membership
from rg02_grantor_global_evidence import global_role_coverage
from rg02_catalog_reconcile import inspect_membership_options
from rg02_edge_syntax_triage import analyze, main as triage_main
from rg02_role_paths import assess
from rg02_local_roles_prepare import prepare


ROLE = ('CREATE ROLE group_role; CREATE ROLE worker; '
        'GRANT group_role TO worker WITH ADMIN FALSE, INHERIT TRUE '
        'GRANTED BY owner_role;')
PARAM = 'GRANT SET ON PARAMETER work_mem TO worker;'
MIXED = ROLE + ' ' + PARAM


def local():
    return {'roles':[
                {'name':'group_role','login':False},
                {'name':'worker','login':False},
                {'name':'owner_role','login':False}],
            'system_role_names':[],
            'memberships':[{'granted':'group_role','member':'worker',
                'grantor':'owner_role','admin_option':False,
                'inherit_option':True,'set_option':True}]}


class GlobalParameterGrantScopeTests(unittest.TestCase):
    def test_role_grant_is_role(self):
        self.assertEqual(global_grant_scope(
            'GRANT group_role TO worker WITH ADMIN FALSE, INHERIT TRUE GRANTED BY owner_role'),
            'role_membership')

    def test_parameter_set_grant_classified_held(self):
        self.assertEqual(global_grant_scope(PARAM),
                         'parameter_acl_shape_hold')

    def test_parameter_alter_system_grant_classified_held(self):
        self.assertEqual(global_grant_scope(
            'GRANT ALTER SYSTEM ON PARAMETER allow_alter_system TO worker'),
            'parameter_acl_shape_hold')

    def test_parameter_set_and_alter_system_classified_held(self):
        self.assertEqual(global_grant_scope(
            'GRANT SET, ALTER SYSTEM ON PARAMETER "app.knob" TO "User A" WITH GRANT OPTION'),
            'parameter_acl_shape_hold')

    def test_parameter_all_privileges_classified_held(self):
        self.assertEqual(global_grant_scope(
            'GRANT ALL PRIVILEGES ON PARAMETER log_min_duration_statement TO PUBLIC'),
            'parameter_acl_shape_hold')

    def test_parameter_alternative_privilege_order(self):
        self.assertEqual(global_grant_scope(
            'GRANT ALTER SYSTEM, SET ON PARAMETER work_mem TO worker GRANTED BY owner_role'),
            'parameter_acl_shape_hold')

    def test_parameter_unsupported_privilege_remains_held(self):
        self.assertEqual(global_grant_scope(
            'GRANT SELECT ON PARAMETER work_mem TO worker'),
            'parameter_acl_unparsed_hold')

    def test_parameter_incomplete_to_remains_held(self):
        self.assertEqual(global_grant_scope(
            'GRANT SET ON PARAMETER work_mem'),
            'parameter_acl_unparsed_hold')

    def test_parameter_name_in_quoted_role_is_role_membership(self):
        self.assertEqual(global_grant_scope(
            'GRANT "ON PARAMETER" TO worker'),
            'role_membership')

    def test_object_grant_remains_unparsed_scope(self):
        self.assertEqual(global_grant_scope(
            'GRANT SELECT ON TABLE public.orders TO worker'),
            'role_or_other_grant_unparsed_hold')

    def test_multi_role_grant_remains_unparsed_scope(self):
        self.assertEqual(global_grant_scope(
            'GRANT group_role, other_group TO worker'),
            'role_or_other_grant_unparsed_hold')

    def test_non_grant_has_no_scope(self):
        self.assertEqual(global_grant_scope('ALTER ROLE worker WITH LOGIN'),
                         'not_grant')

    def test_non_string_rejected(self):
        with self.assertRaisesRegex(ValueError,'GRANT_STATEMENT_TYPE'):
            global_grant_scope(None)

    def test_old_membership_parser_still_refuses_parameter_grant(self):
        self.assertIsNone(parse_membership(PARAM.rstrip(';')))

    def test_grantor_audit_separates_one_parameter_grant(self):
        result=global_role_coverage(MIXED,local())
        self.assertEqual(result['SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD'],1)
        self.assertEqual(result['SOURCE_MEMBERSHIP_GRANTS'],1)
        self.assertEqual(result['DECLARED_GRANTOR_OPTIONS_OBSERVED'],1)
        self.assertEqual(result.get('SOURCE_SYNTAX_UNRESOLVED_HOLD',0),0)

    def test_catalog_diagnostic_separates_global_parameter_grant(self):
        result=inspect_membership_options(MIXED,local())
        self.assertEqual(result['GLOBAL_PARAMETER_PRIVILEGE_GRANTS_HOLD'],1)
        self.assertEqual(result['MEMBERSHIPS_IN_SOURCE'],1)
        self.assertEqual(result['EXPLICIT_OPTIONS_MATCH_CATALOG'],1)
        self.assertEqual(result.get('MEMBERSHIP_SYNTAX_UNRESOLVED',0),0)

    def test_role_graph_separates_parameter_privilege_and_preserves_hold(self):
        result=assess(MIXED,local())
        counts=result['counts']
        self.assertEqual(counts['SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD'],1)
        self.assertEqual(counts['SOURCE_GRANTS'],1)
        self.assertEqual(counts['MEMBER_DECLARED_PATHS'],1)
        self.assertEqual(result['COMMERCIAL_GO'],'NO_GO')
        self.assertEqual(result['GLOBAL_ROLES'],'NOT_VERIFIED')

    def test_triage_separates_23_total_from_22_role_grants(self):
        source=('CREATE ROLE group_role; CREATE ROLE worker; ' +
                ' '.join(f'GRANT group_role TO "member_{i}" GRANTED BY owner_role;'
                         for i in range(22)) + ' ' + PARAM)
        local_roles=local()
        local_roles['roles'].extend(
            {'name':f'member_{i}','login':False} for i in range(22))
        local_roles['memberships']=[]
        result=analyze(source,local_roles)
        counts=result['counts']
        self.assertEqual(counts['SOURCE_GRANT_COMMANDS'],23)
        self.assertEqual(counts['SOURCE_ROLE_GRANT_COMMANDS'],22)
        self.assertEqual(counts['SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD'],1)
        self.assertEqual(counts['SOURCE_GRANT_UNPARSED_HOLD'] if 'SOURCE_GRANT_UNPARSED_HOLD' in counts else 0,0)
        self.assertEqual(counts['SOURCE_PARSED_GRANT_COMMANDS'],22)
        self.assertEqual(counts['SOURCE_DIRECT_EDGE_MISSING_HOLD'],22)
        self.assertEqual(result['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(result['COMMERCIAL_GO'],'NO_GO')

    def test_unrecognized_parameter_syntax_does_not_become_equivalence(self):
        source=ROLE+' GRANT SELECT ON PARAMETER test_setting TO worker;'
        result=analyze(source,local())
        counts=result['counts']
        self.assertEqual(counts['SOURCE_PARAMETER_SYNTAX_UNVERIFIED_HOLD'],1)
        self.assertEqual(counts['SOURCE_ROLE_GRANT_COMMANDS'],1)
        self.assertEqual(result['COMMERCIAL_GO'],'NO_GO')

    def test_role_identity_prepare_marks_parameter_privilege_hold_separately(self):
        _sql,receipt=prepare(MIXED,['group_role','worker','owner_role'])
        self.assertEqual(receipt['memberships_hold'],1)
        self.assertEqual(receipt['global_parameter_privilege_holds'],1)
        self.assertEqual(receipt['privileges_applied'],0)
        self.assertEqual(receipt['memberships_applied'],0)

    def test_output_0600_and_redacted_aggregate_only(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'source.sql').write_text(MIXED)
            (root/'local.json').write_text(json.dumps(local()))
            argv=['triage','--source-roles',str(root/'source.sql'),
                  '--target-roles',str(root/'local.json'),
                  '--out',str(root/'result.json')]
            with patch.object(sys,'argv',argv),redirect_stdout(io.StringIO()) as output:
                triage_main()
            self.assertEqual((root/'result.json').stat().st_mode & 0o777,0o600)
            self.assertNotIn('work_mem',output.getvalue())
            self.assertNotIn('group_role',output.getvalue())
            self.assertNotIn('owner_role',output.getvalue())
            self.assertNotIn('work_mem',json.dumps(json.loads((root/'result.json').read_text())))

if __name__ == '__main__':
    unittest.main()
