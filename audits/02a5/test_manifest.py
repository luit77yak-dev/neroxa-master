import copy,importlib.util,json,pathlib,tempfile,unittest
path=pathlib.Path(__file__).with_name('verify_manifest.py');spec=importlib.util.spec_from_file_location('v',path);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class ManifestTests(unittest.TestCase):
 def setUp(self):self.m=json.loads(path.with_name('INTEGRATED-MANIFEST.json').read_text())
 def test_exact_sources(self):self.assertEqual(v.validate(self.m),27)
 def test_reorder(self):
  self.m['units'][2],self.m['units'][3]=self.m['units'][3],self.m['units'][2]
  with self.assertRaises(ValueError):v.validate(self.m)
 def test_changed_hash(self):
  self.m['units'][3]['sha256']='0'*64
  with self.assertRaises(ValueError):v.validate(self.m)
 def test_dependency(self):
  self.m['units'][2]['depends_on']=[]
  with self.assertRaises(ValueError):v.validate(self.m)
 def test_no_consumer_gate(self):
  with self.assertRaises(FileNotFoundError):v.validate(self.m,release=True)
 def test_path_traversal(self):
  self.m['units'][0]['path']='../../etc/passwd'
  with self.assertRaises(ValueError):v.validate(self.m)
if __name__=='__main__':unittest.main()
