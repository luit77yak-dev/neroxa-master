import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rg02_residual_review import residual_report, CAPTURE, PREFLIGHT


class ResidualReviewTests(unittest.TestCase):
    def inputs(self):
        no_login = (False, False, False, False, False, False, False)
        login = (True, False, False, False, False, False, False)
        source = {"roles": {PREFLIGHT: login, CAPTURE: login, "postgres": login},
                  "memberships": {("pg_read_all_data", CAPTURE, "postgres", False, True, False)}}
        target = {"roles": {PREFLIGHT: no_login, CAPTURE: no_login, "postgres": login},
                  "memberships": set()}
        catalog = {"functions": [], "relations": []}
        return source, target, catalog

    def test_exact_baseline_and_flags(self):
        s, t, c = self.inputs()
        owner = "ALTER SCHEMA vault OWNER TO postgres;"
        a = residual_report("", owner, owner, s, t, {}, {}, c)
        self.assertEqual(a["OWNER_EXTRA_EXACT_BASELINE"], 1)
        self.assertEqual(a["OWNER_EXTRA_NOT_IN_BASELINE_HOLD"], 0)
        self.assertEqual(a["ROLE_F02_PREFLIGHT_LOGIN_SOURCE_TRUE"], 1)
        self.assertEqual(a["EDGE_SOURCE_ONLY_EXACT_TEMP_READ"], 1)

    def test_wrong_owner_not_baseline(self):
        s, t, c = self.inputs()
        a = residual_report("", "ALTER SCHEMA vault OWNER TO postgres;",
                            "ALTER SCHEMA vault OWNER TO other;", s, t, {}, {}, c)
        self.assertEqual(a["OWNER_EXTRA_NOT_IN_BASELINE_HOLD"], 1)
        self.assertEqual(a["OWNER_EXTRA_EXACT_BASELINE"], 0)

    def test_grantor_observation_not_equivalence(self):
        s, t, c = self.inputs()
        grant = "GRANT SELECT ON TABLE public.t TO anon;"
        revoke = "REVOKE SELECT ON TABLE public.t FROM anon;"
        c["relations"].append({"identity": "public.t", "owner": "postgres",
                               "acl": [{"is_public": False, "grantee": "anon",
                                        "grantor": "postgres", "privilege": "SELECT",
                                        "grantable": False}]})
        a = residual_report(revoke+grant, grant, "", s, t, {}, {}, c)
        self.assertEqual(a["FOCAL_ACL_STATEMENTS"], 1)
        self.assertEqual(a["FOCAL_ACL_TARGET_OWNER_GRANTOR"], 1)
        c["relations"][0]["acl"][0]["grantor"] = "unknown_private_role"
        a = residual_report(revoke+grant, grant, "", s, t, {}, {}, c)
        self.assertEqual(a["FOCAL_ACL_TARGET_NONOWNER_GRANTOR_HOLD"], 1)
        self.assertNotIn("unknown_private_role", str(a))

    def test_preflight_rights_are_observations(self):
        s, t, c = self.inputs()
        rows = {(PREFLIGHT, "TABLE", "private.x", "UPDATE"): True,
                (PREFLIGHT, "FUNCTION", "private.fn()", "EXECUTE"): True,
                (PREFLIGHT, "SCHEMA", "private", "CREATE"): False}
        a = residual_report("", "", "", s, t, rows, {}, c)
        self.assertEqual(a["F02_PREFLIGHT_SOURCE_TABLE_WRITE_OR_MAINTAIN"], 1)
        self.assertEqual(a["F02_PREFLIGHT_SOURCE_FUNCTION_EXECUTE"], 1)
        self.assertEqual(a["F02_PREFLIGHT_SOURCE_SCHEMA_CREATE"], 0)
        self.assertNotIn("private.x", str(a))


if __name__ == "__main__":
    unittest.main()
