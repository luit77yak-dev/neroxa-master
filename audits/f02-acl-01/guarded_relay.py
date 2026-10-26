"""Focal admission checks around the unchanged historical Docker relay.

No service may be created until its image ID and isolated network are admitted.
This is a trusted-harness guard, not a sandbox against a hostile Docker client.
"""
import importlib.util
import json
import os
from pathlib import Path
import socketserver
import sys

sys.dont_write_bytecode = True

import driver


def main():
    work, path = driver.read_state()
    state = json.loads(path.read_text())
    driver.validate_state(state)
    driver.require(sys.argv[1:] == [state['project']], 'RELAY_IDENTITY')
    driver.network_ready(state)
    expected = json.loads((driver.ROOT / 'audits/02a5/EXPECTED-IMAGES.json').read_text())
    spec = importlib.util.spec_from_file_location('focal_historical_relay', driver.ROOT / 'tools/ab-auth/docker_loopback.py')
    relay = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(relay)
    original = relay.rewrite

    def guarded(data, project, name):
        driver.require(project == state['project'], 'RELAY_PROJECT')
        value = json.loads(data)
        host = value.get('HostConfig') or {}
        driver.require(host.get('NetworkMode') in (project, state['network_id']), 'RELAY_NETWORK_MODE')
        endpoints = (value.get('NetworkingConfig') or {}).get('EndpointsConfig') or {}
        driver.require(set(endpoints).issubset({project, state['network_id']}), 'RELAY_EXTRA_NETWORK')
        driver.require(not host.get('Privileged') and not host.get('CapAdd')
                       and not host.get('PidMode') and not host.get('Devices'), 'RELAY_HOST_PRIVILEGES')
        driver.network_ready(state)
        image = value.get('Image', '').removeprefix('docker.io/')
        wanted = expected.get(image, image if image in expected.values() else None)
        driver.require(wanted is not None, 'RELAY_UNADMITTED_IMAGE')
        actual = json.loads(driver.command(driver.DOCKER + ['image', 'inspect', image]))[0]
        driver.require(actual['Id'] == wanted, 'RELAY_IMAGE_ID')
        # Resolve mutable tags to admitted IDs BEFORE Docker receives the create.
        value['Image'] = wanted
        value.setdefault('Labels', {})[driver.PROJECT_LABEL] = project
        return original(json.dumps(value).encode(), project, name)

    relay.rewrite = guarded
    sock = Path(state['lab']) / 'docker-loopback.sock'
    driver.require(not sock.exists(), 'RELAY_SOCKET_COLLISION')
    server = socketserver.ThreadingUnixStreamServer(str(sock), relay.Handler)
    server.daemon_threads = True
    server.project = state['project']
    sock.chmod(0o600)
    server.serve_forever()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No request bodies, environment values or credentials in logs.
        print('F02_ACL01_RELAY=BLOCKED')
        sys.exit(78)
