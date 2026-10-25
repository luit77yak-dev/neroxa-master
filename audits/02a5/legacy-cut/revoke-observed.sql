-- Exact ACL delta for the TWO variants observed on iefaoaqzltvpfabyeelj.
-- Not standalone authorization. Remote use requires preflight.remote.pending.sql.
REVOKE ALL ON FUNCTION public.get_public_order_status(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.append_public_order_items_with_payment(uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE signature text; actor text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.get_public_order_status(uuid,text)','public.append_public_order_items_with_payment(uuid,text,jsonb,text)'] LOOP
  FOREACH actor IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(actor,signature,'EXECUTE') THEN RAISE EXCEPTION 'Legacy effective EXECUTE remains: % / %',signature,actor; END IF;
  END LOOP;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
