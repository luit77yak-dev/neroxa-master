-- NOT APPLIED. Target transport must be nominally bound to project
-- iefaoaqzltvpfabyeelj. Hashes are drift guards, not database authentication.
-- Preconditions OUTSIDE SQL: separately authorized window/operator; verified
-- consumer suspension/migration; admission of the actual capability backend.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $$ DECLARE r record; BEGIN
 IF to_regprocedure('public.neroxa_track_order_with_capability(uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)') IS NULL
 OR to_regprocedure('public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)') IS NULL
 OR to_regprocedure('public.neroxa_recover_group_order(uuid,uuid,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'BLOCKED: capability backend not installed/admitted; do not revoke legacy RPCs';
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.proname IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment'))<>2 THEN RAISE EXCEPTION 'BLOCKED: legacy variant inventory drift'; END IF;
 FOR r IN SELECT * FROM (VALUES
  ('public.get_public_order_status(uuid,text)','7c0a6d7b1118b802913bc5ef2c3896016fbbe1f0e403a34728d06bcba7d6ba5d'),
  ('public.append_public_order_items_with_payment(uuid,text,jsonb,text)','36eae9d01cb5c927ae34d2ce7d4319c7ebdd6ce89d5e1b8e6b22a8e68c1c6d65')
 ) AS expected(signature,sha256) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(r.signature) AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.sha256
   AND p.proacl::text='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') THEN
   RAISE EXCEPTION 'BLOCKED: remote function/ACL preimage drift: %',r.signature;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND p.proname NOT IN ('get_public_order_status','append_public_order_items','append_public_order_items_with_payment') AND p.prosrc ~* '(get_public_order_status|append_public_order_items_with_payment|append_public_order_items)') THEN RAISE EXCEPTION 'BLOCKED: wrapper still calls legacy RPC'; END IF;
END $$;
-- Packaging inserts the exact bytes of revoke-observed.sql here, then COMMIT.
