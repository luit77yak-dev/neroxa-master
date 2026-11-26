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
-- Distinct overloads share the first 63 bytes of their qualified identity.
CREATE FUNCTION rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(integer) RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE FUNCTION rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(text) RETURNS integer LANGUAGE sql AS 'SELECT 2';
REVOKE EXECUTE ON FUNCTION rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(integer), rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(integer) TO rg02_smoke_nologin;
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

# RG02 NEW preimage protocol: test the snapshot/export/import choreography
# with SYNTHETIC DATA ONLY, on the already-running PG17 Docker --network none.
# The commercial preimage capture workflow is NEVER triggered by this job.
coproc SOURCE_EXPORTER {
  docker exec -i "$CONTAINER" psql -X -qAt -v ON_ERROR_STOP=1 \
    -h /var/run/postgresql -U supabase_admin -d postgres \
    2>"$PRIVATE/exporter.stderr"
}
printf '%s\n' 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;' \
  'SELECT pg_catalog.pg_export_snapshot();' >&${SOURCE_EXPORTER[1]}
if ! IFS= read -r -t 18 snapshot <&${SOURCE_EXPORTER[0]}; then
  echo 'RG02_SAME_SNAPSHOT_EXPORT=BLOCKED_REDACTED'
  exit 1
fi
if [[ ! "$snapshot" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$ ]]; then
  echo 'RG02_SAME_SNAPSHOT_ID=BLOCKED_REDACTED'
  exit 1
fi
if ! timeout 50s docker exec "$CONTAINER" pg_dump \
    -h /var/run/postgresql -U supabase_admin -d postgres \
    --format=custom --no-password --snapshot="$snapshot" \
    >"$PRIVATE/source.synthetic.dump" 2>"$PRIVATE/dump.stderr"; then
  echo 'RG02_SAME_SNAPSHOT_DUMP=BLOCKED_REDACTED'
  exit 1
fi
if ! timeout 30s docker exec -i "$CONTAINER" psql -X -qAt \
    -v ON_ERROR_STOP=1 -v "snap=$snapshot" \
    -h /var/run/postgresql -U supabase_admin -d postgres \
    < tools/restore-gate01/rg02_source_globals_same_snapshot.sql \
    >"$PRIVATE/source.globals.json" 2>"$PRIVATE/globals.stderr"; then
  echo 'RG02_SAME_SNAPSHOT_GLOBALS=BLOCKED_REDACTED'
  exit 1
fi
if ! timeout 40s docker exec -i "$CONTAINER" psql -X -qAt \
    -v ON_ERROR_STOP=1 -v "snap=$snapshot" \
    -h /var/run/postgresql -U supabase_admin -d postgres \
    < tools/restore-gate01/rg02_source_tuple_same_snapshot.sql \
    >"$PRIVATE/source.tuples.jsonl" 2>"$PRIVATE/tuples.stderr"; then
  echo 'RG02_SAME_SNAPSHOT_TUPLES=BLOCKED_REDACTED'
  exit 1
fi
if ! docker exec -i "$CONTAINER" pg_restore --list \
    <"$PRIVATE/source.synthetic.dump" >"$PRIVATE/restore.list" \
    2>"$PRIVATE/restore.stderr"; then
  echo 'RG02_SAME_SNAPSHOT_ARCHIVE_INVALID'
  exit 1
fi
printf 'ROLLBACK;\n' >&${SOURCE_EXPORTER[1]}
fd=${SOURCE_EXPORTER[1]}
exec {fd}>&-
wait "$SOURCE_EXPORTER_PID" || {
  echo 'RG02_SAME_SNAPSHOT_EXPORTER_CLOSED_UNCLEANLY'
  exit 1
}
python3 - "$PRIVATE/source.globals.json" "$PRIVATE/source.tuples.jsonl" <<'PY'
import json
import sys
from pathlib import Path
g=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
if (g.get('scope')!='SOURCE_GLOBAL_CATALOG_IN_SAME_SNAPSHOT'
        or g.get('format_version')!=1
        or not isinstance(g.get('roles'),list)
        or not isinstance(g.get('memberships'),list)
        or not isinstance(g.get('parameter_acls'),list)):
    raise SystemExit('RG02_SAME_SNAPSHOT_GLOBALS_SHAPE_BLOCKED')
rows=[json.loads(s) for s in Path(sys.argv[2]).read_text(encoding='utf-8').splitlines()]
if not rows or not all(isinstance(x,list) and len(x)==5 and
                       (isinstance(x[4],bool) or x[4] is None) for x in rows):
    raise SystemExit('RG02_SAME_SNAPSHOT_TUPLES_SHAPE_BLOCKED')
if not any(x[0]=='rg02_smoke_nologin' and x[1]=='TABLE' and
           x[3]=='SELECT' and x[4] is True for x in rows):
    raise SystemExit('RG02_SAME_SNAPSHOT_PRIVILEGE_OBSERVATION_BLOCKED')
keys=[tuple(x[:4]) for x in rows]
if len(set(keys)) != len(keys):
    raise SystemExit('RG02_SAME_SNAPSHOT_DUPLICATE_KEYS_BLOCKED')
expected = {
    'rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(integer)': True,
    'rg02_smoke.rg02_collision_function_with_long_shared_identifier_prefix(text)': False,
}
observed = {x[2]: x[4] for x in rows if x[0]=='rg02_smoke_nologin'
            and x[1]=='FUNCTION' and x[3]=='EXECUTE' and x[2] in expected}
if observed != expected:
    raise SystemExit('RG02_FULL_OVERLOAD_IDENTITY_REGRESSION_BLOCKED')
print('RG02_FULL_OVERLOAD_IDENTITY_REGRESSION=PASS')
print('RG02_SAME_SNAPSHOT_SYNTHETIC=PASS')
print('PRODUCTION_DATABASE_ACCESS=NONE; COMMERCIAL_GO=NO_GO')
PY
