-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 385d4446003c5604f9e18a0ebbf1b5f1c92d83fd11655db6cdd9815e7547011e; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',3) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- Candidate only. Do not deploy before reviewing dependencies and running tests.
-- Preserve existing category deletion behavior: ON DELETE SET NULL for category_id.
-- A composite FK would also null instance_id under SET NULL, so use a constraint trigger instead.
CREATE OR REPLACE FUNCTION public.neroxa_validate_product_category_instance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.neroxa_storefront_categories c
    WHERE c.id = NEW.category_id AND c.instance_id = NEW.instance_id
  ) THEN
    RAISE EXCEPTION 'product category must belong to the same instance'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.neroxa_validate_product_category_instance() FROM PUBLIC;
DROP TRIGGER IF EXISTS neroxa_product_category_instance_guard ON public.neroxa_storefront_products;
CREATE TRIGGER neroxa_product_category_instance_guard
BEFORE INSERT OR UPDATE OF category_id, instance_id
ON public.neroxa_storefront_products
FOR EACH ROW EXECUTE FUNCTION public.neroxa_validate_product_category_instance();

-- IMPORTANT: This guard is necessary but not sufficient.
-- The existing RLS tautology must be fixed in ALL relevant permissive policies.
-- Do not copy organization-wide RLS to a per-instance security model.
