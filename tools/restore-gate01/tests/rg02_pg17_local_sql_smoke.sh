#!/usr/bin/env bash
# RG02 SQL semantic smoke: disposable, network-isolated PG17; NO backup.
set -euo pipefail
umask 077
command -v docker >/dev/null
command -v openssl >/dev/null
command -v python3 >/dev/null
PG_IMAGE="supabase/postgres:17.12.0.002"
CONTAINER="rg02-sql-smoke-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
PRIVATE="$(mktemp -d)"
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf -- "$PRIVATE"
}
trap cleanup EXIT

# Pull ONLY the image already used by the protected RG02 workflow. The
# database container has --network none and does not publish any ports.
timeout 240s docker pull "$PG_IMAGE" >/dev/null || {
  echo 'RG02_SQL_SMOKE_IMAGE=BLOCKED'
  exit 1
}
PASSWORD="$(openssl rand -hex 32)"
docker run --rm --detach --name "$CONTAINER" \
  --network none --security-opt no-new-privileges \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=1536m \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  -e POSTGRES_PASSWORD="$PASSWORD" "$PG_IMAGE" >/dev/null
unset PASSWORD
ready=0
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" pg_isready -q -h /var/run/postgresql \
      -U supabase_admin -d postgres; then
    ready=1
    break
  fi
  sleep 2
done
test "$ready" = 1 || { echo 'RG02_SQL_SMOKE_BOOT=BLOCKED'; exit 1; }
version="$(docker exec "$CONTAINER" psql -X -At -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U supabase_admin -d postgres \
  -c 'SHOW server_version_num;' 2>"$PRIVATE/version.stderr")"
[[ "$version" =~ ^17[0-9]{4}$ ]] || { echo 'RG02_SQL_SMOKE_VERSION=BLOCKED'; exit 1; }

# Synthetic-only fixture. It is never derived from the commercial backup.
cat >"$PRIVATE/fixture.sql" <<'SQL'
CREATE ROLE rg02_smoke_nologin WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA rg02_smoke;
CREATE TABLE rg02_smoke.sample_table (id integer);
CREATE FUNCTION rg02_smoke.sample_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE SEQUENCE rg02_smoke.sample_sequence;
GRANT USAGE ON SCHEMA rg02_smoke TO rg02_smoke_nologin;
GRANT SELECT ON TABLE rg02_smoke.sample_table TO rg02_smoke_nologin;
GRANT EXECUTE ON FUNCTION rg02_smoke.sample_function() TO rg02_smoke_nologin;
GRANT USAGE ON SEQUENCE rg02_smoke.sample_sequence TO rg02_smoke_nologin;
SQL
if ! timeout 60s docker exec -i "$CONTAINER" psql -X -qAt -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U supabase_admin -d postgres \
  <"$PRIVATE/fixture.sql" >"$PRIVATE/fixture.stdout" \
  2>"$PRIVATE/fixture.stderr"; then
  echo 'RG02_SQL_SMOKE_SYNTHETIC_FIXTURE=BLOCKED_REDACTED'
  exit 1
fi

# Optional all-local parameter fixture; never contact production.
is_super="$(docker exec "$CONTAINER" psql -X -At -v ON_ERROR_STOP=1 \
  -h /var/run/postgresql -U supabase_admin -d postgres \
  -c 'SHOW is_superuser;' 2>"$PRIVATE/superuser.stderr")"
if test "$is_super" = 'on'; then
  if ! docker exec "$CONTAINER" psql -X -qAt -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U supabase_admin -d postgres \
    -c 'GRANT SET ON PARAMETER work_mem TO rg02_smoke_nologin;' \
    >"$PRIVATE/parameter.stdout" 2>"$PRIVATE/parameter.stderr"; then
    echo 'RG02_SQL_SMOKE_PARAMETER_FIXTURE=BLOCKED_REDACTED'
    exit 1
  fi
fi

# Execute the tracked read-only SQL; all catalog output stays private.
if ! timeout 120s docker exec -i "$CONTAINER" psql -X -qAt \
    -v ON_ERROR_STOP=1 -h /var/run/postgresql -U supabase_admin \
    -d postgres < tools/restore-gate01/rg02_local_effective_rights.sql \
    >"$PRIVATE/probe.raw.json" 2>"$PRIVATE/probe.stderr"; then
  echo 'RG02_SQL_SMOKE_EFFECTIVE_QUERY=BLOCKED_REDACTED'
  exit 1
fi
if ! test -s "$PRIVATE/probe.raw.json" || \
   ! test "$(stat -c %s "$PRIVATE/probe.raw.json")" -le 1048576; then
  echo 'RG02_SQL_SMOKE_EFFECTIVE_SIZE=BLOCKED'
  exit 1
fi
python3 tools/restore-gate01/rg02_local_effective_rights.py \
  --input "$PRIVATE/probe.raw.json" --out "$PRIVATE/probe.report.json" \
  >"$PRIVATE/validator.stdout" 2>"$PRIVATE/validator.stderr" || {
    echo 'RG02_SQL_SMOKE_VALIDATION=BLOCKED_REDACTED'
    exit 1
  }
python3 - "$PRIVATE/probe.report.json" "$is_super" <<'PY'
import json
import sys
from pathlib import Path
r = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
p, v = r['populations'], r['rights']
for key in ('roles','schemas','tables','functions','sequences'):
    if p[key] < 1:
        raise SystemExit('RG02_SQL_SMOKE_POPULATION=BLOCKED')
for key in ('role_member','role_usage','role_set','schema_usage',
            'table_select','function_execute','sequence_usage'):
    if v[key]['checked'] < 1:
        raise SystemExit('RG02_SQL_SMOKE_CHECKS=BLOCKED')
if sys.argv[2] == 'on' and p['parameters'] < 1:
    raise SystemExit('RG02_SQL_SMOKE_PARAMETER=BLOCKED')
if (r['source_effective_privileges'],r['GLOBAL_ROLES'],r['OWNER_ACL'],
        r['COMMERCIAL_GO']) != (
        'NOT_MEASURED','NOT_VERIFIED','NOT_VERIFIED','NO_GO'):
    raise SystemExit('RG02_SQL_SMOKE_GO=BLOCKED')
print('PG17_LOCAL_EFFECTIVE_SQL_SMOKE=PASS')
print('SOURCE_EFFECTIVE_PRIVILEGES=NOT_MEASURED')
print('GLOBAL_ROLES=NOT_VERIFIED; OWNER_ACL=NOT_VERIFIED; COMMERCIAL_GO=NO_GO')
PY
