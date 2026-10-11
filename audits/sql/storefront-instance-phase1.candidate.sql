-- PHASE 1 CANDIDATE ONLY. Run in isolated compatible clone first.
-- Add nullable instance identifiers without changing legacy organization lookup yet.
BEGIN;
ALTER TABLE public.neroxa_storefront_settings ADD COLUMN IF NOT EXISTS instance_id uuid;
ALTER TABLE public.neroxa_storefront_delivery_zones ADD COLUMN IF NOT EXISTS instance_id uuid;
CREATE INDEX IF NOT EXISTS neroxa_storefront_zones_instance_idx ON public.neroxa_storefront_delivery_zones(instance_id);
CREATE UNIQUE INDEX IF NOT EXISTS neroxa_storefront_settings_instance_unique
 ON public.neroxa_storefront_settings(instance_id) WHERE instance_id IS NOT NULL;
-- FK NOT VALID prevents full historical scan; new rows are still checked.
ALTER TABLE public.neroxa_storefront_settings
 ADD CONSTRAINT neroxa_storefront_settings_instance_fk FOREIGN KEY(instance_id)
 REFERENCES public.neroxa_system_instances(id) NOT VALID;
ALTER TABLE public.neroxa_storefront_delivery_zones
 ADD CONSTRAINT neroxa_storefront_zones_instance_fk FOREIGN KEY(instance_id)
 REFERENCES public.neroxa_system_instances(id) NOT VALID;
COMMIT;

-- PHASE 1B: conservative backfill, only when organization has exactly ONE instance.
-- NOTE: Re-run preflight and confirm no concurrent instance creation.
WITH unique_instances AS (
 SELECT organization_id,min(id::text)::uuid AS instance_id
 FROM public.neroxa_system_instances GROUP BY organization_id HAVING count(*)=1
)
UPDATE public.neroxa_storefront_settings s SET instance_id=u.instance_id
FROM unique_instances u WHERE s.organization_id=u.organization_id AND s.instance_id IS NULL;
WITH unique_instances AS (
 SELECT organization_id,min(id::text)::uuid AS instance_id
 FROM public.neroxa_system_instances GROUP BY organization_id HAVING count(*)=1
)
UPDATE public.neroxa_storefront_delivery_zones z SET instance_id=u.instance_id
FROM unique_instances u WHERE z.organization_id=u.organization_id AND z.instance_id IS NULL;

-- PHASE 1C: inspection only; zero rows required before cutover.
SELECT 'settings' AS source,organization_id,count(*) AS unresolved
 FROM public.neroxa_storefront_settings WHERE instance_id IS NULL GROUP BY organization_id
UNION ALL
SELECT 'zones',organization_id,count(*) FROM public.neroxa_storefront_delivery_zones
 WHERE instance_id IS NULL GROUP BY organization_id;
-- PHASE 2 NOT INCLUDED: change settings PK, replace RLS, update RPCs, validate FKs.
-- Do not apply phase 1B to production until concurrency and rollback are approved.
