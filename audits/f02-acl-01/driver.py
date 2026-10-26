"""F02-ACL-01 candidate. No import-time side effects. RUN ONLY after admission.

All SQL transport is docker exec against this run's local, inspected container.
Never accepts a database URL, host, password, arbitrary SQL file or remote ref.
"""
import hashlib
import json
import os
import pwd
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
V1 = '3979bd893ce56823e2a7b816e41ad10efc0e3654'
BRANCH = 'work/f02-acl-01-driver-v2-20261026'
PROJECT_LABEL = 'com.neroxa.f02-acl-01.project'
PRIVATE_FILES = ('status.private.env', 'start.private.log', 'relay.private.log', 'baseline.sql', 'exercise-state.json', 'docker-loopback.sock')
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
    # Atomic, private recovery ledger; no partial JSON after a soft interruption.
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(json.dumps(value, sort_keys=True, indent=2) + '\n')
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


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


def persisted(state, order, key, amended):
    snapshot = business(state)
    orders = [o for o in snapshot['orders'] if o['id'] == order]
    items = [i for i in snapshot['items'] if i['order_id'] == order]
    history = [h for h in snapshot['history'] if h['order_id'] == order]
    require(len(orders) == 1 and len(items) == (2 if amended else 1), 'PERSISTED_ROW_COUNTS')
    o = orders[0]
    expected = {'instance_id': fixture_id(3), 'organization_id': fixture_id(1),
        'idempotency_key': key, 'fulfillment': 'PICKUP', 'payment_method': 'CASH',
        'status': 'RECEIVED', 'customer_name': 'Fictitious F02 ACL buyer', 'customer_phone': '00000000001'}
    require(all(o.get(k) == v for k, v in expected.items()), 'PERSISTED_ORDER_FIELDS')
    total = 138 if amended else 108
    require(float(o['subtotal']) == total and float(o['total']) == total
            and float(o['delivery_fee']) == 0, 'PERSISTED_ORDER_AMOUNTS')
    compound = [i for i in items if i['second_product_id'] == fixture_id(12)]
    require(len(compound) == 1, 'PERSISTED_COMPOUND_COUNT')
    first = compound[0]
    fields = {'product_id': fixture_id(11), 'product_name': 'Fictitious pizza A',
        'second_product_name': 'Fictitious pizza B', 'is_half': True,
        'size_id': fixture_id(21), 'crust_id': fixture_id(22),
        'size_name': 'Fictitious size', 'crust_name': 'Fictitious crust',
        'addons': [{'id': fixture_id(13)}], 'complements': [{'productId': fixture_id(14)}],
        'quantity': 2, 'notes': 'F02 synthetic line'}
    require(all(first.get(k) == v for k, v in fields.items()) and float(first['unit_price']) == 54
            and float(first['line_total']) == 108 and float(first['crust_price']) == 3, 'PERSISTED_COMPOUND_FIELDS')
    if amended:
        simple = [i for i in items if i['second_product_id'] is None]
        require(len(simple) == 1, 'PERSISTED_ADDITION_COUNT')
        added = simple[0]
        fields = {'product_id': fixture_id(11), 'product_name': 'Fictitious pizza A',
                  'quantity': 1, 'is_half': False, 'size_id': None, 'crust_id': None,
                  'addons': [], 'complements': [], 'notes': None}
        require(all(added.get(k) == v for k, v in fields.items()) and float(added['unit_price']) == 30
                and float(added['line_total']) == 30, 'PERSISTED_ADDITION_FIELDS')
    require(len(history) == 1 and history[0]['to_status'] == 'RECEIVED', 'PERSISTED_HISTORY')


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
                'addons': json.loads(addon), 'complements': json.loads(complement),
                'is_half': True, 'size_name': 'Fictitious size', 'crust_name': 'Fictitious crust',
                'crust_price': 3, 'notes': 'F02 synthetic line'}
        payload = {'p_order': {'organization_id': fixture_id(1), 'idempotency_key': key,
            'customer_name': 'Fictitious F02 ACL buyer', 'customer_phone': '00000000001',
            'fulfillment': 'PICKUP', 'payment_method': 'CASH', 'items': [item]}}
        code, rows = http(state, 'rpc/create_public_order', payload, token)
        require(code == 200 and len(rows) == 1 and float(rows[0]['total']) == 108, 'CHECKOUT:' + actor)
        persisted(state, rows[0]['order_id'], key, False)
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
        persisted(state, order, key, True)
        results[actor] = 'PASS: persisted order/items/options/quantity/history; checkout 108; replay without writes; addition 30; total 138'
        results['capability_' + actor] = capability(state, order, key)
    return {'phase': phase, 'checks': results}


def exercise():
    work, path = read_state()
    work = work / 'lab'
    state = json.loads((work / 'exercise-state.json').read_text())
    require(state['lab'] == str(work) and os.getuid() == state['test_uid'], 'EXERCISE_IDENTITY')
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
    subprocess.run(['python3', '-E', str(ROOT / 'tools/ab-auth/build_schema.py'), str(work / 'baseline.sql')],
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
    command(['git', 'merge-base', '--is-ancestor', V1, 'HEAD'])
    changed = command(['git', 'diff', '--name-only', BASE, 'HEAD']).splitlines()
    require(changed and all(p.startswith('audits/f02-acl-01/') or p == 'vercel.json' for p in changed), 'NON_FOCAL_SOURCE_DELTA')
    verify_vercel()
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


def verify_vercel():
    prior = json.loads(command(['git', 'show', V1 + ':vercel.json']))
    current = json.loads((ROOT / 'vercel.json').read_text())
    require(BRANCH not in prior['git']['deploymentEnabled'], 'VERCEL_PREEXISTING_BRANCH')
    prior['git']['deploymentEnabled'][BRANCH] = False
    require(current == prior, 'VERCEL_NON_FOCAL_DELTA')
    require(os.environ.get('GITHUB_REF') == 'refs/heads/' + BRANCH, 'DISPATCH_BRANCH')


def validate_state(state):
    work, _ = read_state()
    project = 'neroxa-02a3-' + os.environ['GITHUB_RUN_ID'] + '-acl01'
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'RECOVERY_VM_ONLY')
    require(state['source_sha'] == os.environ.get('GITHUB_SHA'), 'RECOVERY_SHA')
    require(state['run'] == os.environ['GITHUB_RUN_ID'] and state['project'] == project
            and state['network'] == project and state['db'] == 'supabase_db_' + project, 'STATE_IDENTITY')
    require(state['work'] == str(work) and state['lab'] == str(work / 'lab')
            and state['runner_uid'] == os.getuid(), 'STATE_PATH_OWNER')


def network_ready(state):
    network = json.loads(command(DOCKER + ['network', 'inspect', state['network']]))[0]
    require(network['Id'] == state['network_id'] and network['Driver'] == 'bridge'
            and network['Internal'] is True and network['EnableIPv6'] is False, 'ISOLATION_NETWORK')
    require(state['bridge'] == 'br-' + network['Id'][:12], 'ISOLATION_BRIDGE')
    command(['sudo', 'iptables', '-C', 'DOCKER-USER', '-i', state['bridge'], '!', '-o', state['bridge'], '-j', 'REJECT'])
    for tool in ['iptables', 'ip6tables']:
        command(['sudo', tool, '-C', 'OUTPUT', '-m', 'owner', '--uid-owner', str(state['test_uid']), '-j', 'NEROXA02A5'])
        require(command(['sudo', tool, '-S', 'NEROXA02A5']).splitlines() == [
            '-N NEROXA02A5', '-A NEROXA02A5 -o lo -j RETURN', '-A NEROXA02A5 -j REJECT'], 'ISOLATION_CHAIN')


def containers(state):
    found = set()
    for label in [PROJECT_LABEL, 'com.supabase.cli.project']:
        found.update(command(DOCKER + ['ps', '-aq', '--filter', 'label=' + label + '=' + state['project']]).splitlines())
    return sorted(found)


def relay_pids(state):
    found = []
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            if proc.stat().st_uid != state['runner_uid']:
                continue
            args = (proc / 'cmdline').read_bytes().split(b'\0')
            if str(HERE / 'guarded_relay.py').encode() in args and state['project'].encode() in args:
                found.append(int(proc.name))
        except FileNotFoundError:
            pass
    return found


def acl_snapshot():
    paths = [*ROOT.parents[:-1]]
    return command(['getfacl', '-R', '-n', '-p', str(ROOT)]) + '\n' + '\n'.join(
        command(['getfacl', '-n', '-p', str(p)]) for p in paths) + '\n'


def test_uid(state):
    try:
        entry = pwd.getpwnam('neroxa_test')
    except KeyError:
        return state.get('test_uid')
    require(state.get('user_intent') and entry.pw_dir == '/home/neroxa_test'
            and (state.get('test_uid') is None or state['test_uid'] == entry.pw_uid), 'TEST_UID_OWNERSHIP')
    return entry.pw_uid


def audit(state):
    """Check EVERY domain, even when an earlier check errors. No early PASS."""
    results = {}
    def check(name, action):
        try:
            require(action(), name)
            results[name] = 'PASS'
        except Exception:
            results[name] = 'BLOCKED'
    check('containers', lambda: not containers(state))
    check('volumes', lambda: set(command(DOCKER + ['volume', 'ls', '-q']).splitlines()) == set(state['volumes_before']))
    check('network', lambda: not command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + state['network'] + '$']))
    check('user', lambda: subprocess.run(['id', 'neroxa_test'], capture_output=True).returncode == 1)
    def processes_absent():
        uid = test_uid(state)
        return uid is None or subprocess.run(['pgrep', '-u', str(uid)], capture_output=True).returncode == 1
    check('test_processes', processes_absent)
    check('relay_processes', lambda: not relay_pids(state))
    for tool in ['iptables', 'ip6tables']:
        def rules_absent(tool=tool):
            rules = command(['sudo', tool, '-S'])
            return 'NEROXA02A5' not in rules and (not state.get('bridge') or state['bridge'] not in rules)
        check(tool, rules_absent)
    if state.get('acl_intent'):
        check('workspace_acl', lambda: acl_snapshot() == (Path(state['work']) / 'acl.private.restore').read_text())
    check('work_acl', lambda: 'user:' + str(state.get('test_uid', -1)) + ':' not in command(['getfacl', '-n', '-cp', state['work']]))
    check('local_material', lambda: all(not (Path(state['lab']) / n).exists() for n in PRIVATE_FILES))
    check('home', lambda: not (Path('/home/neroxa_test').exists() or Path('/home/neroxa_test').is_symlink()) if state.get('user_intent') else True)
    return results


def cleanup(state):
    """Idempotent recovery. Every independent action and audit is attempted."""
    errors = []
    work, lab = Path(state['work']), Path(state['lab'])
    def attempt(name, action, default=None):
        try:
            return action()
        except Exception:
            errors.append(name)
            return default
    # Further soft cancellation cannot abandon the other cleanup actions.
    old_signals = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        uid = attempt('resolve_uid', lambda: test_uid(state))
        if uid is not None and state.get('test_uid') is None:
            state['test_uid'] = uid
            attempt('persist_recovered_uid', lambda: save(work / 'state.json', state))
        if uid is not None:
            for sig in ['-TERM', '-KILL']:
                def stop_uid(sig=sig):
                    r = subprocess.run(['pgrep', '-u', str(uid)], capture_output=True, timeout=10)
                    require(r.returncode in (0, 1), 'PGREP_ERROR')
                    if r.returncode == 0:
                        killed = subprocess.run(['sudo', 'pkill', sig, '-u', str(uid)], capture_output=True, timeout=10)
                        require(killed.returncode in (0, 1), 'PKILL_ERROR')
                        time.sleep(0.2)
                attempt('test_processes_' + sig, stop_uid)
        if lab.exists():
            attempt('lab_owner', lambda: command(['sudo', 'chown', '-R', str(state['runner_uid']) + ':' + str(os.getgid()), str(lab)]))
        env = dict(os.environ, AB_NETWORK=state['network'], DOCKER_HOST='unix:///var/run/docker.sock')
        ids = attempt('inventory_containers', lambda: containers(state), [])
        def stop_if_configured():
            if ids and (lab / 'supabase/config.toml').is_file():
                command(['supabase', 'stop', '--workdir', str(lab), '--no-backup'], env=env)
        attempt('supabase_stop', stop_if_configured)
        # Separate inventory failure must not prevent termination of known services.
        ids = attempt('remaining_containers', lambda: containers(state), ids)
        for container in ids:
            attempt('container_remove', lambda container=container: command(DOCKER + ['rm', '-f', container]))
        volumes = attempt('inventory_volumes', lambda: command(DOCKER + ['volume', 'ls', '-q']).splitlines(), [])
        for volume in set(volumes) - set(state['volumes_before']):
            def remove_volume(volume=volume):
                info = json.loads(command(DOCKER + ['volume', 'inspect', volume]))[0]
                if (info.get('Labels') or {}).get('com.supabase.cli.project') == state['project'] or volume.endswith('_' + state['project']):
                    command(DOCKER + ['volume', 'rm', volume])
            attempt('volume_remove', remove_volume)
        # Recorded numeric UID/bridge survive user/network removal in a partial cleanup.
        # This permits recovery even when the historical unlock can no longer resolve them.
        def safe_to_unlock():
            require(not containers(state), 'RETAIN_ISOLATION_WITH_LIVE_CONTAINERS')
            require(uid is None or subprocess.run(['pgrep', '-u', str(uid)], capture_output=True).returncode == 1, 'RETAIN_ISOLATION_WITH_LIVE_PROCESSES')
            return True
        safe = attempt('isolation_release_check', safe_to_unlock, False)
        if safe and state.get('network_lock_intent'):
            def remove_rule(tool, selector):
                exists = subprocess.run(['sudo', tool, '-C'] + selector, capture_output=True, timeout=10)
                require(exists.returncode in (0, 1), 'FIREWALL_QUERY_ERROR')
                if exists.returncode == 0:
                    command(['sudo', tool, '-D'] + selector)
            if uid is not None:
                for tool in ['iptables', 'ip6tables']:
                    attempt(tool + '_uid_rule', lambda tool=tool: remove_rule(tool, ['OUTPUT', '-m', 'owner', '--uid-owner', str(uid), '-j', 'NEROXA02A5']))
            if state.get('bridge'):
                attempt('bridge_rule', lambda: remove_rule('iptables', ['DOCKER-USER', '-i', state['bridge'], '!', '-o', state['bridge'], '-j', 'REJECT']))
            attempt('network_unlock', lambda: command(['bash', 'tools/mission-02a5/network.sh', 'unlock'], env=env))
        def remove_network():
            if command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + state['network'] + '$']):
                command(DOCKER + ['network', 'rm', state['network']])
        attempt('network_remove', remove_network)
        pids = attempt('relay_inventory', lambda: relay_pids(state), [])
        for pid in pids:
            def stop_relay(pid=pid):
                for sig in (signal.SIGTERM, signal.SIGKILL):
                    if pid in relay_pids(state):
                        try:
                            os.kill(pid, sig)
                        except ProcessLookupError:
                            pass
                        time.sleep(0.2)
                try:
                    os.waitpid(pid, os.WNOHANG)
                except ChildProcessError:
                    pass
            attempt('relay_stop', stop_relay)
        if state.get('acl_intent'):
            attempt('acl_restore', lambda: command(['sudo', 'setfacl', '--restore=-'], text=(work / 'acl.private.restore').read_text()))
        if uid is not None:
            def remove_work_acl():
                text = command(['getfacl', '-n', '-cp', str(work)])
                if 'user:' + str(uid) + ':' in text:
                    command(['sudo', 'setfacl', '-x', 'u:' + str(uid), str(work)])
            attempt('work_acl_restore', remove_work_acl)
        if state.get('user_intent'):
            def remove_user():
                try:
                    pwd.getpwnam('neroxa_test')
                except KeyError:
                    return
                require(test_uid(state) == uid, 'USER_OWNERSHIP')
                command(['sudo', 'userdel', 'neroxa_test'])
            attempt('user_remove', remove_user)
            def remove_home():
                home = Path('/home/neroxa_test')
                if home.exists():
                    require(uid is not None and not home.is_symlink() and home.stat().st_uid == uid, 'HOME_OWNERSHIP')
                    command(['sudo', 'rm', '-rf', '--', str(home)])
            attempt('home_remove', remove_home)
        for name in PRIVATE_FILES:
            attempt('material_remove_' + name.replace('.', '_'), lambda name=name: (lab / name).unlink(missing_ok=True))
        # Each check records a failure rather than skipping the remaining domains.
        checks = audit(state)
        receipt = {'status': 'PASS' if not errors and all(v == 'PASS' for v in checks.values()) else 'BLOCKED',
                   'scope': state['project'], 'errors': errors, 'checks': checks}
        attempt('receipt_write', lambda: save(work / 'cleanup.json', receipt))
        require(not errors and receipt['status'] == 'PASS', 'CLEANUP_INCOMPLETE')
        return receipt
    finally:
        for sig, handler in old_signals.items():
            signal.signal(sig, handler)


def recover():
    work, path = read_state()
    if not path.exists():
        require(not work.exists(), 'INCOMPLETE_STATE')
        print('F02_ACL01_RECOVERY=NOT_STARTED')
        return
    require(path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o077 == 0, 'RECOVERY_LEDGER_OWNER')
    state = json.loads(path.read_text())
    validate_state(state)
    cleanup(state)
    print('F02_ACL01_RECOVERY=PASS')


def resource_preflight():
    output = command(['python3', '-E', 'tools/mission-02a3/preflight.py'])
    rows = [line.removeprefix('RESOURCE_PREFLIGHT=') for line in output.splitlines() if line.startswith('RESOURCE_PREFLIGHT=')]
    require(len(rows) == 1, 'RESOURCE_RESULT_REQUIRED')
    result = json.loads(rows[0])
    require(result.get('status') == 'PASS', 'RESOURCE_STATUS_NOT_PASS')
    require(result.get('driver') != 'vfs' and result.get('free_bytes', 0) >= 28 * 1024**3
            and result.get('available_memory_bytes', 0) >= 6 * 1024**3 and result.get('cpus', 0) >= 2, 'RESOURCE_VALUES')
    return result


def run():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'GITHUB_VM_ONLY')
    require(os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and os.environ.get('GITHUB_RUN_ATTEMPT') == '1', 'MANUAL_FIRST_ATTEMPT')
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    require(event['repository']['full_name'] == 'luit77yak-dev/neroxa-master' and event['repository']['private'] is False, 'PUBLIC_REPOSITORY')
    require(str(ROOT).startswith('/home/runner/'), 'WORKSPACE_LOCATION')
    integrity()
    resources = resource_preflight()
    require(subprocess.run(['id', 'neroxa_test'], capture_output=True).returncode == 1
            and not (Path('/home/neroxa_test').exists() or Path('/home/neroxa_test').is_symlink()), 'TEST_UID_COLLISION')
    for tool in ['iptables', 'ip6tables']:
        require('NEROXA02A5' not in command(['sudo', tool, '-S']), 'CHAIN_COLLISION')
    work, state_path = read_state()
    require(not work.exists(), 'WORKDIR_COLLISION')
    run_id = os.environ['GITHUB_RUN_ID']
    project = 'neroxa-02a3-' + run_id + '-acl01'
    require(not command(DOCKER + ['ps', '-aq', '--filter', 'label=' + PROJECT_LABEL + '=' + project])
            and not command(DOCKER + ['ps', '-aq', '--filter', 'label=com.supabase.cli.project=' + project]), 'PROJECT_CONTAINER_COLLISION')
    require(not command(DOCKER + ['network', 'ls', '-q', '--filter', 'name=^' + project + '$']), 'PROJECT_NETWORK_COLLISION')
    before_volumes = command(DOCKER + ['volume', 'ls', '-q']).splitlines()
    require(not any(v.endswith('_' + project) for v in before_volumes), 'PROJECT_VOLUME_COLLISION')
    work.mkdir(mode=0o700)
    lab = work / 'lab'
    state = {'run': run_id, 'project': project, 'network': project, 'db': 'supabase_db_' + project,
             'work': str(work), 'lab': str(lab), 'runner_uid': os.getuid(), 'volumes_before': before_volumes,
             'source_sha': os.environ['GITHUB_SHA'], 'resources': resources}
    save(state_path, state)
    env = dict(os.environ, AB_WORKDIR=str(lab), AB_PROJECT=project, AB_NETWORK=project,
               SUPABASE_INTERNAL_IMAGE_REGISTRY='docker.io', PYTHONOPTIMIZE='0')
    def checkpoint(**values):
        state.update(values)
        save(state_path, state)
    try:
        lab.mkdir(mode=0o700)
        command(['supabase', 'init', '--workdir', str(lab)], env=env)
        # Historical configure requires AB_WORKDIR directly below RUNNER_TEMP.
        configure_env = dict(env, RUNNER_TEMP=str(work))
        command(['python3', '-E', 'tools/ab-auth/configure.py'], env=configure_env)
        require(not (lab / 'supabase/.temp/project-ref').exists() and not (lab / 'supabase/migrations').exists(), 'LINKED_OR_MIGRATIONS')
        expected = json.loads((ROOT / 'audits/02a5/EXPECTED-IMAGES.json').read_text())
        for tag, wanted in expected.items():
            ref = PG if tag == 'supabase/postgres:17.11.0.004' else tag
            command(DOCKER + ['pull', '--platform', 'linux/amd64', ref], timeout=600)
            require(command(DOCKER + ['image', 'inspect', ref, '--format', '{{.Id}}']) == wanted, 'PRE_START_IMAGE_ID')
            if ref != tag:
                command(DOCKER + ['tag', ref, tag])
        checkpoint(images_verified=True, user_intent=True)
        command(['sudo', 'useradd', '--create-home', '--groups', 'docker', 'neroxa_test'])
        checkpoint(test_uid=pwd.getpwnam('neroxa_test').pw_uid)
        command(DOCKER + ['network', 'create', '--internal', '--driver', 'bridge', '--opt',
                         'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', project])
        network = json.loads(command(DOCKER + ['network', 'inspect', project]))[0]
        checkpoint(network_id=network['Id'], bridge='br-' + network['Id'][:12], network_lock_intent=True)
        command(['bash', 'tools/mission-02a5/network.sh', 'lock'], env=env)
        network_ready(state)
        checkpoint(isolation_verified=True)
        with (lab / 'relay.private.log').open('w') as log:
            subprocess.Popen(['python3', '-E', str(HERE / 'guarded_relay.py'), project], env=env, cwd=ROOT, stdout=log, stderr=log)
        for _ in range(100):
            if (lab / 'docker-loopback.sock').is_socket():
                break
            time.sleep(0.1)
        require((lab / 'docker-loopback.sock').is_socket(), 'RELAY_NOT_READY')
        env['DOCKER_HOST'] = 'unix://' + str(lab / 'docker-loopback.sock')
        network_ready(state)
        command(['supabase', 'start', '--workdir', str(lab), '--network-id', project,
                 '--exclude', 'studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit'], env=env, timeout=600)
        seen = []
        for container in containers(state):
            info = json.loads(command(DOCKER + ['inspect', container]))[0]
            seen.append(info['Image'])
            require(info['Config']['Labels'].get(PROJECT_LABEL) == project and not info['HostConfig'].get('Privileged'), 'STACK_IDENTITY')
            require(set(info['NetworkSettings']['Networks']) == {project}, 'STACK_NETWORK')
            for binds in (info['HostConfig'].get('PortBindings') or {}).values():
                require(all(b['HostIp'] == '127.0.0.1' for b in binds or []), 'STACK_BIND')
        require(sorted(seen) == sorted(expected.values()), 'SIX_IMAGE_IDENTITY_DRIFT')
        local_identity(state)
        require(shutil.disk_usage(ROOT).free >= 18 * 1024**3, 'POST_START_DISK')
        status = command(['supabase', 'status', '--workdir', str(lab), '-o', 'env'], env=env)
        (lab / 'status.private.env').write_text(status + '\n')
        (lab / 'status.private.env').chmod(0o600)
        save(lab / 'exercise-state.json', state)
        (work / 'acl.private.restore').write_text(acl_snapshot())
        (work / 'acl.private.restore').chmod(0o600)
        checkpoint(acl_intent=True)
        command(['sudo', 'setfacl', '-m', 'u:neroxa_test:--x', str(work)])
        command(['sudo', 'chown', '-R', 'neroxa_test:neroxa_test', str(lab)])
        for ancestor in [ROOT, *ROOT.parents]:
            if ancestor != Path('/'):
                command(['sudo', 'setfacl', '-m', 'u:neroxa_test:--x', str(ancestor)])
        command(['sudo', 'setfacl', '-R', '-m', 'u:neroxa_test:rX', str(ROOT)])
        network_ready(state)
        command(['sudo', '-u', 'neroxa_test', 'env', '-i', 'PATH=' + os.environ['PATH'],
                 'HOME=/home/neroxa_test', 'GITHUB_RUN_ID=' + run_id,
                 'RUNNER_TEMP=' + os.environ['RUNNER_TEMP'], 'python3', '-E', str(HERE / 'driver.py'), 'exercise'], timeout=600)
    finally:
        cleanup(state)
    print('F02_ACL01=' + json.dumps(json.loads((lab / 'result.json').read_text())))


def interrupted(signum, frame):
    raise InterruptedError('SOFT_CANCELLATION')


def main():
    require(len(sys.argv) == 2, 'MODE_REQUIRED')
    mode = sys.argv[1]
    if mode in ('run', 'recover'):
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, interrupted)
    if mode == 'run':
        run()
    elif mode == 'exercise':
        exercise()
    elif mode == 'recover':
        recover()
    elif mode == 'audit':
        work, path = read_state()
        if path.exists():
            state = json.loads(path.read_text())
            validate_state(state)
            checks = audit(state)
            require(all(v == 'PASS' for v in checks.values()), 'INDEPENDENT_AUDIT_INCOMPLETE')
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
        code = str(exc) if isinstance(exc, RuntimeError) and re.fullmatch(r'[A-Za-z0-9_:/ .-]+', str(exc)) else type(exc).__name__
        print('F02_ACL01=BLOCKED;' + code)
        sys.exit(78)
