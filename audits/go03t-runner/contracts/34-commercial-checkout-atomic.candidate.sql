-- GO02 commercial-schema extension, local candidate ONLY. No old order RPC call.
-- Uses the versioned commercial catalog/pricing, intent, reconciliation and
-- capability contracts from units 01-33; never the R14 LAB schema.
BEGIN;
DO $$ BEGIN
 IF pg_temp.neroxa_go02_admitted('GO02_COMMERCIAL_CHECKOUT_V1',34) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GO02 extension is not admitted';
 END IF;
END $$;
CREATE TABLE private.neroxa_go02_checkout_operations (
 instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
 checkout_key uuid NOT NULL,
 order_id uuid NOT NULL UNIQUE REFERENCES public.neroxa_orders(id),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(instance_id,checkout_key)
);
ALTER TABLE private.neroxa_go02_checkout_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_go02_checkout_operations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_commercial_checkout_atomic(
 p_order jsonb,p_tracking_sha256 text,p_amendment_sha256 text
) RETURNS TABLE(order_id uuid,order_number bigint,total numeric,capabilities_issued boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_instance uuid; v_org uuid; v_key uuid; v_domain text; v_context record;
 v_id uuid; v_number bigint; v_total numeric(12,2); v_subtotal numeric(12,2):=0;
 v_fee numeric(12,2):=0; v_fulfillment text; v_payment text; v_phone text;
 v_item jsonb; v_prepared jsonb; v_prepared_items jsonb:='[]'::jsonb;
 v_qty integer; v_unit numeric; v_neighborhood text; v_zone record;
 v_existing record; v_hash text; v_expires timestamptz; v_issued boolean;
BEGIN
 IF jsonb_typeof(p_order) IS DISTINCT FROM 'object'
 OR p_tracking_sha256 IS NULL OR p_tracking_sha256 !~ '^[0-9a-f]{64}$'
 OR p_amendment_sha256 IS NULL OR p_amendment_sha256 !~ '^[0-9a-f]{64}$'
 OR jsonb_typeof(p_order->'items') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_order->'expected_total') IS DISTINCT FROM 'number'
 OR p_order->>'client_cart_reference' IS NULL OR (p_order->>'client_cart_reference') !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Commercial contract invalid' USING ERRCODE='22023';
 END IF;
 v_instance:=nullif(p_order->>'instance_id','')::uuid;
 v_org:=nullif(p_order->>'organization_id','')::uuid;
 v_key:=nullif(p_order->>'idempotency_key','')::uuid;
 v_domain:=lower(trim(trailing '.' FROM trim(coalesce(p_order->>'store_domain',''))));
 v_fulfillment:=p_order->>'fulfillment'; v_payment:=p_order->>'payment_method';
 v_phone:=trim(coalesce(p_order->>'customer_phone',''));
 IF v_instance IS NULL OR v_org IS NULL OR v_key IS NULL OR v_domain=''
 OR trim(coalesce(p_order->>'customer_name',''))=''
 OR regexp_replace(v_phone,'[^0-9]','','g') !~ '^[0-9]{10,15}$'
 OR v_fulfillment IS NULL OR v_fulfillment NOT IN ('DELIVERY','PICKUP')
 OR v_payment IS NULL OR v_payment NOT IN ('CASH','PIX','CARD_ON_DELIVERY','CARD_ON_SITE')
 OR jsonb_array_length(p_order->'items') NOT BETWEEN 1 AND 40
 OR (p_order->>'expected_total')::numeric < 0
 OR (p_order->>'expected_total')::numeric::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Commercial values invalid' USING ERRCODE='22023';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_order->'items') LOOP
  IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
  OR v_item->>'selection_contract' IS DISTINCT FROM 'GROUP_ADDONS_V1'
  OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
  OR (v_item->>'quantity') !~ '^[1-9][0-9]{0,2}$'
  OR (v_item->>'quantity')::integer > 100 THEN
   RAISE EXCEPTION 'Grouped items required' USING ERRCODE='22023';
  END IF;
 END LOOP;
 -- Exactly one authoritative VERIFIED domain/ACTIVE instance. Never body-selected.
 SELECT c.domain,c.instance_id,c.organization_id INTO STRICT v_context
 FROM public.get_public_storefront_context(v_domain) c;
 IF lower(v_context.domain)<>v_domain OR v_context.instance_id IS DISTINCT FROM v_instance
 OR v_context.organization_id IS DISTINCT FROM v_org
 OR NOT EXISTS(SELECT 1 FROM public.neroxa_system_instances i
  WHERE i.id=v_instance AND i.organization_id=v_org AND i.status='ACTIVE') THEN
  RAISE EXCEPTION 'Commercial tenant denied' USING ERRCODE='42501';
 END IF;
 -- Same lock order/key as commercial units16/17; serialize numbering and replay.
 PERFORM pg_advisory_xact_lock(hashtext(v_instance::text));
 v_hash:=encode(extensions.digest(convert_to(p_order::text,'UTF8'),'sha256'),'hex');
 IF EXISTS(SELECT 1 FROM private.neroxa_checkout_reconciliation x WHERE x.instance_id=v_instance
  AND x.checkout_key=v_key AND x.outcome='FENCED_ABSENT') THEN
  RAISE EXCEPTION 'Checkout fenced' USING ERRCODE='PT410';
 END IF;
 SELECT o.id,o.order_number,o.total,x.payload_sha256 INTO v_existing
 FROM public.neroxa_orders o LEFT JOIN private.neroxa_go02_checkout_operations x
 ON x.order_id=o.id AND x.instance_id=o.instance_id AND x.checkout_key=o.idempotency_key
 WHERE o.instance_id=v_instance AND o.organization_id=v_org AND o.idempotency_key=v_key;
 IF FOUND THEN
  IF v_existing.payload_sha256 IS DISTINCT FROM v_hash THEN
   RAISE EXCEPTION 'Conflicting or unproven checkout key' USING ERRCODE='PT409';
  END IF;
  SELECT i.recovery_expires_at INTO v_expires FROM private.neroxa_group_order_intents i
   WHERE i.order_id=v_existing.id AND i.payload_sha256=v_hash;
  IF v_expires IS NULL OR v_expires<=clock_timestamp() THEN
   RAISE EXCEPTION 'Recovery expired' USING ERRCODE='PT410';
  END IF;
  -- These hashes must already exist from the original atomic transaction.
  IF NOT EXISTS(SELECT 1 FROM private.neroxa_tracking_capabilities t JOIN
   private.neroxa_order_amendment_capabilities a ON a.order_id=t.order_id
   WHERE t.order_id=v_existing.id AND t.instance_id=v_instance AND a.instance_id=v_instance) THEN
   RAISE EXCEPTION 'Capability reconciliation required' USING ERRCODE='55000';
  END IF;
  RETURN QUERY SELECT v_existing.id,v_existing.order_number,v_existing.total,false;
  RETURN;
 END IF;
 PERFORM private.neroxa_assert_store_open(v_instance);
 IF v_fulfillment='DELIVERY' THEN
  v_neighborhood:=trim(coalesce(p_order->>'address_neighborhood',''));
  SELECT z.* INTO v_zone FROM public.neroxa_storefront_delivery_zones z
   WHERE z.instance_id=v_instance AND z.active AND v_neighborhood<>''
   AND EXISTS(SELECT 1 FROM unnest(z.neighborhoods) n WHERE lower(trim(n))=lower(v_neighborhood))
   ORDER BY z.sort_order LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery neighborhood unavailable' USING ERRCODE='22023'; END IF;
  v_fee:=v_zone.delivery_fee;
 END IF;
 -- Prices/snapshots are computed by the commercial catalog helper. No client
 -- unit_price, product name, addons price or subtotal is copied into order items.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_order->'items') LOOP
  v_prepared:=private.neroxa_prepare_group_item(v_instance,v_item);
  v_qty:=(v_prepared->>'quantity')::integer;v_unit:=(v_prepared->>'unit_price')::numeric;
  IF v_qty IS NULL OR v_qty<1 OR v_qty>100 OR v_qty<>(v_item->>'quantity')::integer
  OR v_unit IS NULL OR v_unit<0 OR v_unit::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Catalog price invalid' USING ERRCODE='22023';
  END IF;
  v_subtotal:=v_subtotal+v_unit*v_qty;
  v_prepared_items:=v_prepared_items||jsonb_build_array(v_prepared||jsonb_build_object('notes',nullif(v_item->>'notes','')));
 END LOOP;
 IF v_fee IS NULL OR v_fee<0 OR v_fee::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION 'Delivery price invalid' USING ERRCODE='22023';
 END IF;
 v_total:=v_subtotal+v_fee;
 IF (p_order->>'expected_total')::numeric IS DISTINCT FROM v_total THEN
  RAISE EXCEPTION 'Price changed' USING ERRCODE='PT409';
 END IF;
 SELECT coalesce(max(o.order_number),0)+1 INTO v_number FROM public.neroxa_orders o WHERE o.instance_id=v_instance;
 INSERT INTO public.neroxa_orders(instance_id,organization_id,order_number,customer_name,customer_phone,
  fulfillment,payment_method,status,subtotal,delivery_fee,total,address_street,address_number,
  address_neighborhood,address_complement,address_reference,notes,idempotency_key)
 VALUES(v_instance,v_org,v_number,trim(p_order->>'customer_name'),v_phone,v_fulfillment,v_payment,
  'RECEIVED',v_subtotal,v_fee,v_total,nullif(trim(p_order->>'address_street'),''),
  nullif(trim(p_order->>'address_number'),''),nullif(trim(p_order->>'address_neighborhood'),''),
  nullif(trim(p_order->>'address_complement'),''),nullif(trim(p_order->>'address_reference'),''),
  nullif(trim(p_order->>'notes'),''),v_key) RETURNING id INTO v_id;
 FOR v_prepared IN SELECT value FROM jsonb_array_elements(v_prepared_items) LOOP
  v_qty:=(v_prepared->>'quantity')::integer;v_unit:=(v_prepared->>'unit_price')::numeric;
  INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,product_image_url,quantity,notes,
   unit_price,line_total,addons,selection_snapshot,size_name,crust_name,crust_price)
  VALUES(v_id,(v_prepared->>'product_id')::uuid,v_prepared->>'product_name',v_prepared->>'product_image_url',
   v_qty,v_prepared->>'notes',v_unit,v_unit*v_qty,v_prepared->'addons',v_prepared->'selection_snapshot',
   v_prepared->>'size_name',v_prepared->>'crust_name',(v_prepared->>'crust_price')::numeric);
 END LOOP;
 INSERT INTO private.neroxa_group_order_intents(order_id,payload_sha256) VALUES(v_id,v_hash);
 INSERT INTO private.neroxa_go02_checkout_operations(instance_id,checkout_key,order_id,payload_sha256)
 VALUES(v_instance,v_key,v_id,v_hash);
 INSERT INTO public.neroxa_order_status_history(order_id,to_status,note) VALUES(v_id,'RECEIVED','Commercial checkout');
 v_issued:=public.neroxa_register_buyer_capabilities(v_instance,v_id,v_key,p_tracking_sha256,p_amendment_sha256);
 IF v_issued IS DISTINCT FROM true THEN RAISE EXCEPTION 'Capabilities not confirmed'; END IF;
 -- Any exception aborts order, items, intent, operation and BOTH capability hashes.
 RETURN QUERY SELECT v_id,v_number,v_total,true;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_commercial_checkout_atomic(jsonb,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_commercial_checkout_atomic(jsonb,text,text) TO service_role;
CREATE FUNCTION public.neroxa_go02_checkout_contract() RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT 'GO02_COMMERCIAL_CHECKOUT_V1'::text
 WHERE to_regprocedure('public.neroxa_commercial_checkout_atomic(jsonb,text,text)') IS NOT NULL
 AND to_regprocedure('public.neroxa_checkout_reserve_quota(uuid,text)') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.neroxa_go02_checkout_contract() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_go02_checkout_contract() TO service_role;
COMMIT;
