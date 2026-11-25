#!/usr/bin/env python3
"""Synthetic offline RG02 classifier tests. No private roles, network, or databases."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_compare_runtime import compare_roles, role_metadata_kind, statements
from rg02_local_roles_prepare import prepare


def synthetic_globals():
    rows = []
    for i in range(16):
        n = f"lab_role_{i:02d}"
        rows.append(f"CREATE ROLE {n};")
        high = 'SUPERUSER' if i < 9 else 'NOSUPERUSER'
        rows.append(f"ALTER ROLE {n} WITH {high} NOLOGIN NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;")
        rows.append(f"ALTER ROLE {n} SET search_path TO public;")
    for i in range(23):
        rows.append(f"GRANT lab_role_{i%16:02d} TO lab_role_{(i+1)%16:02d};")
    rows.extend(["SET statement_timeout = 0;", "SET search_path = public;",
                 "SELECT pg_catalog.set_config('search_path','',false);"])
    rows.append("COMMENT ON ROLE lab_role_00 IS 'synthetic; no private data';")
    return "\n".join(rows)


class RG02MetadataClassification(unittest.TestCase):
    def test_audited_shape_is_classified_without_replay(self):
        text = synthetic_globals()
        self.assertEqual(len(statements(text)), 75)
        sql, counts = prepare(text, [])
        self.assertEqual(counts["declared"], 16)
        self.assertEqual(counts["memberships_hold"], 23)
        self.assertEqual(counts["source_elevated_roles_hold"], 9)
        self.assertEqual(counts["role_setting_holds"], 16)
        self.assertEqual(counts["role_comment_holds"], 1)
        self.assertEqual(counts["privileges_applied"], 0)
        self.assertEqual(counts["memberships_applied"], 0)
        self.assertEqual(counts["role_metadata_applied"], 0)
        self.assertEqual(sql.count("CREATE ROLE"), 16)
        self.assertEqual(sql.count("NOLOGIN NOSUPERUSER"), 16)
        self.assertNotIn("GRANT ", sql)
        self.assertNotIn("ALTER ROLE", sql)
        self.assertNotIn("COMMENT ON", sql)
        self.assertNotIn(" SET ", sql)

    def test_comparator_reports_holds_not_automatic_go(self):
        result = compare_roles(synthetic_globals(), {"roles": [], "memberships": []})
        self.assertEqual(result["role_setting_holds"], 16)
        self.assertEqual(result["role_comment_holds"], 1)
        self.assertEqual(result["unknown_role_statements"], 0)
        self.assertEqual(result["missing_roles"], 16)
        self.assertEqual(result["missing_memberships"], 23)

    def test_role_settings_syntactic_variants_are_holds(self):
        self.assertEqual(role_metadata_kind('ALTER ROLE "lab_role" SET "search_path" TO public')[0], "role_setting_hold")
        self.assertEqual(role_metadata_kind("ALTER USER lab_role IN DATABASE lab SET search_path = public")[0], "role_setting_hold")
        self.assertEqual(role_metadata_kind("COMMENT ON ROLE lab_role IS E'example'")[0], "role_comment_hold")

    def test_unclassified_sql_rejected(self):
        with self.assertRaisesRegex(ValueError, "ROLE_SOURCE_UNCLASSIFIED"):
            prepare("CREATE ROLE test_role; ALTER ROLE test_role RESET ALL;", [])

    def test_metadata_role_must_be_declared(self):
        with self.assertRaisesRegex(ValueError, "ROLE_METADATA_TARGET_UNDECLARED"):
            prepare("CREATE ROLE test_role; ALTER ROLE other_role SET search_path TO public;", [])

    def test_managed_roles_never_invented(self):
        with self.assertRaisesRegex(ValueError, "MANAGED_ROLE_BASELINE_MISSING"):
            prepare("CREATE ROLE supabase_admin;", [])

    def test_password_material_rejected(self):
        with self.assertRaisesRegex(ValueError, "SOURCE_PASSWORD_MATERIAL"):
            prepare("CREATE ROLE test_role; ALTER ROLE test_role WITH PASSWORD 'dummy';", [])


if __name__ == "__main__":
    unittest.main()
