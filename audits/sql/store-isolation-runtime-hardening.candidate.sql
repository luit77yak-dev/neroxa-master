-- CANDIDATE ONLY. Tested against full historical catalog + real local Auth.
-- Never an automatic migration. Scope corrections observed in JWT matrix.
BEGIN;
-- Positive control: WITH CHECK and INVOKER tenant guards need authorized parent visibility.
CREATE POLICY "instance members instances read" ON public.neroxa_system_instances
 FOR SELECT TO authenticated USING (neroxa_private.has_instance_role(id));
CREATE POLICY "platform AAL2 orders read" ON public.neroxa_orders
 FOR SELECT TO authenticated USING (public.neroxa_is_platform_member());
-- Preserve RPC-authorized writes. Prevent direct bypass once parent visibility is fixed.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN
 ON public.neroxa_orders,public.neroxa_order_items,public.neroxa_order_status_history FROM anon,authenticated;
CREATE POLICY "instance members order items read" ON public.neroxa_order_items
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.neroxa_orders o WHERE o.id=order_id
 AND (neroxa_private.has_instance_role(o.instance_id) OR public.neroxa_is_platform_member())));
CREATE POLICY "instance members order history read" ON public.neroxa_order_status_history
 FOR SELECT TO authenticated USING (EXISTS (
 SELECT 1 FROM public.neroxa_orders o WHERE o.id=order_id
 AND (neroxa_private.has_instance_role(o.instance_id) OR public.neroxa_is_platform_member())));
-- Platform policies already check AAL2 via public helper. Membership policies used
-- this private helper without MFA: observed AAL1 POST succeeded. Keep signature/ACL.
CREATE OR REPLACE FUNCTION private.neroxa_has_platform_role(p_roles public.neroxa_platform_role[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((auth.jwt()->>'aal')='aal2',false) AND EXISTS (
 SELECT 1 FROM public.neroxa_platform_members m
 WHERE m.user_id=(SELECT auth.uid()) AND m.active AND m.role=ANY(p_roles))
$$;
-- USING/WITH CHECK alone allow transfers when the caller controls both stores.
CREATE OR REPLACE FUNCTION public.neroxa_keep_store_instance()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.instance_id IS DISTINCT FROM OLD.instance_id THEN
  RAISE EXCEPTION 'Store instance reassignment forbidden' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_keep_store_instance() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER neroxa_product_instance_immutable BEFORE UPDATE OF instance_id
 ON public.neroxa_storefront_products FOR EACH ROW EXECUTE FUNCTION public.neroxa_keep_store_instance();
CREATE TRIGGER neroxa_category_instance_immutable BEFORE UPDATE OF instance_id
 ON public.neroxa_storefront_categories FOR EACH ROW EXECUTE FUNCTION public.neroxa_keep_store_instance();
COMMIT;
