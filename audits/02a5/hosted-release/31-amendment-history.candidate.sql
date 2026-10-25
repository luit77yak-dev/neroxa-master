-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 1a2406fc6394f9626ceda25dbfe374ab6081af9b54a698f87b8bb88c07af3fc3; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',31) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- Local disposable candidate ONLY. After the three unchanged amendment units.
-- No legacy ACL revocation and no consumer gate. Preserve NOT_SETTLED.
BEGIN;
DO $patch$
DECLARE signature regprocedure := 'public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)'::regprocedure; definition text;
BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',31) THEN RAISE EXCEPTION 'Disposable intent required'; END IF;
 IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid=signature) IS DISTINCT FROM '32c5fbee5679eb0147f8b0bd3961f9fb' THEN RAISE EXCEPTION 'Amendment history predecessor drift'; END IF;
 SELECT pg_get_functiondef(signature) INTO definition;
 definition := replace(definition,$before$IF v_group THEN INSERT INTO public.neroxa_order_status_history(order_id,from_status,to_status,note) VALUES(p_order_id,v_order.status,v_order.status,'GROUP_ADDONS_V1 items appended; NOT_SETTLED'); END IF;$before$,$after$INSERT INTO public.neroxa_order_status_history(order_id,from_status,to_status,note) VALUES(p_order_id,v_order.status,v_order.status,CASE WHEN v_group THEN 'GROUP_ADDONS_V1 items appended; NOT_SETTLED' ELSE 'CAPABILITY items appended; NOT_SETTLED' END);$after$);
 EXECUTE definition;
 IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'Unsafe amendment effective ACL'; END IF;
END
$patch$;
COMMIT;
