-- RG02 NEW commercial preimage ONLY. Protected runner; no direct manual execution.
-- Imports exported snapshot from the exact same PG17 source cluster and DB
-- used by pg_dump. Output is SENSITIVE metadata: encrypt in-flight; never log.
-- No password hashes or application row data; no DDL or privilege replay.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'snap';
SET LOCAL search_path = pg_catalog;
SELECT pg_catalog.jsonb_build_object(
  'format_version', 1,
  'scope', 'SOURCE_GLOBAL_CATALOG_IN_SAME_SNAPSHOT',
  'roles', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', r.rolname,
      'login', r.rolcanlogin,
      'superuser', r.rolsuper,
      'inherit', r.rolinherit,
      'create_role', r.rolcreaterole,
      'create_db', r.rolcreatedb,
      'replication', r.rolreplication,
      'bypass_rls', r.rolbypassrls
    ) ORDER BY r.rolname) FROM pg_catalog.pg_roles AS r
  ), '[]'::jsonb),
  'memberships', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'role', granted.rolname,
      'member', member.rolname,
      'grantor', grantor.rolname,
      'admin', m.admin_option,
      'inherit', m.inherit_option,
      'set', m.set_option
    ) ORDER BY granted.rolname, member.rolname, grantor.rolname)
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid=m.member
    LEFT JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=m.grantor
  ), '[]'::jsonb),
  'parameter_acls', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'parameter', p.parname, 'acl', p.paracl::text
    ) ORDER BY p.parname)
    FROM pg_catalog.pg_parameter_acl AS p
  ), '[]'::jsonb)
)::text;
ROLLBACK;
