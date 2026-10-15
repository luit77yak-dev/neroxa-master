"""Public standard GitHub VM eligibility probe. NO SQL or database startup.

No package install, dotenv, production secrets, cache/artifact upload or deployment.
Only the fixed public image manifest is read. Probe container runs bash, never DB.
Network rules affect a temporary UID and one disposable Docker bridge only.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import threading

ROOT = Path.cwd()
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']

def command(args, **kwargs):
    return subprocess.run(args, text=True, check=True, **kwargs)

def output(args):
    return subprocess.check_output(args, text=True).strip()

def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    assert event['repository']['full_name'] == 'luit77yak-dev/neroxa-master'
    assert event['repository']['private'] is False
    assert event['repository']['visibility'] == 'public'
    assert os.environ['GITHUB_ACTIONS'] == 'true'
    assert os.environ['RUNNER_ENVIRONMENT'] == 'github-hosted'
    assert os.environ['GITHUB_REF'] == 'refs/heads/security/mission-02a5-integration-local-20261014'
    assert ROOT.as_posix().startswith('/home/runner/')
    assert output(['git', 'rev-parse', 'HEAD']) == os.environ['GITHUB_SHA']
    suffix = os.environ['GITHUB_RUN_ID']
    assert suffix.isdigit()
    network = 'neroxa-executor-' + suffix
    user = 'neroxa_probe'
    chain = 'NXPROBE' + suffix[-12:]
    probe = network + '-probe'
    report = {'source_sha': os.environ['GITHUB_SHA'], 'run_id': suffix,
              'scope': 'EXECUTOR_PREFLIGHT_ONLY_NO_SQL_NO_SUPABASE_START',
              'free_basis': 'public repository + standard ubuntu-24.04 VM; no cache/artifact/larger runner',
              'status': 'BLOCKED', 'native_database_tests': 'NOT RUN', 'gate': 'NOT APPLIED'}
    driver = output(DOCKER + ['info', '--format', '{{.Driver}}'])
    free = shutil.disk_usage(os.environ['RUNNER_TEMP']).free
    mem = int(next(s.split()[1] for s in Path('/proc/meminfo').read_text().splitlines()
                   if s.startswith('MemAvailable:'))) * 1024
    report['resources'] = dict(driver=driver, free_bytes=free, memory_bytes=mem, cpus=os.cpu_count())
    print('EXECUTOR_RESOURCE_PREFLIGHT=' + json.dumps(report['resources']), flush=True)
    # Keep reviewed thresholds; vfs does not satisfy the extraction/copy bound.
    if driver == 'vfs' or free < 28 * 1024**3 or mem < 6 * 1024**3 or os.cpu_count() < 2:
        report['reason'] = 'reviewed resource thresholds not met; no pull/start/network change'
        print('EXECUTOR_FINAL=' + json.dumps(report), flush=True)
        return 2
    manifest = ROOT / 'audits/02a5/EXPECTED-IMAGES.json'
    expected = json.loads(manifest.read_text())
    assert len(expected) == 6
    report['image_manifest_sha256'] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    created_user = created_network = False
    uid = bridge = None
    images_before = set(output(DOCKER + ['image', 'ls', '-q', '--no-trunc']).splitlines())
    volumes_before = set(output(DOCKER + ['volume', 'ls', '-q']).splitlines())
    pulled = []
    listener = None
    try:
        for tag, expected_id in expected.items():
            command(DOCKER + ['pull', '--quiet', tag], stdout=subprocess.DEVNULL)
            actual = output(DOCKER + ['image', 'inspect', tag, '--format', '{{.Id}}'])
            pulled.append((tag, actual))
            assert actual == expected_id, 'image identity drift: ' + tag
        report['images'] = dict(pulled)
        assert shutil.disk_usage(os.environ['RUNNER_TEMP']).free >= 18 * 1024**3, 'post-pull storage bound'
        command(DOCKER + ['network', 'create', '--driver', 'bridge', '--opt',
                          'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network],
                stdout=subprocess.DEVNULL)
        created_network = True
        nid = output(DOCKER + ['network', 'inspect', network, '--format', '{{.Id}}'])
        bridge = 'br-' + nid[:12]
        assert output(DOCKER + ['network', 'inspect', network, '--format', '{{.EnableIPv6}}']) == 'false'
        command(['sudo', 'useradd', '--no-create-home', user])
        created_user = True
        uid = output(['id', '-u', user])
        assert uid != str(os.getuid())
        for tool in ['iptables', 'ip6tables']:
            command(['sudo', tool, '-N', chain])
            command(['sudo', tool, '-A', chain, '-o', 'lo', '-j', 'RETURN'])
            command(['sudo', tool, '-A', chain, '-j', 'REJECT'])
            command(['sudo', tool, '-I', 'OUTPUT', '1', '-m', 'owner', '--uid-owner', uid, '-j', chain])
        command(['sudo', 'iptables', '-I', 'DOCKER-USER', '1', '-i', bridge, '!', '-o', bridge, '-j', 'REJECT'])
        # Positive own-loopback control, then negative TEST-NET targets. No real endpoint.
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(10)
        def accept():
            try:
                client, _ = listener.accept()
                client.close()
            except OSError:
                pass
        thread = threading.Thread(target=accept, daemon=True)
        thread.start()
        code = """import socket,json,sys
port=int(sys.argv[1]);s=socket.socket();s.settimeout(3)
s.connect(('127.0.0.1',port));s.close()
results=[]
for family,host in [(socket.AF_INET,'198.51.100.1'),(socket.AF_INET6,'2001:db8::1')]:
 s=socket.socket(family);s.settimeout(2);r=s.connect_ex((host,443));s.close()
 assert r!=0,'unexpected egress';results.append({'family':family,'blocked':True,'code':r})
print(json.dumps({'loopback_positive':True,'negative_controls':results}))
"""
        raw = output(['sudo', '-u', user, 'env', '-i', 'PATH=/usr/bin:/bin', 'python3', '-c', code,
                      str(listener.getsockname()[1])])
        report['uid_network'] = json.loads(raw)
        thread.join(timeout=1)
        # A no-DB bash container sends only a TEST-NET probe. Its bridge rule counter must rise.
        image = 'supabase/postgres:17.11.0.004'
        volume_paths = json.loads(output(DOCKER + ['image', 'inspect', image, '--format', '{{json .Config.Volumes}}'])) or {}
        args = DOCKER + ['run', '--rm', '--name', probe, '--network', network,
                         '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges']
        for path in volume_paths:
            args += ['--tmpfs', path]
        args += ['--entrypoint', '/bin/bash', image, '-c',
                 "timeout 3 bash -c 'exec 3<>/dev/tcp/198.51.100.1/443'"]
        attempt = subprocess.run(args, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        assert attempt.returncode != 0, 'unexpected bridge egress'
        rule = output(['sudo', 'iptables', '-nvxL', 'DOCKER-USER'])
        matched = [line.split() for line in rule.splitlines() if bridge in line and 'REJECT' in line]
        assert len(matched) == 1 and int(matched[0][0]) > 0, 'no bridge reject counter evidence'
        report['bridge_network'] = {'testnet_blocked': True, 'reject_packets': int(matched[0][0]),
                                    'ipv6_enabled': False, 'database_started': False}
        report['status'] = 'PASS_EXECUTOR_PREFLIGHT_ONLY'
    except Exception as exc:
        report['reason'] = type(exc).__name__ + ': ' + str(exc)[:180]
    finally:
        if listener:
            listener.close()
        subprocess.run(DOCKER + ['rm', '-f', probe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for tool in ['iptables', 'ip6tables']:
            if uid:
                subprocess.run(['sudo', tool, '-D', 'OUTPUT', '-m', 'owner', '--uid-owner', uid, '-j', chain],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for op in ['-F', '-X']:
                subprocess.run(['sudo', tool, op, chain], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if bridge:
            subprocess.run(['sudo', 'iptables', '-D', 'DOCKER-USER', '-i', bridge, '!', '-o', bridge, '-j', 'REJECT'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if created_network:
            subprocess.run(DOCKER + ['network', 'rm', network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if created_user:
            subprocess.run(['sudo', 'userdel', user], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for tag, image_id in pulled:
            if image_id not in images_before:
                subprocess.run(DOCKER + ['image', 'rm', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        remaining = output(DOCKER + ['ps', '-aq', '--filter', 'name=' + probe])
        networks = output(DOCKER + ['network', 'ls', '--filter', 'name=' + network, '-q'])
        volumes_after = set(output(DOCKER + ['volume', 'ls', '-q']).splitlines())
        user_remaining = subprocess.run(['id', user], capture_output=True).returncode == 0
        rules_remaining = any(subprocess.run(['sudo', t, '-S', chain], capture_output=True).returncode == 0
                              for t in ['iptables', 'ip6tables'])
        clean = not remaining and not networks and volumes_after == volumes_before and not user_remaining and not rules_remaining
        report['cleanup'] = {'status': 'PASS' if clean else 'FAIL', 'probe_containers_remaining': bool(remaining),
                             'network_remaining': bool(networks), 'new_volumes_remaining': len(volumes_after - volumes_before),
                             'test_uid_remaining': user_remaining, 'uid_chains_remaining': rules_remaining}
        if not clean:
            report['status'] = 'FAIL_CLEANUP'
    print('EXECUTOR_FINAL=' + json.dumps(report, sort_keys=True), flush=True)
    return 0 if report['status'] == 'PASS_EXECUTOR_PREFLIGHT_ONLY' else 2

if __name__ == '__main__':
    raise SystemExit(main())
