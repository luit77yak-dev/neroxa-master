-- Review-only, after all substitutes verified and consumers frozen in disposable runner.
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('app.bridge_environment',true) IS DISTINCT FROM 'local-disposable'
 OR current_setting('app.bridge_consumers_frozen',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'BRIDGE_FROZEN_DISPOSABLE_REQUIRED'; END IF;
 IF to_regclass('neroxa_bridge.journal') IS NULL THEN
  IF current_setting('app.bridge_clean_verified',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'BRIDGE_PREPARATION_REQUIRED'; END IF;
 ELSE
  IF (SELECT count(*) FROM neroxa_bridge.journal WHERE stage IN ('B','C','D'))<>3 THEN RAISE EXCEPTION 'BRIDGE_PREPARATION_REQUIRED'; END IF;
 END IF;
 IF to_regprocedure('public.neroxa_recover_group_order(uuid,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'BRIDGE_NATIVE_SUBSTITUTES_REQUIRED'; END IF;
END $$;
-- RLS does not protect TRUNCATE; never copy broad historical ACL onto the target.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','neroxa_private') AND c.relkind='r' AND c.relname LIKE 'neroxa_%'
 LOOP EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE %I.%I FROM PUBLIC,anon,authenticated',r.nspname,r.relname); END LOOP;
END $$;
-- Historical reads require scoped Auth through get_admin_orders / operational detail.
-- Phone is not proof; never invent a buyer capability for a historical order.
REVOKE ALL ON FUNCTION public.get_public_order_status(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_order_status(uuid,text) TO service_role;

-- Each signature keeps its explicit role grants. PUBLIC never supplies execution implicitly.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure::text sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','neroxa_private') AND p.prokind='f'
 LOOP EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',f.sig); END LOOP;
END $$;
-- Upgrade anchors have no buyer proof. New hashes and capabilities MUST NOT be retrofitted.
DO $$ BEGIN
 IF to_regclass('neroxa_bridge.legacy_order_anchors') IS NOT NULL THEN
  EXECUTE $ddl$CREATE FUNCTION neroxa_bridge.reject_legacy_buyer_proof() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
  BEGIN
   IF EXISTS(SELECT 1 FROM neroxa_bridge.legacy_order_anchors a WHERE a.order_id=NEW.order_id)
   THEN RAISE EXCEPTION 'Historical order has no new buyer proof' USING ERRCODE='42501'; END IF;
   RETURN NEW;
  END; $fn$;$ddl$;
  REVOKE ALL ON FUNCTION neroxa_bridge.reject_legacy_buyer_proof() FROM PUBLIC,anon,authenticated,service_role;
  CREATE TRIGGER bridge_no_historical_intent BEFORE INSERT OR UPDATE ON private.neroxa_group_order_intents FOR EACH ROW EXECUTE FUNCTION neroxa_bridge.reject_legacy_buyer_proof();
  CREATE TRIGGER bridge_no_historical_capability BEFORE INSERT OR UPDATE ON private.neroxa_order_amendment_capabilities FOR EACH ROW EXECUTE FUNCTION neroxa_bridge.reject_legacy_buyer_proof();
 END IF;
END $$;
