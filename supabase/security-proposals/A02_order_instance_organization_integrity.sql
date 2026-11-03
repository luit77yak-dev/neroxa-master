-- A02 candidate patch. Not a migration; verify full FK/index behavior locally.
-- Use a composite FK to enforce that every order instance belongs to its organization.
-- This is safer than relying on RLS policies or a user-defined trigger.
BEGIN;
-- Existing orders must first be checked for mismatches (report currently counted zero).
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.neroxa_orders o
    LEFT JOIN public.neroxa_system_instances i ON i.id = o.instance_id
    WHERE i.id IS NULL OR i.organization_id IS DISTINCT FROM o.organization_id
  ) THEN
    RAISE EXCEPTION 'Existing order/instance organization mismatch; stop and reconcile';
  END IF;
END
$verify$;
-- Needed as a referenced unique key for the composite FK.
CREATE UNIQUE INDEX IF NOT EXISTS neroxa_instances_id_org_a02_uq
  ON public.neroxa_system_instances (id, organization_id);
-- PostgreSQL FK requires a non-partial unique index or unique constraint on referenced columns.
ALTER TABLE public.neroxa_orders
  ADD CONSTRAINT neroxa_orders_instance_org_a02_fkey
  FOREIGN KEY (instance_id, organization_id)
  REFERENCES public.neroxa_system_instances (id, organization_id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;
COMMIT;
-- Before production rollout: confirm nullable columns, existing FK delete semantics,
-- locks on large tables, and whether other tables also require composite integrity.
