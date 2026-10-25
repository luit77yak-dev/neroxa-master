BEGIN;
DO $recover$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',2) THEN RAISE EXCEPTION 'Recovery admission required'; END IF; IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='neroxa_storefront_settings_instance_fk') OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.neroxa_storefront_settings'::regclass AND attname='instance_id' AND atttypid='uuid'::regtype AND NOT attnotnull) THEN RAISE EXCEPTION 'Unexpected partial schema'; END IF; IF EXISTS(SELECT 1 FROM public.neroxa_storefront_settings s WHERE (SELECT count(*) FROM public.neroxa_system_instances i WHERE i.organization_id=s.organization_id)<>1) THEN RAISE EXCEPTION 'Unresolved disposition/mapping; STOP'; END IF; END $recover$;


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

COMMIT;
