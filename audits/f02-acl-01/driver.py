"""F02-ACL-01 candidate. No import-time side effects. RUN ONLY after admission.

All SQL transport is docker exec against this run's local, inspected container.
Never accepts a database URL, host, password, arbitrary SQL file or remote ref.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
BASE = 'c149f802adf1922be588319cc98a798c7b387ea8'
DELIVERY = '011275488660bfa1a9271b3e4c92e457f7638e34'
PG = 'supabase/postgres@sha256:f2a84af37797675f0b27e27ea1fad2ebcd913ebf7ad60be05d7df0bcbd29e4b5'
PG_ID = 'sha256:94fe95acfce6e1d41106ff2abd4c08e7932a6941d453499a56f8a620a473de1a'
SIG = 'public.calculate_public_order_line_price(uuid,uuid,uuid,text,text,jsonb,jsonb)'
PROBE = 'f02_acl01_probe'
EXPLICIT = ['anon=X/postgres', 'authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres']
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def command(args, *, text=None, env=None, timeout=180):
    # Capture private output; never dump SQL/client errors into public CI logs.
    r = subprocess.run(args, input=text, text=True, capture_output=True,
                       env=env, timeout=timeout, cwd=ROOT)
    require(r.returncode == 0, 'COMMAND_BLOCKED:' + Path(args[0]).name)
    return r.stdout.strip()


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def read_state():
    run = os.environ.get('GITHUB_RUN_ID', '')
    require(run.isdigit(), 'RUN_ID_REQUIRED')
    work = Path(os.environ['RUNNER_TEMP']).resolve() / ('f02-acl-01-' + run)
    return work, work / 'state.json'


def save(path, value):
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
    path.chmod(0o600)


def sql(state, text, denied=False):
    # Local socket inside a single named container; not libpq host environment.
    r = subprocess.run(DOCKER + ['exec', '-i', state['db'], 'psql', '-XqAt',
        '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose'], input=text, text=True, capture_output=True,
        timeout=60, cwd=ROOT)
    if denied:
        require(r.returncode != 0 and re.search(r'ERROR:\s+42501:', r.stderr),
                'EXPECTED_NATIVE_PERMISSION_DENIAL')
        return None
    require(r.returncode == 0, 'SQL_BLOCKED')
    return r.stdout.strip()


def scalar(state, expression):
    return json.loads(sql(state, 'SELECT ' + expression + ';'))


def local_identity(state):
    require(state['project'] == 'neroxa-02a3-' + state['run'] + '-acl01', 'PROJECT_MISMATCH')
    require(state['db'] == 'supabase_db_' + state['project'], 'DB_NAME_MISMATCH')
    c = json.loads(command(DOCKER + ['inspect', state['db']]))[0]
    require(c['Config']['Labels'].get('com.supabase.cli.project') == state['project'], 'DB_LABEL')
    require(c['Image'] == PG_ID, 'DB_IMAGE')
    for binds in (c['HostConfig'].get('PortBindings') or {}).values():
        for bind in binds or []:
            require(bind['HostIp'] == '127.0.0.1', 'NON_LOOPBACK_BIND')
    require(c['HostConfig'].get('Privileged') is False, 'PRIVILEGED_DB')
    require(sql(state, "SELECT current_setting('server_version_num')::int/10000;") == '17', 'PG17')


def metadata(state):
    return scalar(state, """json_build_object(
      'definition',pg_get_functiondef(p.oid),'source_md5',md5(p.prosrc),
      'definition_md5',md5(pg_get_functiondef(p.oid)),
      'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
      'config',p.proconfig,'acl',(SELECT json_agg(x ORDER BY x) FROM unnest(p.proacl::text[]) x))
      FROM pg_proc p WHERE p.oid=to_regprocedure(""" + lit(SIG) + ')')


def catalog(state):
    # Whole app function/grant/policy/trigger baseline, not just a target boolean.
    return scalar(state, """jsonb_build_object(
      'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'def',pg_get_functiondef(p.oid),'owner',p.proowner,'config',p.proconfig,'acl',p.proacl::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')),
      'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')),
      'schemas',(SELECT jsonb_agg(jsonb_build_array(oid,nspowner,nspacl::text) ORDER BY oid) FROM pg_namespace WHERE nspname IN ('public','private')),
      'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
      'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE NOT t.tgisinternal),
      'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m),
      'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d))""")


def business(state):
    return scalar(state, """jsonb_build_object(
       'orders',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.neroxa_orders o),
       'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM public.neroxa_order_items i),
       'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY id),'[]') FROM public.neroxa_order_status_history h))""")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def http(state, endpoint, payload, token, *, auth=False):
    require(endpoint in ('admin/users', 'token?grant_type=password', 'rpc/create_public_order',
                         'rpc/append_public_order_items_with_payment'), 'HTTP_ENDPOINT')
    prefix = '/auth/v1/' if auth else '/rest/v1/'
    req = urllib.request.Request(state['api'] + prefix + endpoint,
        data=json.dumps(payload).encode(), method='POST', headers={
            'apikey': state['anon'], 'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'})
    # Reject redirects, including a redirect away from loopback.
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect).open(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, None


def fixture_id(number):
    return 'a0100000-0000-4000-8000-' + str(number).zfill(12)


def capability(state, order, key):
    # Optional ONLY if exact frozen functions already exist. Never install SQL units.
    reg = 'public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)'
    app = 'public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)'
    present = scalar(state, 'json_build_array(to_regprocedure(' + lit(reg) + ') IS NOT NULL,to_regprocedure(' + lit(app) + ') IS NOT NULL)')
    if present == [False, False]:
        return 'NOT_RUN: dependencies absent in exact historical baseline'
    require(present == [True, True], 'PARTIAL_CAPABILITY_DEPENDENCIES')
    # Unrecognized optional definitions must not become a positive compatibility claim.
    text = (ROOT / 'audits/sql/order-amendment-capability.candidate.sql').read_text()
    for signature, name in ((reg, 'neroxa_register_order_amendment_capability'),
                            (app, 'neroxa_append_order_items_with_capability')):
        m = scalar(state, 'json_build_object(\'source\',p.prosrc,\'owner\',pg_get_userbyid(p.proowner),\'definer\',p.prosecdef) FROM pg_proc p WHERE p.oid=to_regprocedure(' + lit(signature) + ')')
        tag = '$register$' if name.startswith('neroxa_register') else '$amend$'
        require(m['source'] == text.split('AS ' + tag, 1)[1].split(tag, 1)[0]
                and m['owner'] == 'postgres' and m['definer'], 'OPTIONAL_CAPABILITY_VERSION')
    token = 'F' * 43  # Fictitious fixture capability, never a hosted credential.
    digest = hashlib.sha256(token.encode()).hexdigest()
    require(sql(state, 'SET ROLE service_role; SELECT ' + reg.split('(')[0] + '(' + ','.join(map(lit, [fixture_id(3), order, key, digest])) + '); RESET ROLE;') == 't', 'CAPABILITY_REGISTER')
    items = [{'product_id': fixture_id(11), 'quantity': 1}]
    call = app.split('(')[0] + '(' + ','.join(map(lit, [fixture_id(3), order, token, str(uuid.uuid4()), json.dumps(items)])) + ')'
    first = json.loads(sql(state, 'SET ROLE service_role; SELECT row_to_json(x) FROM ' + call + ' x; RESET ROLE;'))
    snapshot = business(state)
    second = json.loads(sql(state, 'SET ROLE service_role; SELECT row_to_json(x) FROM ' + call + ' x; RESET ROLE;'))
    require(first == second and business(state) == snapshot and float(first['added_amount']) == 30, 'CAPABILITY_REPLAY')
    return 'PASS: exact optional definitions; authoritative price and replay'


def positives(state, phase, user_token):
    results = {}
    addon = json.dumps([{'id': fixture_id(13)}])
    complement = json.dumps([{'productId': fixture_id(14)}])
    args = [lit(fixture_id(3)), lit(fixture_id(11)), lit(fixture_id(12)),
            lit(fixture_id(21)), lit(fixture_id(22)), lit(addon), lit(complement)]
    price = SIG.split('(')[0] + '(' + ','.join(args) + ')'
    for role in ['postgres', 'anon', 'authenticated', 'service_role']:
        value = sql(state, 'SET ROLE ' + role + '; SELECT ' + price + '; RESET ROLE;')
        require(float(value) == 54, 'AUTHORITATIVE_PRICE:' + role)
        results['price_' + role] = 'PASS: 54 = highest half 44 + crust 3 + addon 2 + complement 5'
    for actor, token in [('anon', state['anon']), ('authenticated', user_token)]:
        key = str(uuid.uuid4())
        item = {'product_id': fixture_id(11), 'second_product_id': fixture_id(12),
                'size_id': fixture_id(21), 'crust_id': fixture_id(22), 'quantity': 2,
                'addons': json.loads(addon), 'complements': json.loads(complement)}
        payload = {'p_order': {'organization_id': fixture_id(1), 'idempotency_key': key,
            'customer_name': 'Fictitious F02 ACL buyer', 'customer_phone': '00000000001',
            'fulfillment': 'PICKUP', 'payment_method': 'CASH', 'items': [item]}}
        code, rows = http(state, 'rpc/create_public_order', payload, token)
        require(code == 200 and len(rows) == 1 and float(rows[0]['total']) == 108, 'CHECKOUT:' + actor)
        before = business(state)
        code2, replay = http(state, 'rpc/create_public_order', payload, token)
        require(code2 == 200 and rows == replay and business(state) == before, 'CHECKOUT_REPLAY:' + actor)
        order = rows[0]['order_id']
        code3, amended = http(state, 'rpc/append_public_order_items_with_payment', {
            'p_order_id': order, 'p_customer_phone': '00000000001',
            'p_items': [{'product_id': fixture_id(11), 'quantity': 1}],
            'p_payment_method': 'CASH'}, token)
        require(code3 == 200 and len(amended) == 1 and float(amended[0]['total']) == 138,
                'LEGACY_ADDITION:' + actor)
        check = scalar(state, "json_build_object('subtotal',o.subtotal,'total',o.total,'lines',(SELECT sum(line_total) FROM public.neroxa_order_items WHERE order_id=o.id)) FROM public.neroxa_orders o WHERE id=" + lit(order))
        require(float(check['subtotal']) == 138 and float(check['total']) == 138
                and float(check['lines']) == 138, 'FINANCIAL_TOTALS')
        results[actor] = 'PASS: checkout 108, replay without writes, addition 30, total/lines 138'
        results['capability_' + actor] = capability(state, order, key)
    return {'phase': phase, 'checks': results}


def exercise():
    work, path = read_state()
    state = json.loads(path.read_text())
    local_identity(state)
    env = {}
    for line in (work / 'status.private.env').read_text().splitlines():
        m = re.fullmatch(r'([A-Z_]+)="(.*)"', line)
        if m:
            env[m[1]] = m[2]
    require(re.fullmatch(r'http://127\.0\.0\.1:[0-9]+', env.get('API_URL', '')), 'LOCAL_AUTH_ONLY')
    state.update(api=env['API_URL'], anon=env['ANON_KEY'], service=env['SERVICE_ROLE_KEY'])
    # Real local Auth, no imported users or customer data.
    password = uuid.uuid4().hex + uuid.uuid4().hex
    code, _ = http(state, 'admin/users', {'email': 'f02-acl-01@example.invalid',
        'password': password, 'email_confirm': True}, state['service'], auth=True)
    require(code in (200, 201), 'LOCAL_AUTH_CREATE')
    code, session = http(state, 'token?grant_type=password', {
        'email': 'f02-acl-01@example.invalid', 'password': password}, state['anon'], auth=True)
    require(code == 200 and session.get('access_token'), 'LOCAL_AUTH_SIGNIN')
    subprocess.run(['python3', str(ROOT / 'tools/ab-auth/build_schema.py'), str(work / 'baseline.sql')],
                   check=True, capture_output=True, cwd=ROOT)
    sql(state, (work / 'baseline.sql').read_text())
    expected = json.loads((HERE / 'manifest.json').read_text())['helper']
    before = metadata(state)
    require(before['source_md5'] == expected['source_md5'] and before['definition_md5'] == expected['definition_md5']
            and hashlib.sha256(before['definition'].encode()).hexdigest() == expected['definition_sha256'], 'PREIMAGE_HASH')
    require(before['owner'] == 'postgres' and before['definer'] is True
            and before['config'] == ['search_path=public'] and before['acl'] == sorted(EXPLICIT + ['=X/postgres']), 'PREIMAGE_METADATA')
    # The baseline importer contains DDL/grant replay ONLY for an empty local lab.
    # No predecessor/candidate generator or frozen release gate is ever invoked.
    sql(state, (HERE / 'fixtures.sql').read_text())
    sql(state, "NOTIFY pgrst, 'reload schema';")
    # Read-only schema-cache readiness; no retry of mutating checkout calls.
    ready = False
    for _ in range(30):
        req = urllib.request.Request(state['api'] + '/rest/v1/', headers={'apikey':state['anon'], 'Authorization':'Bearer ' + state['anon']})
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect).open(req, timeout=3) as response:
                paths = json.load(response).get('paths', {})
                ready = '/rpc/create_public_order' in paths and '/rpc/append_public_order_items_with_payment' in paths
        except (urllib.error.URLError, ValueError):
            pass
        if ready:
            break
        time.sleep(1)
    require(ready, 'REST_SCHEMA_CACHE')
    require(scalar(state, "json_build_array(rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,rolconnlimit) FROM pg_roles WHERE rolname='f02_acl01_probe'") == [False, False, False, False, False, False, False, 2], 'PROBE_ATTRIBUTES')
    require(sql(state, "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='f02_acl01_probe');") == '0', 'PROBE_MEMBERSHIP')
    require(sql(state, 'SELECT has_function_privilege(' + lit(PROBE) + ',' + lit(SIG) + ",'EXECUTE');") == 't', 'PRE_REVOKE_PUBLIC_CONTROL')
    sql(state, 'SET ROLE ' + PROBE + '; SELECT ' + SIG.split('(')[0] + '(' + lit(fixture_id(3)) + ',' + lit(fixture_id(11)) + ",NULL,NULL,NULL,'[]','[]'); RESET ROLE;")
    report = {'status': 'BLOCKED', 'scope': 'LOCAL_ACL_ONLY', 'before': before,
              'positive_before': positives(state, 'before', session['access_token'])}
    catalog_before = catalog(state)
    business_before = business(state)
    sql(state, (HERE / 'revoke.sql').read_text())
    after = metadata(state)
    require({k: v for k, v in before.items() if k != 'acl'} == {k: v for k, v in after.items() if k != 'acl'}, 'HELPER_CHANGED')
    require(after['acl'] == sorted(EXPLICIT), 'EXPLICIT_GRANTS_CHANGED')
    catalog_after = catalog(state)
    require(len(catalog_before['functions']) == len(catalog_after['functions']), 'FUNCTION_COUNT')
    changes = []
    for old, new in zip(catalog_before['functions'], catalog_after['functions']):
        if old != new:
            require(old['def'] == before['definition'] and new['def'] == before['definition'], 'OTHER_FUNCTION_CHANGED')
            require({k:v for k,v in old.items() if k!='acl'} == {k:v for k,v in new.items() if k!='acl'}, 'FUNCTION_NON_ACL_CHANGED')
            changes.append(old['oid'])
    require(len(changes) == 1, 'EXACTLY_ONE_FUNCTION_ACL_DELTA')
    require({k:v for k,v in catalog_before.items() if k!='functions'} == {k:v for k,v in catalog_after.items() if k!='functions'}, 'OTHER_CATALOG_CHANGED')
    require(business(state) == business_before, 'REVOKE_CHANGED_DATA')
    require(sql(state, 'SELECT has_function_privilege(' + lit(PROBE) + ',' + lit(SIG) + ",'EXECUTE');") == 'f', 'PROBE_STILL_ALLOWED')
    denied_before = business(state)
    sql(state, 'SET ROLE ' + PROBE + '; SELECT ' + SIG.split('(')[0] + '(' + lit(fixture_id(3)) + ',' + lit(fixture_id(11)) + ",NULL,NULL,NULL,'[]','[]');", denied=True)
    require(business(state) == denied_before, 'DENIAL_MUTATED_DATA')
    require(sql(state, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','neroxa_private') AND p.prosecdef AND has_function_privilege('f02_acl01_probe',p.oid,'EXECUTE');") == '0', 'DEFINER_EXECUTE_NONZERO')
    report.update(after=after, focal_delta='PASS', negative='PASS: SQLSTATE 42501, no mutation, no memberships, definer_execute=0',
                  positive_after=positives(state, 'after', session['access_token']))
    require(metadata(state) == after and catalog(state) == catalog_after, 'POST_TEST_CATALOG_DRIFT')
    optional = report['positive_after']['checks']
    report['status'] = 'PASS_ACL_AND_EXECUTED_FLOWS; CAPABILITY_NOT_RUN' if any(str(v).startswith('NOT_RUN') for v in optional.values()) else 'PASS_EXECUTED_SCOPE'
    report['limits'] = ['No hosted TLS/pooler test; no F01/F02 closure.',
                       'Legacy additions have no replay guarantee; replay asserted for checkout and optional capability only.',
                       'Historical catalog parity does not certify all currently hosted dependencies.',
                       'Trusted harness has Docker access; UID filtering is not an adversarial security boundary.']
    save(work / 'result.json', report)


def integrity():
    manifest = json.loads((HERE / 'manifest.json').read_text())
    require(command(['git', 'rev-parse', 'HEAD']) == os.environ.get('GITHUB_SHA'), 'CHECKOUT_SHA')
    command(['git', 'merge-base', '--is-ancestor', BASE, 'HEAD'])
    changed = command(['git', 'diff', '--name-only', BASE, 'HEAD']).splitlines()
    require(changed and all(p.startswith('audits/f02-acl-01/') for p in changed), 'NON_FOCAL_SOURCE_DELTA')
    require(not command(['git', 'status', '--porcelain', '--untracked-files=no']), 'DIRTY_CHECKOUT')
    untracked = command(['git', 'ls-files', '--others', '--exclude-standard']).splitlines()
    require(all(p == 'delivery-candidate/' or p.startswith('delivery-candidate/') for p in untracked), 'UNTRACKED_SOURCE')
    require(command(['git', '-C', 'delivery-candidate', 'rev-parse', 'HEAD']) == DELIVERY, 'DELIVERY_SHA')
    for path, digest in manifest['dependencies'].items():
        require(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, 'DEPENDENCY_HASH:' + path)
    for path, digest in manifest['files'].items():
        require(hashlib.sha256((HERE / path).read_bytes()).hexdigest() == digest, 'CANDIDATE_HASH:' + path)
    require(not (ROOT / '.env').exists(), 'DOTENV_PRESENT')
    require(os.environ.get('DOCKER_HOST', 'unix:///var/run/docker.sock') == 'unix:///var/run/docker.sock', 'REMOTE_DOCKER')
    require(not any(os.environ.get(k) for k in ('DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY')), 'TRANSPORT_OVERRIDE')
    for name in os.environ:
        require(name not in ('PGHOST','PGHOSTADDR','PGPASSWORD','PGSERVICE','PGSERVICEFILE','DATABASE_URL','SUPABASE_URL') and not name.startswith(('F02_PREFLIGHT_', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD')),
                'HOSTED_CREDENTIAL_ENV')


def audit(state):
    remaining = command(DOCKER + ['ps', '-aq', '--filter', 'label=com.supabase.cli.project=' + state['project']])
    volumes = set(command(DOCKER + ['volume', 'ls', '-q']).splitlines())
    network = command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + state['network'] + '$'])
    require(not remaining and not network and volumes == set(state['volumes_before']), 'CLEANUP_DOCKER')
    require(subprocess.run(['id', 'neroxa_test'], capture_output=True).returncode != 0, 'CLEANUP_UID')
    for tool in ['iptables', 'ip6tables']:
        rules = command(['sudo', tool, '-S'])
        require('NEROXA02A5' not in rules, 'CLEANUP_RULES')
        if state.get('bridge'):
            require(state['bridge'] not in rules, 'CLEANUP_BRIDGE_RULE')
    if state.get('test_uid'):
        require(subprocess.run(['pgrep', '-u', str(state['test_uid'])], capture_output=True).returncode == 1, 'CLEANUP_TEST_PROCESSES')
        require('user:' + str(state['test_uid']) + ':' not in command(['getfacl', '-R', '-n', '-cp', str(ROOT)]), 'CLEANUP_WORKSPACE_ACL')
        for ancestor in ROOT.parents:
            if ancestor != Path('/'):
                require('user:' + str(state['test_uid']) + ':' not in command(['getfacl', '-n', '-cp', str(ancestor)]), 'CLEANUP_TRAVERSAL_ACL')
    require(not (Path(state['work']) / 'status.private.env').exists(), 'CLEANUP_LOCAL_KEYS')
    if state.get('relay_pid'):
        # Exact process identity, avoiding killing or misclassifying a reused PID.
        cmdline = Path('/proc') / str(state['relay_pid']) / 'cmdline'
        require(not cmdline.exists() or b'tools/ab-auth/docker_loopback.py' not in cmdline.read_bytes(), 'CLEANUP_RELAY')


def cleanup(state):
    errors = []
    def attempt(args):
        try:
            command(args)
        except Exception:
            errors.append(Path(args[0]).name)
    work = Path(state['work'])
    if work.exists():
        attempt(['sudo', 'chown', '-R', str(os.getuid()) + ':' + str(os.getgid()), str(work)])
    # Stop the isolated test process group before removing its egress restrictions.
    if state.get('test_uid'):
        for sig in ['-TERM', '-KILL']:
            if subprocess.run(['pgrep', '-u', str(state['test_uid'])], capture_output=True).returncode == 0:
                subprocess.run(['sudo', 'pkill', sig, '-u', str(state['test_uid'])], capture_output=True, timeout=10)
                time.sleep(0.2)
    env = dict(os.environ, AB_NETWORK=state['network'], DOCKER_HOST='unix:///var/run/docker.sock')
    try:
        command(['bash', 'tools/mission-02a5/network.sh', 'unlock'], env=env)
    except Exception:
        errors.append('network-unlock')
    work = Path(state['work'])
    if (work / 'supabase/config.toml').is_file():
        try:
            command(['supabase', 'stop', '--workdir', str(work), '--no-backup'], env=env)
        except Exception:
            errors.append('supabase-stop')
    # Explicit inventory and labels prevent removal of unrelated resources.
    ids = command(DOCKER + ['ps', '-aq', '--filter', 'label=com.supabase.cli.project=' + state['project']]).splitlines()
    if ids:
        attempt(DOCKER + ['rm', '-f'] + ids)
    for volume in set(command(DOCKER + ['volume', 'ls', '-q']).splitlines()) - set(state['volumes_before']):
        info = json.loads(command(DOCKER + ['volume', 'inspect', volume]))[0]
        if (info.get('Labels') or {}).get('com.supabase.cli.project') == state['project'] or volume.endswith('_' + state['project']):
            attempt(DOCKER + ['volume', 'rm', volume])
    if command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + state['network'] + '$']):
        attempt(DOCKER + ['network', 'rm', state['network']])
    if state.get('relay_pid'):
        p = Path('/proc') / str(state['relay_pid']) / 'cmdline'
        if p.exists() and b'tools/ab-auth/docker_loopback.py' in p.read_bytes():
            os.kill(state['relay_pid'], signal.SIGTERM)
            for _ in range(30):
                if not p.exists():
                    break
                time.sleep(0.1)
    if state.get('test_uid'):
        attempt(['sudo', 'setfacl', '-R', '-x', 'u:' + str(state['test_uid']), str(ROOT)])
        for ancestor in ROOT.parents:
            if ancestor != Path('/'):
                attempt(['sudo', 'setfacl', '-x', 'u:' + str(state['test_uid']), str(ancestor)])
        attempt(['sudo', 'userdel', '--remove', 'neroxa_test'])
    if work.exists():
        attempt(['sudo', 'chown', '-R', str(os.getuid()) + ':' + str(os.getgid()), str(work)])
        for name in ['status.private.env', 'start.private.log', 'relay.private.log', 'baseline.sql']:
            (work / name).unlink(missing_ok=True)
    audit(state)
    require(not errors, 'CLEANUP_COMMAND_FAILURE')
    save(work / 'cleanup.json', {'status': 'PASS', 'scope': state['project']})


def run():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'GITHUB_VM_ONLY')
    require(os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'MANUAL_FIRST_ATTEMPT')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    require(event['repository']['full_name'] == 'luit77yak-dev/neroxa-master' and event['repository']['private'] is False, 'PUBLIC_REPOSITORY')
    require(str(ROOT).startswith('/home/runner/'), 'WORKSPACE_LOCATION')
    integrity()
    command(['python3', 'tools/mission-02a3/preflight.py'])
    require(subprocess.run(['id', 'neroxa_test'], capture_output=True).returncode != 0, 'TEST_UID_COLLISION')
    for tool in ['iptables', 'ip6tables']:
        require('NEROXA02A5' not in command(['sudo', tool, '-S']), 'CHAIN_COLLISION')
    work, state_path = read_state()
    require(not work.exists(), 'WORKDIR_COLLISION')
    work.mkdir(mode=0o700)
    run_id = os.environ['GITHUB_RUN_ID']
    project = 'neroxa-02a3-' + run_id + '-acl01'
    state = {'run': run_id, 'project': project, 'network': project, 'db': 'supabase_db_' + project,
             'work': str(work), 'volumes_before': command(DOCKER + ['volume', 'ls', '-q']).splitlines()}
    require(not command(DOCKER + ['ps', '-aq', '--filter', 'label=com.supabase.cli.project=' + project]), 'PROJECT_CONTAINER_COLLISION')
    require(not command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + project + '$']), 'PROJECT_NETWORK_COLLISION')
    save(state_path, state)
    env = dict(os.environ, AB_WORKDIR=str(work), AB_PROJECT=project, AB_NETWORK=project,
               SUPABASE_INTERNAL_IMAGE_REGISTRY='docker.io')
    try:
        command(['supabase', 'init', '--workdir', str(work)], env=env)
        command(['python3', 'tools/ab-auth/configure.py'], env=env)
        require(not (work / 'supabase/.temp/project-ref').exists() and not (work / 'supabase/migrations').exists(), 'LINKED_OR_MIGRATIONS')
        command(DOCKER + ['pull', '--platform', 'linux/amd64', PG], timeout=600)
        require(command(DOCKER + ['image', 'inspect', PG, '--format', '{{.Id}}']) == PG_ID, 'IMMUTABLE_IMAGE_ID')
        command(DOCKER + ['tag', PG, 'supabase/postgres:17.11.0.004'])
        command(DOCKER + ['network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', project])
        require(command(DOCKER + ['network', 'inspect', project, '--format', '{{.EnableIPv6}}']) == 'false', 'BRIDGE_IPV6')
        state['bridge'] = 'br-' + command(DOCKER + ['network', 'inspect', project, '--format', '{{.Id}}'])[:12]
        save(state_path, state)
        with (work / 'relay.private.log').open('w') as log:
            relay = subprocess.Popen(['python3', 'tools/ab-auth/docker_loopback.py'], env=env, cwd=ROOT, stdout=log, stderr=log)
        state['relay_pid'] = relay.pid
        save(state_path, state)
        for _ in range(100):
            if (work / 'docker-loopback.sock').exists():
                break
            time.sleep(0.1)
        require((work / 'docker-loopback.sock').is_socket(), 'RELAY_NOT_READY')
        env['DOCKER_HOST'] = 'unix://' + str(work / 'docker-loopback.sock')
        command(['supabase', 'start', '--workdir', str(work), '--network-id', project,
                 '--exclude', 'studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit'], env=env, timeout=600)
        expected = json.loads((ROOT / 'audits/02a5/EXPECTED-IMAGES.json').read_text())
        seen = {}
        ids = command(DOCKER + ['ps', '-q', '--filter', 'label=com.supabase.cli.project=' + project]).splitlines()
        for container in ids:
            info = json.loads(command(DOCKER + ['inspect', container]))[0]
            seen[info['Config']['Image']] = info['Image']
            for binds in (info['HostConfig'].get('PortBindings') or {}).values():
                require(all(b['HostIp'] == '127.0.0.1' for b in binds or []), 'STACK_BIND')
        require(seen == expected, 'SIX_IMAGE_IDENTITY_DRIFT')
        local_identity(state)
        require(shutil.disk_usage(ROOT).free >= 18 * 1024**3, 'POST_START_DISK')
        status = command(['supabase', 'status', '--workdir', str(work), '-o', 'env'], env=env)
        (work / 'status.private.env').write_text(status + '\n')
        (work / 'status.private.env').chmod(0o600)
        command(['sudo', 'useradd', '--create-home', '--groups', 'docker', 'neroxa_test'])
        state['test_uid'] = int(command(['id', '-u', 'neroxa_test']))
        save(state_path, state)
        command(['sudo', 'chown', '-R', 'neroxa_test:neroxa_test', str(work)])
        for ancestor in [ROOT, *ROOT.parents]:
            if ancestor != Path('/'):
                command(['sudo', 'setfacl', '-m', 'u:neroxa_test:--x', str(ancestor)])
        command(['sudo', 'setfacl', '-R', '-m', 'u:neroxa_test:rX', str(ROOT)])
        command(['bash', 'tools/mission-02a5/network.sh', 'lock'], env=env)
        command(['sudo', '-u', 'neroxa_test', 'env', '-i', 'PATH=' + os.environ['PATH'],
                 'HOME=/home/neroxa_test', 'GITHUB_RUN_ID=' + run_id,
                 'RUNNER_TEMP=' + os.environ['RUNNER_TEMP'], 'python3', str(HERE / 'driver.py'), 'exercise'], timeout=600)
    finally:
        cleanup(state)
    print('F02_ACL01=' + json.dumps(json.loads((work / 'result.json').read_text())))


def main():
    require(len(sys.argv) == 2, 'MODE_REQUIRED')
    mode = sys.argv[1]
    if mode == 'run':
        run()
    elif mode == 'exercise':
        exercise()
    elif mode == 'audit':
        work, path = read_state()
        if path.exists():
            audit(json.loads(path.read_text()))
            require(json.loads((work / 'cleanup.json').read_text())['status'] == 'PASS', 'CLEANUP_RECEIPT')
            print('F02_ACL01_INDEPENDENT_AUDIT=PASS')
        else:
            require(not work.exists(), 'INCOMPLETE_STATE')
            print('F02_ACL01_INDEPENDENT_AUDIT=NOT_STARTED')
    else:
        raise RuntimeError('INVALID_MODE')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # No traceback/HTTP payload/keys are emitted by an automated failure.
        code = str(exc) if isinstance(exc, RuntimeError) and re.fullmatch(r'[A-Za-z0-9_:/ .-]+', str(exc)) else type(exc).__name__
        print('F02_ACL01=BLOCKED;' + code)
        sys.exit(78)
