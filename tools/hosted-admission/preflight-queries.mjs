// Closed catalog/builtin queries. No caller-provided SQL, application RPC or DDL.
export const IDENTITY = `SELECT pg_catalog.json_build_object(
 'db',current_database(),'actor',current_user,'session_actor',session_user,
 'pid',pg_catalog.pg_backend_pid(),
 'start',(SELECT backend_start FROM pg_catalog.pg_stat_activity WHERE pid=pg_catalog.pg_backend_pid()),
 'clock',pg_catalog.clock_timestamp(),'read_only',pg_catalog.current_setting('transaction_read_only'),
 'ssl',(SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()),
 'tls',(SELECT version FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid()),
 'role',(SELECT pg_catalog.row_to_json(r) FROM (SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,rolinherit,rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=current_user) r),
 'database_create',pg_catalog.has_database_privilege(current_user,current_database(),'CREATE'),
 'schema_create',(SELECT count(*) FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','private','neroxa_private') AND pg_catalog.has_schema_privilege(current_user,n.oid,'CREATE')),
 'memberships',(SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)),
 'owns_business',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','neroxa_private') AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)),
 'business_write',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind IN ('r','p','v','m','f') AND pg_catalog.has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
 'business_read',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind IN ('r','p','v','m','f') AND pg_catalog.has_table_privilege(current_user,c.oid,'SELECT')),
 'definer_execute',(SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private','neroxa_private') AND p.prosecdef AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE'))
);`;

export const CATALOG = `SELECT pg_catalog.json_agg(pg_catalog.json_build_object(
 'signature',e.signature,'present',p.oid IS NOT NULL,
 'owner',pg_catalog.pg_get_userbyid(p.proowner),'definer',p.prosecdef,
 'anon_execute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY e.signature)
 FROM (VALUES
 ('public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)'),
 ('public.neroxa_track_order_with_capability(uuid,uuid,text)'),
 ('public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)'),
 ('public.neroxa_recover_group_order(uuid,uuid,jsonb)'),
 ('public.neroxa_capability_release_readiness()'),
 ('public.get_public_order_status(uuid,text)'),
 ('public.append_public_order_items_with_payment(uuid,text,jsonb,text)')
 ) e(signature) LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.signature);`;

// Every stage has an explicit psql SQLSTATE. ON_ERROR_STOP is disabled ONLY in
// this closed preflight so the two expected cancellation errors can be observed.
export function stages(parts) {
 return parts.map((sql,i)=>`${sql}\n\\echo NEROXA_STAGE_${i}_:SQLSTATE`).join('\n');
}
export const READ_IDENTITY = stages(['BEGIN READ ONLY;', IDENTITY, 'ROLLBACK;']);
export const READ_CATALOG = stages(['BEGIN READ ONLY;', CATALOG, 'ROLLBACK;']);
export const TIMEOUT = stages(['BEGIN READ ONLY;', "SET LOCAL statement_timeout='1000ms';", 'SELECT pg_catalog.pg_sleep(3);', 'ROLLBACK;']);
export const WAIT = stages(['BEGIN READ ONLY;', "SET LOCAL statement_timeout='5000ms';", 'SELECT pg_catalog.pg_sleep(4);', 'ROLLBACK;']);

const literal = s=>"'"+s.replaceAll("'","''")+"'";
// Target must be the previously authenticated A session, same role and start.
export function observeTarget(target,role,cancel=false) {
 if(!Number.isSafeInteger(target?.pid)||target.pid<=0||!/^\d{4}-\d\d-\d\dT[0-9:.]+(?:Z|[+-]\d\d:\d\d)$/.test(target.start)||!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid cancellation target');
 const where=`a.pid=${target.pid} AND a.backend_start=${literal(target.start)}::timestamptz AND a.usename=${literal(role)} AND a.usename=current_user AND a.pid<>pg_catalog.pg_backend_pid()`;
 // The only in-flight A statement allowed is our exact, fixed harmless wait.
 const active=cancel?" AND a.state='active' AND a.query='SELECT pg_catalog.pg_sleep(4);'":"";
 const value=cancel?'pg_catalog.pg_cancel_backend(a.pid)':"pg_catalog.json_build_object('pid',a.pid,'start',a.backend_start,'state',a.state,'transaction_open',a.xact_start IS NOT NULL,'wait_active',a.state='active' AND a.query LIKE 'SELECT pg_catalog.pg_sleep(%')";
 return stages(['BEGIN READ ONLY;', `SELECT ${value} FROM pg_catalog.pg_stat_activity a WHERE ${where}${active};`, 'ROLLBACK;']);
}
