-- Metadata-only supplement: pg_dump can omit bootstrap ACLs of extension members.
-- Generated exclusively from the disposable source. No rows or role passwords.
WITH objects AS (
 SELECT 'SCHEMA' AS kind,format('%I',n.nspname) AS identity,n.nspowner AS owner,n.nspacl AS acl,'n'::"char" AS aclkind
 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
 AND (EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_namespace'::regclass AND d.objid=n.oid AND d.deptype='e') OR n.nspname IN ('graphql','graphql_public'))
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,format('%I.%I',n.nspname,c.relname),c.relowner,c.relacl,CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','v','m','S','f') AND n.nspname NOT LIKE 'pg_%'
 AND EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 UNION ALL
 SELECT CASE WHEN p.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),p.proowner,p.proacl,'f'::"char"
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%'
 AND EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
 UNION ALL
 SELECT 'TYPE',format('%I.%I',n.nspname,t.typname),t.typowner,t.typacl,'T'::"char"
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND t.typcategory<>'A'
 AND EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')
), metadata AS (
 SELECT o.*, (SELECT string_agg(format('%I',rolname),', ' ORDER BY rolname) FROM pg_roles) AS recipients,
 (SELECT string_agg(format('SET ROLE %I; GRANT %s ON %s %s TO %s%s;',pg_get_userbyid(a.grantor),a.privilege_type,o.kind,o.identity,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE format('%I',pg_get_userbyid(a.grantee)) END,CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END),E'\n' ORDER BY a.grantor=o.owner DESC,a.is_grantable DESC,a.grantor,a.grantee,a.privilege_type)
 FROM aclexplode(coalesce(o.acl,acldefault(o.aclkind,o.owner))) a) AS grants
 FROM objects o
)
SELECT sql FROM (
 SELECT 0 AS stage,'' AS identity,'BEGIN;' AS sql UNION ALL
 SELECT 1,identity,format('RESET ROLE; REVOKE ALL ON %s %s FROM PUBLIC, %s;%s%s',kind,identity,recipients,E'\n',coalesce(grants,'')) FROM metadata
 UNION ALL SELECT 2,'','RESET ROLE; COMMIT;'
) instructions ORDER BY stage,identity;
