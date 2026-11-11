-- Candidate policy replacement, depends on instance-membership-foundation.candidate.sql
-- MUST run only on isolated Master-compatible database after verifying app RPC paths.
BEGIN;
-- Existing organization-wide policies are permissive (OR): remove them, not merely add restrictive ones.
DROP POLICY IF EXISTS "organization manager storefront products write" ON public.neroxa_storefront_products;
DROP POLICY IF EXISTS "organization member storefront products select" ON public.neroxa_storefront_products;
DROP POLICY IF EXISTS "organization manager storefront categories write" ON public.neroxa_storefront_categories;
DROP POLICY IF EXISTS "organization member storefront categories select" ON public.neroxa_storefront_categories;
DROP POLICY IF EXISTS "organization manager orders update" ON public.neroxa_orders;
DROP POLICY IF EXISTS "organization member orders select" ON public.neroxa_orders;

CREATE POLICY "instance members products read" ON public.neroxa_storefront_products
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(instance_id));
CREATE POLICY "instance managers products insert" ON public.neroxa_storefront_products
 FOR INSERT TO authenticated WITH CHECK (
 neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])
 AND EXISTS (SELECT 1 FROM public.neroxa_system_instances i WHERE i.id=instance_id AND i.status <> 'ARCHIVED')
 AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.neroxa_storefront_categories c WHERE c.id=category_id AND c.instance_id=neroxa_storefront_products.instance_id)));
CREATE POLICY "instance managers products update" ON public.neroxa_storefront_products
 FOR UPDATE TO authenticated
 USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]))
 WITH CHECK (
 neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])
 AND EXISTS (SELECT 1 FROM public.neroxa_system_instances i WHERE i.id=instance_id AND i.status <> 'ARCHIVED')
 AND (category_id IS NULL OR EXISTS (SELECT 1 FROM public.neroxa_storefront_categories c WHERE c.id=category_id AND c.instance_id=neroxa_storefront_products.instance_id)));
CREATE POLICY "instance managers products delete" ON public.neroxa_storefront_products
 FOR DELETE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));

CREATE POLICY "instance members categories read" ON public.neroxa_storefront_categories
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(instance_id));
CREATE POLICY "instance managers categories insert" ON public.neroxa_storefront_categories
 FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
CREATE POLICY "instance managers categories update" ON public.neroxa_storefront_categories
 FOR UPDATE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]))
 WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
CREATE POLICY "instance managers categories delete" ON public.neroxa_storefront_categories
 FOR DELETE TO authenticated USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));

CREATE POLICY "instance members orders read" ON public.neroxa_orders
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(instance_id));
CREATE POLICY "instance operators orders update" ON public.neroxa_orders
 FOR UPDATE TO authenticated
 USING (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[]))
 WITH CHECK (neroxa_private.has_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])
 AND EXISTS (SELECT 1 FROM public.neroxa_system_instances i WHERE i.id=instance_id AND i.organization_id=neroxa_orders.organization_id));

-- Blockers: settings and zones have no instance_id; do not replace those policies yet.
-- Existing Neroxa platform policies remain, subject to independent MFA and role audit.
COMMIT;
