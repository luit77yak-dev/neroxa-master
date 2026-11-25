#!/usr/bin/env python3
"""Private-free offline RG02 grantor/global role evidence tests."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rg02_grantor_global_evidence import parse_membership,acl_provenance,global_role_coverage,diagnose,main

def snap(grantor='owner_role', owner='owner_role'):
    return {'functions':[{'identity':'public.private_f()','owner':owner,'acl':[{
        'privilege':'EXECUTE','is_public':True,'grantee':None,'grantor':grantor,'grantable':False}]}],
        'relations':[{'identity':'public.private_table','owner':'owner_role','acl':[]}]}

def target(grantor='owner_role',admin=False,inherit=True,set_option=True):
    return {'roles':[{'name':'worker','login':False}],
        'memberships':[{'granted':'group_role','member':'worker',
          'admin_option':admin,'inherit_option':inherit,'set_option':set_option,
          'grantor':grantor}]}

class GrantorGlobalEvidenceTests(unittest.TestCase):
    def test_explicit_grantor_and_pg17_options(self):
        x=parse_membership('GRANT group_role TO worker WITH ADMIN FALSE, INHERIT TRUE, SET TRUE GRANTED BY owner_role')
        self.assertEqual(x,('group_role','worker','owner_role',
                            {'admin_option':False,'inherit_option':True,'set_option':True}))
    def test_quoted_grantor_and_quoted_role(self):
        x=parse_membership('GRANT "Group Role" TO worker WITH ADMIN OPTION GRANTED BY "Owner Role"')
        self.assertEqual(x[0],'Group Role')
        self.assertEqual(x[2],'Owner Role')
        self.assertEqual(x[3],{'admin_option':True})
    def test_pg17_without_grantor_held(self):
        c=global_role_coverage('GRANT group_role TO worker WITH INHERIT TRUE, SET TRUE;',target())
        self.assertEqual(c['SOURCE_GRANTOR_UNSPECIFIED_HOLD'],1)
    def test_role_grantor_matches_explicit(self):
        c=global_role_coverage('GRANT group_role TO worker WITH INHERIT TRUE, SET TRUE GRANTED BY owner_role;',target())
        self.assertEqual(c['DECLARED_GRANTOR_OPTIONS_OBSERVED'],1)
    def test_role_grantor_mismatch(self):
        c=global_role_coverage('GRANT group_role TO worker GRANTED BY other_role;',target())
        self.assertEqual(c['LOCAL_GRANTOR_MISMATCH_HOLD'],1)
    def test_role_grantor_unresolved(self):
        c=global_role_coverage('GRANT group_role TO worker GRANTED BY other_role;',target(grantor=None))
        self.assertEqual(c['LOCAL_GRANTOR_UNRESOLVED_HOLD'],1)
    def test_role_options_different(self):
        c=global_role_coverage('GRANT group_role TO worker WITH SET FALSE GRANTED BY owner_role;',target())
        self.assertEqual(c['LOCAL_OPTION_MISMATCH_HOLD'],1)
    def test_membership_missing(self):
        c=global_role_coverage('GRANT group_role TO missing_worker GRANTED BY owner_role;',target())
        self.assertEqual(c['LOCAL_MEMBERSHIP_MISSING_HOLD'],1)
    def test_ambiguous_duplicate_membership(self):
        t=target();t['memberships'].append(dict(t['memberships'][0]))
        c=global_role_coverage('GRANT group_role TO worker;',t)
        self.assertEqual(c['LOCAL_MEMBERSHIP_AMBIGUOUS_HOLD'],1)
    def test_unsupported_option_fails_closed(self):
        c=global_role_coverage('GRANT group_role TO worker WITH OTHER TRUE GRANTED BY owner_role;',target())
        self.assertEqual(c['SOURCE_SYNTAX_UNRESOLVED_HOLD'],1)
    def test_revoke_and_elevated_flags_never_replayed(self):
        sql=('ALTER ROLE worker WITH LOGIN SUPERUSER NOBYPASSRLS; '
             'REVOKE group_role FROM worker;')
        c=global_role_coverage(sql,target())
        self.assertEqual(c['SOURCE_ELEVATED_FLAG_HOLDS'],1)
        self.assertEqual(c['SOURCE_REVOKE_HOLD'],1)
    def test_acl_owner_grantor(self):
        c=acl_provenance(snap())
        self.assertEqual(c['ACL_OWNER_GRANTOR_OBSERVED'],1)
    def test_acl_third_party_grantor(self):
        c=acl_provenance(snap(grantor='other_role'))
        self.assertEqual(c['ACL_NONOWNER_GRANTOR_OBSERVED_HOLD'],1)
    def test_acl_grantor_unresolved(self):
        c=acl_provenance(snap(grantor=None))
        self.assertEqual(c['ACL_GRANTOR_UNRESOLVED_HOLD'],1)
    def test_acl_owner_unresolved(self):
        c=acl_provenance(snap(owner=None))
        self.assertEqual(c['OBJECT_OWNER_UNRESOLVED_HOLD'],1)
        self.assertEqual(c['ACL_OWNER_UNKNOWN_HOLD'],1)
    def test_missing_grantor_field_fails_closed(self):
        s=snap();del s['functions'][0]['acl'][0]['grantor']
        with self.assertRaisesRegex(ValueError,'ACL_GRANTOR_MISSING'):
            acl_provenance(s)
    def test_missing_membership_grantor_fails_closed(self):
        t=target();del t['memberships'][0]['grantor']
        with self.assertRaisesRegex(ValueError,'EDGE_FORMAT'):
            global_role_coverage('GRANT group_role TO worker;',t)
    def test_password_material_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'SOURCE_PASSWORD'):
            global_role_coverage('ALTER ROLE secret WITH PASSWORD fake;',target())
    def test_no_go_even_matching_local_metadata(self):
        x=diagnose('GRANT group_role TO worker GRANTED BY owner_role;',target(),snap())
        self.assertEqual(x['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(x['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(x['COMMERCIAL_GO'],'NO_GO')
        self.assertNotIn('group_role',json.dumps(x))
        self.assertNotIn('private_f',json.dumps(x))
    def test_private_mode_and_redacted_stdout(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'roles.sql').write_text('GRANT group_role TO worker GRANTED BY owner_role;')
            (root/'target.json').write_text(json.dumps(target()))
            (root/'catalog.json').write_text(json.dumps(snap()))
            argv=['check','--source-roles',str(root/'roles.sql'),
                  '--target-roles',str(root/'target.json'),
                  '--catalog-json',str(root/'catalog.json'),
                  '--out',str(root/'report.json')]
            with patch.object(sys,'argv',argv),redirect_stdout(io.StringIO()) as logs:
                main()
            self.assertEqual((root/'report.json').stat().st_mode & 0o777,0o600)
            self.assertNotIn('group_role',logs.getvalue())
            self.assertNotIn('private_f',logs.getvalue())
            self.assertIn('COMMERCIAL_GO=NO_GO',logs.getvalue())
if __name__=='__main__':
    unittest.main()
