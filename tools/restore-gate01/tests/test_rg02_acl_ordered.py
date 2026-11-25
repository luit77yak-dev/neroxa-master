#!/usr/bin/env python3
"""Synthetic, non-secret, no-network unit tests of HOLD-only SQL order triage."""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_acl_ordered import analyze, parse_event, main


def sample_catalog(execute=True):
    return {
        'functions': [
            {'identity': 'public.f(integer)', 'acl': (
                [{'is_public': True, 'grantee': None,
                  'privilege': 'EXECUTE', 'grantable': False}] if execute else [])},
            {'identity': 'public.g(integer)', 'acl': []}
        ],
        'relations': [
            {'identity': 'public.t', 'acl': []},
        ],
    }


REVOKE = 'REVOKE EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;'
GRANT = 'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC;'


class OrderedAclTests(unittest.TestCase):
    def counts(self, sql, catalog=None):
        return analyze(sql, sample_catalog() if catalog is None else catalog)['aggregate_counts']

    def test_regrant_after_revoke_observed(self):
        c = self.counts(REVOKE + GRANT)
        self.assertEqual(c['LAST_SUPPORTED_EVENT_GRANT_ALL'], 1)
        self.assertEqual(c['CATALOG_PRESENT_LAST_SUPPORTED_EVENT_GRANT_ALL'], 1)

    def test_grant_before_revoke_is_not_regrant(self):
        c = self.counts(GRANT + REVOKE, sample_catalog(False))
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)
        self.assertEqual(c['CATALOG_ABSENT_NO_LATER_MATCHING_GRANT'], 1)

    def test_later_revoke_overrides_later_grant(self):
        c = self.counts(REVOKE + GRANT + REVOKE)
        self.assertEqual(c['LATER_GRANT_OVERRIDDEN_OR_OPTION_HOLD'], 2 if False else 1)
        self.assertEqual(c['REVOKES_IN_SCOPE'], 2)
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)

    def test_other_target_does_not_regrant(self):
        c = self.counts(REVOKE + 'GRANT EXECUTE ON FUNCTION public.g(integer) TO PUBLIC;')
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)

    def test_other_grantee_does_not_regrant(self):
        c = self.counts(REVOKE + 'GRANT EXECUTE ON FUNCTION public.f(integer) TO app_user;')
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)

    def test_quoted_public_not_pseudorole(self):
        self.assertNotEqual(parse_event(GRANT.rstrip(';'))['grantee'],
                            parse_event('GRANT EXECUTE ON FUNCTION public.f(integer) TO "PUBLIC"')['grantee'])
        c = self.counts(REVOKE + 'GRANT EXECUTE ON FUNCTION public.f(integer) TO "PUBLIC";')
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)

    def test_function_overload_does_not_regrant(self):
        c = self.counts(REVOKE + 'GRANT EXECUTE ON FUNCTION public.f(text) TO PUBLIC;')
        self.assertEqual(c['NO_LATER_MATCHING_GRANT'], 1)

    def test_multi_privilege_partial_restore(self):
        sql = ('REVOKE SELECT, UPDATE ON TABLE public.t FROM PUBLIC;'
               'GRANT SELECT ON TABLE public.t TO PUBLIC;')
        c = self.counts(sql)
        self.assertEqual(c['LAST_SUPPORTED_EVENT_GRANT_PARTIAL'], 1)

    def test_all_privileges_grant(self):
        sql = 'REVOKE ALL PRIVILEGES ON TABLE public.t FROM PUBLIC; GRANT ALL ON TABLE public.t TO PUBLIC;'
        c = self.counts(sql)
        self.assertEqual(c['LAST_SUPPORTED_EVENT_GRANT_ALL'], 1)

    def test_option_only_revoke_requires_option_regrant(self):
        sql = 'REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;' + GRANT
        self.assertEqual(self.counts(sql)['LATER_GRANT_OVERRIDDEN_OR_OPTION_HOLD'], 1)
        sql = ('REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC;'
               'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC WITH GRANT OPTION;')
        self.assertEqual(self.counts(sql)['LAST_SUPPORTED_EVENT_GRANT_ALL'], 1)

    def test_unparsed_future_acl_stays_hold(self):
        sql = REVOKE + 'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC, alice;'
        c = self.counts(sql)
        self.assertEqual(c['UNPARSED_LATER_ACL_HOLD'], 1)

    def test_granted_by_stays_unresolved(self):
        sql = REVOKE + 'GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC GRANTED BY owner_role;'
        self.assertEqual(self.counts(sql)['UNPARSED_LATER_ACL_HOLD'], 1)
        sql = 'REVOKE EXECUTE ON FUNCTION public.f(integer) FROM PUBLIC GRANTED BY owner_role;'
        self.assertEqual(self.counts(sql)['SOURCE_REVOKE_UNPARSED_HOLD'], 1)

    def test_fail_closed_unsupported_grantee(self):
        self.assertIsNone(parse_event('GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC, alice'))
        self.assertIsNone(parse_event('GRANT EXECUTE ON FUNCTION public.f(integer) TO PUBLIC GRANTED BY owner_role'))

    def test_snapshot_missing_is_unresolved(self):
        c = self.counts(REVOKE + GRANT, {'functions': [], 'relations': []})
        self.assertEqual(c['CATALOG_UNRESOLVED_LAST_SUPPORTED_EVENT_GRANT_ALL'], 1)

    def test_status_never_go(self):
        result = analyze(REVOKE + GRANT, sample_catalog())
        self.assertEqual(result['COMMERCIAL_GO'], 'NO_GO')
        self.assertEqual(result['OWNER_ACL'], 'NOT_VERIFIED')
        self.assertEqual(result['GLOBAL_ROLES'], 'NOT_VERIFIED')
        self.assertNotIn('public.f', json.dumps(result))

    def test_cli_private_file_and_no_identifiers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'src.sql').write_text(REVOKE + GRANT)
            (root/'catalog.json').write_text(json.dumps(sample_catalog()))
            argv=['diag', '--source-sql', str(root/'src.sql'),
                  '--catalog-json', str(root/'catalog.json'), '--out', str(root/'report.json')]
            with patch.object(sys,'argv',argv), redirect_stdout(io.StringIO()) as stdout:
                main()
            self.assertEqual((root/'report.json').stat().st_mode & 0o777,0o600)
            self.assertNotIn('public.f', stdout.getvalue())
            self.assertNotIn('GRANT EXECUTE', stdout.getvalue())
            self.assertEqual(json.loads((root/'report.json').read_text())['COMMERCIAL_GO'], 'NO_GO')


if __name__ == '__main__':
    unittest.main()
