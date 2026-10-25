-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 959170218f352c6d7b41e7dcc011ab8e092ded44e8a5a8e8855a1c8947f52c64; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',8) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- CANDIDATE ONLY: execute after settings/zones instance_id NOT NULL cutover.
-- Existing permissive org policies must be dropped in the same transaction.
-- First inspect exact policy names on target database.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='neroxa_storefront_settings'
 AND column_name='instance_id' AND is_nullable='YES')
 THEN RAISE EXCEPTION 'Settings instance_id must be NOT NULL'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='neroxa_storefront_delivery_zones'
 AND column_name='instance_id' AND is_nullable='YES')
 THEN RAISE EXCEPTION 'Zone instance_id must be NOT NULL'; END IF;
END $$;
-- Drop every legacy org-scoped policy for these tables, not just known names.
DO $$
DECLARE p record;
BEGIN
 FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies
 WHERE schemaname='public' AND tablename IN
 ('neroxa_storefront_settings','neroxa_storefront_delivery_zones')
 LOOP
  EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY "instance settings read" ON public.neroxa_storefront_settings
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(instance_id) OR public.neroxa_is_platform_member());
CREATE POLICY "instance settings insert" ON public.neroxa_storefront_settings
 FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
CREATE POLICY "instance settings update" ON public.neroxa_storefront_settings
 FOR UPDATE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]))
 WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
CREATE POLICY "instance settings delete" ON public.neroxa_storefront_settings
 FOR DELETE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
CREATE POLICY "instance zones read" ON public.neroxa_storefront_delivery_zones
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(instance_id) OR public.neroxa_is_platform_member());
CREATE POLICY "instance zones insert" ON public.neroxa_storefront_delivery_zones
 FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
CREATE POLICY "instance zones update" ON public.neroxa_storefront_delivery_zones
 FOR UPDATE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]))
 WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
CREATE POLICY "instance zones delete" ON public.neroxa_storefront_delivery_zones
 FOR DELETE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));
COMMIT;
-- REQUIRED FOLLOW-UP: composite instance/org integrity trigger before deployment.
