#!/usr/bin/env bash
set -euo pipefail
# Only an ephemeral GitHub service container; no project or network credentials.
[[ "${GITHUB_ACTIONS:-}" = true ]]
[[ "${1:-}" =~ ^[a-f0-9]{64}$ ]]
container="$1"
[[ "$(docker inspect -f '{{.Config.Image}}' "$container")" = postgres:17 ]]
root_psql() { docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U fixture_root -d postgres "$@"; }
db() { docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
root_psql <<'SQL'
CREATE ROLE postgres LOGIN CREATEROLE NOSUPERUSER;
ALTER DATABASE postgres OWNER TO postgres;
SQL
db <<'SQL'
CREATE ROLE neroxa_commercial_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
CREATE TABLE public.fixture_private (id bigint GENERATED ALWAYS AS IDENTITY, payload text);
CREATE FUNCTION public.get_admin_order_detail(uuid,uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::jsonb';
CREATE FUNCTION public.get_admin_orders(uuid,text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::jsonb';
CREATE FUNCTION public.neroxa_claim_cloudflare_grant(text,timestamptz,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT false';
CREATE FUNCTION public.update_admin_order_status(uuid,text,text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS 'SELECT NULL::jsonb';
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.neroxa_claim_cloudflare_grant(text,timestamptz,text) TO neroxa_commercial_runtime;
SQL
candidate=audits/runtime-review/admin-role-bootstrap.sql
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
assert_absent() {
  [[ "$(db -Atc "SELECT count(*) FROM pg_roles WHERE rolname='neroxa_commercial_admin_runtime'")" = 0 ]]
}
expect_failure() {
  local file="$1" expected="$2"
  if db < "$file" > "$tmp/error" 2>&1; then echo UNEXPECTED_SUCCESS; exit 1; fi
  grep -F "$expected" "$tmp/error" >/dev/null
  assert_absent
}
expect_failure "$candidate" 'Admin function preimage mismatch'
echo PRODUCTION_PINS_REJECT_SYNTHETIC_FIXTURE=PASS
db -Atc "SELECT md5(pg_get_functiondef(x::regprocedure)) FROM unnest(ARRAY['public.get_admin_order_detail(uuid,uuid)','public.get_admin_orders(uuid,text)','public.neroxa_claim_cloudflare_grant(text,timestamptz,text)','public.update_admin_order_status(uuid,text,text)']) x" > "$tmp/pins"
python3 - "$candidate" "$tmp/pins" "$tmp/synthetic.sql" <<'PY'
import pathlib,re,sys
src=pathlib.Path(sys.argv[1]).read_text()
pins=pathlib.Path(sys.argv[2]).read_text().splitlines()
assert len(pins)==4 and all(re.fullmatch('[a-f0-9]{32}',p) for p in pins)
matches=list(re.finditer(r"'[a-f0-9]{32}'",src))
assert len(matches)==4
for m,p in reversed(list(zip(matches,pins))):
    src=src[:m.start()]+"'"+p+"'"+src[m.end():]
pathlib.Path(sys.argv[3]).write_text(src)
PY
db -c "CREATE FUNCTION public.fixture_extra() RETURNS int LANGUAGE sql AS 'SELECT 1'"
expect_failure "$tmp/synthetic.sql" 'Unexpected effective application function ACL'
db -c 'DROP FUNCTION public.fixture_extra()'
echo EXTRA_EXECUTE_ATOMIC_ROLLBACK=PASS
db -c 'GRANT SELECT ON public.fixture_private TO PUBLIC'
expect_failure "$tmp/synthetic.sql" 'Unexpected direct application table privileges'
db -c 'REVOKE SELECT ON public.fixture_private FROM PUBLIC'
echo TABLE_ACL_ATOMIC_ROLLBACK=PASS
db < "$tmp/synthetic.sql"
[[ "$(db -Atc "SELECT count(*) FROM pg_roles WHERE rolname='neroxa_commercial_admin_runtime' AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND rolconnlimit=5")" = 1 ]]
[[ "$(db -Atc "SELECT count(*) FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member WHERE r.rolname='neroxa_commercial_admin_runtime' AND m.rolname='postgres' AND a.grantor=10 AND a.admin_option AND NOT a.inherit_option AND NOT a.set_option")" = 1 ]]
[[ "$(db -Atc "SELECT has_function_privilege('neroxa_commercial_runtime','public.get_admin_orders(uuid,text)','EXECUTE')")" = f ]]
echo ADMIN_NOLOGIN_ACL_SYNTHETIC_PG17=PASS
echo COMMERCIAL_SQL_EXECUTED=NO
