-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 648fcca5bdac67ba3879c0804189b204a53fc4f3b136646407b659ca5a62f23c; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',20) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- REVIEW CANDIDATE ONLY / DB TESTS NOT RUN. Not an automatic migration.
-- Profile: Master b6f70f1 + exact manifest chain. NOT the legacy Delivery schema.
-- Run only via reviewed loopback-only disposable executor; the GUC is an intent
-- guard, not proof of destination safety. Never install remotely in this mission.
BEGIN;
DO $guard$ BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',20) THEN
  RAISE EXCEPTION '02A2 disposable intent missing'; END IF;
 IF to_regclass('public.neroxa_instance_members') IS NULL OR
    to_regprocedure('neroxa_private.has_instance_role(uuid,public.neroxa_organization_role[])') IS NULL OR
    to_regprocedure('public.get_admin_order_detail(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION '02A2 prerequisite chain incomplete'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.get_admin_order_detail(uuid,uuid)')) NOT IN ('8ef3026b9df93c82810ad8db579c7e8b','8ef3026b9df93c82810ad8db579c7e8b') OR to_regprocedure('public.get_admin_order_detail(uuid,uuid)') IS NULL THEN RAISE EXCEPTION '02A2 function drift: public.get_admin_order_detail(uuid,uuid)'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.get_admin_orders(uuid,text)')) NOT IN ('ca945ecae8be7b3271e5274c0db26cf4','a300a19387491e0c159e6822b8095f63') OR to_regprocedure('public.get_admin_orders(uuid,text)') IS NULL THEN RAISE EXCEPTION '02A2 function drift: public.get_admin_orders(uuid,text)'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.update_admin_order_status(uuid,text,text)')) NOT IN ('36201c6bceee327e7d42deae34f153d4','a91375d1393721f842ec6f1f550ea75f') OR to_regprocedure('public.update_admin_order_status(uuid,text,text)') IS NULL THEN RAISE EXCEPTION '02A2 function drift: public.update_admin_order_status(uuid,text,text)'; END IF;
END $guard$;

-- Platform membership is not a grant to every delivery store. Reuse the existing
-- explicit instance membership as the scope grant; no default grants/backfill.
CREATE OR REPLACE FUNCTION neroxa_private.has_delivery_instance_role(
 target_instance uuid, allowed_roles public.neroxa_organization_role[] DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND CASE WHEN EXISTS (
  SELECT 1 FROM public.neroxa_platform_members p
  WHERE p.user_id=(SELECT auth.uid()) AND p.active
 ) THEN public.neroxa_is_platform_member() AND EXISTS (
  SELECT 1 FROM public.neroxa_instance_members m
  JOIN public.neroxa_system_instances i ON i.id=m.instance_id
  WHERE m.user_id=(SELECT auth.uid()) AND m.instance_id=target_instance
   AND m.active AND i.status <> 'ARCHIVED'
   AND (allowed_roles IS NULL OR m.role=ANY(allowed_roles))
 ) ELSE neroxa_private.has_instance_role(target_instance,allowed_roles) END
$$;
REVOKE ALL ON FUNCTION neroxa_private.has_delivery_instance_role(uuid,public.neroxa_organization_role[])
 FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA neroxa_private TO authenticated;
GRANT EXECUTE ON FUNCTION neroxa_private.has_delivery_instance_role(uuid,public.neroxa_organization_role[])
 TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_orders(p_instance_id uuid,p_status text DEFAULT NULL)
RETURNS SETOF public.neroxa_orders LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
 SELECT o.* FROM public.neroxa_orders o
 WHERE o.instance_id=p_instance_id AND (p_status IS NULL OR o.status=p_status)
 AND neroxa_private.has_delivery_instance_role(p_instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])
 ORDER BY o.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.update_admin_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS neroxa_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.neroxa_orders; v_old text;
begin
 select * into v_order from public.neroxa_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if not (neroxa_private.has_delivery_instance_role(v_order.instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])) then raise exception 'Acesso negado' USING ERRCODE='42501'; end if;
 if p_status not in ('RECEIVED','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') then raise exception 'Status inválido'; end if;
 v_old:=v_order.status;
 IF p_status<>v_old AND NOT (
 (v_old='RECEIVED' AND p_status IN ('CONFIRMED','CANCELLED')) OR
 (v_old='CONFIRMED' AND p_status IN ('PREPARING','CANCELLED')) OR
 (v_old='PREPARING' AND p_status IN ('READY','CANCELLED')) OR
 (v_old='READY' AND (p_status='CANCELLED' OR (v_order.fulfillment='DELIVERY' AND p_status='OUT_FOR_DELIVERY') OR (v_order.fulfillment='PICKUP' AND p_status='DELIVERED'))) OR
 (v_old='OUT_FOR_DELIVERY' AND p_status='DELIVERED')
 ) THEN RAISE EXCEPTION 'Invalid order transition' USING ERRCODE='22023'; END IF;
 update public.neroxa_orders set status=p_status,updated_at=now(),
 confirmed_at=case when p_status='CONFIRMED' and confirmed_at is null then now() else confirmed_at end,
 preparing_at=case when p_status='PREPARING' and preparing_at is null then now() else preparing_at end,
 ready_at=case when p_status='READY' and ready_at is null then now() else ready_at end,
 out_for_delivery_at=case when p_status='OUT_FOR_DELIVERY' and out_for_delivery_at is null then now() else out_for_delivery_at end,
 delivered_at=case when p_status='DELIVERED' and delivered_at is null then now() else delivered_at end,
 cancelled_at=case when p_status='CANCELLED' and cancelled_at is null then now() else cancelled_at end
 where id=p_order_id returning * into v_order;
 IF v_old<>p_status THEN
 insert into public.neroxa_order_status_history(order_id,from_status,to_status,changed_by_user_id,note)
 values(p_order_id,v_old,p_status,auth.uid(),nullif(trim(p_note),''));
 END IF;
 return v_order;
end;
$function$;

-- Detail delegates visibility to get_admin_orders. Its original body is preserved.
REVOKE ALL ON FUNCTION public.get_admin_orders(uuid,text),
 public.get_admin_order_detail(uuid,uuid),public.update_admin_order_status(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_orders(uuid,text),
 public.get_admin_order_detail(uuid,uuid),public.update_admin_order_status(uuid,text,text)
 TO authenticated;

-- Restrictive policies AND the existing permissive policies; adding another
-- permissive scope policy would leave organization/platform OR bypasses open.
ALTER TABLE public.neroxa_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_orders;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_orders AS RESTRICTIVE FOR ALL TO authenticated
 USING (neroxa_private.has_delivery_instance_role(instance_id))
 WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id));
ALTER TABLE public.neroxa_storefront_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_storefront_products;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_storefront_products AS RESTRICTIVE FOR SELECT TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id));
DROP POLICY IF EXISTS mission02a2_scope_cap_insert ON public.neroxa_storefront_products;
CREATE POLICY mission02a2_scope_cap_insert ON public.neroxa_storefront_products AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_update ON public.neroxa_storefront_products;
CREATE POLICY mission02a2_scope_cap_update ON public.neroxa_storefront_products AS RESTRICTIVE FOR UPDATE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_delete ON public.neroxa_storefront_products;
CREATE POLICY mission02a2_scope_cap_delete ON public.neroxa_storefront_products AS RESTRICTIVE FOR DELETE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
ALTER TABLE public.neroxa_storefront_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_storefront_categories;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_storefront_categories AS RESTRICTIVE FOR SELECT TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id));
DROP POLICY IF EXISTS mission02a2_scope_cap_insert ON public.neroxa_storefront_categories;
CREATE POLICY mission02a2_scope_cap_insert ON public.neroxa_storefront_categories AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_update ON public.neroxa_storefront_categories;
CREATE POLICY mission02a2_scope_cap_update ON public.neroxa_storefront_categories AS RESTRICTIVE FOR UPDATE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_delete ON public.neroxa_storefront_categories;
CREATE POLICY mission02a2_scope_cap_delete ON public.neroxa_storefront_categories AS RESTRICTIVE FOR DELETE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
ALTER TABLE public.neroxa_storefront_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_storefront_settings;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_storefront_settings AS RESTRICTIVE FOR SELECT TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id));
DROP POLICY IF EXISTS mission02a2_scope_cap_insert ON public.neroxa_storefront_settings;
CREATE POLICY mission02a2_scope_cap_insert ON public.neroxa_storefront_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_update ON public.neroxa_storefront_settings;
CREATE POLICY mission02a2_scope_cap_update ON public.neroxa_storefront_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_delete ON public.neroxa_storefront_settings;
CREATE POLICY mission02a2_scope_cap_delete ON public.neroxa_storefront_settings AS RESTRICTIVE FOR DELETE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
ALTER TABLE public.neroxa_storefront_delivery_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_storefront_delivery_zones;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_storefront_delivery_zones AS RESTRICTIVE FOR SELECT TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id));
DROP POLICY IF EXISTS mission02a2_scope_cap_insert ON public.neroxa_storefront_delivery_zones;
CREATE POLICY mission02a2_scope_cap_insert ON public.neroxa_storefront_delivery_zones AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_update ON public.neroxa_storefront_delivery_zones;
CREATE POLICY mission02a2_scope_cap_update ON public.neroxa_storefront_delivery_zones AS RESTRICTIVE FOR UPDATE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_delete ON public.neroxa_storefront_delivery_zones;
CREATE POLICY mission02a2_scope_cap_delete ON public.neroxa_storefront_delivery_zones AS RESTRICTIVE FOR DELETE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
ALTER TABLE public.neroxa_storefront_addon_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_scope_cap ON public.neroxa_storefront_addon_groups;
CREATE POLICY mission02a2_scope_cap ON public.neroxa_storefront_addon_groups AS RESTRICTIVE FOR SELECT TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id));
DROP POLICY IF EXISTS mission02a2_scope_cap_insert ON public.neroxa_storefront_addon_groups;
CREATE POLICY mission02a2_scope_cap_insert ON public.neroxa_storefront_addon_groups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_update ON public.neroxa_storefront_addon_groups;
CREATE POLICY mission02a2_scope_cap_update ON public.neroxa_storefront_addon_groups AS RESTRICTIVE FOR UPDATE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])) WITH CHECK (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
DROP POLICY IF EXISTS mission02a2_scope_cap_delete ON public.neroxa_storefront_addon_groups;
CREATE POLICY mission02a2_scope_cap_delete ON public.neroxa_storefront_addon_groups AS RESTRICTIVE FOR DELETE TO authenticated USING (neroxa_private.has_delivery_instance_role(instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]));
ALTER TABLE public.neroxa_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_parent_scope_cap ON public.neroxa_order_items;
CREATE POLICY mission02a2_parent_scope_cap ON public.neroxa_order_items AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.neroxa_orders o WHERE o.id=neroxa_order_items.order_id
 AND neroxa_private.has_delivery_instance_role(o.instance_id)))
 WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_orders o WHERE o.id=neroxa_order_items.order_id
 AND neroxa_private.has_delivery_instance_role(o.instance_id)));
ALTER TABLE public.neroxa_order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_parent_scope_cap ON public.neroxa_order_status_history;
CREATE POLICY mission02a2_parent_scope_cap ON public.neroxa_order_status_history AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.neroxa_orders o WHERE o.id=neroxa_order_status_history.order_id
 AND neroxa_private.has_delivery_instance_role(o.instance_id)))
 WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_orders o WHERE o.id=neroxa_order_status_history.order_id
 AND neroxa_private.has_delivery_instance_role(o.instance_id)));

ALTER TABLE public.neroxa_storefront_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_group_scope_cap ON public.neroxa_storefront_addons;
CREATE POLICY mission02a2_group_scope_cap ON public.neroxa_storefront_addons AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=neroxa_storefront_addons.group_id AND neroxa_private.has_delivery_instance_role(g.instance_id)));
DROP POLICY IF EXISTS mission02a2_group_scope_cap_insert ON public.neroxa_storefront_addons;
CREATE POLICY mission02a2_group_scope_cap_insert ON public.neroxa_storefront_addons AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=neroxa_storefront_addons.group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
DROP POLICY IF EXISTS mission02a2_group_scope_cap_update ON public.neroxa_storefront_addons;
CREATE POLICY mission02a2_group_scope_cap_update ON public.neroxa_storefront_addons AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=neroxa_storefront_addons.group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]))) WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=neroxa_storefront_addons.group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
DROP POLICY IF EXISTS mission02a2_group_scope_cap_delete ON public.neroxa_storefront_addons;
CREATE POLICY mission02a2_group_scope_cap_delete ON public.neroxa_storefront_addons AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_addon_groups g WHERE g.id=neroxa_storefront_addons.group_id AND neroxa_private.has_delivery_instance_role(g.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
ALTER TABLE public.neroxa_storefront_product_addon_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mission02a2_link_scope_cap ON public.neroxa_storefront_product_addon_groups;
CREATE POLICY mission02a2_link_scope_cap ON public.neroxa_storefront_product_addon_groups AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_products p JOIN public.neroxa_storefront_addon_groups g ON g.instance_id=p.instance_id WHERE p.id=neroxa_storefront_product_addon_groups.product_id AND g.id=neroxa_storefront_product_addon_groups.group_id AND neroxa_private.has_delivery_instance_role(p.instance_id)));
DROP POLICY IF EXISTS mission02a2_link_scope_cap_insert ON public.neroxa_storefront_product_addon_groups;
CREATE POLICY mission02a2_link_scope_cap_insert ON public.neroxa_storefront_product_addon_groups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_storefront_products p JOIN public.neroxa_storefront_addon_groups g ON g.instance_id=p.instance_id WHERE p.id=neroxa_storefront_product_addon_groups.product_id AND g.id=neroxa_storefront_product_addon_groups.group_id AND neroxa_private.has_delivery_instance_role(p.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
DROP POLICY IF EXISTS mission02a2_link_scope_cap_update ON public.neroxa_storefront_product_addon_groups;
CREATE POLICY mission02a2_link_scope_cap_update ON public.neroxa_storefront_product_addon_groups AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_products p JOIN public.neroxa_storefront_addon_groups g ON g.instance_id=p.instance_id WHERE p.id=neroxa_storefront_product_addon_groups.product_id AND g.id=neroxa_storefront_product_addon_groups.group_id AND neroxa_private.has_delivery_instance_role(p.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]))) WITH CHECK (EXISTS (SELECT 1 FROM public.neroxa_storefront_products p JOIN public.neroxa_storefront_addon_groups g ON g.instance_id=p.instance_id WHERE p.id=neroxa_storefront_product_addon_groups.product_id AND g.id=neroxa_storefront_product_addon_groups.group_id AND neroxa_private.has_delivery_instance_role(p.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
DROP POLICY IF EXISTS mission02a2_link_scope_cap_delete ON public.neroxa_storefront_product_addon_groups;
CREATE POLICY mission02a2_link_scope_cap_delete ON public.neroxa_storefront_product_addon_groups AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.neroxa_storefront_products p JOIN public.neroxa_storefront_addon_groups g ON g.instance_id=p.instance_id WHERE p.id=neroxa_storefront_product_addon_groups.product_id AND g.id=neroxa_storefront_product_addon_groups.group_id AND neroxa_private.has_delivery_instance_role(p.instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[])));
-- Financial writes remain RPC-only; preserve service_role checkout path.
REVOKE ALL ON public.neroxa_orders,public.neroxa_order_items,public.neroxa_order_status_history FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN
 ON public.neroxa_orders,public.neroxa_order_items,public.neroxa_order_status_history FROM authenticated;
COMMIT;
-- NOT complete F01 closure: legacy tables, Storage, Realtime, contacts and other
-- SECURITY DEFINER functions need separate reviewed gates and real JWT tests.
