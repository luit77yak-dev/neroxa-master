-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: f06c49a835128063c95d1dae7272502a1831ff1009c3a9dc430edae7b633855a; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',7) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- PHASE 2 STRUCTURAL CUTOVER CANDIDATE. ISOLATED DATABASE ONLY.
-- Run after phase 1 and after all legacy settings writers have migrated.
-- CAUTION: inspect dependent foreign keys/views before dropping settings PK.
BEGIN;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.neroxa_storefront_settings WHERE instance_id IS NULL)
 OR EXISTS (SELECT 1 FROM public.neroxa_storefront_delivery_zones WHERE instance_id IS NULL)
 THEN RAISE EXCEPTION 'Unresolved instance_id rows: manual reconciliation required'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.neroxa_storefront_settings s
  JOIN public.neroxa_system_instances i ON i.id=s.instance_id
  WHERE i.organization_id<>s.organization_id
 ) OR EXISTS (
  SELECT 1 FROM public.neroxa_storefront_delivery_zones z
  JOIN public.neroxa_system_instances i ON i.id=z.instance_id
  WHERE i.organization_id<>z.organization_id
 ) THEN RAISE EXCEPTION 'Organization/instance mismatch'; END IF;
END $$;
-- A separate primary key on instance_id enables two settings rows in same organization.
-- Existing dependent FK constraints must be inspected before running this block.
ALTER TABLE public.neroxa_storefront_settings DROP CONSTRAINT neroxa_storefront_settings_pkey;
ALTER TABLE public.neroxa_storefront_settings ALTER COLUMN instance_id SET NOT NULL;
ALTER TABLE public.neroxa_storefront_settings ADD CONSTRAINT neroxa_storefront_settings_pkey PRIMARY KEY(instance_id);
ALTER TABLE public.neroxa_storefront_delivery_zones ALTER COLUMN instance_id SET NOT NULL;
ALTER TABLE public.neroxa_storefront_settings VALIDATE CONSTRAINT neroxa_storefront_settings_instance_fk;
ALTER TABLE public.neroxa_storefront_delivery_zones VALIDATE CONSTRAINT neroxa_storefront_zones_instance_fk;
COMMIT;
-- NEXT CANDIDATE REQUIRED: atomic RLS replacement for settings/zones,
-- instance-org integrity triggers and safe create/update consumers.
-- Do not run this file until FK dependency preflight and rollback rehearsals pass.
