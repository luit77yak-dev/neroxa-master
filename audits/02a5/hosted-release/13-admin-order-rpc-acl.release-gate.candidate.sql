-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: dd50db6bf42a0b2c41065110d6a88f2ee7e26bf225538718a3ac2f96020666a4; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',13) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- REVIEW CANDIDATE ONLY. Never run remotely without coordinated approval.
-- Existing authenticated operators/platform identities retain execution and all
-- internal authorization/MFA checks. PUBLIC/anon are not admin consumers.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('get_admin_orders','update_admin_order_status'))<>2
 OR to_regprocedure('public.get_admin_orders(uuid,text)') IS NULL
 OR to_regprocedure('public.update_admin_order_status(uuid,text,text)') IS NULL
 THEN RAISE EXCEPTION 'Administrative order RPC overload/contract mismatch'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_orders(uuid,text),public.update_admin_order_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_orders(uuid,text),public.update_admin_order_status(uuid,text,text) TO authenticated,service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_admin_orders(uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.update_admin_order_status(uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous administrative execution remains'; END IF;
END $$;
COMMIT;
