-- CANDIDATE ONLY, independent post-install unit 34. No legacy RPC change.
-- Catalog fingerprints reuse native 40214203640; atomic registration body is
-- derived from unit33 source (not an independent security oracle).
BEGIN;
DO $$BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',34) THEN RAISE EXCEPTION 'Hosted unit admission required';END IF;END$$;
CREATE FUNCTION public.neroxa_capability_release_readiness() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $ready$
DECLARE good boolean;
BEGIN
 WITH expected(signature,body_md5,definer,service_exec) AS (VALUES
('private.neroxa_assert_store_open(uuid)','24d5987399c608bbbd17163bf02e0c97',true,false),
('private.neroxa_prepare_group_item(uuid,jsonb)','1353ca2f110b2a85993fa657ffae3643',true,false),
('private.neroxa_recovery_order_snapshot(uuid,uuid)','3160d2674ddd8862990215f0a52fdc40',false,false),
('public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','e96d1e1eb9c74b061bc97378f6a3bbf0',true,true),
('public.neroxa_checkout_reserve_quota(uuid,text)','0415a2c2dedfc64f7df70781651cfae5',true,true),
('public.neroxa_recover_group_order(uuid,uuid,jsonb)','dc2823818c7c970d372a6646422c9c34',true,true),
('public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)','86f7797568caec5570a9f1c75ce34153',true,true),
('public.neroxa_register_tracking_capability(uuid,uuid,uuid,text)','c9f4530f4bc05dac2af8c174214a0d57',true,true),
('public.neroxa_track_order_with_capability(uuid,uuid,text)','ed80161ea63589ceb6a5f34a256454eb',true,true),
('public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)','0abdcf61972370fdf880989be38c4446',true,true)
 ) SELECT bool_and(coalesce(p.oid IS NOT NULL AND md5(p.prosrc)=e.body_md5
 AND p.prosecdef=e.definer AND pg_get_userbyid(p.proowner)='postgres'
 AND p.proconfig=ARRAY['search_path=""']::text[]
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND has_function_privilege('service_role',p.oid,'EXECUTE')=e.service_exec,false))
 INTO good FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
 good:=coalesce(good,false) AND NOT EXISTS (
 SELECT 1 FROM (VALUES ('private.neroxa_tracking_capabilities'),('private.neroxa_order_amendment_capabilities'),('private.neroxa_order_amendment_operations')) t(name)
 LEFT JOIN pg_class c ON c.oid=to_regclass(t.name)
 WHERE c.oid IS NULL OR NOT c.relrowsecurity
 OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'));
 good:=good AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('neroxa_orders','neroxa_order_items','neroxa_order_history'));
 RETURN jsonb_build_object('ready',good,'project','iefaoaqzltvpfabyeelj','release','6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1','checked_at',clock_timestamp());
END $ready$;
REVOKE ALL ON FUNCTION public.neroxa_capability_release_readiness() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_capability_release_readiness() TO service_role;
COMMIT;
