-- Check every ordinary FK, including NOT VALID constraints, without exposing rows.
CREATE TEMP TABLE restore_fk_integrity (identity text PRIMARY KEY, orphan_count bigint);
DO $$
DECLARE k record; join_pred text; nonnull_pred text; anynull_pred text; some_nonnull text; v bigint;
BEGIN
 FOR k IN SELECT c.*,n.nspname,t.relname,rn.nspname AS refschema,rt.relname AS reftable
 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
 JOIN pg_class rt ON rt.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=rt.relnamespace
 WHERE c.contype='f' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' LOOP
 SELECT string_agg(format('s.%I = r.%I',a.attname,b.attname),' AND ' ORDER BY x.i),
 string_agg(format('s.%I IS NOT NULL',a.attname),' AND ' ORDER BY x.i),
 string_agg(format('s.%I IS NULL',a.attname),' OR ' ORDER BY x.i),
 string_agg(format('s.%I IS NOT NULL',a.attname),' OR ' ORDER BY x.i)
 INTO join_pred,nonnull_pred,anynull_pred,some_nonnull
 FROM generate_subscripts(k.conkey,1) x(i)
 JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[x.i]
 JOIN pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=k.confkey[x.i];
 EXECUTE format('SELECT count(*) FROM %I.%I s WHERE (%s) AND NOT EXISTS (SELECT 1 FROM %I.%I r WHERE %s)',k.nspname,k.relname,nonnull_pred,k.refschema,k.reftable,join_pred) INTO v;
 IF k.confmatchtype='f' THEN
 EXECUTE format('SELECT count(*) + $1 FROM %I.%I s WHERE (%s) AND (%s)',k.nspname,k.relname,anynull_pred,some_nonnull) INTO v USING v;
 END IF;
 INSERT INTO restore_fk_integrity VALUES(k.nspname||'.'||k.relname||'.'||k.conname,v);
 END LOOP;
END $$;
SELECT identity||'|'||orphan_count FROM restore_fk_integrity ORDER BY identity;
