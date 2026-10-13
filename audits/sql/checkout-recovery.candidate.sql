-- REVIEW ONLY. After availability; legacy rows are NOT given a new recovery lease.
BEGIN;
ALTER TABLE private.neroxa_group_order_intents ADD COLUMN recovery_expires_at timestamptz;
CREATE FUNCTION private.neroxa_lease_group_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.recovery_expires_at IS NULL THEN NEW.recovery_expires_at:=clock_timestamp()+interval '24 hours'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.neroxa_lease_group_intent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER group_intent_lease BEFORE INSERT ON private.neroxa_group_order_intents FOR EACH ROW EXECUTE FUNCTION private.neroxa_lease_group_intent();
CREATE FUNCTION public.neroxa_recover_group_order(p_instance_id uuid,p_checkout_key uuid,p_order jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.neroxa_orders; deadline timestamptz;
BEGIN
 IF p_instance_id IS DISTINCT FROM nullif(p_order->>'instance_id','')::uuid OR p_checkout_key IS DISTINCT FROM nullif(p_order->>'idempotency_key','')::uuid THEN RAISE EXCEPTION 'Recovery denied' USING ERRCODE='42501'; END IF;
 SELECT orders.* INTO o
 FROM public.neroxa_orders orders JOIN private.neroxa_group_order_intents i ON i.order_id=orders.id
 WHERE orders.instance_id=p_instance_id AND orders.idempotency_key=p_checkout_key
 AND i.payload_sha256=encode(extensions.digest(convert_to(p_order::text,'UTF8'),'sha256'),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION 'Recovery denied' USING ERRCODE='42501'; END IF;
 SELECT i.recovery_expires_at INTO deadline FROM private.neroxa_group_order_intents i WHERE i.order_id=o.id;
 IF deadline IS NULL OR deadline<=clock_timestamp() THEN RAISE EXCEPTION 'Recovery expired; authorized operator required' USING ERRCODE='PT410'; END IF;
 RETURN public.get_public_order_status(o.id,o.customer_phone)||jsonb_build_object('instance_id',o.instance_id);
END $$;
REVOKE ALL ON FUNCTION public.neroxa_recover_group_order(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_recover_group_order(uuid,uuid,jsonb) TO service_role;
-- Keep create replay expiration aligned, without changing signatures or default privileges.
DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure) IS DISTINCT FROM '46a6a03f43b04d5deb1dc7ace1080869' THEN RAISE EXCEPTION 'Unexpected availability-aware create body'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
-- Separate read budget: never consumes or relaxes the existing checkout quota.
CREATE TABLE private.neroxa_recovery_quota_counters (
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
  scope text NOT NULL CHECK (scope IN ('store', 'contact')),
  window_start timestamptz NOT NULL,
  identity_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, scope, window_start, identity_hash)
);

ALTER TABLE private.neroxa_recovery_quota_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.neroxa_recovery_quota_counters
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neroxa_recovery_reserve_quota(
  p_instance_id uuid,
  p_contact_fingerprint text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $quota$
DECLARE
  v_current timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_ten_minutes timestamptz;
  v_attempts integer;
BEGIN
  IF p_instance_id IS NULL OR
     p_contact_fingerprint !~ '^[0-9a-f]{64}$' OR
     p_contact_fingerprint IS NULL
  THEN
    RAISE EXCEPTION 'Invalid checkout quota identity' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.neroxa_system_instances i
    WHERE i.id = p_instance_id AND i.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Inactive or unknown store' USING ERRCODE='22023';
  END IF;

  v_minute := to_timestamp(floor(extract(epoch FROM v_current) / 60)::bigint * 60);
  v_ten_minutes := to_timestamp(floor(extract(epoch FROM v_current) / 60)::bigint * 60);

  -- Consistent global-before-contact lock order. INSERT/ON CONFLICT guards
  -- against concurrent overbooking across independent serverless workers.
  INSERT INTO private.neroxa_recovery_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'store', v_minute, 'store-total', 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_recovery_quota_counters.attempts + 1
  WHERE private.neroxa_recovery_quota_counters.attempts < 120
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'Recovery store quota exceeded' USING ERRCODE='PT429';
  END IF;
  v_attempts := NULL;

  INSERT INTO private.neroxa_recovery_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'contact', v_ten_minutes, p_contact_fingerprint, 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_recovery_quota_counters.attempts + 1
  WHERE private.neroxa_recovery_quota_counters.attempts < 30
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- RAISE rolls back both increments in this function transaction.
    RAISE EXCEPTION 'Recovery contact quota exceeded' USING ERRCODE='PT429';
  END IF;
  RETURN true;
END
$quota$;

REVOKE ALL ON FUNCTION public.neroxa_recovery_reserve_quota(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neroxa_recovery_reserve_quota(uuid,text) TO service_role;


COMMIT;
