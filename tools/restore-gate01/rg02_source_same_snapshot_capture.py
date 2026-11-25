#!/usr/bin/env python3
"""RG02 new preimage: protected, synchronized, read-only PG17 capture.

NEVER invoke this from chat, a local shell with commercial credentials, a
non-protected runner, or the old F02 catalog-only role. Each executable
subprocess receives a fixed command and an explicitly built environment.
Dump and SQL witness plaintext are streamed directly into GPG (no raw files).
A same-snapshot *protocol* is not independent attestation and is not GO.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys

PROJECT = "iefaoaqzltvpfabyeelj"
ROLE = "neroxa_rg02_snapshot_reader"
SESSION_HOST = "aws-0-us-east-1.pooler.supabase.com"
APPROVED_CA_SHA256 = "700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
SNAPSHOT = re.compile(r"[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
CONFIRMATION = "RG02_NEW_PREIMAGE_READONLY"
MAX_DUMP = 3 * 1024 * 1024 * 1024
MAX_GLOBALS = 8 * 1024 * 1024
MAX_TUPLES = 64 * 1024 * 1024
MAX_TUPLE_ROWS = 250_000
ROOT = Path(__file__).resolve().parent


class Blocked(Exception):
    """Only a constant, non-sensitive reason may be emitted."""


def required(name):
    x = os.environ.get(name, "")
    if not x:
        raise Blocked("RG02_PRIVATE_REQUIREMENTS_MISSING")
    return x


def check_context(env):
    if (env.get("GITHUB_REPOSITORY") != "luit77yak-dev/neroxa-master"
            or env.get("GITHUB_EVENT_NAME") != "workflow_dispatch"
            or env.get("GITHUB_REF") != "refs/heads/main"
            or env.get("GITHUB_REF_PROTECTED") != "true"
            or env.get("GITHUB_RUN_ATTEMPT") != "1"
            or env.get("GITHUB_ACTOR") not in ("luit77yak-dev", "dev-luizt5")
            or not re.fullmatch(r"[0-9]{5,15}", env.get("GITHUB_RUN_ID", ""))
            or not re.fullmatch(r"[0-9a-f]{40}", env.get("GITHUB_SHA", ""))):
        raise Blocked("RG02_PROTECTED_CONTEXT_INVALID")
    if (env.get("RG02_SOURCE_CONFIRMATION") != CONFIRMATION
            or env.get("RG02_SOURCE_GATE") != "OPERATOR_APPROVED_PRIVATE_CAPTURE"
            or env.get("RG02_ESCROW_RECOVERY") != "EXTERNALLY_RECOVERABLE_KEY_CONFIRMED"):
        raise Blocked("RG02_OPERATOR_CUSTODY_APPROVAL_REQUIRED")


def check_conn_config(host, user, port):
    if host != SESSION_HOST or port != "5432":
        raise Blocked("RG02_PINNED_SOURCE_DESTINATION_INVALID")
    expected = f"{ROLE}.{PROJECT}"
    if user != expected:
        raise Blocked("RG02_DEDICATED_READONLY_ROLE_REQUIRED")


def check_snapshot(value):
    if not isinstance(value, str) or not SNAPSHOT.fullmatch(value):
        raise Blocked("RG02_SNAPSHOT_TOKEN_INVALID")
    return value


def check_identity(raw):
    # Never print the identity, role, server address or raw exception text.
    try:
        v = json.loads(raw)
        if type(v) is not dict:
            raise ValueError()
        role = v["role"]
        flags = v["flags"]
        if (v["db"] != "postgres" or role != ROLE
                or type(v["server_major"]) is not int or v["server_major"] != 17
                or v["tx_read_only"] != "on" or v["ssl"] is not True
                or type(flags) is not dict
                or flags["login"] is not True
                or any(flags[k] is not False for k in (
                    "superuser", "create_db", "create_role", "replication"))
                or type(v["db_create"]) is not bool or v["db_create"]
                or type(v["business_write_objects"]) is not int
                or v["business_write_objects"] != 0
                or type(v["schema_create"]) is not int
                or v["schema_create"] != 0):
            raise ValueError()
        if type(flags["bypass_rls"]) is not bool:
            raise ValueError()
        return {"bypass_rls": flags["bypass_rls"]}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise Blocked("RG02_READONLY_IDENTITY_NOT_PROVEN") from None


def public_subprocess_env():
    # Every external binary, including GPG, must not inherit captured DB
    # credentials, passphrase, API tokens, or other application secrets.
    return {k: v for k, v in os.environ.items()
            if not k.startswith(("PG", "RG02_", "SUPABASE_", "CLOUDFLARE_"))
            and k not in ("GITHUB_TOKEN", "GH_TOKEN", "ACTIONS_RUNTIME_TOKEN")}


def make_db_env(host, username, secret, ca_path):
    # Only psql/pg_dump inherit the dedicated DB password; never GPG.
    env = public_subprocess_env()
    env.update({
        "PGHOST": host, "PGPORT": "5432", "PGDATABASE": "postgres",
        "PGUSER": username, "PGPASSWORD": secret,
        "PGSSLMODE": "verify-full", "PGSSLROOTCERT": str(ca_path),
        "PGAPPNAME": "neroxa_rg02_new_preimage",
        "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000",
    })
    return env


def identity_sql():
    return """SELECT pg_catalog.jsonb_build_object(
 'db', current_database(), 'role', current_user,
 'server_major', current_setting('server_version_num')::int/10000,
 'tx_read_only', current_setting('transaction_read_only'),
 'ssl', (SELECT ssl FROM pg_catalog.pg_stat_ssl
         WHERE pid=pg_catalog.pg_backend_pid()),
 'flags', (SELECT pg_catalog.jsonb_build_object(
   'login',rolcanlogin,'superuser',rolsuper,'create_db',rolcreatedb,
   'create_role',rolcreaterole,'replication',rolreplication,
   'bypass_rls',rolbypassrls) FROM pg_catalog.pg_roles
   WHERE rolname=current_user),
 'db_create', pg_catalog.has_database_privilege(current_user,
              current_database(),'CREATE'),
 'schema_create', (SELECT COUNT(*) FROM pg_catalog.pg_namespace n
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE')),
 'business_write_objects', (SELECT COUNT(*)
   FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
     AND c.relkind IN ('r','p','v','m','f','S')
     AND (CASE WHEN c.relkind='S'
       THEN pg_catalog.has_sequence_privilege(current_user,c.oid,'UPDATE')
       ELSE pg_catalog.has_table_privilege(current_user,c.oid,
            'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       END))
)::text;"""


class Exporter:
    def __init__(self, env):
        self.process = subprocess.Popen(
            ["timeout", "800s", "psql", "-X", "-qAt",
             "-v", "ON_ERROR_STOP=1"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, env=env, text=True, bufsize=1,
        )

    def start(self):
        # Must hold the exporting transaction open until pg_dump and BOTH
        # independent witness sessions imported the same snapshot.
        self.process.stdin.write(
            "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
            "SELECT pg_catalog.pg_export_snapshot();\n"
            + identity_sql() + "\n"
        )
        self.process.stdin.flush()
        snap = self.process.stdout.readline().strip()
        check_snapshot(snap)
        observation = self.process.stdout.readline().strip()
        role = check_identity(observation)
        if self.process.poll() is not None:
            raise Blocked("RG02_EXPORTER_CLOSED_EARLY")
        return snap, role

    def close(self):
        proc = self.process
        if proc.poll() is None:
            try:
                proc.stdin.write("ROLLBACK;\n")
                proc.stdin.flush()
                proc.stdin.close()
                proc.wait(timeout=6)
            except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
                proc.kill()
                proc.wait(timeout=5)
        if proc.stdout:
            proc.stdout.close()


def encrypt_pipeline(command, env, passfile, destination, max_bytes,
                     count_rows=False):
    # Producer stdout goes straight into GPG; plaintext NEVER hits disk.
    # Producer stderr is never exposed to public CI logs.
    producer = subprocess.Popen(command, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, env=env)
    cipher = subprocess.Popen([
        "timeout", "720s", "gpg", "--batch", "--yes", "--no-tty",
        "--pinentry-mode", "loopback", "--passphrase-file", str(passfile),
        "--cipher-algo", "AES256", "--s2k-digest-algo", "SHA256",
        "--symmetric", "--output", str(destination),
    ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
       stderr=subprocess.DEVNULL, env=public_subprocess_env())
    h = hashlib.sha256()
    n = 0
    rows = 0
    try:
        while True:
            chunk = producer.stdout.read(256 * 1024)
            if not chunk:
                break
            n += len(chunk)
            if n > max_bytes:
                raise Blocked("RG02_CAPTURE_SIZE_BUDGET_EXCEEDED")
            if count_rows:
                rows += chunk.count(b"\n")
                if rows > MAX_TUPLE_ROWS:
                    raise Blocked("RG02_TUPLE_BUDGET_EXCEEDED")
            h.update(chunk)
            cipher.stdin.write(chunk)
        cipher.stdin.close()
        if producer.wait(timeout=8) != 0 or cipher.wait(timeout=20) != 0 or n == 0:
            raise Blocked("RG02_PRIVATE_STREAM_UNVERIFIED")
        if count_rows and rows == 0:
            raise Blocked("RG02_TUPLE_SET_EMPTY")
        # No symlink, permission or size ambiguity.
        if not destination.is_file() or destination.is_symlink():
            raise Blocked("RG02_ENCRYPTED_OUTPUT_INVALID")
        # Protected capture already enforces umask 077. Also explicitly
        # seal 0600 for direct synthetic callers with a different umask.
        destination.chmod(0o600)
        if destination.stat().st_mode & 0o077:
            raise Blocked("RG02_ENCRYPTED_MODE_INVALID")
        return {"sha256": h.hexdigest(), "plain_bytes": n,
                "cipher_bytes": destination.stat().st_size,
                "rows": rows if count_rows else None}
    except (OSError, subprocess.TimeoutExpired, BrokenPipeError):
        raise Blocked("RG02_PRIVATE_STREAM_FAILED") from None
    finally:
        if producer.poll() is None:
            producer.kill()
        if cipher.poll() is None:
            cipher.kill()
        producer.wait()
        cipher.wait()
        if producer.stdout:
            producer.stdout.close()
        if cipher.stdin and not cipher.stdin.closed:
            cipher.stdin.close()


def verify_decrypt(passfile, ciphertext, expected, limit):
    proc = subprocess.Popen([
        "timeout", "720s", "gpg", "--batch", "--no-tty",
        "--pinentry-mode", "loopback", "--passphrase-file", str(passfile),
        "--decrypt", str(ciphertext),
    ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
       env=public_subprocess_env())
    h = hashlib.sha256()
    n = 0
    try:
        for data in iter(lambda: proc.stdout.read(256 * 1024), b""):
            n += len(data)
            if n > limit:
                raise Blocked("RG02_DECRYPT_BUDGET_INVALID")
            h.update(data)
        if proc.wait(timeout=20) != 0 or n != expected["plain_bytes"] or (
                h.hexdigest() != expected["sha256"]):
            raise Blocked("RG02_ENCRYPTED_REDECRYPT_HASH_MISMATCH")
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()
        proc.stdout.close()


def decrypt_and_validate_source(passfile, globals_file, tuples_file,
                                expected_rows):
    # Secondary structural validation, still with zero plaintext files.
    # Raw identities may exist in runner memory only; they never reach stdout.
    def read_private(path, budget):
        proc = subprocess.Popen([
            "timeout", "90s", "gpg", "--batch", "--no-tty",
            "--pinentry-mode", "loopback",
            "--passphrase-file", str(passfile), "--decrypt", str(path),
        ], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
           env=public_subprocess_env())
        data = bytearray()
        try:
            for chunk in iter(lambda: proc.stdout.read(256 * 1024), b""):
                data.extend(chunk)
                if len(data) > budget:
                    raise Blocked("RG02_PRIVATE_WITNESS_TOO_LARGE")
            if proc.wait(timeout=10) != 0:
                raise Blocked("RG02_PRIVATE_WITNESS_DECRYPT_INVALID")
            return bytes(data)
        finally:
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            proc.stdout.close()

    try:
        source_globals = json.loads(read_private(globals_file, MAX_GLOBALS))
        if (not isinstance(source_globals, dict)
                or source_globals.get("format_version") != 1
                or source_globals.get("scope") !=
                "SOURCE_GLOBAL_CATALOG_IN_SAME_SNAPSHOT"
                or not isinstance(source_globals.get("roles"), list)
                or not source_globals["roles"]
                or not isinstance(source_globals.get("memberships"), list)
                or not isinstance(source_globals.get("parameter_acls"), list)):
            raise Blocked("RG02_GLOBALS_STRUCTURAL_PROOF_MISSING")
        roles = source_globals["roles"]
        if (not all(isinstance(x, dict) and isinstance(x.get("name"), str)
                    for x in roles)
                or len({x["name"] for x in roles}) != len(roles)
                or ROLE not in {x["name"] for x in roles}):
            raise Blocked("RG02_GLOBALS_ROLE_SET_INVALID")
        rows = read_private(tuples_file, MAX_TUPLES).splitlines()
        if len(rows) != expected_rows or not rows:
            raise Blocked("RG02_TUPLE_COUNT_MISMATCH")
        kinds = {
            "ROLE": {"MEMBER", "USAGE", "SET"},
            "SCHEMA": {"USAGE", "CREATE"},
            "TABLE": {"SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE",
                      "REFERENCES", "TRIGGER", "MAINTAIN"},
            "FUNCTION": {"EXECUTE"},
            "SEQUENCE": {"USAGE", "SELECT", "UPDATE"},
            "PARAMETER": {"SET", "ALTER SYSTEM"},
        }
        observed = set()
        for line in rows:
            row = json.loads(line)
            if (not isinstance(row, list) or len(row) != 5
                    or not all(isinstance(row[i], str) and row[i]
                               and "\x00" not in row[i] for i in (0, 1, 2, 3))
                    or row[1] not in kinds or row[3] not in kinds[row[1]]
                    or (type(row[4]) is not bool and row[4] is not None)):
                raise Blocked("RG02_TUPLE_SHAPE_INVALID")
            key = tuple(row[:4])
            if key in observed:
                raise Blocked("RG02_TUPLE_DUPLICATE")
            observed.add(key)
        return {"roles": len(roles), "rows": len(rows)}
    except (ValueError, UnicodeDecodeError, TypeError, KeyError):
        raise Blocked("RG02_PRIVATE_WITNESS_PARSE_INVALID") from None


def encrypt_json(body, passfile, dest):
    proc = subprocess.Popen([
        "timeout", "30s", "gpg", "--batch", "--yes", "--no-tty",
        "--pinentry-mode", "loopback", "--passphrase-file", str(passfile),
        "--cipher-algo", "AES256", "--symmetric", "--output", str(dest)
    ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
       stderr=subprocess.DEVNULL, env=public_subprocess_env())
    plain = json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    proc.communicate(input=plain, timeout=25)
    if proc.returncode != 0 or not dest.is_file():
        raise Blocked("RG02_PRIVATE_MANIFEST_ENCRYPTION_FAILED")
    dest.chmod(0o600)
    verify_decrypt(passfile, dest,
                   {"plain_bytes": len(plain),
                    "sha256": hashlib.sha256(plain).hexdigest()}, 32 * 1024)


def run():
    os.umask(0o077)
    check_context(os.environ)
    host = required("RG02_SOURCE_HOST")
    username = required("RG02_SOURCE_PG_USER")
    check_conn_config(host, username, "5432")
    password = required("RG02_SOURCE_PG_PASSWORD")
    ca = required("RG02_SOURCE_CA_PEM")
    encryption_secret = required("RG02_CAPTURE_PASSPHRASE")
    if (len(encryption_secret) < 32 or len(encryption_secret) > 1024
            or any(c in encryption_secret for c in "\x00\r\n")
            or len(password) < 12 or len(ca) > 65536
            or "BEGIN CERTIFICATE" not in ca):
        raise Blocked("RG02_SECRET_INPUT_INVALID")
    # Independently audited F02 Supavisor CA pin. Do not accept a substituted
    # trust root or a direct host without a new, separately approved revision.
    if hashlib.sha256(ca.encode("utf-8")).hexdigest() != APPROVED_CA_SHA256:
        raise Blocked("RG02_PINNED_CA_MISMATCH")
    root = Path(required("RG02_PRIVATE_OUTPUT_ROOT")).resolve()
    if not root.is_dir() or root.is_symlink() or root.stat().st_mode & 0o077:
        raise Blocked("RG02_PRIVATE_ROOT_INVALID")
    output = root / ("preimage-" + required("GITHUB_RUN_ID"))
    if output.exists() or output.is_symlink():
        raise Blocked("RG02_CAPTURE_ALREADY_STARTED")
    output.mkdir(mode=0o700)
    passfile = output / "passphrase.tmp"
    ca_file = output / "ca.tmp"
    passfile.write_text(encryption_secret, encoding="utf-8")
    ca_file.write_text(ca, encoding="utf-8")
    passfile.chmod(0o600)
    ca_file.chmod(0o600)
    db_env = make_db_env(host, username, password, ca_file)
    exporter = None
    success = False
    try:
        exporter = Exporter(db_env)
        snapshot, flags = exporter.start()
        # Every consumer imports the SAME exporter snapshot. The exporter
        # lives through the entire dump/global/tuple sequence.
        dump = output / "dump.custom.gpg"
        global_file = output / "global-catalog.json.gpg"
        tuple_file = output / "source-tuple-witness.jsonl.gpg"
        stats = {}
        stats["dump"] = encrypt_pipeline(
            ["timeout", "650s", "pg_dump", "--format=custom",
             "--no-password", "--lock-wait-timeout=5000",
             "--snapshot=" + snapshot, "--dbname=postgres"],
            db_env, passfile, dump, MAX_DUMP,
        )
        for kind, file, sql, maxsize, count_rows in (
            ("globals", global_file, "rg02_source_globals_same_snapshot.sql",
             MAX_GLOBALS, False),
            ("tuples", tuple_file, "rg02_source_tuple_same_snapshot.sql",
             MAX_TUPLES, True),
        ):
            stats[kind] = encrypt_pipeline(
                ["timeout", "120s", "psql", "-X", "-qAt",
                 "-v", "ON_ERROR_STOP=1", "-v", "snap=" + snapshot,
                 "-f", str(ROOT / sql)],
                db_env, passfile, file, maxsize, count_rows,
            )
        if exporter.process.poll() is not None:
            raise Blocked("RG02_SNAPSHOT_OWNER_LOST")
        for kind, file, limit in (
                ("dump", dump, MAX_DUMP),
                ("globals", global_file, MAX_GLOBALS),
                ("tuples", tuple_file, MAX_TUPLES)):
            verify_decrypt(passfile, file, stats[kind], limit)
        # Verify structure and uniqueness after decrypt/hash without writing
        # any private plaintext to disk or printing identifiers.
        shape = decrypt_and_validate_source(
            passfile, global_file, tuple_file, stats["tuples"]["rows"])
        # This hash-only manifest binds all 3 bytestrings to a NEW capture,
        # but cannot independently authenticate the commercial source.
        manifest = {
            "format": 1, "scope": "NEW_READ_ONLY_SAME_PREIMAGE_STAGED",
            "capture_id": secrets.token_hex(16),
            "project_ref": PROJECT, "source_role": ROLE,
            "encrypted_objects": stats,
            "private_witness_shape": shape, "pg_major": 17,
            "github_source_commit": required("GITHUB_SHA"),
            "github_protected_run_id": required("GITHUB_RUN_ID"),
            "snapshot_import_contract": "1 exporter + pg_dump snapshot + 2 imported PG17 sessions",
            "rls_bypass_on_reader": flags["bypass_rls"],
            "source_cryptographic_provenance": "NOT_INDEPENDENTLY_ATTESTED",
            "external_escrow_readback": "NOT_VERIFIED",
            "preimage_vs_old_backup": "DIFFERENT_NEW_PREIMAGE",
            "GLOBAL_ROLES": "NOT_VERIFIED",
            "OWNER_ACL": "NOT_VERIFIED",
            "COMMERCIAL_GO": "NO_GO",
        }
        encrypt_json(manifest, passfile, output / "manifest.json.gpg")
        success = True
    finally:
        if exporter is not None:
            exporter.close()
        # The passphrase is NEVER included in any artifact.
        passfile.unlink(missing_ok=True)
        ca_file.unlink(missing_ok=True)
        if not success:
            shutil.rmtree(output, ignore_errors=True)
    print("RG02_SAME_SNAPSHOT_CAPTURE=ENCRYPTED_STAGED_NOT_GO")
    print("SOURCE_CREDENTIALS_LOGGED=NO; UNENCRYPTED_BACKUP_WRITTEN=NO")
    print("SOURCE_INDEPENDENT_ATTESTATION=NOT_VERIFIED; EXTERNAL_CUSTODY=NOT_VERIFIED")
    print("PRODUCTION_WRITES=NONE; SQL_RELEASE=NOT_RUN; COMMERCIAL_GO=NO_GO")


if __name__ == "__main__":
    try:
        run()
    except (Blocked, OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError):
        print("RG02_NEW_PREIMAGE_CAPTURE=BLOCKED_REDACTED")
        print("PRODUCTION_WRITES=NONE; SQL_RELEASE=NOT_RUN; COMMERCIAL_GO=NO_GO")
        sys.exit(2)
