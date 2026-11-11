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
