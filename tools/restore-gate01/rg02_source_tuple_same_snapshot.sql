-- RG02 NEW SOURCE: full per-role/per-object native privilege witness (19 kinds).
-- PROTECTED CAPTURE ONLY. Imported snapshot must match pg_dump and globals.
-- Output contains sensitive role/object identities: encrypt immediately; no logs.
-- This is NOT proof of RLS predicates, column privilege, SECURITY DEFINER
-- semantics, session grants or immutable independent source identity.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'snap';
SET LOCAL search_path = pg_catalog;
WITH
roles_checked AS MATERIALIZED (
  SELECT oid, rolname FROM pg_catalog.pg_roles WHERE rolname !~ '^pg_'
),
schemas_checked AS MATERIALIZED (
  SELECT oid, nspname FROM pg_catalog.pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
),
tables_checked AS MATERIALIZED (
  SELECT c.oid, pg_catalog.format('%I.%I', n.nspname, c.relname) AS identity
  FROM pg_catalog.pg_class AS c
  JOIN schemas_checked AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f')
),
sequences_checked AS MATERIALIZED (
  SELECT c.oid, pg_catalog.format('%I.%I', n.nspname, c.relname) AS identity
  FROM pg_catalog.pg_class AS c
  JOIN schemas_checked AS n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S'
),
functions_checked AS MATERIALIZED (
  SELECT f.oid, pg_catalog.format(
    '%I.%I(%s)', n.nspname, f.proname,
    pg_catalog.pg_get_function_identity_arguments(f.oid)) AS identity
  FROM pg_catalog.pg_proc AS f
  JOIN schemas_checked AS n ON n.oid = f.pronamespace
),
parameters_checked AS MATERIALIZED (
  SELECT name FROM pg_catalog.pg_settings
  UNION
  SELECT parname AS name FROM pg_catalog.pg_parameter_acl
),
-- UNION ALL must resolve object_identity as text, not catalog type name.
-- Otherwise qualified signatures are silently truncated to 63 bytes.
probes AS (
  SELECT u.rolname AS role_name, 'ROLE'::text AS object_kind,
         o.rolname::text AS object_identity, 'MEMBER'::text AS privilege,
         pg_catalog.pg_has_role(u.oid, o.oid, 'MEMBER') AS allowed
  FROM roles_checked AS u CROSS JOIN roles_checked AS o
  WHERE u.oid <> o.oid
  UNION ALL
  SELECT u.rolname AS role_name, 'ROLE'::text AS object_kind,
         o.rolname::text AS object_identity, 'USAGE'::text AS privilege,
         pg_catalog.pg_has_role(u.oid, o.oid, 'USAGE') AS allowed
  FROM roles_checked AS u CROSS JOIN roles_checked AS o
  WHERE u.oid <> o.oid
  UNION ALL
  SELECT u.rolname AS role_name, 'ROLE'::text AS object_kind,
         o.rolname::text AS object_identity, 'SET'::text AS privilege,
         pg_catalog.pg_has_role(u.oid, o.oid, 'SET') AS allowed
  FROM roles_checked AS u CROSS JOIN roles_checked AS o
  WHERE u.oid <> o.oid
  UNION ALL
  SELECT u.rolname AS role_name, 'SCHEMA'::text AS object_kind,
         o.nspname::text AS object_identity, 'USAGE'::text AS privilege,
         pg_catalog.has_schema_privilege(u.oid, o.oid, 'USAGE') AS allowed
  FROM roles_checked AS u CROSS JOIN schemas_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'SCHEMA'::text AS object_kind,
         o.nspname::text AS object_identity, 'CREATE'::text AS privilege,
         pg_catalog.has_schema_privilege(u.oid, o.oid, 'CREATE') AS allowed
  FROM roles_checked AS u CROSS JOIN schemas_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'SELECT'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'SELECT') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'INSERT'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'INSERT') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'UPDATE'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'UPDATE') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'DELETE'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'DELETE') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'TRUNCATE'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'TRUNCATE') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'REFERENCES'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'REFERENCES') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'TRIGGER'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'TRIGGER') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'TABLE'::text AS object_kind,
         o.identity AS object_identity, 'MAINTAIN'::text AS privilege,
         pg_catalog.has_table_privilege(u.oid, o.oid, 'MAINTAIN') AS allowed
  FROM roles_checked AS u CROSS JOIN tables_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'FUNCTION'::text AS object_kind,
         o.identity AS object_identity, 'EXECUTE'::text AS privilege,
         pg_catalog.has_function_privilege(u.oid, o.oid, 'EXECUTE') AS allowed
  FROM roles_checked AS u CROSS JOIN functions_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'SEQUENCE'::text AS object_kind,
         o.identity AS object_identity, 'USAGE'::text AS privilege,
         pg_catalog.has_sequence_privilege(u.oid, o.oid, 'USAGE') AS allowed
  FROM roles_checked AS u CROSS JOIN sequences_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'SEQUENCE'::text AS object_kind,
         o.identity AS object_identity, 'SELECT'::text AS privilege,
         pg_catalog.has_sequence_privilege(u.oid, o.oid, 'SELECT') AS allowed
  FROM roles_checked AS u CROSS JOIN sequences_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'SEQUENCE'::text AS object_kind,
         o.identity AS object_identity, 'UPDATE'::text AS privilege,
         pg_catalog.has_sequence_privilege(u.oid, o.oid, 'UPDATE') AS allowed
  FROM roles_checked AS u CROSS JOIN sequences_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'PARAMETER'::text AS object_kind,
         o.name::text AS object_identity, 'SET'::text AS privilege,
         pg_catalog.has_parameter_privilege(u.oid, o.name, 'SET') AS allowed
  FROM roles_checked AS u CROSS JOIN parameters_checked AS o
  UNION ALL
  SELECT u.rolname AS role_name, 'PARAMETER'::text AS object_kind,
         o.name::text AS object_identity, 'ALTER SYSTEM'::text AS privilege,
         pg_catalog.has_parameter_privilege(u.oid, o.name, 'ALTER SYSTEM') AS allowed
  FROM roles_checked AS u CROSS JOIN parameters_checked AS o
)
SELECT pg_catalog.jsonb_build_array(
  role_name, object_kind, object_identity, privilege, allowed
)::text
FROM probes
ORDER BY role_name, object_kind, object_identity, privilege;
ROLLBACK;
