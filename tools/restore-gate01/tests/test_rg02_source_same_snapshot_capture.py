#!/usr/bin/env python3
"""Synthetic-only tests of PG17 source snapshot capture safety boundaries."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rg02_source_same_snapshot_capture import (
    Blocked, CONFIRMATION, ROLE, PROJECT, SESSION_HOST, APPROVED_CA_SHA256,
    check_context, check_conn_config, check_identity, check_snapshot,
    public_subprocess_env, make_db_env, encrypt_pipeline, verify_decrypt,
    decrypt_and_validate_source,
)

ROOT = Path(__file__).resolve().parents[1]


def fake_context():
    return {
        "GITHUB_REPOSITORY": "luit77yak-dev/neroxa-master",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_REF_PROTECTED": "true",
        "GITHUB_RUN_ATTEMPT": "1",
        "GITHUB_RUN_ID": "45623456789",
        "GITHUB_SHA": "a" * 40,
        "GITHUB_ACTOR": "luit77yak-dev",
        "RG02_SOURCE_CONFIRMATION": CONFIRMATION,
        "RG02_SOURCE_GATE": "OPERATOR_APPROVED_PRIVATE_CAPTURE",
        "RG02_ESCROW_RECOVERY": "EXTERNALLY_RECOVERABLE_KEY_CONFIRMED",
    }


def fake_identity():
    return {
        "db": "postgres", "role": ROLE, "server_major": 17,
        "tx_read_only": "on", "ssl": True,
        "flags": {"login": True, "superuser": False,
                  "create_db": False, "create_role": False,
                  "replication": False, "bypass_rls": True},
        "db_create": False, "business_write_objects": 0, "schema_create": 0,
    }


class ProtectedSourceCaptureTests(unittest.TestCase):
    def test_explicit_scope_and_project_are_pinned(self):
        self.assertEqual(PROJECT, "iefaoaqzltvpfabyeelj")
        self.assertEqual(CONFIRMATION, "RG02_NEW_PREIMAGE_READONLY")
        self.assertEqual(ROLE, "neroxa_rg02_snapshot_reader")

    def test_good_environment_is_gate_only_not_go(self):
        self.assertIsNone(check_context(fake_context()))

    def test_unauthorized_trigger_rejected(self):
        for key, value in (
            ("GITHUB_REF", "refs/heads/unprotected"),
            ("GITHUB_REF_PROTECTED", "false"),
            ("GITHUB_EVENT_NAME", "push"),
            ("GITHUB_RUN_ATTEMPT", "2"),
            ("GITHUB_ACTOR", "unapproved-actor"),
            ("RG02_SOURCE_CONFIRMATION", "RESTORE_ISOLATED_ONLY"),
            ("RG02_SOURCE_GATE", ""),
            ("RG02_ESCROW_RECOVERY", "NOT_PROVEN"),
        ):
            with self.subTest(key=key):
                e = fake_context(); e[key] = value
                with self.assertRaises(Blocked):
                    check_context(e)

    def test_only_pinned_host_and_reader_credential_accepted(self):
        self.assertEqual(len(APPROVED_CA_SHA256), 64)
        self.assertIsNone(check_conn_config(
            SESSION_HOST, ROLE + "." + PROJECT, "5432"))
        for host, user, port in (
            ("example.net", ROLE, "5432"),
            (SESSION_HOST, "postgres." + PROJECT, "5432"),
            ("db." + PROJECT + ".supabase.co", ROLE, "5432"),
            (SESSION_HOST, ROLE + "." + PROJECT, "6543"),
        ):
            with self.assertRaises(Blocked):
                check_conn_config(host, user, port)

    def test_snapshot_id_never_accepts_sql_injection(self):
        self.assertEqual(check_snapshot("00000003-0000001B-1"),
                         "00000003-0000001B-1")
        for item in ("", "not-a-snapshot", "00000003-0000001B-1'; SELECT 1",
                     "00000003-0000001B-1\nROLLBACK;", "00000003-0000001B-1 --",
                     "00000003-0000001B"):
            with self.assertRaises(Blocked):
                check_snapshot(item)

    def test_readonly_source_role_fails_closed(self):
        self.assertTrue(check_identity(json.dumps(fake_identity()))["bypass_rls"])
        for key, value in (
            ("db", "wrong"), ("role", "postgres"), ("server_major", 16),
            ("tx_read_only", "off"), ("ssl", False),
            ("db_create", True), ("business_write_objects", 1),
            ("schema_create", 1),
        ):
            with self.subTest(key=key):
                o = fake_identity(); o[key] = value
                with self.assertRaises(Blocked):
                    check_identity(json.dumps(o))
        for key in ("superuser", "create_db", "create_role", "replication"):
            o = fake_identity(); o["flags"][key] = True
            with self.assertRaises(Blocked):
                check_identity(json.dumps(o))

    def test_missing_identity_fields_fail_without_logging(self):
        for item in ('{"db":"postgres"}', "not-json", "[]"):
            with self.assertRaises(Blocked):
                check_identity(item)

    def test_capture_secret_is_not_inherited_by_gpg(self):
        with patch.dict(os.environ, {
            "PGPASSWORD": "DONOTLEAK_DB", "RG02_CAPTURE_PASSPHRASE": "DONOTLEAK_GPG",
            "SUPABASE_ACCESS_TOKEN": "DONOTLEAK_SB",
            "CLOUDFLARE_API_TOKEN": "DONOTLEAK_CF",
            "GITHUB_TOKEN": "DONOTLEAK_GH",
            "PGSERVICE": "untrusted"}, clear=False):
            sanitized = public_subprocess_env()
            for key in ("PGPASSWORD", "RG02_CAPTURE_PASSPHRASE",
                        "SUPABASE_ACCESS_TOKEN", "CLOUDFLARE_API_TOKEN",
                        "GITHUB_TOKEN", "PGSERVICE"):
                self.assertNotIn(key, sanitized)
            with tempfile.TemporaryDirectory() as d:
                x = make_db_env(SESSION_HOST, ROLE + "." + PROJECT, "private_password",
                                Path(d) / "ca.pem")
                self.assertEqual(x["PGSSLMODE"], "verify-full")
                self.assertEqual(x["PGPASSWORD"], "private_password")
                self.assertNotIn("RG02_CAPTURE_PASSPHRASE", x)

    def test_stream_encrypt_decrypt_without_plaintext_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            secret = root / "key"
            secret.write_text("random-bytes-do-not-use-in-production-" * 3)
            secret.chmod(0o600)
            artifact = root / "sample.gpg"
            payload = b"fake-not-customer-data\n"
            cmd = [sys.executable, "-c",
                   "import sys;sys.stdout.buffer.write(b'fake-not-customer-data\\n')"]
            rec = encrypt_pipeline(cmd, public_subprocess_env(), secret,
                                   artifact, 1024)
            self.assertEqual(rec["sha256"], hashlib.sha256(payload).hexdigest())
            self.assertNotIn(payload, artifact.read_bytes())
            self.assertEqual(artifact.stat().st_mode & 0o777, 0o600)
            verify_decrypt(secret, artifact, rec, 1024)

    def test_encrypted_source_schema_and_tuple_dedup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            secret = root / "key"
            secret.write_text("this-is-only-a-synthetic-unrecoverable-test-key-" * 2)
            secret.chmod(0o600)
            globals_doc = json.dumps({
                "format_version": 1,
                "scope": "SOURCE_GLOBAL_CATALOG_IN_SAME_SNAPSHOT",
                "roles": [{"name": ROLE}],
                "memberships": [], "parameter_acls": [],
            }) + "\n"
            globals_file, tuples_file = root / "global.gpg", root / "tuples.gpg"

            def encrypt_synthetic(source, target):
                return encrypt_pipeline(
                    [sys.executable, "-c", "import sys;print(sys.argv[1],end='')",
                     source], public_subprocess_env(), secret, target, 8192,
                    count_rows=target == tuples_file)

            encrypt_synthetic(globals_doc, globals_file)
            line = json.dumps(["fake", "TABLE", "mock_schema.table",
                               "SELECT", True]) + "\n"
            encrypt_synthetic(line, tuples_file)
            shape = decrypt_and_validate_source(secret, globals_file, tuples_file, 1)
            self.assertEqual(shape["rows"], 1)
            self.assertEqual(shape["roles"], 1)
            tuples_file.unlink()
            encrypt_synthetic(line * 2, tuples_file)
            with self.assertRaisesRegex(Blocked, "RG02_TUPLE_DUPLICATE"):
                decrypt_and_validate_source(secret, globals_file, tuples_file, 2)

    def test_stream_size_limit_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); secret = root / "key"
            secret.write_text("random-bytes-do-not-use-in-production-" * 3)
            secret.chmod(0o600)
            with self.assertRaises(Blocked):
                encrypt_pipeline(
                    [sys.executable, "-c",
                     "import sys;sys.stdout.buffer.write(b'a'*100)"],
                    public_subprocess_env(), secret, root / "test.gpg", 10)

    def test_sql_imports_exported_snapshot_readonly(self):
        for path in ("rg02_source_globals_same_snapshot.sql",
                     "rg02_source_tuple_same_snapshot.sql"):
            text = (ROOT / path).read_text(encoding="utf-8")
            self.assertIn("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;", text)
            self.assertIn("SET TRANSACTION SNAPSHOT :'snap';", text)
            self.assertTrue(text.rstrip().endswith("ROLLBACK;"))
            self.assertNotIn("CREATE ROLE ", text.upper())
            self.assertNotIn("INSERT INTO ", text.upper())
        tuples = (ROOT / "rg02_source_tuple_same_snapshot.sql").read_text()
        for name in ("pg_catalog.pg_has_role", "pg_catalog.has_table_privilege",
                     "pg_catalog.has_function_privilege",
                     "pg_catalog.has_schema_privilege",
                     "pg_catalog.has_sequence_privilege",
                     "pg_catalog.has_parameter_privilege"):
            self.assertIn(name, tuples)

    def test_workflow_requires_review_secret_and_encrypts_only(self):
        workflow = (ROOT.parents[1] / ".github/workflows"
                    / "rg02-source-synchronized-preimage.yml").read_text()
        self.assertIn("github.ref_protected", workflow)
        self.assertIn("name: neroxa-rg02-source-capture", workflow)
        self.assertIn("RG02_SOURCE_GATE", workflow)
        self.assertIn("RG02_ESCROW_RECOVERY", workflow)
        self.assertIn("retention-days: 7", workflow)
        self.assertIn('export RG02_PRIVATE_OUTPUT_ROOT="$PRIVATE"', workflow)
        self.assertIn("/*.gpg", workflow)
        self.assertNotIn("continue-on-error", workflow)
        self.assertIn("COMMERCIAL_GO=NO_GO", workflow)


if __name__ == "__main__":
    unittest.main()
