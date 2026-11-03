-- Offline coordinated gate, NOT automatic production migration.
BEGIN;
DO $$ DECLARE f record; BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' OR
 current_setting('neroxa.legacy_phone_consumers_disabled',true) IS DISTINCT FROM 'on' OR
 to_regprocedure('public.neroxa_track_order_with_capability(uuid,uuid,text)') IS NULL THEN
 RAISE EXCEPTION 'Tracking substitution/explicit disabled consumers required'; END IF;
 FOR f IN SELECT p.oid::regprocedure AS signature,p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Inherited legacy execution remains'; END IF;
 END LOOP;
END $$;
COMMIT;
-- Not an inverse rollback: keep disabled, repair/roll forward. Never restore phone grants.
