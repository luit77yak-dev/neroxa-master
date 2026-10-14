"""Offline fail-closed contract tests, NOT proof of PostgreSQL restoration."""
import hashlib,json,pathlib,unittest
R=pathlib.Path(__file__).parent
class Contracts(unittest.TestCase):
 def test_two_distinct_clusters(self):
  s=(R/'restore.mjs').read_text();self.assertIn('system_identifier FROM pg_control_system()',s);self.assertIn('source === target',s);self.assertIn('Different PostgreSQL data volumes',s)
 def test_errors_fail_atomically(self):
  s=(R/'restore.mjs').read_text();self.assertIn('--exit-on-error',s);self.assertIn('--single-transaction',s);self.assertIn('ON_ERROR_STOP=1',s)
 def test_archive_not_artifact(self):
  s=(R/'restore.mjs').read_text();self.assertIn('mode: 0o600',s);self.assertIn('recovery.private.dump',s)
 def test_target_auth_and_foreign_signature(self):
  s=(R/'restore.mjs').read_text();self.assertIn('signInWithPassword',s);self.assertIn('PGRST301',s);self.assertIn('targetEnv.SERVICE_ROLE_KEY',s)
 def test_not_settled(self):
  self.assertIn('NOT_SETTLED',(R/'prepare-source.mjs').read_text());self.assertIn('NOT_SETTLED',(R/'restore.mjs').read_text())
 def test_t1_is_not_zero_rpo(self):
  s=(R/'t0-t1.mjs').read_text();self.assertIn('rpoZero: false',s);self.assertIn('T1_PRESENT_ROLLBACK_TO_T0_FORBIDDEN',s);self.assertIn('no WAL/PITR/CDC',s)
 def test_no_managed_role_changes(self):
  for p in R.glob('*.mjs'):self.assertNotIn('ALTER ROLE',p.read_text())
 def test_resource_margin_before_downloads(self):
  s=(R/'preflight.py').read_text();self.assertIn('26*1024**3',s);self.assertIn('6*1024**3',s)
 def test_backend_proxy_local_only(self):
  s=(R/'proxy.mjs').read_text();self.assertIn('127.0.0.1',s);self.assertIn('res.writeHead(404)',s)
 def test_dump_hash_detects_damage(self):
  a=b'private-synthetic-test-only';self.assertNotEqual(hashlib.sha256(a).digest(),hashlib.sha256(a[:-1]).digest())
if __name__=='__main__':unittest.main()
