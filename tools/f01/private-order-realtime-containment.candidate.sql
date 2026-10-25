-- CANDIDATE: isolated rehearsal only. No production migration or unsafe inverse.
-- Postgres Changes DELETE bypasses row filtering; keep private financial rows
-- out of the public publication. The scoped admin consumer uses REST polling.
BEGIN;
DO $$ DECLARE t text; BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Disposable explicit context required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN RAISE EXCEPTION 'Expected publication absent'; END IF;
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND puballtables) THEN RAISE EXCEPTION 'BLOCKED: FOR ALL TABLES requires separately reviewed change'; END IF;
 FOREACH t IN ARRAY ARRAY['neroxa_orders','neroxa_order_items','neroxa_order_status_history'] LOOP
  IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Expected private relation absent: %',t; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t) AND relrowsecurity) THEN RAISE EXCEPTION 'Existing RLS required: %',t; END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_rel r JOIN pg_publication p ON p.oid=r.prpubid WHERE p.pubname='supabase_realtime' AND r.prrelid=to_regclass('public.'||t)) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',t);
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('neroxa_orders','neroxa_order_items','neroxa_order_status_history')) THEN RAISE EXCEPTION 'Private publication membership remains'; END IF;
END $$;
COMMIT;
-- No RLS/ACL/body/data changes. Do not re-add these tables as automatic recovery.
