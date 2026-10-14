#!/bin/bash
# Only the ephemeral public GitHub runner; never the managed workstation.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ]
case "$(pwd)" in /home/runner/*) ;; *) exit 1;; esac
if [ "$1" = lock ]; then
  nid=$(docker network inspect "$AB_NETWORK" --format '{{.Id}}')
  bridge="br-${nid:0:12}"
  subnet=$(docker network inspect "$AB_NETWORK" --format '{{(index .IPAM.Config 0).Subnet}}')
  sudo iptables -I DOCKER-USER 1 -i "$bridge" ! -o "$bridge" -j REJECT
  sudo iptables -N NEROXA02A3
  sudo iptables -A NEROXA02A3 -o "$bridge" -d "$subnet" -j RETURN
  sudo iptables -A NEROXA02A3 -o lo -j RETURN
  sudo iptables -A NEROXA02A3 -d 127.0.0.0/8 -j RETURN
  sudo iptables -A NEROXA02A3 -j REJECT
  sudo iptables -I OUTPUT 1 -j NEROXA02A3
  sudo ip6tables -N NEROXA02A3
  sudo ip6tables -A NEROXA02A3 -o lo -j RETURN
  sudo ip6tables -A NEROXA02A3 -j REJECT
  sudo ip6tables -I OUTPUT 1 -j NEROXA02A3
  echo "EGRESS_LOCK=host loopback + disposable bridge $bridge/$subnet only; container external forwarding rejected; IPv6 loopback only"
  python3 - <<'PYTEST'
import socket,json
s=socket.socket();s.settimeout(2);r=s.connect_ex(('198.51.100.1',443));s.close();print('EGRESS_NEGATIVE_CONTROL='+json.dumps({'destination':'TEST-NET-2, no commercial host','connect_code':r,'blocked':r!=0}));assert r!=0
PYTEST
else
  nid=$(docker --host=unix:///var/run/docker.sock network inspect "$AB_NETWORK" --format '{{.Id}}' 2>/dev/null || true)
  if [ -n "$nid" ]; then sudo iptables -D DOCKER-USER -i "br-${nid:0:12}" ! -o "br-${nid:0:12}" -j REJECT 2>/dev/null || true; fi
  sudo iptables -D OUTPUT -j NEROXA02A3 || true
  sudo iptables -F NEROXA02A3 || true
  sudo iptables -X NEROXA02A3 || true
  sudo ip6tables -D OUTPUT -j NEROXA02A3 || true
  sudo ip6tables -F NEROXA02A3 || true
  sudo ip6tables -X NEROXA02A3 || true
fi
