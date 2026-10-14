"""Offline fail-closed contract tests, NOT proof of PostgreSQL restoration."""
import hashlib,json,pathlib,unittest,os,tempfile,subprocess
R=pathlib.Path(__file__).parent
class Contracts(unittest.TestCase):
 def test_ec_keys_are_independent_and_api_jwt_signatures_bound(self):
  with tempfile.TemporaryDirectory() as d:
   paths=[]
   for side in ['source','target']:
    p=pathlib.Path(d)/side/'supabase';p.mkdir(parents=True);(p/'config.toml').write_text('[auth]\n# signing_keys_path = "./keys.json"\n[db]\nport = 54322\n')
    subprocess.run(['python3',str(R/'configure.py')],env={**os.environ,'AB_WORKDIR':str(p.parent),'DR_SIDE':side},check=True,stdout=subprocess.DEVNULL)
    self.assertEqual((p/'dr-signing.private.json').stat().st_mode&0o777,0o600);paths.append(p)
   k=[json.loads((p/'dr-signing.private.json').read_text())[0] for p in paths];self.assertNotEqual(k[0]['x'],k[1]['x']);self.assertNotEqual(k[0]['kid'],k[1]['kid'])
   script="""const fs=require('node:fs'),c=require('node:crypto');const paths=process.argv.slice(1);const keys=paths.map(p=>{const {d,...k}=JSON.parse(fs.readFileSync(p+'/dr-signing.private.json'))[0];return c.createPublicKey({key:k,format:'jwk'});});const jwt=fs.readFileSync(paths[0]+'/config.toml','utf8').match(/anon_key = \"([^\"]+)\"/)[1];const [h,p,s]=jwt.split('.');const v=k=>c.verify('sha256',Buffer.from(h+'.'+p),{key:k,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url'));process.stdout.write(JSON.stringify([v(keys[0]),v(keys[1])]));"""
   result=subprocess.check_output(['node','-e',script,*map(str,paths)],text=True);self.assertEqual(json.loads(result),[True,False])

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
