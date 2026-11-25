#!/usr/bin/env python3
"""Synthetic offline diagnostics. No private SQL, DB connections or network."""
import io
import json
import unittest
from contextlib import redirect_stdout
import tempfile
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_acl_diagnostic import canonical_acl, diagnose, main


class Rg02AclDiagnosticTests(unittest.TestCase):
    def test_pg17_table_and_all_privileges_equivalence(self):
        a = canonical_acl('GRANT ALL PRIVILEGES ON TABLE public.orders TO app_role')
        b = canonical_acl('grant all on public.orders to app_role')
        self.assertEqual(a, b)

    def test_whitespace_and_case_only(self):
        self.assertEqual(canonical_acl('GRANT SELECT ON TABLE t TO alice'),
                         canonical_acl('grant select on table t to alice'))

    def test_never_equates_different_acl(self):
        base = canonical_acl('GRANT SELECT ON TABLE t TO alice')
        for different in ('GRANT UPDATE ON TABLE t TO alice',
                          'GRANT SELECT ON TABLE t TO bob',
                          'GRANT SELECT ON TABLE t TO alice WITH GRANT OPTION',
                          'REVOKE SELECT ON TABLE t FROM alice'):
            self.assertNotEqual(base, canonical_acl(different))

    def test_no_role_membership_in_acl_parser(self):
        self.assertIsNone(canonical_acl('GRANT a TO b'))

    def test_unparsed_literal_retained_as_hold(self):
        self.assertIsNone(canonical_acl("GRANT SELECT ON TABLE t TO 'raw_str'"))

    def test_sql_grant_diagnostic(self):
        src = 'GRANT SELECT ON TABLE public.orders TO alice; GRANT UPDATE ON TABLE public.orders TO alice;'
        dst = 'grant select on public.orders to alice; GRANT DELETE ON TABLE public.orders TO alice;'
        r = diagnose(src, dst, 'CREATE ROLE alice; ALTER ROLE alice WITH NOLOGIN;', {'roles': [{'name': 'alice', 'login': False}], 'memberships': []})
        self.assertEqual(r['acl_raw_missing'], 2)
        self.assertEqual(r['acl_token_normalized_missing'], 1)
        self.assertEqual(r['acl_token_normalized_extra'], 1)
        self.assertEqual(r['role_attribute_mismatch_by_flag'], {})
        self.assertEqual(r['OWNER_ACL'], 'NOT_VERIFIED')
        self.assertEqual(r['COMMERCIAL_GO'], 'NO_GO')

    def test_role_flag_summary_does_not_print_role_name(self):
        r = diagnose('', '', 'CREATE ROLE private_actual; ALTER ROLE private_actual WITH LOGIN NOSUPERUSER;',
                     {'roles': [{'name': 'private_actual', 'login': False, 'superuser': False}], 'memberships': []})
        self.assertEqual(r['role_attribute_mismatch_by_flag'], {'LOGIN': 1})
        self.assertNotIn('private_actual', json.dumps(r))

    def test_role_statements_categorized_no_names(self):
        src = "GRANT admin_role TO app_role WITH INHERIT TRUE; ALTER ROLE app_role WITH CONNECTION LIMIT -1;"
        r = diagnose('', '', src, {'roles':[], 'memberships': []})
        self.assertEqual(r['roles_statement_category_counts']['MEMBERSHIP_WITH_OPTIONS'], 1)
        self.assertEqual(r['roles_statement_category_counts']['ROLE_ATTRIBUTE_EXTRA_OPTIONS'], 1)
        self.assertNotIn('admin_role', json.dumps(r))

    def test_cli_writes_mode_600_and_sanitized_output(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            for filename, data in [('src.sql', 'GRANT SELECT ON TABLE private_table TO private_role;'),
                                   ('dst.sql', ''), ('roles.sql', 'CREATE ROLE private_role;'),
                                   ('roles.json', '{"roles":[], "memberships":[]}')]:
                (p / filename).write_text(data)
            args = ['diag', '--source-sql', str(p/'src.sql'), '--target-sql', str(p/'dst.sql'),
                    '--source-roles', str(p/'roles.sql'), '--target-roles', str(p/'roles.json'),
                    '--out', str(p/'report.json')]
            with patch.object(sys,'argv',args), redirect_stdout(io.StringIO()) as stdout:
                main()
            self.assertNotIn('private_table', stdout.getvalue())
            self.assertNotIn('private_role', stdout.getvalue())
            self.assertEqual((p/'report.json').stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads((p/'report.json').read_text())['COMMERCIAL_GO'], 'NO_GO')

if __name__=='__main__': unittest.main()
