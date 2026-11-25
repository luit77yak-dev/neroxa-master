#!/usr/bin/env python3
"""Private-free RG02 proof-matrix synthetic tests. Never use backup contents."""
import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_proof_matrix import produce, main


def fixture():
    gate={'GLOBAL_ROLES':'NOT_VERIFIED','OWNER_ACL':'NOT_VERIFIED','COMMERCIAL_GO':'NO_GO'}
    def report(status, **fields):
        return {'status':status,**gate,**fields}
    return {
        'catalog':report('HOLD_CATALOG_DIAGNOSTIC_ONLY',
            membership_counts={'MEMBERSHIPS_IN_SOURCE':22,
                               'GLOBAL_PARAMETER_PRIVILEGE_GRANTS_HOLD':1,
                               'EXPLICIT_OPTIONS_MATCH_CATALOG':18,
                               'MEMBERSHIP_MISSING_OR_AMBIGUOUS':4},
            login_counts={'LOGIN_EXPECTED_TRUE_LOCAL_FALSE_HOLD':1},
            revoke_counts={}),
        'targeted':report('HOLD_TARGETED_SQL_DIFF_OBSERVATION',
            exact_sql_diff_count=51,
            by_class={'LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED':51}),
        'grantor':report('HOLD_GRANTOR_GLOBAL_EVIDENCE',
            acl_counts={'ACL_ROWS':2520,'ACL_OWNER_GRANTOR_OBSERVED':2520},
            membership_counts={
                'SOURCE_MEMBERSHIP_GRANTS':22,
                'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD':1,
                'DECLARED_GRANTOR_OPTIONS_OBSERVED':18,
                'LOCAL_MEMBERSHIP_MISSING_HOLD':4,
                'SOURCE_ELEVATED_FLAG_HOLDS':9,
            }),
        'paths':report('HOLD_MEMBERSHIP_PATH_EVIDENCE',
            counts={'SOURCE_GRANTS':22,'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD':1,
                    'SOURCE_MEMBERSHIP_DIRECT_MISSING_HOLD':4,
                    'SOURCE_SET_OPTION_UNSPECIFIED_HOLD':21,
                    'MEMBER_DECLARED_PATHS':25,'MEMBER_PATHS_OBSERVED_LOCAL':21,
                    'MEMBER_PATHS_MISSING_LOCAL_HOLD':4,
                    'INHERIT_DECLARED_PATHS':14,'INHERIT_PATHS_OBSERVED_LOCAL':14,
                    'INHERIT_PATHS_MISSING_LOCAL_HOLD':0,
                    'SET_DECLARED_PATHS':0,'SET_PATHS_OBSERVED_LOCAL':0,
                    'SET_PATHS_MISSING_LOCAL_HOLD':0}),
        'edges':report('HOLD_SOURCE_GRANTS_AND_SYSTEM_ROLE_ENDPOINTS',
            counts={'SOURCE_GRANT_COMMANDS':23,'SOURCE_ROLE_GRANT_COMMANDS':22,
                    'SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD':1,
                    'SOURCE_PAIRED_UNIQUE_GRANTS':22,
                    'SOURCE_DIRECT_EDGE_PRESENT_LOCAL':18,
                    'SOURCE_DIRECT_EDGE_MISSING_HOLD':4,
                    'MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD':4}),
        'acl':report('HOLD_DIAGNOSTIC_ONLY',
            acl_raw_missing=51,acl_raw_extra=0),
    }


class ProofMatrixTests(unittest.TestCase):
    def test_consistent_fixture_stays_hold(self):
        result=produce(fixture())
        self.assertEqual(result['status'],'HOLD_PROOF_MATRIX_NOT_EFFECTIVE_PRIVILEGE_EQUIVALENCE')
        self.assertEqual(result['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(result['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(result['COMMERCIAL_GO'],'NO_GO')

    def test_observed_local_counts_are_not_effective_privilege_proof(self):
        x=produce(fixture())
        self.assertEqual(x['observed_local_metadata']['declared_memberships_with_explicit_grantor_options_seen'],18)
        self.assertEqual(x['observed_local_metadata']['explicit_inherit_paths_seen'],14)
        self.assertEqual(x['observed_local_metadata']['direct_acl_consistent_after_later_grant_seen'],51)
        self.assertEqual(x['unproven_or_unresolved']['source_effective_object_privileges'],'NOT_PROVEN')

    def test_policy_non_replay_separated(self):
        x=produce(fixture())['non_replayed_isolation_policy']
        self.assertEqual(x['source_edges_missing_in_local_catalog'],4)
        self.assertEqual(x['source_elevated_role_flags_not_replayed'],9)
        self.assertEqual(x['source_parameter_privilege_commands_not_replayed'],1)

    def test_missing_report_fails_closed(self):
        reports=fixture();del reports['edges']
        with self.assertRaisesRegex(ValueError,'EVIDENCE_REQUIRED_REPORTS_MISSING'):
            produce(reports)

    def test_extra_report_fails_closed(self):
        reports=fixture();reports['untrusted']={}
        with self.assertRaisesRegex(ValueError,'EVIDENCE_REQUIRED_REPORTS_MISSING'):
            produce(reports)

    def test_source_membership_count_disagreement_fails(self):
        reports=fixture()
        reports['grantor']['membership_counts']['SOURCE_MEMBERSHIP_GRANTS']=21
        with self.assertRaisesRegex(ValueError,'EVIDENCE_COUNTER_DISAGREEMENT'):
            produce(reports)

    def test_source_parameter_count_disagreement_fails(self):
        reports=fixture()
        reports['paths']['counts']['SOURCE_PARAMETER_PRIVILEGE_GRANTS_HELD']=0
        with self.assertRaisesRegex(ValueError,'EVIDENCE_COUNTER_DISAGREEMENT'):
            produce(reports)

    def test_no_go_invariant_tampering_fails(self):
        reports=fixture();reports['targeted']['COMMERCIAL_GO']='GO'
        with self.assertRaisesRegex(ValueError,'EVIDENCE_GATE_INVARIANT_INVALID'):
            produce(reports)

    def test_false_verified_roles_status_fails(self):
        reports=fixture();reports['grantor']['GLOBAL_ROLES']='PASS'
        with self.assertRaisesRegex(ValueError,'EVIDENCE_GATE_INVARIANT_INVALID'):
            produce(reports)

    def test_status_tampering_fails(self):
        reports=fixture();reports['catalog']['status']='PASS'
        with self.assertRaisesRegex(ValueError,'EVIDENCE_STATUS_INVALID'):
            produce(reports)

    def test_role_membership_outcomes_must_balance(self):
        reports=fixture();reports['grantor']['membership_counts']['DECLARED_GRANTOR_OPTIONS_OBSERVED']=17
        with self.assertRaisesRegex(ValueError,'EVIDENCE_MEMBERSHIP_OUTCOMES_UNBALANCED'):
            produce(reports)

    def test_direct_edge_source_mismatch_fails(self):
        reports=fixture();reports['edges']['counts']['SOURCE_DIRECT_EDGE_PRESENT_LOCAL']=17
        with self.assertRaisesRegex(ValueError,'EVIDENCE_DIRECT_EDGE_ACCOUNTING'):
            produce(reports)

    def test_missing_role_identity_cannot_be_silently_approved(self):
        reports=fixture()
        reports['edges']['counts']['MISSING_EDGE_BOTH_IDENTITIES_CATALOG_CONFIRMED_HOLD']=3
        with self.assertRaisesRegex(ValueError,'EVIDENCE_MISSING_IDENTITY_NOT_ALL_RESOLVED'):
            produce(reports)

    def test_member_paths_must_balance(self):
        reports=fixture();reports['paths']['counts']['MEMBER_DECLARED_PATHS']=26
        with self.assertRaisesRegex(ValueError,'EVIDENCE_MEMBER_PATHS_UNBALANCED'):
            produce(reports)

    def test_inherit_paths_must_balance(self):
        reports=fixture();reports['paths']['counts']['INHERIT_PATHS_OBSERVED_LOCAL']=13
        with self.assertRaisesRegex(ValueError,'EVIDENCE_INHERIT_PATHS_UNBALANCED'):
            produce(reports)

    def test_set_paths_must_balance(self):
        reports=fixture();reports['paths']['counts']['SET_PATHS_MISSING_LOCAL_HOLD']=1
        with self.assertRaisesRegex(ValueError,'EVIDENCE_SET_PATHS_UNBALANCED'):
            produce(reports)

    def test_textual_acl_diff_stays_unproven(self):
        x=produce(fixture())['unproven_or_unresolved']
        self.assertEqual(x['direct_acl_sql_differences_not_effective_proof'],51)
        self.assertEqual(x['login_flags_differ_or_unresolved'],1)
        self.assertEqual(x['source_set_options_unspecified'],21)

    def test_targeted_acl_missing_count_disagreement_fails(self):
        reports=fixture();reports['acl']['acl_raw_missing']=50
        with self.assertRaisesRegex(ValueError,'EVIDENCE_COUNTER_DISAGREEMENT'):
            produce(reports)

    def test_targeted_acl_classes_must_balance(self):
        reports=fixture();reports['targeted']['by_class']['LATER_GRANT__CATALOG_DIRECT_CONSISTENT_OBSERVED']=50
        with self.assertRaisesRegex(ValueError,'EVIDENCE_TARGETED_ACL_UNBALANCED'):
            produce(reports)

    def test_invalid_count_bool_fails(self):
        reports=fixture();reports['paths']['counts']['MEMBER_DECLARED_PATHS']=True
        with self.assertRaisesRegex(ValueError,'EVIDENCE_COUNT_INVALID'):
            produce(reports)

    def test_invalid_count_negative_fails(self):
        reports=fixture();reports['edges']['counts']['SOURCE_ROLE_GRANT_COMMANDS']=-1
        with self.assertRaisesRegex(ValueError,'EVIDENCE_COUNT_INVALID'):
            produce(reports)

    def test_missing_required_field_fails(self):
        reports=fixture();del reports['targeted']['exact_sql_diff_count']
        with self.assertRaisesRegex(ValueError,'EVIDENCE_REQUIRED_COUNT_MISSING'):
            produce(reports)

    def test_zero_observations_do_not_create_pass(self):
        reports=fixture()
        reports['grantor']['acl_counts']['ACL_ROWS']=0
        reports['grantor']['acl_counts']['ACL_OWNER_GRANTOR_OBSERVED']=0
        x=produce(reports)
        self.assertEqual(x['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(x['observed_local_metadata']['owner_as_grantor_acl_rows_seen'],0)

    def test_no_names_or_sql_in_output_and_file_private(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            args=['matrix']
            for name,body in fixture().items():
                source=root/(name+'.json')
                source.write_text(json.dumps(body))
                args.extend(['--'+name,str(source)])
            target=root/'proof.json'
            args.extend(['--out',str(target)])
            with patch.object(sys,'argv',args),redirect_stdout(io.StringIO()) as output:
                main()
            self.assertEqual(target.stat().st_mode & 0o777,0o600)
            self.assertIn('COMMERCIAL_GO=NO_GO',output.getvalue())
            self.assertNotIn('private_role_name',output.getvalue())
            self.assertNotIn('public.orders',target.read_text())

if __name__=='__main__':
    unittest.main()
