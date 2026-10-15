-- Pre-gate ONLY, local disposable native PostgreSQL, catalog reads.
-- No DDL/DML/ACL mutation, no bodies/credentials/customer rows printed.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='30s';
WITH
fn AS (
 SELECT p.oid,p.oid::regprocedure::text AS signature,n.nspname AS schema_name,
  p.proname AS name,pg_get_userbyid(p.proowner) AS owner,
  r.rolsuper AS owner_superuser,r.rolbypassrls AS owner_bypassrls,
  p.prosecdef AS security_definer,p.proacl::text AS explicit_acl,md5(p.prosrc) AS body_md5,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname IN ('public','private','neroxa_private')
 AND (p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment','neroxa_track_order_with_capability','neroxa_register_tracking_capability')
 OR p.prosrc ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)')
),
grants AS (
 SELECT f.signature,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
 pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
 FROM fn f JOIN pg_proc p ON p.oid=f.oid
 CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
),
defaults AS (
 SELECT pg_get_userbyid(d.defaclrole) AS owner,coalesce(n.nspname,'GLOBAL') AS schema_name,
 d.defaclobjtype AS object_type,d.defaclacl::text AS acl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclobjtype='f' AND (n.nspname IN ('public','private','neroxa_private') OR n.oid IS NULL)
),
inherited AS (
 SELECT pg_get_userbyid(m.member) AS member_name,pg_get_userbyid(m.roleid) AS parent_role,
 m.inherit_option,m.set_option,m.admin_option
 FROM pg_auth_members m
 WHERE pg_get_userbyid(m.member) IN ('anon','authenticated','service_role')
 OR pg_get_userbyid(m.roleid) IN ('anon','authenticated','service_role')
),
views AS (
 SELECT n.nspname AS schema_name,c.relname AS name,pg_get_userbyid(c.relowner) AS owner,
 c.relkind AS kind,c.reloptions::text AS options,md5(pg_get_viewdef(c.oid,true)) AS body_md5
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind IN ('v','m')
 AND pg_get_viewdef(c.oid,true) ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)'
)
SELECT jsonb_build_object(
 'kind','F02_PRE_GATE_PG_CATALOG_ONLY','legacy_gate_applied',false,
 'consumer_disablement_evidenced',false,'release_approved',false,
 'legacy_function_count',(SELECT count(*) FROM fn WHERE name IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment')),
 'functions',coalesce((SELECT jsonb_agg(to_jsonb(f)-'oid' ORDER BY signature) FROM fn f),'[]'::jsonb),
 'grants',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY signature,grantee) FROM grants g),'[]'::jsonb),
 'default_acl',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY owner,schema_name) FROM defaults d),'[]'::jsonb),
 'inherited_roles',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY member_name,parent_role) FROM inherited m),'[]'::jsonb),
 'view_wrappers',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY schema_name,name) FROM views v),'[]'::jsonb)
)::text;
COMMIT;
