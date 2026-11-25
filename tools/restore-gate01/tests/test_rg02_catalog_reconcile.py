import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rg02_catalog_reconcile import identity_key,revoke_request,inspect_revocations,parse_membership,inspect_membership_options,diagnose


class CatalogProofTests(unittest.TestCase):
    def fixture(self, execute=True):
        return {'functions': [
          {'identity':'public.secure_func(integer, text)',
           'acl':[{'is_public': True,'grantee':None,'privilege':'EXECUTE','grantable':False}] if execute else []},
        ],'relations':[{'identity':'public.private_t','acl':[]}]}
    def test_quoted_identifier_case_and_signature(self):
        self.assertEqual(identity_key('public."secure_func"(integer, text)'),identity_key('public.secure_func(integer, text)'))
        self.assertNotEqual(identity_key('public."Secure_Func"(integer)'),identity_key('public.secure_func(integer)'))
        self.assertIsNone(identity_key('no_schema'))
        self.assertIsNone(identity_key('public.f(integer); DROP TABLE xyz'))
    def test_public_function_revoke_catalog_conflict(self):
        sql='REVOKE ALL ON FUNCTION public.secure_func(integer, text) FROM PUBLIC;'
        x=inspect_revocations(sql,self.fixture(True))
        self.assertEqual(x['REVOKES_IN_SCOPE'],1)
        self.assertEqual(x['DIRECT_OR_DEFAULT_GRANT_PRESENT_HOLD'],1)
    def test_public_function_revoke_absence_not_GO(self):
        sql='REVOKE ALL ON FUNCTION public.secure_func(integer, text) FROM PUBLIC;'
        x=inspect_revocations(sql,self.fixture(False))
        self.assertEqual(x['DIRECT_OR_DEFAULT_ABSENCE_OBSERVED'],1)
        r=diagnose(sql,'',self.fixture(False),{'memberships':[]})
        self.assertEqual(r['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertEqual(r['OWNER_ACL'],'NOT_VERIFIED')
        self.assertEqual(r['COMMERCIAL_GO'],'NO_GO')
    def test_table_revoke_all(self):
        sql='REVOKE ALL PRIVILEGES ON TABLE public.private_t FROM PUBLIC;'
        x=inspect_revocations(sql,self.fixture(False))
        self.assertEqual(x['DIRECT_OR_DEFAULT_ABSENCE_OBSERVED'],1)
        acl=self.fixture(False);acl['relations'][0]['acl'].append({'is_public':True,'grantee':None,'privilege':'SELECT','grantable':False})
        self.assertEqual(inspect_revocations(sql,acl)['DIRECT_OR_DEFAULT_GRANT_PRESENT_HOLD'],1)
    def test_grant_option_only(self):
        sql='REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.secure_func(integer, text) FROM PUBLIC;'
        self.assertEqual(inspect_revocations(sql,self.fixture(True))['DIRECT_OR_DEFAULT_ABSENCE_OBSERVED'],1)
        acl=self.fixture(True);acl['functions'][0]['acl'][0]['grantable']=True
        self.assertEqual(inspect_revocations(sql,acl)['DIRECT_OR_DEFAULT_GRANT_PRESENT_HOLD'],1)
    def test_unresolved_target_and_grantee(self):
        sql='REVOKE ALL ON FUNCTION public.unknown() FROM PUBLIC;'
        self.assertEqual(inspect_revocations(sql,self.fixture(False))['OBJECT_UNRESOLVED_OR_AMBIGUOUS'],1)
        a=self.fixture(False);a['functions'].append(a['functions'][0])
        sql='REVOKE EXECUTE ON FUNCTION public.secure_func(integer, text) FROM PUBLIC;'
        self.assertEqual(inspect_revocations(sql,a)['OBJECT_UNRESOLVED_OR_AMBIGUOUS'],1)
    def test_source_revoke_statement_unparsed(self):
        self.assertIsNone(revoke_request('REVOKE EXECUTE ON FUNCTION not.legal(int); DROP TABLE public.t FROM PUBLIC'))
        a=inspect_revocations('REVOKE EXECUTE ON FUNCTION public.a() FROM PUBLIC, alice;',self.fixture(False))
        self.assertEqual(a['SOURCE_SYNTAX_UNRESOLVED'],1)
    def test_role_member_options(self):
        sql='GRANT authority_role TO employee WITH ADMIN TRUE, INHERIT FALSE, SET TRUE;'
        tgt={'memberships':[{'granted':'authority_role','member':'employee','admin_option':True,'inherit_option':False,'set_option':True}]}
        c=inspect_membership_options(sql,tgt)
        self.assertEqual(c['EXPLICIT_OPTIONS_MATCH_CATALOG'],1)
        tgt['memberships'][0]['set_option']=False
        self.assertEqual(inspect_membership_options(sql,tgt)['MEMBERSHIP_OPTION_DIFFERENCE'],1)
    def test_unparsed_options_hold_and_missing(self):
        sql='GRANT foo TO bar WITH FUTURE OPTION;'
        tgt={'memberships':[{'granted':'foo','member':'bar','admin_option':False,'inherit_option':True,'set_option':True}]}
        self.assertEqual(inspect_membership_options(sql,tgt)['MEMBERSHIP_SYNTAX_UNRESOLVED'],1)
        self.assertEqual(inspect_membership_options('GRANT foo TO bar WITH ADMIN OPTION;', {'memberships':[]})['MEMBERSHIP_MISSING_OR_AMBIGUOUS'],1)
    def test_login_mismatch_is_held_not_replayed(self):
        source = 'CREATE ROLE saved_role; ALTER ROLE saved_role WITH LOGIN NOSUPERUSER;'
        snapshot = {'roles':[{'name':'saved_role','login':False}], 'memberships':[]}
        r = diagnose('',source,self.fixture(False),snapshot)
        self.assertEqual(r['login_counts']['LOGIN_EXPECTED_TRUE_LOCAL_FALSE_HOLD'],1)
        self.assertEqual(r['GLOBAL_ROLES'],'NOT_VERIFIED')
        self.assertNotIn('saved_role',str(r))

    def test_revoke_parser_does_not_accept_unsupported_sql(self):
        for statement in ('REVOKE EXECUTE ON FUNCTION public.f() FROM alice, bob',
                          'REVOKE SET ROLE public FROM alice',
                          'REVOKE EXECUTE ON FUNCTION public.f() FROM alice; DROP TABLE x'):
            self.assertIsNone(revoke_request(statement))

    def test_quoted_public_is_not_pseudorole(self):
        x=revoke_request('REVOKE EXECUTE ON FUNCTION public.secure_func(integer, text) FROM "PUBLIC"')
        self.assertIsNotNone(x)
        self.assertFalse(x['is_public'])
        self.assertEqual(x['grantee'],'PUBLIC')

    def test_catalog_format_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'CATALOG_FORMAT'):
            inspect_revocations('REVOKE ALL ON TABLE public.private_t FROM PUBLIC;', {'functions':[], 'relations':None})
        with self.assertRaisesRegex(ValueError, 'MEMBERSHIP_CATALOG_INCOMPLETE'):
            inspect_membership_options('GRANT foo TO bar;', {'memberships':[{'granted':'foo', 'member':'bar'}]})

    def test_readonly_report_file_mode_0600_and_no_names_in_stdout(self):
        import io
        import json
        import tempfile
        from unittest.mock import patch
        from contextlib import redirect_stdout
        from rg02_catalog_reconcile import main
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            samples = {
                'src.sql':'REVOKE ALL ON TABLE public.private_t FROM PUBLIC;',
                'roles.sql':'CREATE ROLE private_role;',
                'catalog.json':json.dumps(self.fixture(False)),
                'roles.json':json.dumps({'roles':[], 'memberships':[]}),
            }
            for filename, content in samples.items():
                (root / filename).write_text(content)
            argv = ['rg02_catalog_reconcile', '--source-sql', str(root/'src.sql'),
                    '--source-roles', str(root/'roles.sql'), '--catalog-json', str(root/'catalog.json'),
                    '--target-roles', str(root/'roles.json'), '--out', str(root/'private-report.json')]
            with patch.object(sys, 'argv', argv), redirect_stdout(io.StringIO()) as output:
                main()
            self.assertEqual((root/'private-report.json').stat().st_mode & 0o777, 0o600)
            self.assertNotIn('private_t', output.getvalue())
            self.assertNotIn('private_role', output.getvalue())
            self.assertIn('NOT_VERIFIED', (root/'private-report.json').read_text())

    def test_all_results_no_private_identifiers(self):
        sql='REVOKE ALL ON TABLE public.private_t FROM PUBLIC;'
        x=diagnose(sql,'GRANT private_role TO another WITH ADMIN TRUE;', self.fixture(False), {'memberships': []})
        import json
        txt=json.dumps(x)
        self.assertNotIn('private_t',txt)
        self.assertNotIn('private_role',txt)
        self.assertIn('NO_GO',txt)

if __name__=='__main__':unittest.main()
