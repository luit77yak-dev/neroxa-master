#!/bin/bash
# Only the ephemeral public GitHub runner; never the managed workstation.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ]
case "$(pwd)" in /home/runner/*) ;; *) exit 1;; esac
if [ "$1" = lock ]; then
  sudo iptables -N NEROXA02A3
  sudo iptables -A NEROXA02A3 -o lo -j RETURN
  sudo iptables -A NEROXA02A3 -d 127.0.0.0/8 -j RETURN
  sudo iptables -A NEROXA02A3 -j REJECT
  sudo iptables -I OUTPUT 1 -j NEROXA02A3
  sudo ip6tables -N NEROXA02A3
  sudo ip6tables -A NEROXA02A3 -o lo -j RETURN
  sudo ip6tables -A NEROXA02A3 -j REJECT
  sudo ip6tables -I OUTPUT 1 -j NEROXA02A3
  echo 'EGRESS_LOCK=loopback-only IPv4/IPv6 host; services internal Docker network'
else
  sudo iptables -D OUTPUT -j NEROXA02A3 || true
  sudo iptables -F NEROXA02A3 || true
  sudo iptables -X NEROXA02A3 || true
  sudo ip6tables -D OUTPUT -j NEROXA02A3 || true
  sudo ip6tables -F NEROXA02A3 || true
  sudo ip6tables -X NEROXA02A3 || true
fi
