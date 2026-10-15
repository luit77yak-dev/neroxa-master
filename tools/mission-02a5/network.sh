#!/bin/bash
# Scoped to the test UID; GitHub runner heartbeat retains its own UID and egress.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ]
case "$PWD" in /home/runner/*) ;; *) exit 1;; esac
uid=$(id -u neroxa_test 2>/dev/null || true)
if [ "$1" = lock ]; then
 test -n "$uid" && test "$uid" != "$(id -u)"
 nid=$(docker --host=unix:///var/run/docker.sock network inspect "$AB_NETWORK" --format '{{.Id}}')
 bridge="br-${nid:0:12}"
 sudo iptables -I DOCKER-USER 1 -i "$bridge" ! -o "$bridge" -j REJECT
 sudo iptables -N NEROXA02A5
 sudo iptables -A NEROXA02A5 -o lo -j RETURN
 sudo iptables -A NEROXA02A5 -j REJECT
 sudo iptables -I OUTPUT 1 -m owner --uid-owner "$uid" -j NEROXA02A5
 sudo ip6tables -N NEROXA02A5
 sudo ip6tables -A NEROXA02A5 -o lo -j RETURN
 sudo ip6tables -A NEROXA02A5 -j REJECT
 sudo ip6tables -I OUTPUT 1 -m owner --uid-owner "$uid" -j NEROXA02A5
 echo 'TEST_UID_EGRESS=loopback only; Docker project bridge external forwarding denied; runner heartbeat UID unchanged'
 sudo -u neroxa_test python3 - <<'PY'
import socket,json
s=socket.socket();s.settimeout(2);r=s.connect_ex(('198.51.100.1',443));s.close();assert r!=0;print('EGRESS_NEGATIVE_CONTROL='+json.dumps({'blocked':True,'connect_code':r,'destination':'TEST-NET-2'}))
PY
else
 if [ -n "$uid" ]; then
  sudo iptables -D OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5 2>/dev/null || true
  sudo ip6tables -D OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5 2>/dev/null || true
 fi
 sudo iptables -F NEROXA02A5 2>/dev/null || true; sudo iptables -X NEROXA02A5 2>/dev/null || true
 sudo ip6tables -F NEROXA02A5 2>/dev/null || true; sudo ip6tables -X NEROXA02A5 2>/dev/null || true
 nid=$(docker --host=unix:///var/run/docker.sock network inspect "$AB_NETWORK" --format '{{.Id}}' 2>/dev/null || true)
 if [ -n "$nid" ]; then sudo iptables -D DOCKER-USER -i "br-${nid:0:12}" ! -o "br-${nid:0:12}" -j REJECT 2>/dev/null || true; fi
fi
