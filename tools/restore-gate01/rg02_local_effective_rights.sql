-- RG02: bounded, read-only local effective privilege witness (PG17).
-- NEVER run on commercial DB. The source globals SQL is NOT executed here.
-- This measures ONLY isolated post-restore rights, NOT equivalence to source.
-- No row data, identifiers, grantees, object names, SQL or secrets exported.
BEGIN READ ONLY;
WITH
roles_checked AS MATERIALIZED (
  SELECT oid FROM pg_catalog.pg_roles WHERE rolname !~ '^pg_'
),
schemas_checked AS MATERIALIZED (
  SELECT oid FROM pg_catalog.pg_namespace
  WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
),
tables_checked AS MATERIALIZED (
  SELECT c.oid FROM pg_catalog.pg_class AS c
  JOIN schemas_checked AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f')
),
functions_checked AS MATERIALIZED (
  SELECT p.oid FROM pg_catalog.pg_proc AS p
  JOIN schemas_checked AS n ON n.oid = p.pronamespace
),
sequences_checked AS MATERIALIZED (
  SELECT c.oid FROM pg_catalog.pg_class AS c
  JOIN schemas_checked AS n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S'
),
parameters_checked AS MATERIALIZED (
  SELECT parname FROM pg_catalog.pg_parameter_acl
),
probes AS (
  SELECT 'role_member'::text AS probe, pg_catalog.pg_has_role(u.oid, obj.oid, 'MEMBER') AS allowed
  FROM roles_checked u CROSS JOIN roles_checked obj
  WHERE u.oid <> obj.oid
  UNION ALL
  SELECT 'role_usage'::text AS probe, pg_catalog.pg_has_role(u.oid, obj.oid, 'USAGE') AS allowed
  FROM roles_checked u CROSS JOIN roles_checked obj
  WHERE u.oid <> obj.oid
  UNION ALL
  SELECT 'role_set'::text AS probe, pg_catalog.pg_has_role(u.oid, obj.oid, 'SET') AS allowed
  FROM roles_checked u CROSS JOIN roles_checked obj
  WHERE u.oid <> obj.oid
  UNION ALL
  SELECT 'schema_usage'::text AS probe, pg_catalog.has_schema_privilege(u.oid, obj.oid, 'USAGE') AS allowed
  FROM roles_checked u CROSS JOIN schemas_checked obj
  UNION ALL
  SELECT 'schema_create'::text AS probe, pg_catalog.has_schema_privilege(u.oid, obj.oid, 'CREATE') AS allowed
  FROM roles_checked u CROSS JOIN schemas_checked obj
  UNION ALL
  SELECT 'table_select'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'SELECT') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_insert'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'INSERT') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_update'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'UPDATE') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_delete'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'DELETE') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_truncate'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'TRUNCATE') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_references'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'REFERENCES') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_trigger'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'TRIGGER') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'table_maintain'::text AS probe, pg_catalog.has_table_privilege(u.oid, obj.oid, 'MAINTAIN') AS allowed
  FROM roles_checked u CROSS JOIN tables_checked obj
  UNION ALL
  SELECT 'function_execute'::text AS probe, pg_catalog.has_function_privilege(u.oid, obj.oid, 'EXECUTE') AS allowed
  FROM roles_checked u CROSS JOIN functions_checked obj
  UNION ALL
  SELECT 'sequence_usage'::text AS probe, pg_catalog.has_sequence_privilege(u.oid, obj.oid, 'USAGE') AS allowed
  FROM roles_checked u CROSS JOIN sequences_checked obj
  UNION ALL
  SELECT 'sequence_select'::text AS probe, pg_catalog.has_sequence_privilege(u.oid, obj.oid, 'SELECT') AS allowed
  FROM roles_checked u CROSS JOIN sequences_checked obj
  UNION ALL
  SELECT 'sequence_update'::text AS probe, pg_catalog.has_sequence_privilege(u.oid, obj.oid, 'UPDATE') AS allowed
  FROM roles_checked u CROSS JOIN sequences_checked obj
  UNION ALL
  SELECT 'parameter_set'::text AS probe, pg_catalog.has_parameter_privilege(u.oid, obj.parname, 'SET') AS allowed
  FROM roles_checked u CROSS JOIN parameters_checked obj
  UNION ALL
  SELECT 'parameter_alter_system'::text AS probe, pg_catalog.has_parameter_privilege(u.oid, obj.parname, 'ALTER SYSTEM') AS allowed
  FROM roles_checked u CROSS JOIN parameters_checked obj
),
expected_probes(probe) AS (
  VALUES
    ('role_member'),
    ('role_usage'),
    ('role_set'),
    ('schema_usage'),
    ('schema_create'),
    ('table_select'),
    ('table_insert'),
    ('table_update'),
    ('table_delete'),
    ('table_truncate'),
    ('table_references'),
    ('table_trigger'),
    ('table_maintain'),
    ('function_execute'),
    ('sequence_usage'),
    ('sequence_select'),
    ('sequence_update'),
    ('parameter_set'),
    ('parameter_alter_system')
),
summary AS (
  SELECT e.probe,
    COUNT(p.probe)::bigint AS checked,
    COUNT(*) FILTER (WHERE p.allowed IS TRUE)::bigint AS granted,
    COUNT(*) FILTER (WHERE p.allowed IS FALSE)::bigint AS denied,
    COUNT(*) FILTER (WHERE p.probe IS NOT NULL AND p.allowed IS NULL)::bigint AS unknown
  FROM expected_probes e LEFT JOIN probes p ON p.probe = e.probe
  GROUP BY e.probe
)
SELECT pg_catalog.jsonb_build_object(
  'scope', 'ISOLATED_LOCAL_PG17_ONLY',
  'major', pg_catalog.current_setting('server_version_num')::int / 10000,
  'populations', pg_catalog.jsonb_build_object(
    'roles', (SELECT COUNT(*) FROM roles_checked),
    'schemas', (SELECT COUNT(*) FROM schemas_checked),
    'tables', (SELECT COUNT(*) FROM tables_checked),
    'functions', (SELECT COUNT(*) FROM functions_checked),
    'sequences', (SELECT COUNT(*) FROM sequences_checked),
    'parameters', (SELECT COUNT(*) FROM parameters_checked)
  ),
  'rights', (SELECT pg_catalog.jsonb_object_agg(probe,
    pg_catalog.jsonb_build_object(
      'checked', checked,
      'granted', granted,
      'denied', denied,
      'unknown', unknown
    )) FROM summary)
)::text;
ROLLBACK;
