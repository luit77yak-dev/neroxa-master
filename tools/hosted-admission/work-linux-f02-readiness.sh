#!/usr/bin/env bash
# NEROXA V1 — F02 Work Linux precheck, existing lab, NO CREDENTIALS.
# This script does not read .env, prompt for passwords, run SQL or mutate hosts.
# Run only in the candidate branch checkout (never on a production deployment).
set -euo pipefail
set +x
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"

HOST='aws-0-us-east-1.pooler.supabase.com'
REF='iefaoaqzltvpfabyeelj'
CA_FILE='tools/hosted-admission/ca/supabase-root-2021.library-candidate.crt'
CA_SHA256='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
CORE_BLOB='394edd40004f259daa01ab95496ef8fc042416da'
OFFLINE=0
case "${1:-}" in
  '') ;;
  --offline) OFFLINE=1 ;;
  *) printf 'USAGE=bash tools/hosted-admission/work-linux-f02-readiness.sh [--offline]\n'; exit 2 ;;
esac

printf 'PROJECT_REF=%s\n' "$REF"
printf 'HOST=%s\n' "$HOST"
printf 'PORT=5432\n'
printf 'DATABASE=postgres\n'
printf 'PREFLIGHT_ROLE=neroxa_f02_preflight\n'
printf 'SECURITY_MODE=NO_SECRETS_NO_SQL_NO_WRITES\n'

failed=0
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '%s=PASS\n' "$label"
  else
    printf '%s=BLOCKED\n' "$label"
    failed=1
  fi
}

check WORK_REPO_ROOT test -d .git
check WORK_NODE command -v node
check WORK_PYTHON command -v python3
check WORK_PSQL command -v psql
check WORK_OPENSSL command -v openssl
check WORK_SHA256SUM command -v sha256sum
check CA_FILE_PRESENT test -f "$CA_FILE"
if command -v sha256sum >/dev/null 2>&1 && test -f "$CA_FILE"; then
  actual="$(sha256sum "$CA_FILE" | cut -d ' ' -f 1)"
  if test "$actual" = "$CA_SHA256"; then
    printf 'CA_SHA256=PASS\n'
  else
    printf 'CA_SHA256=BLOCKED\n'
    failed=1
  fi
else
  printf 'CA_SHA256=NOT_RUN\n'
  failed=1
fi

if command -v openssl >/dev/null 2>&1 && test -f "$CA_FILE"; then
  check CA_CERT_FORMAT openssl x509 -in "$CA_FILE" -noout
  check CA_NOT_EXPIRING_IN_7_DAYS openssl x509 -in "$CA_FILE" -noout -checkend 604800
else
  printf 'CA_CERT_FORMAT=NOT_RUN\n'
  failed=1
fi

if command -v git >/dev/null 2>&1 && test -f delivery-candidate/src/server/hosted-release-core.mjs; then
  blob="$(git hash-object delivery-candidate/src/server/hosted-release-core.mjs)"
  if test "$blob" = "$CORE_BLOB"; then
    printf 'HOSTED_CORE_BLOB=PASS\n'
  else
    printf 'HOSTED_CORE_BLOB=BLOCKED\n'
    failed=1
  fi
else
  printf 'HOSTED_CORE_BLOB=NOT_RUN\n'
  failed=1
fi

if command -v node >/dev/null 2>&1; then
  check SQL_GATES_CLOSED node --input-type=module -e "
    import fs from 'node:fs';
    const p=JSON.parse(fs.readFileSync('tools/hosted-admission/preflight-policy.json'));
    const m=JSON.parse(fs.readFileSync('audits/02a5/hosted-release/MANIFEST.json'));
    if(!String(p.state).startsWith('CLOSED')||p.host!==null||p.role!==null||p.authority?.publicKeyPem!==null||m.execution_authorized!==false||m.approval!==null||m.units?.length!==33)process.exit(1);
  "
else
  printf 'SQL_GATES_CLOSED=NOT_RUN\n'
  failed=1
fi

if test "$OFFLINE" -eq 1; then
  printf 'POOLER_NETWORK_TLS=NOT_RUN_OFFLINE_MODE\n'
elif command -v python3 >/dev/null 2>&1 && test -f "$CA_FILE"; then
  # The public, shared Supabase pooler host is the only network destination.
  # Output contains only status flags, never passwords or SQL result rows.
  if python3 tools/hosted-admission/session-pooler-tls-probe.py \
    --host "$HOST" --ca-file "$CA_FILE" --ca-sha256 "$CA_SHA256"; then
    printf 'POOLER_NETWORK_TLS=PASS_WITH_CA_CANDIDATE\n'
  else
    printf 'POOLER_NETWORK_TLS=NOT_VERIFIED\n'
    failed=1
  fi
else
  printf 'POOLER_NETWORK_TLS=NOT_RUN\n'
  failed=1
fi

printf 'PRIVATE_PASSWORD_AUTH=NOT_ATTEMPTED\n'
printf 'HOSTED_PREFLIGHT=NOT_RUN\n'
printf 'SQL_RELEASE=NOT_AUTHORIZED\n'
printf 'COMMERCIAL_GO=NO_GO\n'
if test "$failed" -ne 0; then
  printf 'WORK_F02_READINESS=BLOCKED\n'
  exit 78
fi
if test "$OFFLINE" -eq 1; then
  printf 'WORK_F02_READINESS=OFFLINE_PRECHECK_PASS_NETWORK_NOT_RUN\n'
else
  printf 'WORK_F02_READINESS=PRECHECK_PASS_NOT_AUTHENTICATED\n'
fi
