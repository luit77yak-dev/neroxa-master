-- RG02: immutable, read-only PG17 catalog probe against disposable restored DB.
-- Never include table data, SQL_RELEASE, auth secrets or password hashes.
BEGIN READ ONLY;
SELECT pg_catalog.jsonb_build_object(
  'functions', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identity', pg_catalog.format('%I.%I(%s)', n.nspname, p.proname,
                     pg_catalog.pg_get_function_identity_arguments(p.oid)),
      'acl', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'is_public', a.grantee = 0,
        'grantee', g.rolname,
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ))
      FROM pg_catalog.aclexplode(COALESCE(p.proacl,
        pg_catalog.acldefault('f'::"char", p.proowner))) AS a
      LEFT JOIN pg_catalog.pg_roles AS g ON g.oid = a.grantee), '[]'::jsonb)
    ))
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
  ), '[]'::jsonb),
  'relations', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identity', pg_catalog.format('%I.%I', n.nspname, c.relname),
      'acl', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'is_public', a.grantee = 0,
        'grantee', g.rolname,
        'privilege', a.privilege_type,
        'grantable', a.is_grantable
      ))
      FROM pg_catalog.aclexplode(COALESCE(c.relacl,
        pg_catalog.acldefault('r'::"char", c.relowner))) AS a
      LEFT JOIN pg_catalog.pg_roles AS g ON g.oid = a.grantee), '[]'::jsonb)
    ))
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND n.nspname !~ '^pg_'
      AND n.nspname <> 'information_schema'
  ), '[]'::jsonb)
)::text;
ROLLBACK;
