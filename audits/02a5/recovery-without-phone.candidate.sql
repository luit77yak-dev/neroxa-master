-- Disposable candidate only: remove phone RPC dependency from service-only recovery.
-- Preserve the existing exact payload hash/key/instance/expiry authorization.
BEGIN;
DO $$ BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'Disposable intent required'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.neroxa_recover_group_order(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM 'a7b00a68fa486f741d813e15fb96035a' THEN RAISE EXCEPTION 'Recovery wrapper predecessor drift'; END IF;
 IF to_regprocedure('private.neroxa_recovery_order_snapshot(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Private recovery helper already exists'; END IF;
END $$;
CREATE FUNCTION private.neroxa_recovery_order_snapshot(p_order_id uuid,p_instance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $snapshot$

declare v_order public.neroxa_orders; v_items jsonb;
begin
  select * into v_order from public.neroxa_orders
  where id=p_order_id and instance_id=p_instance_id;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'lineId', i.id::text, 'productId', i.product_id, 'productName', i.product_name,
    'imageUrl', i.product_image_url, 'secondProductId', i.second_product_id,
    'secondProductName', i.second_product_name, 'isHalf', i.is_half,
    'sizeId', i.size_id, 'sizeName', i.size_name, 'crustId', i.crust_id, 'crustName', i.crust_name,
    'crustPrice', i.crust_price, 'addons', i.addons, 'complements', i.complements,
    'quantity', i.quantity, 'notes', i.notes, 'unitPrice', i.unit_price
  ) order by i.created_at), '[]'::jsonb) into v_items
  from public.neroxa_order_items i where i.order_id=v_order.id;

  return jsonb_build_object(
    'id',v_order.id,'order_id',v_order.id,'order_number',v_order.order_number,
    'status',v_order.status,'customer_name',v_order.customer_name,'customer_phone',v_order.customer_phone,
    'fulfillment',v_order.fulfillment,'payment_method',v_order.payment_method,
    'subtotal',v_order.subtotal,'delivery_fee',v_order.delivery_fee,'total',v_order.total,
    'address_street',v_order.address_street,'address_number',v_order.address_number,
    'address_neighborhood',v_order.address_neighborhood,'address_complement',v_order.address_complement,
    'address_reference',v_order.address_reference,'notes',v_order.notes,'items',v_items,
    'created_at',v_order.created_at,'updated_at',v_order.updated_at
  );
end;
$snapshot$;
REVOKE ALL ON FUNCTION private.neroxa_recovery_order_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.neroxa_recover_group_order(uuid,uuid,jsonb)'::regprocedure) INTO definition;
 IF strpos(definition,'RETURN public.get_public_order_status(o.id,o.customer_phone)')=0 THEN RAISE EXCEPTION 'Recovery wrapper dependency drift'; END IF;
 definition:=replace(definition,'RETURN public.get_public_order_status(o.id,o.customer_phone)','RETURN private.neroxa_recovery_order_snapshot(o.id,o.instance_id)');
 EXECUTE definition;
 IF has_function_privilege('anon','public.neroxa_recover_group_order(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.neroxa_recover_group_order(uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.neroxa_recover_group_order(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('service_role','private.neroxa_recovery_order_snapshot(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Recovery ACL drift'; END IF;
END
$patch$;
COMMIT;
