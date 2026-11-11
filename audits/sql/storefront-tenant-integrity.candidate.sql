-- Isolated test candidate: enforce instance/org consistency and immutable tenancy.
-- Must run AFTER phase 1 backfill; BEFORE phase 2 RLS cutover.
BEGIN;
CREATE OR REPLACE FUNCTION public.neroxa_guard_storefront_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE expected_org uuid;
BEGIN
 IF TG_OP='UPDATE' AND
 (NEW.instance_id IS DISTINCT FROM OLD.instance_id OR
  NEW.organization_id IS DISTINCT FROM OLD.organization_id)
 THEN RAISE EXCEPTION 'Tenant reassignment forbidden' USING ERRCODE='23514'; END IF;
 IF NEW.instance_id IS NULL THEN
  RAISE EXCEPTION 'Missing instance_id' USING ERRCODE='23514';
 END IF;
 SELECT i.organization_id INTO expected_org
 FROM public.neroxa_system_instances i WHERE i.id=NEW.instance_id;
 IF expected_org IS NULL OR NEW.organization_id IS DISTINCT FROM expected_org
 THEN RAISE EXCEPTION 'Instance and organization mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS neroxa_settings_tenant_guard ON public.neroxa_storefront_settings;
CREATE TRIGGER neroxa_settings_tenant_guard BEFORE INSERT OR UPDATE
ON public.neroxa_storefront_settings FOR EACH ROW
EXECUTE FUNCTION public.neroxa_guard_storefront_tenant();
DROP TRIGGER IF EXISTS neroxa_zones_tenant_guard ON public.neroxa_storefront_delivery_zones;
CREATE TRIGGER neroxa_zones_tenant_guard BEFORE INSERT OR UPDATE
ON public.neroxa_storefront_delivery_zones FOR EACH ROW
EXECUTE FUNCTION public.neroxa_guard_storefront_tenant();
DROP TRIGGER IF EXISTS neroxa_orders_tenant_guard ON public.neroxa_orders;
CREATE TRIGGER neroxa_orders_tenant_guard BEFORE INSERT OR UPDATE
ON public.neroxa_orders FOR EACH ROW
EXECUTE FUNCTION public.neroxa_guard_storefront_tenant();
COMMIT;
-- Caveat: old clients that insert settings/zones without instance_id will fail.
-- Phase ordering requires consumer dual-write deployment first.
-- Additional protection required against changing parent instance.organization_id.
