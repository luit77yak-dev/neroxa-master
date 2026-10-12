"""Real PG17 archive/comparator regression; NOT a Supabase/Auth compatibility test."""
import pathlib, subprocess, time, unittest, uuid, tempfile, os, hashlib, shutil, re
ROOT = pathlib.Path(__file__).resolve().parents[2]

class RestoreRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = 'neroxa-restore-unit-' + uuid.uuid4().hex[:12]
        cls.command(['docker','run','-d','--network','none','--name',cls.container,
                 '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17'])
        try:
            for _ in range(30):
                if 'PostgreSQL init process complete' in subprocess.run(['docker','logs',cls.container],capture_output=True,text=True).stdout and subprocess.run(['docker','exec',cls.container,'pg_isready','-U','postgres'],capture_output=True).returncode == 0: break
                time.sleep(1)
            cls.sql('postgres', '''CREATE TABLE public.fixture(id integer PRIMARY KEY, instance_id uuid NOT NULL, value text);
                INSERT INTO public.fixture VALUES(1,'00000000-0000-4000-8000-000000000001','fictitious');
                CREATE TABLE public.fixture_child(id integer PRIMARY KEY, parent_id integer REFERENCES public.fixture(id));
                INSERT INTO public.fixture_child VALUES(1,1);
                ALTER TABLE public.fixture ENABLE ROW LEVEL SECURITY;
                CREATE POLICY fixture_read ON public.fixture FOR SELECT USING (id=1);
                CREATE FUNCTION public.fixture_fn() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT 1$$;''')
            cls.command(['docker','exec',cls.container,'pg_dump','-U','postgres','-Fc','-f','/tmp/fixture.dump','postgres'])
        except BaseException:
            cls.tearDownClass()
            raise

    @staticmethod
    def command(args, input=None):
        return subprocess.run(args,input=input,text=True,capture_output=True,check=True).stdout.strip()

    @classmethod
    def sql(cls, db, text):
        return cls.command(['docker','exec','-i',cls.container,'psql','-XqAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],text)

    @classmethod
    def tearDownClass(cls):
        cls.command(['docker','rm','-f',cls.container])

    def test_archive_roundtrip_and_mutation_detection(self):
        self.sql('postgres','CREATE DATABASE restored TEMPLATE template0;')
        toc=self.command(['docker','exec',self.container,'pg_restore','-l','/tmp/fixture.dump'])
        if any(' SCHEMA - public ' in l for l in toc.splitlines()): self.sql('restored','DROP SCHEMA public;')
        self.command(['docker','exec',self.container,'pg_restore','-U','postgres','-d','restored','--exit-on-error','--single-transaction','/tmp/fixture.dump'])
        # Internal PostgreSQL "char" must be cast before string concatenation.
        self.sql('restored', "SELECT 'trigger|' || tgenabled::text FROM pg_trigger;")
        script=(ROOT/'tools/ab-auth/restore_rehearsal.mjs').read_text()
        catalog=re.search(r'const catalog =.*?`(.*?)`',script,re.S).group(1).replace('\\\\','\\')
        self.assertEqual(self.sql('postgres',catalog),self.sql('restored',catalog))
        data=(ROOT/'tools/ab-auth/restore_data.sql').read_text()
        props=(ROOT/'tools/ab-auth/restore_properties.sql').read_text()
        self.assertEqual(self.sql('postgres',data),self.sql('restored',data))
        self.assertEqual(self.sql('postgres',props),self.sql('restored',props))
        integrity=(ROOT/'tools/ab-auth/restore_integrity.sql').read_text()
        self.assertTrue(self.sql('restored',integrity).endswith('|0'))
        self.sql('restored',"UPDATE public.fixture SET instance_id='00000000-0000-4000-8000-000000000002';")
        self.assertNotEqual(self.sql('postgres',data),self.sql('restored',data))
        self.sql('restored','ALTER FUNCTION public.fixture_fn() SECURITY INVOKER;')
        self.assertNotEqual(self.sql('postgres',props),self.sql('restored',props))
        self.sql('restored', 'CREATE TABLE public.orphan_fixture(parent_id integer); INSERT INTO public.orphan_fixture VALUES(999); ALTER TABLE public.orphan_fixture ADD CONSTRAINT bad_fk FOREIGN KEY(parent_id) REFERENCES public.fixture(id) NOT VALID;')
        self.assertIn('orphan_fixture.bad_fk|1',self.sql('restored',integrity))
        # Repeated invocation uses a fresh destination, never overlays a restored DB.
        self.sql('postgres','DROP DATABASE restored;')

    def test_docker_relay_preserves_binary_exec_stream(self):
        work=tempfile.mkdtemp(prefix='neroxa-relay-unit-')
        relay=None
        try:
            env=os.environ.copy()
            env.update(AB_WORKDIR=work,AB_PROJECT='neroxa-rehearsal-123456789')
            relay=subprocess.Popen(['python3',str(ROOT/'tools/ab-auth/docker_loopback.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            socket_path=pathlib.Path(work)/'docker-loopback.sock'
            for _ in range(30):
                if socket_path.exists(): break
                time.sleep(0.1)
            self.assertTrue(socket_path.exists())
            env['DOCKER_HOST']='unix://'+str(socket_path)
            for key in ['DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']: env.pop(key,None)
            payload=bytes(range(256))*4096
            result=subprocess.run(['docker','exec','-i',self.container,'sha256sum'],env=env,input=payload,capture_output=True,check=True)
            self.assertEqual(result.stdout.decode().split()[0],hashlib.sha256(payload).hexdigest())
        finally:
            if relay:
                relay.terminate()
                relay.wait(timeout=5)
            shutil.rmtree(work)

if __name__ == '__main__': unittest.main()
