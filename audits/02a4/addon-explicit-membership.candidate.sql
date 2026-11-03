-- Master M + explicit scope caps (02A2); not the Delivery legacy profile.
BEGIN;
DO $$ BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.neroxa_storefront_addon_groups'::regclass AND polname='mission02a2_scope_cap') THEN RAISE EXCEPTION 'Explicit instance caps required'; END IF;
END $$;
-- Existing org-only permissive policies exclude legitimate scoped platform staff.
-- These new allow paths require the SAME explicit helper; restrictive AND caps
-- remain, so other org/platform policies cannot grant foreign instance access.
CREATE POLICY mission02a4_scoped_addon_groups_read ON public.neroxa_storefront_addon_groups FOR SELECT TO authenticated USING(neroxa_private.has_delivery_instance_role(instance_id));
CREATE POLICY mission02a4_scoped_addon_groups_manage ON public.neroxa_storefront_addon_groups FOR ALL TO authenticated
 USING(neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK(neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
CREATE POLICY mission02a4_scoped_addons_read ON public.neroxa_storefront_addons FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=group_id AND neroxa_private.has_delivery_instance_role(g.instance_id)));
CREATE POLICY mission02a4_scoped_addons_manage ON public.neroxa_storefront_addons FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])))
 WITH CHECK(EXISTS(SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
COMMIT;
-- Only SELECT/manage of groups/addons; link administration requires its own
-- validated allow path. No global grants, unsafe inverses or storefront changes.
