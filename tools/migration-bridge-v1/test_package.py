import hashlib,json,pathlib,unittest
R=pathlib.Path(__file__).resolve().parents[2];P=R/'audits/migration-bridge-v1-20261013'
def verify(m):
 if [x['phase'] for x in m['sequence']]!=list('ABCDE'):raise ValueError('order')
 for x in m['sequence']:
  path=(R/x['path']).resolve()
  if not path.is_relative_to(P.resolve()):raise ValueError('path')
  if hashlib.sha256(path.read_bytes()).hexdigest()!=x['sha256']:raise ValueError('hash')
 if m['remoteExecutionAuthorized'] or m['automaticMigrations']:raise ValueError('remote')
 for x in m['nativeSequence']:
  if hashlib.sha256((R/x['path']).read_bytes()).hexdigest()!=x['sha256']:raise ValueError('native hash')
class Tests(unittest.TestCase):
 def setUp(self):self.m=json.loads((P/'MANIFEST-PONTE.json').read_text())
 def test_manifest(self):verify(self.m)
 def test_wrong_order(self):self.m['sequence'].reverse();self.assertRaises(ValueError,verify,self.m)
 def test_hash_tamper(self):self.m['sequence'][0]['sha256']='0'*64;self.assertRaises(ValueError,verify,self.m)
 def test_path(self):self.m['sequence'][0]['path']='../../private';self.assertRaises(ValueError,verify,self.m)
 def test_remote(self):self.m['remoteExecutionAuthorized']=True;self.assertRaises(ValueError,verify,self.m)
 def test_preflight_readonly(self):
  s=(R/self.m['sequence'][0]['path']).read_text();self.assertNotIn('ALTER TABLE',s);self.assertNotIn('INSERT INTO',s)
 def test_no_permission_defaults(self):
  s=(R/self.m['sequence'][2]['path']).read_text();self.assertNotIn("SET role='",s);self.assertIn('BRIDGE_EXPLICIT_RESOLUTION_REQUIRED',s)
 def test_no_destructive_strategy(self):
  s='\n'.join((R/x['path']).read_text() for x in self.m['sequence']);self.assertNotIn('DROP CASCADE',s);self.assertFalse(any(line.lstrip().startswith('TRUNCATE ') for line in s.splitlines()));self.assertNotIn('DISABLE ROW LEVEL',s)
 def test_historical_not_repriced(self):
  s=(R/self.m['sequence'][2]['path']).read_text();self.assertNotIn('UPDATE public."neroxa_orders"',s);self.assertNotIn('UPDATE public."neroxa_order_items"',s)
 def test_managed_roles_untouched(self):
  s='\n'.join((R/x['path']).read_text() for x in self.m['sequence']);self.assertNotIn('ALTER ROLE',s);self.assertNotIn('FOR ROLE supabase_admin',s)
if __name__=='__main__':unittest.main()
