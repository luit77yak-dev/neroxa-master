-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 342bafbec2f94f1f03aab24731fa31700b7c20151334a2ec415564c412384c37; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',12) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
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
-- 42702 observed on successful append: qualify columns, keep API and price semantics.
CREATE OR REPLACE FUNCTION public.append_public_order_items_with_payment(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text)
 RETURNS TABLE(order_id uuid, order_number bigint, subtotal numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.neroxa_orders;v_item jsonb;v_qty int;v_unit numeric;v_add numeric:=0;
begin
 select * into v_order from public.neroxa_orders where id=p_order_id and regexp_replace(customer_phone,'\\D','','g')=regexp_replace(trim(p_customer_phone),'\\D','','g');
 if not found then raise exception 'Pedido não encontrado';end if;
 if v_order.status not in ('RECEIVED','CONFIRMED','PREPARING','READY') then raise exception 'Este pedido não aceita novos itens';end if;
 for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  v_qty:=greatest(1,coalesce((v_item->>'quantity')::int,1));
  v_unit:=public.calculate_public_order_line_price(v_order.instance_id,nullif(v_item->>'product_id','')::uuid,nullif(v_item->>'second_product_id','')::uuid,nullif(v_item->>'size_id',''),nullif(v_item->>'crust_id',''),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb));
  insert into public.neroxa_order_items(order_id,product_id,product_name,product_image_url,second_product_id,is_half,addons,complements,quantity,notes,unit_price,line_total)
  select v_order.id,p.id,p.name,p.image_url,nullif(v_item->>'second_product_id','')::uuid,coalesce((v_item->>'is_half')::boolean,false),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb),v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty
  from public.neroxa_storefront_products p where p.id=nullif(v_item->>'product_id','')::uuid and p.instance_id=v_order.instance_id and p.active;
  if not found then raise exception 'Produto não disponível';end if;
  v_add:=v_add+v_unit*v_qty;
 end loop;
 update public.neroxa_orders as o set subtotal=o.subtotal+v_add,total=o.total+v_add,payment_method=coalesce(p_payment_method,o.payment_method),updated_at=now() where o.id=v_order.id returning o.* into v_order;
 order_id:=v_order.id;order_number:=v_order.order_number;subtotal:=v_order.subtotal;total:=v_order.total;return next;
end $function$
;
COMMIT;
