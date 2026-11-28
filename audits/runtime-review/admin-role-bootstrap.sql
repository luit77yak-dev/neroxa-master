-- REVIEW ONLY. Execute only after independent approval of these exact bytes.
-- Commercial project must be verified by the provisioning operator outside SQL.
-- Orders only, NOT the Master catalog editor. No password or LOGIN.
DO $bootstrap$
DECLARE
  target text := 'neroxa_commercial_admin_runtime';
  allowed oid[] := ARRAY[
    to_regprocedure('public.get_admin_order_detail(uuid,uuid)')::oid,
    to_regprocedure('public.get_admin_orders(uuid,text)')::oid,
    to_regprocedure('public.neroxa_claim_cloudflare_grant(text,timestamptz,text)')::oid,
    to_regprocedure('public.update_admin_order_status(uuid,text,text)')::oid
  ];
  expected text[] := ARRAY[
    '0a9518ff6774be85edb46cdf1f6a91fc',
    '2c031612ca0a8d55d90c6fb34bd83ed1',
    'ae94dbf915668783c67ecdf42ae540a3',
    'e0701a00462b46be67f6cdae09f60a4f'
  ];
  role_oid oid;
  operator_oid oid;
  i integer;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' OR session_user <> 'postgres' THEN RAISE EXCEPTION 'Wrong database or operator'; END IF;
  IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 OR current_setting('createrole_self_grant') <> '' THEN RAISE EXCEPTION 'Unexpected PostgreSQL role creation configuration'; END IF;
  SELECT oid INTO STRICT operator_oid FROM pg_roles WHERE rolname=current_user AND rolcreaterole AND NOT rolsuper;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target) THEN RAISE EXCEPTION 'Unexpected role already exists'; END IF;
  FOR i IN 1..4 LOOP
    IF allowed[i] IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid=allowed[i] AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
      AND md5(pg_get_functiondef(p.oid))=expected[i]
      AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
    ) THEN RAISE EXCEPTION 'Admin function preimage mismatch: %',i; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neroxa_commercial_runtime' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit) THEN RAISE EXCEPTION 'Buyer role drift'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(allowed[1:2] || allowed[4:4]) f(oid) WHERE has_function_privilege('neroxa_commercial_runtime',f.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Buyer privilege drift'; END IF;
  CREATE ROLE neroxa_commercial_admin_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
  GRANT CONNECT ON DATABASE postgres TO neroxa_commercial_admin_runtime;
  GRANT USAGE ON SCHEMA public TO neroxa_commercial_admin_runtime;
  GRANT EXECUTE ON FUNCTION public.get_admin_order_detail(uuid,uuid), public.get_admin_orders(uuid,text), public.neroxa_claim_cloudflare_grant(text,timestamptz,text), public.update_admin_order_status(uuid,text,text) TO neroxa_commercial_admin_runtime;
  SELECT oid INTO STRICT role_oid FROM pg_roles WHERE rolname=target AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=5;
  -- PostgreSQL 17 automatically grants ADMIN-only membership to the
  -- nonsuperuser creator. OID 10 is the observed bootstrap grantor.
  -- This does not constrain the trusted role provisioning operator.
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_oid)
    OR (SELECT count(*) FROM pg_auth_members WHERE roleid=role_oid)<>1
    OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=role_oid AND member=operator_oid AND grantor=10 AND admin_option AND NOT inherit_option AND NOT set_option)
  THEN RAISE EXCEPTION 'Unexpected role membership'; END IF;
  IF has_database_privilege(target,current_database(),'CREATE') OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege(target,n.oid,'CREATE')) THEN RAISE EXCEPTION 'Unexpected persistent create privileges'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege(target,n.oid,'USAGE') AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege(target,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(target,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN RAISE EXCEPTION 'Unexpected direct application table privileges'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname NOT LIKE 'pg_%' AND has_schema_privilege(target,n.oid,'USAGE') AND has_sequence_privilege(target,c.oid,'USAGE,SELECT,UPDATE')) THEN RAISE EXCEPTION 'Unexpected application sequence privileges'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(allowed) f(oid) WHERE NOT has_function_privilege(target,f.oid,'EXECUTE')) OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prorettype NOT IN ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype) AND has_schema_privilege(target,n.oid,'USAGE') AND has_function_privilege(target,p.oid,'EXECUTE') AND NOT p.oid=ANY(allowed)) THEN RAISE EXCEPTION 'Unexpected effective application function ACL'; END IF;
END
$bootstrap$;
-- No LOGIN, password, explicit role membership, direct table grants,
-- buyer ACL modification, Data API change, or cutover.
-- Independent post-commit readback required.
