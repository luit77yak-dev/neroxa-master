-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 67011e4dc707703f183e737852021a8b6e3ae26364056e86fe996f2998696264; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',21) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- Disposable Master profile only, after exact 02A2 manifest and scoped-order-access.
-- No automatic migration. No data mutation or global Master authorization change.
BEGIN;
DO $$ DECLARE t text; BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',21) OR
 to_regprocedure('neroxa_private.has_delivery_instance_role(uuid,public.neroxa_organization_role[])') IS NULL THEN
 RAISE EXCEPTION '02A4 requires disposable Master scoped baseline'; END IF;
 FOREACH t IN ARRAY ARRAY['neroxa_storefront_availability','neroxa_storefront_weekly_hours','neroxa_storefront_special_days','neroxa_storefront_special_hours'] LOOP
 IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'Missing availability relation %',t; END IF;
 -- Existing permissive platform policies remain AND-capped. SELECT and every
 -- write require an explicit operational role on this instance, including AAL2
 -- for platform staff through the existing helper. PUBLIC policies cannot OR out.
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('DROP POLICY IF EXISTS mission02a4_availability_scope ON public.%I',t);
 EXECUTE format('CREATE POLICY mission02a4_availability_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY[''OWNER'',''ADMIN'',''MANAGER'']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY[''OWNER'',''ADMIN'',''MANAGER'']::public.neroxa_organization_role[]))',t);
 -- Native public storefront RPC projects intentional schedule data. Raw tables
 -- and inherited PUBLIC grants must never become an anonymous private API.
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon',t);
 END LOOP;
END $$;
COMMIT;
-- No reverse policy DROP/unsafe grant rollback. Preserve containment and roll
-- forward with a reviewed successor; transactional abort is separately tested.
