-- REVIEW-ONLY; never remote. Transaction/journal envelope is enforced by runner.
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR current_setting('app.bridge_environment',true) IS DISTINCT FROM 'local-disposable'
 THEN RAISE EXCEPTION 'BRIDGE_DISPOSABLE_CONTEXT_REQUIRED'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL
 THEN RAISE EXCEPTION 'BRIDGE_REAL_AUTH_REQUIRED'; END IF;
 IF pg_has_role('anon','postgres','MEMBER') OR pg_has_role('authenticated','service_role','MEMBER')
 THEN RAISE EXCEPTION 'BRIDGE_ROLE_ESCALATION'; END IF;
END $$;
DO $$ BEGIN IF current_setting('app.bridge_consumers_frozen',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'BRIDGE_FROZEN_CONSUMERS_REQUIRED'; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;
CREATE OR REPLACE FUNCTION private.neroxa_has_platform_role(p_roles neroxa_platform_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.neroxa_platform_members m
    where m.user_id = (select auth.uid())
      and m.active
      and m.role = any(p_roles)
  );
$function$
;
REVOKE ALL ON FUNCTION "private"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "private"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) TO "authenticated";
CREATE OR REPLACE FUNCTION private.neroxa_is_platform_staff(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select exists (
    select 1
    from public.neroxa_platform_members m
    where m.user_id = p_user_id
      and m.active = true
  );
$function$
;
REVOKE ALL ON FUNCTION "private"."neroxa_is_platform_staff"(p_user_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "private"."neroxa_is_platform_staff"(p_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."neroxa_is_platform_staff"(p_user_id uuid) TO "authenticated";
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
 update public.neroxa_orders set subtotal=subtotal+v_add,total=total+v_add,payment_method=coalesce(p_payment_method,payment_method),updated_at=now() where id=v_order.id returning * into v_order;
 order_id:=v_order.id;order_number:=v_order.order_number;subtotal:=v_order.subtotal;total:=v_order.total;return next;
end $function$
;
REVOKE ALL ON FUNCTION "public"."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "service_role";
CREATE OR REPLACE FUNCTION public.calculate_public_order_line_price(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_product record; v_second record; v_org uuid; v_rule text:='highest_half'; v_fixed numeric;
 v_base numeric:=0; v_second_base numeric:=0; v_crust numeric:=0; v_addons numeric:=0; v_complements numeric:=0;
 v_choice jsonb; v_item jsonb; v_id uuid; v_addon_price numeric;
begin
 select p.*,i.organization_id into v_product from public.neroxa_storefront_products p
 join public.neroxa_system_instances i on i.id=p.instance_id
 where p.id=p_product_id and p.instance_id=p_instance_id and p.active;
 if not found then raise exception 'Produto não disponível'; end if;
 v_org:=v_product.organization_id;
 select s.half_pizza_pricing_rule,s.half_pizza_fixed_price into v_rule,v_fixed from public.neroxa_storefront_settings s where s.organization_id=v_org;

 v_base:=coalesce(v_product.price,0);
 if p_size_id is not null then
  select choice into v_choice from jsonb_array_elements(coalesce(v_product.metadata->'options','[]'::jsonb)) opt
  cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
  where opt->>'id'='tamanho' and choice->>'id'=p_size_id limit 1;
  v_base:=v_base+coalesce((v_choice->>'price')::numeric,0);
 end if;

 if p_second_product_id is not null then
  select * into v_second from public.neroxa_storefront_products where id=p_second_product_id and instance_id=p_instance_id and active;
  if not found then raise exception 'Segundo sabor não disponível'; end if;
  v_second_base:=coalesce(v_second.price,0);
  if p_size_id is not null then
   select choice into v_choice from jsonb_array_elements(coalesce(v_second.metadata->'options','[]'::jsonb)) opt
   cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
   where opt->>'id'='tamanho' and choice->>'id'=p_size_id limit 1;
   v_second_base:=v_second_base+coalesce((v_choice->>'price')::numeric,0);
  end if;
  if coalesce(v_rule,'highest_half')='average_halves' then v_base:=(v_base+v_second_base)/2;
  elsif coalesce(v_rule,'highest_half')='fixed_price' and v_fixed is not null then v_base:=v_fixed;
  else v_base:=greatest(v_base,v_second_base);
  end if;
 end if;

 if p_crust_id is not null then
  select coalesce((choice->>'price')::numeric,0) into v_crust
  from jsonb_array_elements(coalesce(v_product.metadata->'options','[]'::jsonb)) opt
  cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
  where opt->>'id'='borda' and choice->>'id'=p_crust_id limit 1;
 end if;

 for v_item in select * from jsonb_array_elements(coalesce(p_addons,'[]'::jsonb)) loop
  v_id:=nullif(v_item->>'id','')::uuid;
  if v_id is null then raise exception 'Adicional inválido'; end if;
  select price into v_addon_price from public.neroxa_storefront_products where id=v_id and instance_id=p_instance_id and active;
  if not found then raise exception 'Adicional não disponível'; end if;
  v_addons:=v_addons+coalesce(v_addon_price,0);
 end loop;

 for v_item in select * from jsonb_array_elements(coalesce(p_complements,'[]'::jsonb)) loop
  v_id:=nullif(v_item->>'productId','')::uuid;
  if v_id is null then raise exception 'Acompanhamento inválido'; end if;
  select price into v_addon_price from public.neroxa_storefront_products where id=v_id and instance_id=p_instance_id and active;
  if not found then raise exception 'Acompanhamento não disponível'; end if;
  v_complements:=v_complements+coalesce(v_addon_price,0);
 end loop;

 return v_base+v_crust+v_addons+v_complements;
end $function$
;
REVOKE ALL ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_org uuid:=nullif(p_order->>'organization_id','')::uuid;
 v_instance uuid; v_order_id uuid; v_number bigint;
 v_subtotal numeric(12,2):=0; v_delivery_fee numeric(12,2):=0; v_total numeric(12,2);
 v_fulfillment text:=coalesce(p_order->>'fulfillment','DELIVERY'); v_payment text:=coalesce(p_order->>'payment_method','PIX');
 v_phone text:=trim(coalesce(p_order->>'customer_phone','')); v_item jsonb; v_unit numeric; v_qty integer; v_zone record; v_neighborhood text;
begin
 if v_org is null or v_phone='' or trim(coalesce(p_order->>'customer_name',''))='' then raise exception 'Dados do cliente incompletos'; end if;
 select i.id into v_instance from public.neroxa_system_instances i where i.organization_id=v_org and i.status='ACTIVE' order by i.created_at limit 1;
 if v_instance is null then raise exception 'Loja ativa não encontrada'; end if;
 if nullif(p_order->>'idempotency_key','') is not null then
  select o.id,o.order_number,o.total into v_order_id,v_number,v_total from public.neroxa_orders o where o.instance_id=v_instance and o.idempotency_key=(p_order->>'idempotency_key')::uuid;
  if v_order_id is not null then order_id:=v_order_id;order_number:=v_number;total:=v_total;return next;return;end if;
 end if;
 if jsonb_array_length(coalesce(p_order->'items','[]'::jsonb))=0 then raise exception 'O pedido precisa ter pelo menos um item'; end if;
 if v_fulfillment not in ('DELIVERY','PICKUP') or v_payment not in ('CASH','PIX','CARD_ON_DELIVERY','CARD_ON_SITE') then raise exception 'Forma de recebimento ou pagamento inválida'; end if;
 if v_fulfillment='DELIVERY' then
  v_neighborhood:=trim(coalesce(p_order->>'address_neighborhood',''));
  if v_neighborhood='' then raise exception 'Bairro de entrega obrigatório'; end if;
  select z.* into v_zone from public.neroxa_storefront_delivery_zones z
  where z.organization_id=v_org and z.active and exists(select 1 from unnest(z.neighborhoods) n where lower(trim(n))=lower(v_neighborhood))
  order by z.sort_order limit 1;
  if not found then raise exception 'Bairro não atendido pela loja'; end if;
  v_delivery_fee:=v_zone.delivery_fee;
 end if;
 perform pg_advisory_xact_lock(hashtext(v_instance::text));
 select coalesce(max(o.order_number),0)+1 into v_number from public.neroxa_orders o where o.instance_id=v_instance;
 insert into public.neroxa_orders(instance_id,organization_id,order_number,customer_name,customer_phone,fulfillment,payment_method,status,delivery_fee,address_street,address_number,address_neighborhood,address_complement,address_reference,notes,idempotency_key)
 values(v_instance,v_org,v_number,trim(p_order->>'customer_name'),v_phone,v_fulfillment,v_payment,'RECEIVED',v_delivery_fee,nullif(trim(p_order->>'address_street'),''),nullif(trim(p_order->>'address_number'),''),nullif(trim(p_order->>'address_neighborhood'),''),nullif(trim(p_order->>'address_complement'),''),nullif(trim(p_order->>'address_reference'),''),nullif(trim(p_order->>'notes'),''),nullif(p_order->>'idempotency_key','')::uuid)
 returning id into v_order_id;

 for v_item in select * from jsonb_array_elements(p_order->'items') loop
  v_qty:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
  v_unit:=public.calculate_public_order_line_price(v_instance,nullif(v_item->>'product_id','')::uuid,nullif(v_item->>'second_product_id','')::uuid,nullif(v_item->>'size_id',''),nullif(v_item->>'crust_id',''),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb));
  insert into public.neroxa_order_items(order_id,product_id,product_name,product_image_url,second_product_id,second_product_name,is_half,size_id,size_name,crust_id,crust_name,crust_price,addons,complements,quantity,notes,unit_price,line_total)
  select v_order_id,p.id,p.name,p.image_url,nullif(v_item->>'second_product_id','')::uuid,p2.name,coalesce((v_item->>'is_half')::boolean,false),nullif(v_item->>'size_id','')::uuid,nullif(v_item->>'size_name',''),nullif(v_item->>'crust_id','')::uuid,nullif(v_item->>'crust_name',''),coalesce((v_item->>'crust_price')::numeric,0),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb),v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty
  from public.neroxa_storefront_products p
  left join public.neroxa_storefront_products p2 on p2.id=nullif(v_item->>'second_product_id','')::uuid and p2.instance_id=v_instance
  where p.id=nullif(v_item->>'product_id','')::uuid and p.instance_id=v_instance and p.active;
  if not found then raise exception 'Produto não disponível'; end if;
  v_subtotal:=v_subtotal+v_unit*v_qty;
 end loop;
 v_total:=v_subtotal+v_delivery_fee;
 update public.neroxa_orders set subtotal=v_subtotal,total=v_total,updated_at=now() where id=v_order_id;
 insert into public.neroxa_order_status_history(order_id,to_status,note) values(v_order_id,'RECEIVED','Pedido criado pelo site');
 order_id:=v_order_id;order_number:=v_number;total:=v_total;return next;
end $function$
;
REVOKE ALL ON FUNCTION "public"."create_public_order"(p_order jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."create_public_order"(p_order jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."create_public_order"(p_order jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."create_public_order"(p_order jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."create_public_order"(p_order jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_admin_orders(p_instance_id uuid, p_status text DEFAULT NULL::text)
 RETURNS SETOF neroxa_orders
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o from public.neroxa_orders o
  where o.instance_id=p_instance_id
    and (p_status is null or o.status=p_status)
    and (public.neroxa_is_platform_member())
  order by o.created_at desc;
$function$
;
REVOKE ALL ON FUNCTION "public"."get_admin_orders"(p_instance_id uuid, p_status text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."get_admin_orders"(p_instance_id uuid, p_status text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_admin_orders"(p_instance_id uuid, p_status text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_admin_orders"(p_instance_id uuid, p_status text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_admin_orders"(p_instance_id uuid, p_status text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.neroxa_orders; v_items jsonb;
begin
  select * into v_order from public.neroxa_orders
  where id=p_order_id and regexp_replace(customer_phone,'\\D','','g')=regexp_replace(trim(p_customer_phone),'\\D','','g');
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
$function$
;
REVOKE ALL ON FUNCTION "public"."get_public_order_status"(p_order_id uuid, p_customer_phone text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_public_storefront_catalog(p_domain text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_instance uuid;
  v_org uuid;
  v_context jsonb;
  v_categories jsonb;
  v_products jsonb;
  v_settings jsonb;
  v_zones jsonb;
  v_addon_groups jsonb;
begin
  select x.instance_id, x.organization_id into v_instance, v_org
  from public.get_public_storefront_context(p_domain) x limit 1;
  if v_instance is null then return null; end if;

  select to_jsonb(x) into v_context from public.get_public_storefront_context(p_domain) x limit 1;

  select coalesce(jsonb_agg(to_jsonb(c) - 'instance_id' order by c.sort_order, c.name), '[]'::jsonb)
    into v_categories from public.neroxa_storefront_categories c
    where c.instance_id = v_instance and c.active;

  select coalesce(jsonb_agg(to_jsonb(p) - 'instance_id' order by p.sort_order, p.name), '[]'::jsonb)
    into v_products from public.neroxa_storefront_products p
    where p.instance_id = v_instance and p.active;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'name', g.name, 'required', g.required,
      'min_selections', g.min_selections, 'max_selections', g.max_selections,
      'active', g.active, 'sort_order', g.sort_order,
      'products', coalesce((
        select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'sort_order', l.sort_order)
          order by l.sort_order)
        from public.neroxa_storefront_product_addon_groups l
        where l.group_id = g.id
      ), '[]'::jsonb),
      'addons', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'price_delta', a.price_delta,
          'active', a.active, 'sort_order', a.sort_order
        ) order by a.sort_order, a.name)
        from public.neroxa_storefront_addons a
        where a.group_id = g.id and a.active
      ), '[]'::jsonb)
    ) order by g.sort_order, g.name
  ), '[]'::jsonb) into v_addon_groups
  from public.neroxa_storefront_addon_groups g
  where g.instance_id = v_instance and g.active;

  select to_jsonb(s) - 'organization_id' into v_settings
  from public.neroxa_storefront_settings s where s.organization_id = v_org;

  if v_settings is null then
    v_settings := jsonb_build_object(
      'payment_methods', jsonb_build_array('PIX'), 'delivery_enabled', true, 'pickup_enabled', true,
      'pickup_instructions', null, 'min_order_amount', 0, 'estimated_delivery_minutes', 45,
      'estimated_pickup_minutes', 20, 'description', null, 'whatsapp_phone', null,
      'address_street', null, 'address_number', null, 'address_neighborhood', null,
      'address_city', null, 'address_state', null, 'address_zip', null, 'logo_url', null,
      'hero_image_url', null, 'hero_title', null, 'hero_subtitle', null, 'hero_cta_label', null,
      'primary_color', '145 28% 32%', 'secondary_color', '42 35% 96%', 'font_family', 'inherit',
      'social_links', '{}'::jsonb, 'half_pizza_pricing_rule', 'highest_half',
      'half_pizza_fixed_price', null, 'loyalty_points_per_currency', 0, 'scheduling_enabled', false,
      'visual_overrides', '{}'::jsonb
    );
  else
    v_settings := jsonb_set(v_settings, '{visual_overrides}', coalesce(v_settings->'visual_overrides', '{}'::jsonb), true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', z.id, 'name', z.name, 'neighborhoods', z.neighborhoods,
    'minimum_order', z.minimum_order, 'delivery_fee', z.delivery_fee,
    'estimated_minutes', z.estimated_minutes, 'active', z.active
  ) order by z.sort_order, z.name), '[]'::jsonb) into v_zones
  from public.neroxa_storefront_delivery_zones z
  where z.organization_id = v_org and z.active;

  return jsonb_build_object(
    'context', v_context, 'categories', v_categories, 'products', v_products,
    'settings', v_settings, 'delivery_zones', v_zones, 'addon_groups', v_addon_groups
  );
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."get_public_storefront_catalog"(p_domain text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_catalog"(p_domain text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_catalog"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_catalog"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_catalog"(p_domain text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_public_storefront_context(p_domain text)
 RETURNS TABLE(domain text, instance_id uuid, instance_slug text, instance_name text, instance_status text, organization_id uuid, organization_name text, system_id uuid, system_slug text, system_name text, system_type text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    d.domain,
    i.id,
    i.slug,
    i.name,
    i.status::text,
    i.organization_id,
    o.trade_name,
    s.id,
    s.slug,
    s.name,
    s.system_type
  from public.neroxa_system_domains d
  join public.neroxa_system_instances i on i.id = d.system_instance_id
  join public.neroxa_organizations o on o.id = i.organization_id
  left join public.neroxa_systems s on s.id = i.system_id
  where lower(d.domain) = lower(trim(trailing '.' from trim(p_domain)))
    and d.status = 'VERIFIED'
    and i.status = 'ACTIVE'
    and o.active = true
    and (s.id is null or s.active = true)
  limit 1;
$function$
;
REVOKE ALL ON FUNCTION "public"."get_public_storefront_context"(p_domain text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_context"(p_domain text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_context"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_context"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_public_storefront_context"(p_domain text) TO "service_role";
CREATE OR REPLACE FUNCTION public.guard_neroxa_implementation_write_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_setting('neroxa.implementation_write_path', true) is distinct from 'official' then
    raise exception 'Escrita de implantação deve ocorrer exclusivamente pelo fluxo oficial';
  end if;
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."guard_neroxa_implementation_write_path"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."guard_neroxa_implementation_write_path"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."guard_neroxa_implementation_write_path"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."guard_neroxa_implementation_write_path"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."guard_neroxa_implementation_write_path"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."guard_neroxa_implementation_write_path"() TO "service_role";
CREATE OR REPLACE FUNCTION public.neroxa_has_org_role(target_organization_id uuid, allowed_roles neroxa_organization_role[] DEFAULT NULL::neroxa_organization_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.neroxa_organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.active = true
      and (allowed_roles is null or m.role = any(allowed_roles))
  );
$function$
;
REVOKE ALL ON FUNCTION "public"."neroxa_has_org_role"(target_organization_id uuid, allowed_roles neroxa_organization_role[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_org_role"(target_organization_id uuid, allowed_roles neroxa_organization_role[]) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_org_role"(target_organization_id uuid, allowed_roles neroxa_organization_role[]) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_org_role"(target_organization_id uuid, allowed_roles neroxa_organization_role[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_org_role"(target_organization_id uuid, allowed_roles neroxa_organization_role[]) TO "service_role";
CREATE OR REPLACE FUNCTION public.neroxa_has_platform_role(p_roles neroxa_platform_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.neroxa_platform_members m
      where m.user_id = (select auth.uid())
        and m.active
        and m.role = any(p_roles)
    );
$function$
;
REVOKE ALL ON FUNCTION "public"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."neroxa_has_platform_role"(p_roles neroxa_platform_role[]) TO "service_role";
CREATE OR REPLACE FUNCTION public.neroxa_is_platform_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.neroxa_platform_members m
      where m.user_id = (select auth.uid())
        and m.active
    );
$function$
;
REVOKE ALL ON FUNCTION "public"."neroxa_is_platform_member"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."neroxa_is_platform_member"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."neroxa_is_platform_member"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."neroxa_is_platform_member"() TO "service_role";
CREATE OR REPLACE FUNCTION public.neroxa_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."neroxa_set_updated_at"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."neroxa_set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."neroxa_set_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."neroxa_set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."neroxa_set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."neroxa_set_updated_at"() TO "service_role";
CREATE OR REPLACE FUNCTION public.reset_neroxa_domain_verification_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin if new.domain is distinct from old.domain then new.status := 'PENDING'::public.neroxa_domain_status; new.verified_at := null; end if; return new; end; $function$
;
REVOKE ALL ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reset_neroxa_domain_verification_on_change"() TO "service_role";
CREATE OR REPLACE FUNCTION public.set_neroxa_systems_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."set_neroxa_systems_updated_at"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."set_neroxa_systems_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_neroxa_systems_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_neroxa_systems_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_neroxa_systems_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_neroxa_systems_updated_at"() TO "service_role";
CREATE OR REPLACE FUNCTION public.sync_domains_with_instance_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status = 'ARCHIVED' then
    update public.neroxa_system_domains
    set status = 'DISABLED'::neroxa_domain_status,
        updated_at = now()
    where system_instance_id = new.id
      and is_primary = false
      and status <> 'DISABLED'::neroxa_domain_status;
  end if;

  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."sync_domains_with_instance_status"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."sync_domains_with_instance_status"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."sync_domains_with_instance_status"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."sync_domains_with_instance_status"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."sync_domains_with_instance_status"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sync_domains_with_instance_status"() TO "service_role";
CREATE OR REPLACE FUNCTION public.update_admin_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS neroxa_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.neroxa_orders; v_old text;
begin
 if not public.neroxa_is_platform_member() then raise exception 'Acesso negado'; end if;
 select * into v_order from public.neroxa_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if p_status not in ('RECEIVED','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') then raise exception 'Status inválido'; end if;
 v_old:=v_order.status;
 update public.neroxa_orders set status=p_status,updated_at=now(),
 confirmed_at=case when p_status='CONFIRMED' and confirmed_at is null then now() else confirmed_at end,
 preparing_at=case when p_status='PREPARING' and preparing_at is null then now() else preparing_at end,
 ready_at=case when p_status='READY' and ready_at is null then now() else ready_at end,
 out_for_delivery_at=case when p_status='OUT_FOR_DELIVERY' and out_for_delivery_at is null then now() else out_for_delivery_at end,
 delivered_at=case when p_status='DELIVERED' and delivered_at is null then now() else delivered_at end,
 cancelled_at=case when p_status='CANCELLED' and cancelled_at is null then now() else cancelled_at end
 where id=p_order_id returning * into v_order;
 insert into public.neroxa_order_status_history(order_id,from_status,to_status,changed_by_user_id,note)
 values(p_order_id,v_old,p_status,auth.uid(),nullif(trim(p_note),''));
 return v_order;
end;
$function$
;
REVOKE ALL ON FUNCTION "public"."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "service_role";
ALTER TABLE public."neroxa_organization_members" ADD CONSTRAINT "neroxa_organization_members_organization_id_user_id_key" UNIQUE (organization_id, user_id);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_email_not_blank" CHECK (email IS NULL OR length(btrim(email)) > 0);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_legal_name_not_blank" CHECK (length(btrim(legal_name)) > 0);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_status_check" CHECK (status = ANY (ARRAY['LEAD'::text, 'PROPOSAL'::text, 'NEGOTIATION'::text, 'CONTRACTED'::text, 'IMPLEMENTATION'::text, 'ACTIVE'::text, 'PAUSED'::text, 'DELINQUENT'::text, 'CANCELLED'::text]));
ALTER TABLE public."neroxa_platform_members" ADD CONSTRAINT "neroxa_platform_members_user_id_key" UNIQUE (user_id);
ALTER TABLE public."neroxa_storefront_addon_groups" ADD CONSTRAINT "neroxa_storefront_addon_groups_check" CHECK (max_selections > 0 AND max_selections >= min_selections);
ALTER TABLE public."neroxa_storefront_addon_groups" ADD CONSTRAINT "neroxa_storefront_addon_groups_min_selections_check" CHECK (min_selections >= 0);
ALTER TABLE public."neroxa_storefront_addon_groups" ADD CONSTRAINT "neroxa_storefront_addon_groups_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_addons" ADD CONSTRAINT "neroxa_storefront_addons_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_addons" ADD CONSTRAINT "neroxa_storefront_addons_price_delta_check" CHECK (price_delta >= 0::numeric);
ALTER TABLE public."neroxa_storefront_categories" ADD CONSTRAINT "neroxa_storefront_categories_instance_id_slug_key" UNIQUE (instance_id, slug);
ALTER TABLE public."neroxa_storefront_categories" ADD CONSTRAINT "neroxa_storefront_categories_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_delivery_fee_check" CHECK (delivery_fee >= 0::numeric);
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_estimated_minutes_check" CHECK (estimated_minutes IS NULL OR estimated_minutes > 0);
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_minimum_order_check" CHECK (minimum_order >= 0::numeric);
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_pkey" PRIMARY KEY (product_id, group_id);
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_instance_id_slug_key" UNIQUE (instance_id, slug);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_estimated_delivery_minutes_check" CHECK (estimated_delivery_minutes > 0);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_estimated_pickup_minutes_check" CHECK (estimated_pickup_minutes > 0);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_min_order_amount_check" CHECK (min_order_amount >= 0::numeric);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_storefront_theme_check" CHECK (storefront_theme = ANY (ARRAY['neroxa-classic'::text, 'neroxa-horizontal'::text, 'neroxa-accordion'::text, 'burger-club'::text]));
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_visual_overrides_object" CHECK (jsonb_typeof(visual_overrides) = 'object'::text);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_domain_format" CHECK (length(TRIM(BOTH FROM domain)) > 0 AND domain = lower(domain) AND POSITION((' '::text) IN (domain)) = 0 AND POSITION(('/'::text) IN (domain)) = 0 AND POSITION(('://'::text) IN (domain)) = 0);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_primary_not_disabled" CHECK (NOT (is_primary AND status = 'DISABLED'::neroxa_domain_status));
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_slug_format" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_slug_key" UNIQUE (slug);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_type_check" CHECK (system_type = ANY (ARRAY['DELIVERY'::text, 'FOOD'::text, 'CLINIC'::text, 'BEAUTY'::text, 'BARBER'::text, 'FITNESS'::text, 'CUSTOM'::text]));
ALTER TABLE public."neroxa_orders" DROP CONSTRAINT "neroxa_orders_instance_id_fkey";
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_orders" DROP CONSTRAINT "neroxa_orders_organization_id_fkey";
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_organization_members" ADD CONSTRAINT "neroxa_organization_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_platform_members" ADD CONSTRAINT "neroxa_platform_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_addon_groups" ADD CONSTRAINT "neroxa_storefront_addon_groups_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_addons" ADD CONSTRAINT "neroxa_storefront_addons_group_id_fkey" FOREIGN KEY (group_id) REFERENCES neroxa_storefront_addon_groups(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_categories" ADD CONSTRAINT "neroxa_storefront_categories_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES neroxa_storefront_addon_groups(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_product_id_fkey" FOREIGN KEY (product_id) REFERENCES neroxa_storefront_products(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES neroxa_storefront_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_neroxa_domains_instance ON public.neroxa_system_domains USING btree (system_instance_id);
CREATE INDEX idx_neroxa_instances_org ON public.neroxa_system_instances USING btree (organization_id);
CREATE INDEX idx_neroxa_instances_plan ON public.neroxa_system_instances USING btree (plan_id);
CREATE INDEX idx_neroxa_instances_status ON public.neroxa_system_instances USING btree (status);
CREATE INDEX idx_neroxa_order_history_order ON public.neroxa_order_status_history USING btree (order_id, created_at);
CREATE INDEX idx_neroxa_order_items_order ON public.neroxa_order_items USING btree (order_id);
CREATE INDEX idx_neroxa_orders_instance_status ON public.neroxa_orders USING btree (instance_id, status, created_at DESC);
CREATE INDEX idx_neroxa_orders_org_created ON public.neroxa_orders USING btree (organization_id, created_at DESC);
CREATE INDEX idx_neroxa_orders_phone ON public.neroxa_orders USING btree (customer_phone, created_at DESC);
CREATE INDEX idx_neroxa_org_members_user_org ON public.neroxa_organization_members USING btree (user_id, organization_id) WHERE (active = true);
CREATE INDEX idx_neroxa_platform_members_user ON public.neroxa_platform_members USING btree (user_id);
CREATE UNIQUE INDEX idx_neroxa_system_instances_subscription_id ON public.neroxa_system_instances USING btree (subscription_id) WHERE (subscription_id IS NOT NULL);
CREATE INDEX idx_storefront_categories_instance ON public.neroxa_storefront_categories USING btree (instance_id, active, sort_order);
CREATE INDEX idx_storefront_delivery_zones_org ON public.neroxa_storefront_delivery_zones USING btree (organization_id, active, sort_order);
CREATE INDEX idx_storefront_products_category ON public.neroxa_storefront_products USING btree (category_id, active, sort_order);
CREATE INDEX idx_storefront_products_instance ON public.neroxa_storefront_products USING btree (instance_id, active, sort_order);
CREATE UNIQUE INDEX neroxa_one_primary_domain_per_instance ON public.neroxa_system_domains USING btree (system_instance_id) WHERE (is_primary = true);
CREATE INDEX neroxa_organizations_active_idx ON public.neroxa_organizations USING btree (active);
CREATE INDEX neroxa_organizations_created_at_idx ON public.neroxa_organizations USING btree (created_at DESC);
CREATE INDEX neroxa_system_instances_system_id_idx ON public.neroxa_system_instances USING btree (system_id);
CREATE INDEX neroxa_systems_active_idx ON public.neroxa_systems USING btree (active);
CREATE TRIGGER neroxa_organizations_set_updated_at BEFORE UPDATE ON neroxa_organizations FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_neroxa_platform_members_updated_at BEFORE UPDATE ON neroxa_platform_members FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_neroxa_system_domains_reset_verification BEFORE UPDATE ON neroxa_system_domains FOR EACH ROW EXECUTE FUNCTION reset_neroxa_domain_verification_on_change();
CREATE TRIGGER trg_neroxa_system_domains_updated_at BEFORE UPDATE ON neroxa_system_domains FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_guard_neroxa_system_instance_insert BEFORE INSERT ON neroxa_system_instances FOR EACH ROW EXECUTE FUNCTION guard_neroxa_implementation_write_path();
CREATE TRIGGER trg_neroxa_system_instances_updated_at BEFORE UPDATE ON neroxa_system_instances FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_sync_domains_with_instance_status AFTER UPDATE OF status ON neroxa_system_instances FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION sync_domains_with_instance_status();
CREATE TRIGGER trg_set_neroxa_systems_updated_at BEFORE UPDATE ON neroxa_systems FOR EACH ROW EXECUTE FUNCTION set_neroxa_systems_updated_at();
CREATE POLICY "organization manager orders update" ON public."neroxa_orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role, 'OPERATOR'::neroxa_organization_role])) WITH CHECK (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role, 'OPERATOR'::neroxa_organization_role]));
CREATE POLICY "organization member orders select" ON public."neroxa_orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (neroxa_has_org_role(organization_id));
CREATE POLICY "organization members delete admins" ON public."neroxa_organization_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role]));
CREATE POLICY "organization members insert admins" ON public."neroxa_organization_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role]));
CREATE POLICY "organization members select own" ON public."neroxa_organization_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role])));
CREATE POLICY "organization members update admins" ON public."neroxa_organization_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role])) WITH CHECK (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role]));
CREATE POLICY "neroxa admins delete organizations" ON public."neroxa_organizations" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa admins insert organizations" ON public."neroxa_organizations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa admins update organizations" ON public."neroxa_organizations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role)) WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa organizations access" ON public."neroxa_organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT neroxa_is_platform_member() AS neroxa_is_platform_member));
CREATE POLICY "neroxa admins delete platform members" ON public."neroxa_platform_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));
CREATE POLICY "neroxa admins manage platform members" ON public."neroxa_platform_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));
CREATE POLICY "neroxa admins update platform members" ON public."neroxa_platform_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role])) WITH CHECK (private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));
CREATE POLICY "neroxa platform members access" ON public."neroxa_platform_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((( SELECT auth.uid() AS uid) = user_id) OR private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role])));
CREATE POLICY "supplier_addon_groups_manage" ON public."neroxa_storefront_addon_groups" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_addon_groups.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_addon_groups.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role])))));
CREATE POLICY "supplier_addon_groups_select" ON public."neroxa_storefront_addon_groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_addon_groups.instance_id) AND neroxa_has_org_role(i.organization_id)))));
CREATE POLICY "supplier_addons_manage" ON public."neroxa_storefront_addons" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (neroxa_storefront_addon_groups g
     JOIN neroxa_system_instances i ON ((i.id = g.instance_id)))
  WHERE ((g.id = neroxa_storefront_addons.group_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (neroxa_storefront_addon_groups g
     JOIN neroxa_system_instances i ON ((i.id = g.instance_id)))
  WHERE ((g.id = neroxa_storefront_addons.group_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role])))));
CREATE POLICY "supplier_addons_select" ON public."neroxa_storefront_addons" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (neroxa_storefront_addon_groups g
     JOIN neroxa_system_instances i ON ((i.id = g.instance_id)))
  WHERE ((g.id = neroxa_storefront_addons.group_id) AND neroxa_has_org_role(i.organization_id)))));
CREATE POLICY "neroxa storefront categories delete" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa storefront categories insert" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role) AND (EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_categories.instance_id) AND (i.status <> 'ARCHIVED'::neroxa_instance_status))))));
CREATE POLICY "neroxa storefront categories select" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT neroxa_is_platform_member() AS neroxa_is_platform_member));
CREATE POLICY "neroxa storefront categories update" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role)) WITH CHECK ((( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role) AND (EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_categories.instance_id) AND (i.status <> 'ARCHIVED'::neroxa_instance_status))))));
CREATE POLICY "organization manager storefront categories write" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_categories.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]) AND (i.status <> 'ARCHIVED'::neroxa_instance_status))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_categories.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]) AND (i.status <> 'ARCHIVED'::neroxa_instance_status)))));
CREATE POLICY "organization member storefront categories select" ON public."neroxa_storefront_categories" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_categories.instance_id) AND neroxa_has_org_role(i.organization_id)))));
CREATE POLICY "organization manager delivery zones write" ON public."neroxa_storefront_delivery_zones" AS PERMISSIVE FOR ALL TO "authenticated" USING (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role])) WITH CHECK (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]));
CREATE POLICY "organization member delivery zones select" ON public."neroxa_storefront_delivery_zones" AS PERMISSIVE FOR SELECT TO "authenticated" USING (neroxa_has_org_role(organization_id));
CREATE POLICY "supplier_product_addon_groups_manage" ON public."neroxa_storefront_product_addon_groups" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((neroxa_storefront_products p
     JOIN neroxa_system_instances i ON ((i.id = p.instance_id)))
     JOIN neroxa_storefront_addon_groups g ON ((g.id = neroxa_storefront_product_addon_groups.group_id)))
  WHERE ((p.id = neroxa_storefront_product_addon_groups.product_id) AND (g.instance_id = p.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((neroxa_storefront_products p
     JOIN neroxa_system_instances i ON ((i.id = p.instance_id)))
     JOIN neroxa_storefront_addon_groups g ON ((g.id = neroxa_storefront_product_addon_groups.group_id)))
  WHERE ((p.id = neroxa_storefront_product_addon_groups.product_id) AND (g.instance_id = p.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role])))));
CREATE POLICY "supplier_product_addon_groups_select" ON public."neroxa_storefront_product_addon_groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((neroxa_storefront_products p
     JOIN neroxa_system_instances i ON ((i.id = p.instance_id)))
     JOIN neroxa_storefront_addon_groups g ON ((g.id = neroxa_storefront_product_addon_groups.group_id)))
  WHERE ((p.id = neroxa_storefront_product_addon_groups.product_id) AND (g.instance_id = p.instance_id) AND neroxa_has_org_role(i.organization_id)))));
CREATE POLICY "neroxa storefront products delete" ON public."neroxa_storefront_products" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa storefront products insert" ON public."neroxa_storefront_products" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role) AND (EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_products.instance_id) AND (i.status <> 'ARCHIVED'::neroxa_instance_status)))) AND ((category_id IS NULL) OR (EXISTS ( SELECT 1
   FROM neroxa_storefront_categories c
  WHERE ((c.id = neroxa_storefront_products.category_id) AND (c.instance_id = c.instance_id)))))));
CREATE POLICY "neroxa storefront products select" ON public."neroxa_storefront_products" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT neroxa_is_platform_member() AS neroxa_is_platform_member));
CREATE POLICY "neroxa storefront products update" ON public."neroxa_storefront_products" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role)) WITH CHECK ((( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]) AS neroxa_has_platform_role) AND (EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_products.instance_id) AND (i.status <> 'ARCHIVED'::neroxa_instance_status)))) AND ((category_id IS NULL) OR (EXISTS ( SELECT 1
   FROM neroxa_storefront_categories c
  WHERE ((c.id = neroxa_storefront_products.category_id) AND (c.instance_id = c.instance_id)))))));
CREATE POLICY "organization manager storefront products write" ON public."neroxa_storefront_products" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_products.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]) AND (i.status <> 'ARCHIVED'::neroxa_instance_status))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_products.instance_id) AND neroxa_has_org_role(i.organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]) AND (i.status <> 'ARCHIVED'::neroxa_instance_status)))));
CREATE POLICY "organization member storefront products select" ON public."neroxa_storefront_products" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM neroxa_system_instances i
  WHERE ((i.id = neroxa_storefront_products.instance_id) AND neroxa_has_org_role(i.organization_id)))));
CREATE POLICY "organization manager storefront settings write" ON public."neroxa_storefront_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role])) WITH CHECK (neroxa_has_org_role(organization_id, ARRAY['OWNER'::neroxa_organization_role, 'ADMIN'::neroxa_organization_role, 'MANAGER'::neroxa_organization_role]));
CREATE POLICY "organization member storefront settings select" ON public."neroxa_storefront_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (neroxa_has_org_role(organization_id));
CREATE POLICY "neroxa admins delete disabled non-primary domains" ON public."neroxa_system_domains" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((is_primary = false) AND (status = 'DISABLED'::neroxa_domain_status) AND neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role])));
CREATE POLICY "neroxa admins insert domains" ON public."neroxa_system_domains" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa admins update domains" ON public."neroxa_system_domains" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role)) WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa domains access" ON public."neroxa_system_domains" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT neroxa_is_platform_member() AS neroxa_is_platform_member));
CREATE POLICY "neroxa admins delete instances" ON public."neroxa_system_instances" AS PERMISSIVE FOR DELETE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa admins insert instances" ON public."neroxa_system_instances" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa admins update instances" ON public."neroxa_system_instances" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role)) WITH CHECK (( SELECT neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role, 'SUPPORT'::neroxa_platform_role]) AS neroxa_has_platform_role));
CREATE POLICY "neroxa instances access" ON public."neroxa_system_instances" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT neroxa_is_platform_member() AS neroxa_is_platform_member));
CREATE POLICY "platform staff can manage systems" ON public."neroxa_systems" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.neroxa_is_platform_staff(( SELECT auth.uid() AS uid))) WITH CHECK (private.neroxa_is_platform_staff(( SELECT auth.uid() AS uid)));
ALTER TABLE public."neroxa_order_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_order_items" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_order_items" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_order_items" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_order_items" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_order_items" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_order_items" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_order_items" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_order_items" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_order_items" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_order_items" TO "anon";
GRANT SELECT ON TABLE public."neroxa_order_items" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_order_items" TO "anon";
GRANT DELETE ON TABLE public."neroxa_order_items" TO "anon";
GRANT INSERT ON TABLE public."neroxa_order_items" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_order_items" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_order_items" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_order_items" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_order_items" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_order_items" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_order_items" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_order_items" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_order_items" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_order_items" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_order_items" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_order_items" TO "service_role";
ALTER TABLE public."neroxa_order_status_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_order_status_history" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_order_status_history" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_order_status_history" TO "anon";
GRANT SELECT ON TABLE public."neroxa_order_status_history" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_order_status_history" TO "anon";
GRANT DELETE ON TABLE public."neroxa_order_status_history" TO "anon";
GRANT INSERT ON TABLE public."neroxa_order_status_history" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_order_status_history" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_order_status_history" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_order_status_history" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_order_status_history" TO "service_role";
ALTER TABLE public."neroxa_orders" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_orders" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_orders" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_orders" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_orders" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_orders" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_orders" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_orders" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_orders" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_orders" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_orders" TO "anon";
GRANT SELECT ON TABLE public."neroxa_orders" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_orders" TO "anon";
GRANT DELETE ON TABLE public."neroxa_orders" TO "anon";
GRANT INSERT ON TABLE public."neroxa_orders" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_orders" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_orders" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_orders" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_orders" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_orders" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_orders" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_orders" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_orders" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_orders" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_orders" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_orders" TO "service_role";
ALTER TABLE public."neroxa_organization_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_organization_members" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_organization_members" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "anon";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "anon";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "anon";
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_organization_members" TO "service_role";
ALTER TABLE public."neroxa_organizations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_organizations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_organizations" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_organizations" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "service_role";
ALTER TABLE public."neroxa_platform_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_platform_members" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "service_role";
ALTER TABLE public."neroxa_storefront_addon_groups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_addon_groups" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_addon_groups" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_addon_groups" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_addon_groups" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_addon_groups" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_addon_groups" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_addon_groups" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_addon_groups" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_addon_groups" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_addon_groups" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_addon_groups" TO "service_role";
ALTER TABLE public."neroxa_storefront_addons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_addons" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_addons" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_addons" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_addons" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_addons" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_addons" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_addons" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_addons" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_addons" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_addons" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_addons" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_addons" TO "service_role";
ALTER TABLE public."neroxa_storefront_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_categories" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_categories" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_categories" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_categories" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_categories" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_categories" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_categories" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_categories" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_categories" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_categories" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_categories" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_categories" TO "service_role";
ALTER TABLE public."neroxa_storefront_delivery_zones" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_delivery_zones" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_delivery_zones" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
ALTER TABLE public."neroxa_storefront_product_addon_groups" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_product_addon_groups" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_product_addon_groups" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_product_addon_groups" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_product_addon_groups" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_product_addon_groups" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_product_addon_groups" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_product_addon_groups" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_product_addon_groups" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_product_addon_groups" TO "service_role";
ALTER TABLE public."neroxa_storefront_products" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_products" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_products" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_products" TO "service_role";
ALTER TABLE public."neroxa_storefront_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_storefront_settings" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_settings" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_settings" TO "service_role";
ALTER TABLE public."neroxa_system_domains" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_system_domains" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "service_role";
ALTER TABLE public."neroxa_system_instances" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_system_instances" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "service_role";
ALTER TABLE public."neroxa_systems" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."neroxa_systems" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_systems" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_systems" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_systems" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_systems" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_systems" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_systems" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_systems" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_systems" TO "anon";
GRANT SELECT ON TABLE public."neroxa_systems" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "anon";
GRANT DELETE ON TABLE public."neroxa_systems" TO "anon";
GRANT INSERT ON TABLE public."neroxa_systems" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_systems" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_systems" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_systems" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_systems" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_systems" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_systems" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_systems" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_systems" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_systems" TO "service_role";
GRANT USAGE ON SCHEMA private TO authenticated;
