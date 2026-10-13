-- REVIEW ONLY: explicit operator reconciliation; no payment or append authorization.
BEGIN;
CREATE TABLE private.neroxa_checkout_reconciliation(
 instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),checkout_key uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('CONFIRMED','FENCED_ABSENT')),order_id uuid REFERENCES public.neroxa_orders(id),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(instance_id,checkout_key),CHECK((outcome='CONFIRMED')=(order_id IS NOT NULL))
);
ALTER TABLE private.neroxa_checkout_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_checkout_reconciliation FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_reconcile_checkout(p_instance_id uuid,p_checkout_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.neroxa_orders; prior private.neroxa_checkout_reconciliation;
BEGIN
 IF auth.uid() IS NULL OR p_checkout_key IS NULL OR NOT (neroxa_private.has_instance_role(p_instance_id,ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY['ADMIN','SUPER_ADMIN']::public.neroxa_platform_role[])) THEN RAISE EXCEPTION 'Reconciliation denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_instance_id::text));
 SELECT * INTO prior FROM private.neroxa_checkout_reconciliation WHERE instance_id=p_instance_id AND checkout_key=p_checkout_key;
 IF FOUND THEN RETURN jsonb_build_object('outcome',prior.outcome,'order_id',prior.order_id,'instance_id',prior.instance_id); END IF;
 SELECT * INTO o FROM public.neroxa_orders WHERE instance_id=p_instance_id AND idempotency_key=p_checkout_key;
 INSERT INTO private.neroxa_checkout_reconciliation(instance_id,checkout_key,outcome,order_id,actor_id)
 VALUES(p_instance_id,p_checkout_key,CASE WHEN o.id IS NULL THEN 'FENCED_ABSENT' ELSE 'CONFIRMED' END,o.id,auth.uid()) RETURNING * INTO prior;
 RETURN jsonb_build_object('outcome',prior.outcome,'order_id',prior.order_id,'instance_id',prior.instance_id);
END $$;
REVOKE ALL ON FUNCTION public.neroxa_reconcile_checkout(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_reconcile_checkout(uuid,uuid) TO authenticated;
DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure) IS DISTINCT FROM '558513e7394392b1088f6b0fd243d954' THEN RAISE EXCEPTION 'Unexpected recovery create body'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE(order_id uuid,order_number bigint,total numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
declare
 v_org uuid:=nullif(p_order->>'organization_id','')::uuid;
 v_store_domain text:=nullif(lower(trim(trailing '.' from trim(coalesce(p_order->>'store_domain','')))),'');
 v_domain_instance uuid;
 v_instance uuid; v_order_id uuid; v_number bigint;
 v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0; v_total numeric(12,2);
 v_fulfillment text:=coalesce(p_order->>'fulfillment','DELIVERY'); v_payment text:=coalesce(p_order->>'payment_method','PIX');
 v_phone text:=trim(coalesce(p_order->>'customer_phone','')); v_item jsonb; v_unit numeric; v_qty integer; v_prepared jsonb; v_zone record; v_neighborhood text;
begin
 if v_org is null or v_phone='' or trim(coalesce(p_order->>'customer_name',''))='' then raise exception 'Dados do cliente incompletos'; end if;
 select i.id into v_instance from public.neroxa_system_instances i where i.id=nullif(p_order->>'instance_id','')::uuid and i.organization_id=v_org and i.status='ACTIVE';
 if v_instance is null then raise exception 'Loja ativa não encontrada'; end if;
 -- Validate before idempotent replay: a retry for the wrong domain must fail, too.
 if v_store_domain is null then
  raise exception 'Dominio da loja obrigatorio' USING ERRCODE='22023';
 end if;
 select ctx.instance_id into v_domain_instance
 from public.get_public_storefront_context(v_store_domain) ctx
 where ctx.organization_id=v_org
 limit 1;
 if v_domain_instance IS DISTINCT FROM v_instance then
  raise exception 'Dominio nao corresponde a loja' USING ERRCODE='42501';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_instance::text));
 IF EXISTS(SELECT 1 FROM private.neroxa_checkout_reconciliation WHERE instance_id=v_instance AND checkout_key=nullif(p_order->>'idempotency_key','')::uuid AND outcome='FENCED_ABSENT') THEN RAISE EXCEPTION 'Checkout fenced; authorized reconciliation required' USING ERRCODE='PT410'; END IF;
 if nullif(p_order->>'idempotency_key','') is not null then
  select o.id,o.order_number,o.total into v_order_id,v_number,v_total from public.neroxa_orders o where o.instance_id=v_instance and o.idempotency_key=(p_order->>'idempotency_key')::uuid;
  if v_order_id is not null then
   IF EXISTS(SELECT 1 FROM private.neroxa_group_order_intents x WHERE x.order_id=v_order_id AND x.payload_sha256<>encode(extensions.digest(convert_to(p_order::text,'UTF8'),'sha256'),'hex')) THEN RAISE EXCEPTION 'Conflicting grouped checkout key' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_order->'items') x WHERE x->>'selection_contract'='GROUP_ADDONS_V1') AND NOT EXISTS(SELECT 1 FROM private.neroxa_group_order_intents x WHERE x.order_id=v_order_id) THEN RAISE EXCEPTION 'Legacy checkout key cannot become grouped' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM private.neroxa_group_order_intents i WHERE i.order_id=v_order_id AND (i.recovery_expires_at IS NULL OR i.recovery_expires_at<=clock_timestamp())) THEN RAISE EXCEPTION 'Recovery expired' USING ERRCODE='PT410'; END IF;
   order_id:=v_order_id;order_number:=v_number;total:=v_total;return next;return;end if;
 end if;
 perform private.neroxa_assert_store_open(v_instance);
 if jsonb_array_length(coalesce(p_order->'items','[]'::jsonb))=0 then raise exception 'O pedido precisa ter pelo menos um item'; end if;
 if v_fulfillment not in ('DELIVERY','PICKUP') or v_payment not in ('CASH','PIX','CARD_ON_DELIVERY','CARD_ON_SITE') then raise exception 'Forma de recebimento ou pagamento inválida'; end if;
 if v_fulfillment='DELIVERY' then
  v_neighborhood:=trim(coalesce(p_order->>'address_neighborhood',''));
  if v_neighborhood='' then raise exception 'Bairro de entrega obrigatório'; end if;
  select z.* into v_zone from public.neroxa_storefront_delivery_zones z
  where z.instance_id=v_instance and z.active and exists(select 1 from unnest(z.neighborhoods) n where lower(trim(n))=lower(v_neighborhood))
  order by z.sort_order limit 1;
  if not found then raise exception 'Bairro não atendido pela loja'; end if;
  v_delivery_fee:=v_zone.delivery_fee;
 end if;
 perform pg_advisory_xact_lock(hashtext(v_instance::text));
 select coalesce(max(o.order_number),0)+1 into v_number from public.neroxa_orders o where o.instance_id=v_instance;
 insert into public.neroxa_orders(instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,status,delivery_fee,address_street,address_number,address_neighborhood,address_complement,address_reference,notes,idempotency_key)
 values(v_instance,v_org,v_number,trim(p_order->>'customer_name'),v_phone,v_fulfillment,v_payment,'RECEIVED',v_delivery_fee,nullif(trim(p_order->>'address_street'),''),nullif(trim(p_order->>'address_number'),''),nullif(trim(p_order->>'address_neighborhood'),''),nullif(trim(p_order->>'address_complement'),''),nullif(trim(p_order->>'address_reference'),''),nullif(trim(p_order->>'notes'),''),nullif(p_order->>'idempotency_key','')::uuid)
 returning id into v_order_id;

 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_order->'items') x WHERE x->>'selection_contract'='GROUP_ADDONS_V1') THEN
  IF nullif(p_order->>'idempotency_key','') IS NULL THEN RAISE EXCEPTION 'Grouped checkout requires idempotency key' USING ERRCODE='22023'; END IF;
  INSERT INTO private.neroxa_group_order_intents VALUES(v_order_id,encode(extensions.digest(convert_to(p_order::text,'UTF8'),'sha256'),'hex'));
 END IF;
 for v_item in select * from jsonb_array_elements(p_order->'items') loop
  IF v_item->>'selection_contract'='GROUP_ADDONS_V1' THEN
   v_prepared:=private.neroxa_prepare_group_item(v_instance,v_item);
   v_qty:=(v_prepared->>'quantity')::integer;v_unit:=(v_prepared->>'unit_price')::numeric;
   INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,product_image_url,quantity,notes,unit_price,line_total,addons,selection_snapshot,size_name,crust_name,crust_price)
   VALUES(v_order_id,(v_prepared->>'product_id')::uuid,v_prepared->>'product_name',v_prepared->>'product_image_url',v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty,v_prepared->'addons',v_prepared->'selection_snapshot',v_prepared->>'size_name',v_prepared->>'crust_name',(v_prepared->>'crust_price')::numeric);
  ELSE
   IF private.neroxa_requires_group_contract(v_instance,(v_item->>'product_id')::uuid) THEN RAISE EXCEPTION 'Product requires explicit grouped contract' USING ERRCODE='22023'; END IF;
     IF v_item ? 'group_addon_ids' OR (v_item ? 'selection_contract' AND v_item->>'selection_contract'<>'LEGACY_PRODUCT_V1') THEN RAISE EXCEPTION 'Selection contract mismatch' USING ERRCODE='22023'; END IF;
  v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
  v_unit:=public.calculate_public_order_line_price(v_instance,nullif(v_item->>'product_id','')::uuid,nullif(v_item->>'second_product_id','')::uuid,nullif(v_item->>'size_id',''),nullif(v_item->>'crust_id',''),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb));
  insert into public.neroxa_order_items(order_id,product_id,product_name,product_image_url,second_product_id,second_product_name,is_half,size_id,size_name,crust_id,crust_name,crust_price,addons,complements,quantity,notes,unit_price,line_total)
  select v_order_id,p.id,p.name,p.image_url,nullif(v_item->>'second_product_id','')::uuid,p2.name,coalesce((v_item->>'is_half')::boolean,false),nullif(v_item->>'size_id','')::uuid,nullif(v_item->>'size_name',''),nullif(v_item->>'crust_id','')::uuid,nullif(v_item->>'crust_name',''),coalesce((v_item->>'crust_price')::numeric,0),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb),v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty
  from public.neroxa_storefront_products p
  left join public.neroxa_storefront_products p2 on p2.id=nullif(v_item->>'second_product_id','')::uuid and p2.instance_id=v_instance
  where p.id=nullif(v_item->>'product_id','')::uuid and p.instance_id=v_instance and p.active;
  if not found then raise exception 'Produto não disponível'; end if;
  END IF;
  v_subtotal:=v_subtotal+v_unit*v_qty;
 end loop;
 v_total:=v_subtotal+v_delivery_fee;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_order->'items') x WHERE x->>'selection_contract'='GROUP_ADDONS_V1') THEN
  IF jsonb_typeof(p_order->'expected_total') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Total acknowledgement required' USING ERRCODE='22023'; END IF;
  IF (p_order->>'expected_total')::numeric IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'Total changed; review order' USING ERRCODE='PT409'; END IF;
 END IF;
 update public.neroxa_orders set subtotal=v_subtotal,total=v_total,updated_at=now() where id=v_order_id;
 insert into public.neroxa_order_status_history(order_id,to_status,note) values(v_order_id,'RECEIVED','Pedido criado pelo site');
 order_id:=v_order_id;order_number:=v_number;total:=v_total;return next;
end $function$;
COMMIT;
