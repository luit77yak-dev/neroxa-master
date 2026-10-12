-- Digests only: never return rows, Auth secrets or personal fields to the runner.
CREATE TEMP TABLE restore_data_digest (identity text PRIMARY KEY, digest text);
DO $$
DECLARE r record; v text;
BEGIN
 FOR r IN SELECT n.nspname,c.relname,c.oid,c.relkind FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','S') AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
 AND (NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 OR EXISTS (SELECT 1 FROM pg_extension e WHERE c.oid=ANY(e.extconfig)))
 ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('SELECT count(*)::text || '':'' || md5(coalesce(string_agg(to_jsonb(t)::text, E''\n'' ORDER BY to_jsonb(t)::text), '''')) FROM %I.%I t',r.nspname,r.relname) INTO v;
 INSERT INTO restore_data_digest VALUES ((CASE WHEN r.relkind='S' THEN 'sequence|' ELSE 'table|' END)||r.nspname||'.'||r.relname,v);
 END LOOP;
END $$;
SELECT identity || '|' || digest FROM restore_data_digest ORDER BY identity;
