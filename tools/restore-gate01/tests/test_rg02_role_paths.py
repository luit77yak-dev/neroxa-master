#!/usr/bin/env python3
"""Synthetic-only RG02 role-graph reachability tests, no private secrets."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_role_paths import assess, closure, main, source_edges, target_edges


def edge(granted='group_role',member='worker', inherit=True, setting=True,
         admin=False, grantor='owner_role'):
    return {'granted':granted,'member':member,'inherit_option':inherit,
            'set_option':setting,'admin_option':admin,'grantor':grantor}


def catalog(roles=('group_role','worker','parent'), edges=None):
    return {'roles':[{'name':x,'login':False} for x in roles],
            'memberships':[edge()] if edges is None else edges}


def sql(options='ADMIN FALSE, INHERIT TRUE, SET TRUE',grantor='owner_role'):
    return ('CREATE ROLE group_role; CREATE ROLE worker; '
            'GRANT group_role TO worker WITH ' + options +
            ' GRANTED BY ' + grantor + ';')


class RolePathProofTests(unittest.TestCase):
    def test_source_membership_single_edge(self):
        model,origins,counts=source_edges(sql())
        self.assertEqual(len(model),1)
        self.assertIn('worker',origins)
        self.assertEqual(counts['SOURCE_UNIQUE_ROLE_GRANTS'],1)

    def test_direct_member_inherit_and_set_match(self):
        report=assess(sql(),catalog())
        c=report['counts']
        for key in ('MEMBER','INHERIT','SET'):
            self.assertEqual(c[key+'_DECLARED_PATHS'],1)
            self.assertEqual(c[key+'_PATHS_OBSERVED_LOCAL'],1)
            self.assertEqual(c[key+'_PATHS_MISSING_LOCAL_HOLD'],0)

    def test_source_false_inherit_and_set_are_not_positive_paths(self):
        report=assess(sql('ADMIN FALSE, INHERIT FALSE, SET FALSE'),
                      catalog(edges=[edge(inherit=False,setting=False)]))
        c=report['counts']
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],1)
        self.assertEqual(c['INHERIT_DECLARED_PATHS'],0)
        self.assertEqual(c['SET_DECLARED_PATHS'],0)

    def test_inherit_missing_local_while_membership_exists(self):
        report=assess(sql(),catalog(edges=[edge(inherit=False)]))
        c=report['counts']
        self.assertEqual(c['MEMBER_PATHS_OBSERVED_LOCAL'],1)
        self.assertEqual(c['INHERIT_PATHS_MISSING_LOCAL_HOLD'],1)
        self.assertEqual(c['MEMBERSHIP_INHERIT_OPTION_DIFF_HOLD'],1)

    def test_set_missing_local_while_membership_exists(self):
        report=assess(sql(),catalog(edges=[edge(setting=False)]))
        self.assertEqual(report['counts']['SET_PATHS_MISSING_LOCAL_HOLD'],1)

    def test_missing_direct_edge_held_for_all_three(self):
        c=assess(sql(),catalog(edges=[]))['counts']
        self.assertEqual(c['SOURCE_MEMBERSHIP_DIRECT_MISSING_HOLD'],1)
        for mode in ('MEMBER','INHERIT','SET'):
            self.assertEqual(c[mode+'_PATHS_MISSING_LOCAL_HOLD'],1)

    def test_missing_identity_held(self):
        c=assess(sql(),catalog(roles=('group_role',),edges=[]))['counts']
        self.assertEqual(c['SOURCE_ROLE_IDENTITIES_ABSENT_LOCAL_HOLD'],1)

    def test_multihop_inherit_and_set_paths(self):
        source=('CREATE ROLE group_role; CREATE ROLE worker; CREATE ROLE parent; '
                'GRANT group_role TO parent WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY owner_role; '
                'GRANT parent TO worker WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY owner_role;')
        target=catalog(edges=[edge(granted='group_role',member='parent'),
                              edge(granted='parent',member='worker')])
        c=assess(source,target)['counts']
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],3)
        self.assertEqual(c['INHERIT_PATHS_OBSERVED_LOCAL'],3)
        self.assertEqual(c['SET_PATHS_OBSERVED_LOCAL'],3)

    def test_alt_local_path_is_observed(self):
        source=sql()
        # Direct role absent but alternative local path remains; direct missing
        # stays HOLD even when graph reachability is observed.
        target=catalog(edges=[edge(granted='parent',member='worker'),
                              edge(granted='group_role',member='parent')])
        c=assess(source,target)['counts']
        self.assertEqual(c['SOURCE_MEMBERSHIP_DIRECT_MISSING_HOLD'],1)
        self.assertEqual(c['MEMBER_PATHS_OBSERVED_LOCAL'],1)
        self.assertEqual(c['INHERIT_PATHS_OBSERVED_LOCAL'],1)

    def test_unknown_source_inherit_set_never_count_as_positive_paths(self):
        source='CREATE ROLE group_role; CREATE ROLE worker; GRANT group_role TO worker GRANTED BY owner_role;'
        c=assess(source,catalog())['counts']
        self.assertEqual(c['SOURCE_INHERIT_OPTION_UNSPECIFIED_HOLD'],1)
        self.assertEqual(c['SOURCE_SET_OPTION_UNSPECIFIED_HOLD'],1)
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],1)
        self.assertEqual(c['INHERIT_DECLARED_PATHS'],0)
        self.assertEqual(c['SET_DECLARED_PATHS'],0)

    def test_unparsed_grant_stays_hold(self):
        source=sql()+' GRANT group_role, parent TO worker;'
        c=assess(source,catalog())['counts']
        self.assertEqual(c['SOURCE_UNPARSED_GRANTS_HOLD'],1)
        self.assertEqual(c['MEMBER_PATHS_OBSERVED_LOCAL'],1)

    def test_duplicate_source_pair_excluded(self):
        source=sql()+' GRANT group_role TO worker GRANTED BY owner_role;'
        c=assess(source,catalog())['counts']
        self.assertEqual(c['SOURCE_DUPLICATE_PAIR_HOLD'],1)
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],0)

    def test_source_revoke_disables_all_projection(self):
        source=sql()+' REVOKE group_role FROM worker;'
        c=assess(source,catalog())['counts']
        self.assertEqual(c['PROJECTION_UNSAFE_REVOKE_HOLD'],1)
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],0)

    def test_source_password_material_forbidden(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_PASSWORD_MATERIAL'):
            assess(sql()+' ALTER ROLE worker WITH PASSWORD something;',catalog())

    def test_target_duplicate_edges_rejected(self):
        with self.assertRaisesRegex(ValueError,'LOCAL_EDGE_DUPLICATE'):
            assess(sql(),catalog(edges=[edge(),edge()]))

    def test_target_invalid_options_rejected(self):
        with self.assertRaisesRegex(ValueError,'LOCAL_EDGE_OPTION_INVALID'):
            assess(sql(),catalog(edges=[edge(inherit='yes')]))

    def test_builtins_outside_role_snapshot_are_held_not_crash(self):
        t=catalog(edges=[edge(),edge(granted='pg_monitor',member='worker')])
        c=assess(sql(),t)['counts']
        self.assertEqual(c['LOCAL_EDGE_ENDPOINT_OUTSIDE_ROLES_SNAPSHOT_HOLD'],1)
        self.assertEqual(c['INHERIT_PATHS_OBSERVED_LOCAL'],1)

    def test_local_missing_required_fields_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'LOCAL_CATALOG_ARRAY_MISSING'):
            assess(sql(),{'roles':[]})

    def test_self_membership_held_and_not_projected(self):
        source='CREATE ROLE group_role; GRANT group_role TO group_role;'
        c=assess(source,catalog())['counts']
        self.assertEqual(c['SOURCE_SELF_GRANT_HOLD'],1)
        self.assertEqual(c['MEMBER_DECLARED_PATHS'],0)

    def test_cycle_no_unbounded_self_path(self):
        p=closure({('a','b'),('b','a')}, {'a','b'})
        self.assertEqual(p,{('a','b'),('b','a')})
        self.assertNotIn(('a','a'),p)

    def test_privilege_go_never_emitted(self):
        output=assess(sql(),catalog())
        self.assertEqual(output['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(output['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(output['COMMERCIAL_GO'],'NO_GO')
        self.assertNotIn('group_role',json.dumps(output))
        self.assertNotIn('worker',json.dumps(output))

    def test_mode_0600_no_source_names_in_stdout(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            (base/'source.sql').write_text(sql())
            (base/'target.json').write_text(json.dumps(catalog()))
            args=['prog','--source-roles',str(base/'source.sql'),
                  '--target-roles',str(base/'target.json'),
                  '--out',str(base/'receipt.json')]
            with patch.object(sys,'argv',args), redirect_stdout(io.StringIO()) as out:
                main()
            self.assertEqual((base/'receipt.json').stat().st_mode & 0o777, 0o600)
            self.assertNotIn('group_role',out.getvalue())
            self.assertIn('COMMERCIAL_GO=NO_GO',out.getvalue())

    def test_source_no_grants_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'NO_ROLE_MEMBERSHIPS_IN_SOURCE'):
            assess('CREATE ROLE worker;',catalog())


if __name__ == '__main__':
    unittest.main()
