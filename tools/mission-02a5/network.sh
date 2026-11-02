#!/bin/bash
# Egress policy is scoped to the disposable focal UID and bridge only.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ]
case "$PWD" in /home/runner/*) ;; *) exit 1;; esac
uid=$(id -u neroxa_test 2>/dev/null || true)
[ "$#" -eq 1 ] || { echo 'usage: network.sh lock|unlock' >&2; exit 2; }

if [ "$1" = lock ]; then
  test -n "$uid" && test "$uid" != "$(id -u)"
  [[ "${PROOF1_API_PORT:-}" =~ ^[0-9]{1,5}$ ]] && (( PROOF1_API_PORT > 0 && PROOF1_API_PORT < 65536 ))
  [[ "${PROOF1_HANDLER_PORT:-}" =~ ^[0-9]{1,5}$ ]] && (( PROOF1_HANDLER_PORT > 0 && PROOF1_HANDLER_PORT < 65536 ))
  test "$PROOF1_API_PORT" != "$PROOF1_HANDLER_PORT"
  test "$PROOF1_API_PORT" != 2375 && test "$PROOF1_API_PORT" != 2376
  test "$PROOF1_HANDLER_PORT" != 2375 && test "$PROOF1_HANDLER_PORT" != 2376
  nid=$(docker --host=unix:///var/run/docker.sock network inspect "$AB_NETWORK" --format '{{.Id}}')
  bridge="br-${nid:0:12}"
  sudo iptables -N NEROXA02A5
  sudo ip6tables -N NEROXA02A5
  sudo iptables -I DOCKER-USER 1 -i "$bridge" ! -o "$bridge" -j REJECT
  sudo iptables -A NEROXA02A5 -o lo -d 127.0.0.1/32 -p tcp --dport "$PROOF1_API_PORT" -j RETURN
  sudo iptables -A NEROXA02A5 -o lo -d 127.0.0.1/32 -p tcp --dport "$PROOF1_HANDLER_PORT" -j RETURN
  sudo iptables -A NEROXA02A5 -j REJECT
  sudo iptables -I OUTPUT 1 -m owner --uid-owner "$uid" -j NEROXA02A5
  sudo ip6tables -A NEROXA02A5 -j REJECT
  sudo ip6tables -I OUTPUT 1 -m owner --uid-owner "$uid" -j NEROXA02A5
  v4=$(sudo iptables-save)
  v6=$(sudo ip6tables-save)
  grep -Fq -- "-i $bridge ! -o $bridge -j REJECT" <<< "$v4"
  grep -Fq -- "--uid-owner $uid -j NEROXA02A5" <<< "$v4"
  grep -Fq -- "--uid-owner $uid -j NEROXA02A5" <<< "$v6"
  grep -Fq -- "-d 127.0.0.1/32 -p tcp --dport $PROOF1_API_PORT -j RETURN" <<< "$v4"
  grep -Fq -- "-d 127.0.0.1/32 -p tcp --dport $PROOF1_HANDLER_PORT -j RETURN" <<< "$v4"
  grep -Fq -- "-j REJECT" <<< "$v4"
  grep -Fq -- "-j REJECT" <<< "$v6"
  echo 'TEST_UID_EGRESS=only API + capability-handler IPv4 endpoints; all other IPv4/IPv6 blocked'
  sudo -u neroxa_test python3 - <<'PY'
import json,socket
s=socket.socket();s.settimeout(2)
try:
    code=s.connect_ex(('198.51.100.1',443))
finally:
    s.close()
assert code != 0
print('EGRESS_NEGATIVE_CONTROL='+json.dumps({'blocked':True,'connect_code':code,'destination':'TEST-NET-2'}))
PY
elif [ "$1" = unlock ]; then
  if [ -n "$uid" ]; then
    while sudo iptables -C OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5 2>/dev/null; do sudo iptables -D OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5; done
    while sudo ip6tables -C OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5 2>/dev/null; do sudo ip6tables -D OUTPUT -m owner --uid-owner "$uid" -j NEROXA02A5; done
  fi
  nid=''
  if nid=$(docker --host=unix:///var/run/docker.sock network inspect "$AB_NETWORK" --format '{{.Id}}' 2>/dev/null); then
    if [ -n "${AB_NETWORK_ID:-}" ] && [ "$AB_NETWORK_ID" != "$nid" ]; then echo 'network identity differs from cleanup receipt' >&2; exit 1; fi
  elif [ -n "${AB_WORKDIR:-}" ] && [ -f "$AB_WORKDIR/network.receipt" ]; then
    mapfile -t receipt < "$AB_WORKDIR/network.receipt"
    if [ "${#receipt[@]}" -ne 2 ] || [ "${receipt[0]}" != "$AB_NETWORK" ] || ! [[ "${receipt[1]}" =~ ^[0-9a-f]{64}$ ]]; then echo 'invalid network cleanup receipt' >&2; exit 1; fi
    nid=${receipt[1]}
  fi
  if [ -n "$nid" ]; then
    bridge="br-${nid:0:12}"
    while sudo iptables -C DOCKER-USER -i "$bridge" ! -o "$bridge" -j REJECT 2>/dev/null; do sudo iptables -D DOCKER-USER -i "$bridge" ! -o "$bridge" -j REJECT; done
  fi
  for tool in iptables ip6tables; do
    if sudo "$tool" -S NEROXA02A5 >/dev/null 2>&1; then sudo "$tool" -F NEROXA02A5; sudo "$tool" -X NEROXA02A5; fi
  done
  echo 'FIREWALL_UNLOCK=commands completed; caller must verify IPv4/IPv6 inventories'
else
  echo 'unknown action' >&2
  exit 2
fi
