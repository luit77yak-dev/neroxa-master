-- ISOLATED TEST CANDIDATE: full functions preserved from Master schema inspection.
-- Depends on phase 2 settings/zones cutover and membership foundation.
-- Public order caller must supply instance_id from trusted resolved storefront domain;
-- validate origin/domain binding in application before release.
-- Never deploy directly to production.

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
 select i.id into v_instance from public.neroxa_system_instances i where i.id=nullif(p_order->>'instance_id','')::uuid and i.organization_id=v_org and i.status='ACTIVE';
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
  from public.neroxa_storefront_settings s where s.instance_id = v_instance;

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
  where z.instance_id = v_instance and z.active;

  return jsonb_build_object(
    'context', v_context, 'categories', v_categories, 'products', v_products,
    'settings', v_settings, 'delivery_zones', v_zones, 'addon_groups', v_addon_groups
  );
end;
$function$


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
 select s.half_pizza_pricing_rule,s.half_pizza_fixed_price into v_rule,v_fixed from public.neroxa_storefront_settings s where s.instance_id=p_instance_id;

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
 if not (public.neroxa_is_platform_member() OR neroxa_private.has_instance_role(v_order.instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])) then raise exception 'Acesso negado' USING ERRCODE='42501'; end if;
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
