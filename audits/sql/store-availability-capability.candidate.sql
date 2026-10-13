BEGIN;
DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)'::regprocedure) IS DISTINCT FROM 'a155f86d00edea3cf807723f7cac5838' THEN RAISE EXCEPTION 'Unexpected capability body'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.neroxa_append_order_items_with_capability(
  p_instance_id uuid,
  p_order_id uuid,
  p_token text,
  p_request_key uuid,
  p_items jsonb
) RETURNS TABLE (
  order_id uuid,
  order_number bigint,
  subtotal numeric,
  total numeric,
  added_amount numeric,
  payment_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $amend$
DECLARE
  v_prepared jsonb;
  v_group boolean:=false;
  v_order public.neroxa_orders;
  v_cap private.neroxa_order_amendment_capabilities;
  v_prior private.neroxa_order_amendment_operations;
  v_hash text;
  v_qty integer;
  v_item jsonb;
  v_price numeric;
  v_added numeric(12,2):=0;
  v_payload_hash text;
BEGIN
  IF p_instance_id IS NULL OR p_order_id IS NULL OR p_request_key IS NULL OR
     p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' OR
     p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR
     jsonb_array_length(p_items) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid amendment request' USING ERRCODE='22023';
  END IF;

  SELECT o.* INTO v_order FROM public.neroxa_orders o
    JOIN public.neroxa_system_instances i ON i.id=o.instance_id
    WHERE o.id=p_order_id AND o.instance_id=p_instance_id AND i.status='ACTIVE'
    FOR UPDATE OF o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment not authorized' USING ERRCODE='42501';
  END IF;

  v_hash:=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex');
  SELECT c.* INTO v_cap
    FROM private.neroxa_order_amendment_capabilities c
    WHERE c.order_id=p_order_id AND c.instance_id=p_instance_id
      AND c.token_sha256=v_hash
      AND c.revoked_at IS NULL AND c.expires_at > clock_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amendment not authorized' USING ERRCODE='42501';
  END IF;

  v_payload_hash:=encode(extensions.digest(convert_to(p_items::text,'UTF8'),'sha256'),'hex');
  SELECT op.* INTO v_prior FROM private.neroxa_order_amendment_operations op
    WHERE op.order_id=p_order_id AND op.request_key=p_request_key;
  IF FOUND THEN
    IF v_prior.payload_sha256 IS DISTINCT FROM v_payload_hash OR
       v_prior.instance_id IS DISTINCT FROM p_instance_id THEN
      RAISE EXCEPTION 'Conflicting amendment idempotency key' USING ERRCODE='22023';
    END IF;
    order_id:=p_order_id;
    order_number:=v_order.order_number;
    subtotal:=v_prior.resulting_subtotal;
    total:=v_prior.resulting_total;
    added_amount:=v_prior.added_amount;
    payment_state:=v_prior.payment_state;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM private.neroxa_assert_store_open(p_instance_id);
  -- PREPARING requires a separate supplier approval workflow.
  IF v_order.status NOT IN ('RECEIVED','CONFIRMED') THEN
    RAISE EXCEPTION 'Order no longer accepts automatic additions'
      USING ERRCODE='22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR
       jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number' OR
       (v_item->>'quantity') !~ '^[1-9][0-9]*$' OR
       length(v_item->>'quantity') > 2 THEN
      RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE='22023';
    END IF;
    v_qty:=(v_item->>'quantity')::integer;
    IF v_qty > 10 THEN
      RAISE EXCEPTION 'Invalid item quantity' USING ERRCODE='22023';
    END IF;

    -- Give cross-store product attempts a deterministic invalid-input SQLSTATE
    -- rather than leaking the calculation helper's internal P0001 error.
    IF NOT EXISTS (
      SELECT 1 FROM public.neroxa_storefront_products p
      WHERE p.id=nullif(v_item->>'product_id','')::uuid
        AND p.instance_id=p_instance_id AND p.active
    ) THEN
      RAISE EXCEPTION 'Product not available in this store' USING ERRCODE='22023';
    END IF;

    IF v_item->>'selection_contract'='GROUP_ADDONS_V1' THEN
     v_group:=true;
     v_prepared:=private.neroxa_prepare_group_item(p_instance_id,v_item);
     v_price:=(v_prepared->>'unit_price')::numeric;
     INSERT INTO public.neroxa_order_items(order_id,product_id,product_name,product_image_url,quantity,notes,unit_price,line_total,addons,selection_snapshot,size_name,crust_name,crust_price)
     VALUES(v_order.id,(v_prepared->>'product_id')::uuid,v_prepared->>'product_name',v_prepared->>'product_image_url',v_qty,nullif(v_item->>'notes',''),v_price,v_price*v_qty,v_prepared->'addons',v_prepared->'selection_snapshot',v_prepared->>'size_name',v_prepared->>'crust_name',(v_prepared->>'crust_price')::numeric);
    ELSE
     IF private.neroxa_requires_group_contract(p_instance_id,(v_item->>'product_id')::uuid) THEN RAISE EXCEPTION 'Product requires explicit grouped contract' USING ERRCODE='22023'; END IF;
     IF v_item ? 'group_addon_ids' OR (v_item ? 'selection_contract' AND v_item->>'selection_contract'<>'LEGACY_PRODUCT_V1') THEN RAISE EXCEPTION 'Selection contract mismatch' USING ERRCODE='22023'; END IF;
    v_price:=public.calculate_public_order_line_price(
      p_instance_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'second_product_id','')::uuid,
      nullif(v_item->>'size_id',''),
      nullif(v_item->>'crust_id',''),
      coalesce(v_item->'addons','[]'::jsonb),
      coalesce(v_item->'complements','[]'::jsonb)
    );
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Invalid item price' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.neroxa_order_items
      (order_id,product_id,product_name,product_image_url,second_product_id,
       second_product_name,is_half,addons,complements,quantity,notes,unit_price,line_total)
    SELECT v_order.id,p.id,p.name,p.image_url,
      nullif(v_item->>'second_product_id','')::uuid,p2.name,
      coalesce((v_item->>'is_half')::boolean,false),
      coalesce(v_item->'addons','[]'::jsonb),
      coalesce(v_item->'complements','[]'::jsonb),
      v_qty,nullif(v_item->>'notes',''),v_price,v_price*v_qty
      FROM public.neroxa_storefront_products p
      LEFT JOIN public.neroxa_storefront_products p2
        ON p2.id=nullif(v_item->>'second_product_id','')::uuid
       AND p2.instance_id=p_instance_id AND p2.active
      WHERE p.id=nullif(v_item->>'product_id','')::uuid
        AND p.instance_id=p_instance_id AND p.active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not available in this store' USING ERRCODE='22023';
    END IF;
    END IF;
    v_added:=v_added+v_price*v_qty;
  END LOOP;

  UPDATE public.neroxa_orders o SET
    subtotal=o.subtotal+v_added,
    total=o.total+v_added,
    updated_at=clock_timestamp()
    WHERE o.id=p_order_id RETURNING o.* INTO v_order;

  IF v_group THEN INSERT INTO public.neroxa_order_status_history(order_id,from_status,to_status,note) VALUES(p_order_id,v_order.status,v_order.status,'GROUP_ADDONS_V1 items appended; NOT_SETTLED'); END IF;

  INSERT INTO private.neroxa_order_amendment_operations
    (order_id,request_key,instance_id,payload_sha256,added_amount,
     resulting_subtotal,resulting_total,payment_state)
  VALUES(p_order_id,p_request_key,p_instance_id,v_payload_hash,v_added,
    v_order.subtotal,v_order.total,'NOT_SETTLED');

  order_id:=v_order.id;
  order_number:=v_order.order_number;
  subtotal:=v_order.subtotal;
  total:=v_order.total;
  added_amount:=v_added;
  payment_state:='NOT_SETTLED';
  RETURN NEXT;
END
$amend$;
COMMIT;
