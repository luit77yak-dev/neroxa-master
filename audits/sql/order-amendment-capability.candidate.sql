-- DRAFT / ISOLATED TEST CANDIDATE — NEVER APPLY TO PRODUCTION.
-- A high-entropy per-order amendment capability must be created ONLY through
-- the trusted checkout server after it has created a new order.
-- The server holds the plaintext and only submits the SHA-256 hex digest here.
-- This draft does not authorize the legacy anonymous phone-only append RPC.
BEGIN;

CREATE TABLE private.neroxa_order_amendment_capabilities (
  order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT amendment_capability_expiry CHECK (expires_at > created_at)
);
CREATE INDEX neroxa_amendment_capabilities_instance_idx
  ON private.neroxa_order_amendment_capabilities(instance_id);

CREATE TABLE private.neroxa_order_amendment_operations (
  order_id uuid NOT NULL REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  added_amount numeric(12,2) NOT NULL CHECK (added_amount >= 0),
  resulting_subtotal numeric(12,2) NOT NULL CHECK (resulting_subtotal >= 0),
  resulting_total numeric(12,2) NOT NULL CHECK (resulting_total >= 0),
  payment_state text NOT NULL DEFAULT 'NOT_SETTLED'
    CHECK (payment_state = 'NOT_SETTLED'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (order_id, request_key)
);
CREATE INDEX neroxa_amendment_operations_instance_idx
  ON private.neroxa_order_amendment_operations(instance_id);

ALTER TABLE private.neroxa_order_amendment_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.neroxa_order_amendment_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_order_amendment_capabilities,
              private.neroxa_order_amendment_operations
  FROM PUBLIC, anon, authenticated, service_role;

-- If checkout fails before registration, a retry with the same unpredictable
-- checkout idempotency UUID can perform the registration exactly once. A retry
-- after success NEVER receives or rotates the already issued capability.
-- This function is service-only. Its Boolean result is not the secret token.
CREATE FUNCTION public.neroxa_register_order_amendment_capability(
  p_instance_id uuid,
  p_order_id uuid,
  p_checkout_key uuid,
  p_token_sha256 text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $register$
DECLARE
  v_order public.neroxa_orders;
  v_inserted uuid;
BEGIN
  IF p_instance_id IS NULL OR p_order_id IS NULL OR p_checkout_key IS NULL OR
     p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid amendment registration' USING ERRCODE='22023';
  END IF;

  SELECT o.* INTO v_order
    FROM public.neroxa_orders o
    JOIN public.neroxa_system_instances i ON i.id=o.instance_id
    WHERE o.id=p_order_id AND o.instance_id=p_instance_id
      AND o.idempotency_key=p_checkout_key AND i.status='ACTIVE'
    FOR UPDATE OF o;
  IF NOT FOUND OR v_order.status NOT IN ('RECEIVED','CONFIRMED') THEN
    RAISE EXCEPTION 'Amendment registration not allowed' USING ERRCODE='42501';
  END IF;

  INSERT INTO private.neroxa_order_amendment_capabilities
    (order_id,instance_id,token_sha256,expires_at)
  VALUES(p_order_id,p_instance_id,p_token_sha256,clock_timestamp() + interval '2 hours')
  ON CONFLICT(order_id) DO NOTHING
  RETURNING order_id INTO v_inserted;

  RETURN v_inserted IS NOT NULL;
END
$register$;

-- Only this RPC may modify an order with a buyer capability.
-- Phone and order UUID alone are never accepted as authorization.
-- Every successful request is atomic; a repeated request_key + identical
-- JSONB payload returns its original result without duplicating items.
CREATE FUNCTION public.neroxa_append_order_items_with_capability(
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
    v_added:=v_added+v_price*v_qty;
  END LOOP;

  UPDATE public.neroxa_orders o SET
    subtotal=o.subtotal+v_added,
    total=o.total+v_added,
    updated_at=clock_timestamp()
    WHERE o.id=p_order_id RETURNING o.* INTO v_order;

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

REVOKE EXECUTE ON FUNCTION public.neroxa_register_order_amendment_capability(
  uuid,uuid,uuid,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neroxa_register_order_amendment_capability(
  uuid,uuid,uuid,text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.neroxa_append_order_items_with_capability(
  uuid,uuid,text,uuid,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neroxa_append_order_items_with_capability(
  uuid,uuid,text,uuid,jsonb
) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon',
       'public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated',
       'public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('anon',
       'public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated',
       'public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.neroxa_append_order_items_with_capability(uuid,uuid,text,uuid,jsonb)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Unsafe order amendment EXECUTE privilege';
  END IF;
END
$verify$;
COMMIT;
