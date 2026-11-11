import unittest,json
from docker_loopback import rewrite
class BindGuard(unittest.TestCase):
 def test_public_bind_becomes_loopback(self):
  b=json.dumps({'HostConfig':{'PortBindings':{'5432/tcp':[{'HostIp':'0.0.0.0','HostPort':'54322'}]}}}).encode()
  self.assertEqual(json.loads(rewrite(b,'ab','supabase_db_ab'))['HostConfig']['PortBindings']['5432/tcp'][0]['HostIp'],'127.0.0.1')
 def test_wrong_project_with_ports_rejected(self):
  with self.assertRaises(ValueError):rewrite(b'{"HostConfig":{"PortBindings":{"5432/tcp":[{}]}}}','ab','supabase_db_other')
 def test_unpublished_utility_not_rewritten(self):
  b=b'{"HostConfig":{"NetworkMode":"none"}}';self.assertEqual(rewrite(b,'ab',''),b)
if __name__=='__main__':unittest.main()
