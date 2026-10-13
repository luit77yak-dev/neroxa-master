-- ONLY empty local-disposable database; synthetic metadata, NO REMOTE.
BEGIN;
SET check_function_bodies=off;
CREATE TABLE public."neroxa_system_instances" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"organization_id" uuid NOT NULL,"system_id" uuid,"name" text NOT NULL,"slug" text NOT NULL,"system_type" text NOT NULL,"status" text DEFAULT 'PROVISIONING'::text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_organizations" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"legal_name" text NOT NULL,"trade_name" text,"active" boolean DEFAULT true NOT NULL);
CREATE TABLE public."neroxa_systems" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"slug" text NOT NULL,"name" text NOT NULL,"system_type" text NOT NULL,"active" boolean DEFAULT true NOT NULL);
CREATE TABLE public."neroxa_system_domains" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"system_instance_id" uuid NOT NULL,"domain" text NOT NULL,"status" text DEFAULT 'PENDING'::text NOT NULL,"verified_at" timestamp with time zone);
CREATE TABLE public."neroxa_storefront_settings" ("organization_id" uuid NOT NULL,"half_pizza_pricing_rule" text DEFAULT 'highest_half'::text NOT NULL,"half_pizza_fixed_price" numeric);
CREATE TABLE public."neroxa_storefront_delivery_zones" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"organization_id" uuid NOT NULL,"name" text NOT NULL,"neighborhoods" text[] DEFAULT '{}'::text[] NOT NULL,"minimum_order" numeric DEFAULT 0 NOT NULL,"delivery_fee" numeric DEFAULT 0 NOT NULL,"estimated_minutes" integer,"active" boolean DEFAULT true NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL);
CREATE TABLE public."neroxa_storefront_products" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"name" text NOT NULL,"slug" text NOT NULL,"image_url" text,"price" numeric,"active" boolean DEFAULT true NOT NULL,"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL);
CREATE TABLE public."neroxa_organization_members" ("organization_id" uuid NOT NULL,"user_id" uuid NOT NULL,"active" boolean DEFAULT true NOT NULL);
CREATE TABLE public."neroxa_platform_members" ("user_id" uuid NOT NULL,"active" boolean DEFAULT true NOT NULL);
CREATE TABLE public."neroxa_orders" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"organization_id" uuid NOT NULL,"order_number" bigint NOT NULL,"customer_name" text NOT NULL,"customer_phone" text NOT NULL,"fulfillment" text NOT NULL,"payment_method" text NOT NULL,"status" text DEFAULT 'RECEIVED'::text NOT NULL,"subtotal" numeric(12,2) DEFAULT 0 NOT NULL,"delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,"total" numeric(12,2) DEFAULT 0 NOT NULL,"address_street" text,"address_number" text,"address_neighborhood" text,"address_complement" text,"address_reference" text,"notes" text,"idempotency_key" uuid,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"confirmed_at" timestamp with time zone,"preparing_at" timestamp with time zone,"ready_at" timestamp with time zone,"out_for_delivery_at" timestamp with time zone,"delivered_at" timestamp with time zone,"cancelled_at" timestamp with time zone);
CREATE TABLE public."neroxa_order_items" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"order_id" uuid NOT NULL,"product_id" uuid,"product_name" text NOT NULL,"product_image_url" text,"second_product_id" uuid,"second_product_name" text,"is_half" boolean DEFAULT false NOT NULL,"size_id" uuid,"size_name" text,"crust_id" uuid,"crust_name" text,"crust_price" numeric(12,2) DEFAULT 0 NOT NULL,"addons" jsonb DEFAULT '[]'::jsonb NOT NULL,"complements" jsonb DEFAULT '[]'::jsonb NOT NULL,"quantity" integer NOT NULL,"notes" text,"unit_price" numeric(12,2) NOT NULL,"line_total" numeric(12,2) NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_order_status_history" ("id" uuid DEFAULT gen_random_uuid() NOT NULL,"order_id" uuid NOT NULL,"from_status" text,"to_status" text NOT NULL,"changed_by_user_id" uuid,"note" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_slug_key" UNIQUE (slug);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_domain_key" UNIQUE (domain);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_pkey" PRIMARY KEY (organization_id);
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_organization_members" ADD CONSTRAINT "neroxa_organization_members_pkey" PRIMARY KEY (organization_id, user_id);
ALTER TABLE public."neroxa_platform_members" ADD CONSTRAINT "neroxa_platform_members_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_delivery_fee_check" CHECK ((delivery_fee >= (0)::numeric));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_fulfillment_check" CHECK ((fulfillment = ANY (ARRAY['DELIVERY'::text, 'PICKUP'::text])));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_idempotency_key_key" UNIQUE (instance_id, idempotency_key);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_order_number_key" UNIQUE (instance_id, order_number);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_payment_method_check" CHECK ((payment_method = ANY (ARRAY['CASH'::text, 'PIX'::text, 'CARD_ON_DELIVERY'::text, 'CARD_ON_SITE'::text])));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_status_check" CHECK ((status = ANY (ARRAY['RECEIVED'::text, 'CONFIRMED'::text, 'PREPARING'::text, 'READY'::text, 'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'CANCELLED'::text])));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_subtotal_check" CHECK ((subtotal >= (0)::numeric));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_total_check" CHECK ((total >= (0)::numeric));
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_line_total_check" CHECK ((line_total >= (0)::numeric));
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_quantity_check" CHECK (((quantity >= 1) AND (quantity <= 99)));
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_unit_price_check" CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_system_id_fkey" FOREIGN KEY (system_id) REFERENCES neroxa_systems(id);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_system_instance_id_fkey" FOREIGN KEY (system_instance_id) REFERENCES neroxa_system_instances(id);
ALTER TABLE public."neroxa_storefront_settings" ADD CONSTRAINT "neroxa_storefront_settings_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id);
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id);
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id);
ALTER TABLE public."neroxa_organization_members" ADD CONSTRAINT "neroxa_organization_members_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES neroxa_orders(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES neroxa_storefront_products(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_second_product_id_fkey" FOREIGN KEY (second_product_id) REFERENCES neroxa_storefront_products(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_changed_by_user_id_fkey" FOREIGN KEY (changed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_order_id_fkey" FOREIGN KEY (order_id) REFERENCES neroxa_orders(id) ON DELETE CASCADE;
CREATE INDEX neroxa_orders_instance_created_idx ON public.neroxa_orders USING btree (instance_id, created_at DESC);
CREATE INDEX neroxa_orders_instance_status_idx ON public.neroxa_orders USING btree (instance_id, status);
CREATE UNIQUE INDEX neroxa_orders_instance_order_number_uidx ON public.neroxa_orders USING btree (instance_id, order_number);
CREATE UNIQUE INDEX neroxa_orders_instance_idempotency_uidx ON public.neroxa_orders USING btree (instance_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX neroxa_order_items_order_idx ON public.neroxa_order_items USING btree (order_id);
CREATE INDEX neroxa_order_status_history_order_idx ON public.neroxa_order_status_history USING btree (order_id, created_at);
CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_customer_phone text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', o.id, 'order_id', o.id, 'order_number', o.order_number,
    'status', o.status, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'fulfillment', o.fulfillment, 'payment_method', o.payment_method,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'address_street', o.address_street, 'address_number', o.address_number,
    'address_neighborhood', o.address_neighborhood, 'address_complement', o.address_complement,
    'address_reference', o.address_reference, 'notes', o.notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lineId', oi.id::text, 'productId', oi.product_id, 'productName', oi.product_name,
        'imageUrl', oi.product_image_url, 'secondProductId', oi.second_product_id,
        'secondProductName', oi.second_product_name, 'isHalf', oi.is_half,
        'sizeId', oi.size_id, 'sizeName', oi.size_name, 'crustId', oi.crust_id,
        'crustName', oi.crust_name, 'crustPrice', oi.crust_price,
        'addons', oi.addons, 'complements', oi.complements, 'quantity', oi.quantity,
        'notes', oi.notes, 'unitPrice', oi.unit_price
      ) order by oi.created_at)
      from public.neroxa_order_items oi where oi.order_id = o.id
    ), '[]'::jsonb),
    'created_at', o.created_at, 'updated_at', o.updated_at
  )
  from public.neroxa_orders o
  where o.id = p_order_id
    and regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
      = regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')
  limit 1;
$function$
;
REVOKE ALL ON FUNCTION public."get_public_order_status"(p_order_id uuid, p_customer_phone text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_public_order_status"(p_order_id uuid, p_customer_phone text) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_public_storefront_context(p_domain text)
 RETURNS TABLE(domain text, instance_id uuid, instance_slug text, instance_name text, instance_status text, organization_id uuid, organization_name text, system_id uuid, system_slug text, system_name text, system_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.domain, i.id, i.slug, i.name, i.status,
         o.id, o.trade_name, s.id, s.slug, s.name, s.system_type
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
REVOKE ALL ON FUNCTION public."get_public_storefront_context"(p_domain text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."get_public_storefront_context"(p_domain text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_public_storefront_context"(p_domain text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."get_public_storefront_context"(p_domain text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_public_storefront_context"(p_domain text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_public_storefront_context"(p_domain text) TO "service_role";
CREATE OR REPLACE FUNCTION public.neroxa_is_platform_member()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.neroxa_platform_members m
    where m.user_id = auth.uid() and m.active
  );
$function$
;
REVOKE ALL ON FUNCTION public."neroxa_is_platform_member"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."neroxa_is_platform_member"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."neroxa_is_platform_member"() TO "postgres";
GRANT EXECUTE ON FUNCTION public."neroxa_is_platform_member"() TO "anon";
GRANT EXECUTE ON FUNCTION public."neroxa_is_platform_member"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."neroxa_is_platform_member"() TO "service_role";
CREATE OR REPLACE FUNCTION public.append_public_order_items_with_payment(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text)
 RETURNS TABLE(order_id uuid, order_number bigint, subtotal numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.neroxa_orders%rowtype;
  v_item jsonb;
  v_product record;
  v_second_id uuid;
  v_second_name text;
  v_qty integer;
  v_unit numeric(12,2);
  v_added numeric(12,2) := 0;
begin
  if p_payment_method is null or p_payment_method not in ('CASH','PIX','CARD_ON_DELIVERY','CARD_ON_SITE') then
    raise exception 'Forma de pagamento inválida';
  end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then
    raise exception 'Adicione pelo menos um item';
  end if;

  select o.* into v_order
  from public.neroxa_orders o
  where o.id = p_order_id
    and regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
      = regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g')
  for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_order.status not in ('RECEIVED','CONFIRMED','PREPARING','READY') then
    raise exception 'Este pedido não pode mais receber novos itens';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as x(value) loop
    v_second_id := null;
    v_second_name := null;
    v_qty := greatest(1, least(99, coalesce((v_item->>'quantity')::integer,1)));

    select p.* into v_product
    from public.neroxa_storefront_products p
    where p.id = nullif(v_item->>'product_id','')::uuid
      and p.instance_id = v_order.instance_id
      and p.active
      and coalesce((p.metadata->>'available')::boolean,true);
    if not found then raise exception 'Produto não disponível'; end if;

    if nullif(v_item->>'second_product_id','') is not null then
      select p.id,p.name into v_second_id,v_second_name
      from public.neroxa_storefront_products p
      where p.id = (v_item->>'second_product_id')::uuid
        and p.instance_id = v_order.instance_id and p.active
        and coalesce((p.metadata->>'available')::boolean,true);
      if not found then raise exception 'Segundo sabor não disponível'; end if;
    end if;

    v_unit := public.calculate_public_order_line_price(
      v_order.instance_id, v_product.id, v_second_id,
      nullif(v_item->>'size_id',''), nullif(v_item->>'crust_id',''),
      coalesce(v_item->'addons','[]'::jsonb), coalesce(v_item->'complements','[]'::jsonb)
    );

    insert into public.neroxa_order_items(
      order_id,product_id,product_name,product_image_url,second_product_id,second_product_name,
      is_half,size_id,size_name,crust_id,crust_name,crust_price,addons,complements,
      quantity,notes,unit_price,line_total
    ) values (
      v_order.id,v_product.id,v_product.name,v_product.image_url,v_second_id,v_second_name,
      coalesce((v_item->>'is_half')::boolean,false),
      case when v_item->>'size_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item->>'size_id')::uuid else null end,
      nullif(v_item->>'size_name',''),
      case when v_item->>'crust_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item->>'crust_id')::uuid else null end,
      nullif(v_item->>'crust_name',''),
      coalesce((v_item->>'crust_price')::numeric,0),
      coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb),
      v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty
    );
    v_added := v_added + v_unit*v_qty;
  end loop;

  update public.neroxa_orders as o
  set payment_method=p_payment_method,
      subtotal=round(coalesce(v_order.subtotal,0)+v_added,2),
      total=round(coalesce(v_order.subtotal,0)+v_added+coalesce(v_order.delivery_fee,0),2),
      updated_at=now()
  where o.id=v_order.id returning o.* into v_order;

  order_id:=v_order.id; order_number:=v_order.order_number;
  subtotal:=v_order.subtotal; total:=v_order.total;
  return next;
end;
$function$
;
REVOKE ALL ON FUNCTION public."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "anon";
GRANT EXECUTE ON FUNCTION public."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."append_public_order_items_with_payment"(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method text) TO "service_role";
CREATE OR REPLACE FUNCTION public.calculate_public_order_line_price(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_product record;
  v_second record;
  v_org uuid;
  v_rule text := 'highest_half';
  v_fixed numeric;
  v_base numeric := 0;
  v_second_base numeric := 0;
  v_crust numeric := 0;
  v_addons numeric := 0;
  v_complements numeric := 0;
  v_choice jsonb;
  v_item jsonb;
  v_id uuid;
  v_addon_price numeric;
begin
  select p.*, i.organization_id into v_product
  from public.neroxa_storefront_products p
  join public.neroxa_system_instances i on i.id = p.instance_id
  where p.id = p_product_id and p.instance_id = p_instance_id and p.active;
  if not found then raise exception 'Produto não disponível'; end if;

  v_org := v_product.organization_id;
  select s.half_pizza_pricing_rule, s.half_pizza_fixed_price
    into v_rule, v_fixed
  from public.neroxa_storefront_settings s where s.organization_id = v_org;

  v_base := coalesce(v_product.price, 0);
  if p_size_id is not null then
    select choice into v_choice
    from jsonb_array_elements(coalesce(v_product.metadata->'options','[]'::jsonb)) opt
    cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
    where opt->>'id' = 'tamanho' and choice->>'id' = p_size_id limit 1;
    v_base := v_base + coalesce((v_choice->>'price')::numeric, 0);
  end if;

  if p_second_product_id is not null then
    select * into v_second from public.neroxa_storefront_products
    where id = p_second_product_id and instance_id = p_instance_id and active;
    if not found then raise exception 'Segundo sabor não disponível'; end if;
    v_second_base := coalesce(v_second.price, 0);
    if p_size_id is not null then
      select choice into v_choice
      from jsonb_array_elements(coalesce(v_second.metadata->'options','[]'::jsonb)) opt
      cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
      where opt->>'id' = 'tamanho' and choice->>'id' = p_size_id limit 1;
      v_second_base := v_second_base + coalesce((v_choice->>'price')::numeric, 0);
    end if;
    if coalesce(v_rule, 'highest_half') = 'average_halves' then
      v_base := (v_base + v_second_base) / 2;
    elsif coalesce(v_rule, 'highest_half') = 'fixed_price' and v_fixed is not null then
      v_base := v_fixed;
    else
      v_base := greatest(v_base, v_second_base);
    end if;
  end if;

  if p_crust_id is not null then
    select coalesce((choice->>'price')::numeric, 0) into v_crust
    from jsonb_array_elements(coalesce(v_product.metadata->'options','[]'::jsonb)) opt
    cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
    where opt->>'id' = 'borda' and choice->>'id' = p_crust_id limit 1;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_addons,'[]'::jsonb)) loop
    v_id := nullif(v_item->>'id','')::uuid;
    if v_id is null then raise exception 'Adicional inválido'; end if;
    select price into v_addon_price from public.neroxa_storefront_products
    where id = v_id and instance_id = p_instance_id and active;
    if not found then raise exception 'Adicional não disponível'; end if;
    v_addons := v_addons + coalesce(v_addon_price, 0);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_complements,'[]'::jsonb)) loop
    v_id := nullif(v_item->>'productId','')::uuid;
    if v_id is null then raise exception 'Acompanhamento inválido'; end if;
    select price into v_addon_price from public.neroxa_storefront_products
    where id = v_id and instance_id = p_instance_id and active;
    if not found then raise exception 'Acompanhamento não disponível'; end if;
    v_complements := v_complements + coalesce(v_addon_price, 0);
  end loop;

  return v_base + v_crust + v_addons + v_complements;
end;
$function$
;
REVOKE ALL ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."calculate_public_order_line_price"(p_instance_id uuid, p_product_id uuid, p_second_product_id uuid, p_size_id text, p_crust_id text, p_addons jsonb, p_complements jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_domain text := lower(trim(trailing '.' from trim(coalesce(p_order->>'storefront_domain',''))));
 v_client_org uuid := nullif(p_order->>'organization_id','')::uuid;
 v_org uuid;
 v_instance uuid;
 v_order_id uuid;
 v_number bigint;
 v_subtotal numeric(12,2) := 0;
 v_delivery_fee numeric(12,2) := 0;
 v_total numeric(12,2);
 v_fulfillment text := coalesce(p_order->>'fulfillment','DELIVERY');
 v_payment text := coalesce(p_order->>'payment_method','PIX');
 v_phone text := trim(coalesce(p_order->>'customer_phone',''));
 v_item jsonb;
 v_unit numeric;
 v_qty integer;
 v_zone record;
 v_neighborhood text;
begin
 if v_domain = '' then raise exception 'Domínio da loja obrigatório'; end if;

 -- Resolve tenant from a verified, active domain; never trust the browser's tenant ID.
 select ctx.organization_id, ctx.instance_id
   into v_org, v_instance
 from public.get_public_storefront_context(v_domain) ctx
 limit 1;

 if v_org is null or v_instance is null then
   raise exception 'Loja indisponível para este domínio';
 end if;

 if v_client_org is not null and v_client_org <> v_org then
   raise exception 'O domínio não corresponde à loja selecionada';
 end if;

 if v_phone = '' or trim(coalesce(p_order->>'customer_name','')) = '' then
   raise exception 'Dados do cliente incompletos';
 end if;

 if jsonb_typeof(p_order->'items') <> 'array'
    or jsonb_array_length(coalesce(p_order->'items','[]'::jsonb)) = 0 then
   raise exception 'O pedido precisa ter pelo menos um item';
 end if;

 if v_fulfillment not in ('DELIVERY','PICKUP')
    or v_payment not in ('CASH','PIX','CARD_ON_DELIVERY','CARD_ON_SITE') then
   raise exception 'Forma de recebimento ou pagamento inválida';
 end if;

 -- Serialize per instance before checking idempotency, so concurrent retries return the same order.
 perform pg_advisory_xact_lock(hashtext(v_instance::text));

 if nullif(p_order->>'idempotency_key','') is not null then
   select o.id, o.order_number, o.total
     into v_order_id, v_number, v_total
   from public.neroxa_orders o
   where o.instance_id = v_instance
     and o.idempotency_key = (p_order->>'idempotency_key')::uuid;

   if v_order_id is not null then
     order_id := v_order_id;
     order_number := v_number;
     total := v_total;
     return next;
     return;
   end if;
 end if;

 if v_fulfillment = 'DELIVERY' then
   v_neighborhood := trim(coalesce(p_order->>'address_neighborhood',''));
   if v_neighborhood = '' then raise exception 'Bairro de entrega obrigatório'; end if;

   select z.* into v_zone
   from public.neroxa_storefront_delivery_zones z
   where z.organization_id = v_org
     and z.active
     and exists (
       select 1 from unnest(z.neighborhoods) n
       where lower(trim(n)) = lower(v_neighborhood)
     )
   order by z.sort_order
   limit 1;

   if not found then raise exception 'Bairro não atendido pela loja'; end if;
   v_delivery_fee := coalesce(v_zone.delivery_fee, 0);
 end if;

 -- The per-instance lock above also protects order-number allocation.
 select coalesce(max(o.order_number),0)+1
   into v_number
 from public.neroxa_orders o
 where o.instance_id = v_instance;

 insert into public.neroxa_orders(
   instance_id, organization_id, order_number, customer_name, customer_phone,
   fulfillment, payment_method, status, delivery_fee, address_street,
   address_number, address_neighborhood, address_complement, address_reference,
   notes, idempotency_key
 ) values (
   v_instance, v_org, v_number, trim(p_order->>'customer_name'), v_phone,
   v_fulfillment, v_payment, 'RECEIVED', v_delivery_fee,
   nullif(trim(p_order->>'address_street'),''),
   nullif(trim(p_order->>'address_number'),''),
   nullif(trim(p_order->>'address_neighborhood'),''),
   nullif(trim(p_order->>'address_complement'),''),
   nullif(trim(p_order->>'address_reference'),''),
   nullif(trim(p_order->>'notes'),''),
   nullif(p_order->>'idempotency_key','')::uuid
 ) returning id into v_order_id;

 for v_item in select * from jsonb_array_elements(p_order->'items') loop
   v_qty := greatest(1, least(99, coalesce((v_item->>'quantity')::integer,1)));
   v_unit := public.calculate_public_order_line_price(
     v_instance,
     nullif(v_item->>'product_id','')::uuid,
     nullif(v_item->>'second_product_id','')::uuid,
     nullif(v_item->>'size_id',''),
     nullif(v_item->>'crust_id',''),
     coalesce(v_item->'addons','[]'::jsonb),
     coalesce(v_item->'complements','[]'::jsonb)
   );

   insert into public.neroxa_order_items(
     order_id, product_id, product_name, product_image_url, second_product_id,
     second_product_name, is_half, size_id, size_name, crust_id, crust_name,
     crust_price, addons, complements, quantity, notes, unit_price, line_total
   )
   select
     v_order_id, p.id, p.name, p.image_url,
     nullif(v_item->>'second_product_id','')::uuid, p2.name,
     coalesce((v_item->>'is_half')::boolean,false),
     case when v_item->>'size_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item->>'size_id')::uuid else null end,
     coalesce(
       nullif(v_item->>'size_name',''),
       (select choice->>'name'
        from jsonb_array_elements(coalesce(p.metadata->'options','[]'::jsonb)) opt
        cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
        where opt->>'id'='tamanho' and choice->>'id'=v_item->>'size_id'
        limit 1)
     ),
     case when v_item->>'crust_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item->>'crust_id')::uuid else null end,
     coalesce(
       nullif(v_item->>'crust_name',''),
       (select choice->>'name'
        from jsonb_array_elements(coalesce(p.metadata->'options','[]'::jsonb)) opt
        cross join lateral jsonb_array_elements(coalesce(opt->'choices','[]'::jsonb)) choice
        where opt->>'id'='borda' and choice->>'id'=v_item->>'crust_id'
        limit 1)
     ),
     coalesce((v_item->>'crust_price')::numeric,0),
     coalesce(v_item->'addons','[]'::jsonb),
     coalesce(v_item->'complements','[]'::jsonb),
     v_qty, nullif(v_item->>'notes',''), v_unit, v_unit*v_qty
   from public.neroxa_storefront_products p
   left join public.neroxa_storefront_products p2
     on p2.id = nullif(v_item->>'second_product_id','')::uuid
    and p2.instance_id = v_instance
   where p.id = nullif(v_item->>'product_id','')::uuid
     and p.instance_id = v_instance
     and p.active
     and coalesce((p.metadata->>'available')::boolean,true);

   if not found then raise exception 'Produto não disponível'; end if;
   v_subtotal := v_subtotal + v_unit*v_qty;
 end loop;

 v_total := v_subtotal + v_delivery_fee;
 update public.neroxa_orders
 set subtotal = v_subtotal, total = v_total, updated_at = now()
 where id = v_order_id;

 insert into public.neroxa_order_status_history(order_id,to_status,note)
 values(v_order_id,'RECEIVED','Pedido criado pelo site');

 order_id := v_order_id;
 order_number := v_number;
 total := v_total;
 return next;
end;
$function$
;
REVOKE ALL ON FUNCTION public."create_public_order"(p_order jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."create_public_order"(p_order jsonb) TO "postgres";
GRANT EXECUTE ON FUNCTION public."create_public_order"(p_order jsonb) TO "anon";
GRANT EXECUTE ON FUNCTION public."create_public_order"(p_order jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_public_order"(p_order jsonb) TO "service_role";
CREATE OR REPLACE FUNCTION public.get_admin_orders(p_instance_id uuid, p_status text DEFAULT NULL::text)
 RETURNS SETOF neroxa_orders
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
begin
  select i.organization_id into v_org
  from public.neroxa_system_instances i where i.id = p_instance_id;
  if v_org is null then raise exception 'Loja não encontrada'; end if;
  if not public.neroxa_is_platform_member()
     and not exists (
       select 1 from public.neroxa_organization_members m
       where m.organization_id = v_org and m.user_id = auth.uid() and m.active
     ) then
    raise exception 'Acesso não autorizado aos pedidos desta loja';
  end if;

  return query
  select o.* from public.neroxa_orders o
  where o.instance_id = p_instance_id and (p_status is null or o.status = p_status)
  order by o.created_at desc;
end;
$function$
;
REVOKE ALL ON FUNCTION public."get_admin_orders"(p_instance_id uuid, p_status text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."get_admin_orders"(p_instance_id uuid, p_status text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."get_admin_orders"(p_instance_id uuid, p_status text) TO "anon";
GRANT EXECUTE ON FUNCTION public."get_admin_orders"(p_instance_id uuid, p_status text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_admin_orders"(p_instance_id uuid, p_status text) TO "service_role";
CREATE OR REPLACE FUNCTION public.update_admin_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS neroxa_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.neroxa_orders%rowtype;
  v_previous_status text;
begin
  select o.* into v_order from public.neroxa_orders o where o.id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not public.neroxa_is_platform_member()
     and not exists (
       select 1 from public.neroxa_organization_members m
       where m.organization_id=v_order.organization_id and m.user_id=auth.uid() and m.active
     ) then
    raise exception 'Acesso não autorizado a este pedido';
  end if;
  if p_status not in ('RECEIVED','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') then
    raise exception 'Status inválido';
  end if;
  if p_status = v_order.status then return v_order; end if;
  v_previous_status := v_order.status;

  if not (
    (v_order.status = 'RECEIVED' and p_status in ('CONFIRMED','CANCELLED')) or
    (v_order.status = 'CONFIRMED' and p_status in ('PREPARING','CANCELLED')) or
    (v_order.status = 'PREPARING' and p_status in ('READY','CANCELLED')) or
    (v_order.status = 'READY' and p_status = 'CANCELLED') or
    (v_order.status = 'READY' and v_order.fulfillment = 'PICKUP' and p_status = 'DELIVERED') or
    (v_order.status = 'READY' and v_order.fulfillment = 'DELIVERY' and p_status = 'OUT_FOR_DELIVERY') or
    (v_order.status = 'OUT_FOR_DELIVERY' and p_status in ('DELIVERED','CANCELLED'))
  ) then
    raise exception 'Transição de status inválida: % -> %', v_order.status, p_status;
  end if;

  update public.neroxa_orders
  set status=p_status, updated_at=now(),
      confirmed_at=case when p_status='CONFIRMED' and confirmed_at is null then now() else confirmed_at end,
      preparing_at=case when p_status='PREPARING' and preparing_at is null then now() else preparing_at end,
      ready_at=case when p_status='READY' and ready_at is null then now() else ready_at end,
      out_for_delivery_at=case when p_status='OUT_FOR_DELIVERY' and out_for_delivery_at is null then now() else out_for_delivery_at end,
      delivered_at=case when p_status='DELIVERED' and delivered_at is null then now() else delivered_at end,
      cancelled_at=case when p_status='CANCELLED' and cancelled_at is null then now() else cancelled_at end
  where id=p_order_id returning * into v_order;

  insert into public.neroxa_order_status_history(
    order_id,from_status,to_status,changed_by_user_id,note
  ) values(v_order.id,v_previous_status,p_status,auth.uid(),nullif(trim(p_note),''));
  return v_order;
end;
$function$
;
REVOKE ALL ON FUNCTION public."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "postgres";
GRANT EXECUTE ON FUNCTION public."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "anon";
GRANT EXECUTE ON FUNCTION public."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_admin_order_status"(p_order_id uuid, p_status text, p_note text) TO "service_role";
REVOKE ALL ON TABLE public."neroxa_system_instances" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "anon";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "anon";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "anon";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "anon";
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_system_instances" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_system_instances" TO "service_role";
REVOKE ALL ON TABLE public."neroxa_organizations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_organizations" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_organizations" TO "anon";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "anon";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "anon";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "anon";
GRANT INSERT ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_organizations" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_organizations" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_organizations" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_organizations" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_organizations" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_organizations" TO "service_role";
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
GRANT TRUNCATE ON TABLE public."neroxa_systems" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_systems" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_systems" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_systems" TO "anon";
GRANT INSERT ON TABLE public."neroxa_systems" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_systems" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_systems" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_systems" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_systems" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_systems" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_systems" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_systems" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_systems" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_systems" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_systems" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_systems" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_systems" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_systems" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_systems" TO "service_role";
REVOKE ALL ON TABLE public."neroxa_system_domains" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "anon";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "anon";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "anon";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "anon";
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_system_domains" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_system_domains" TO "service_role";
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
GRANT TRUNCATE ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_settings" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_settings" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_settings" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_settings" TO "service_role";
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
GRANT TRUNCATE ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_delivery_zones" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_delivery_zones" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_delivery_zones" TO "service_role";
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
GRANT TRUNCATE ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_products" TO "anon";
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_products" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_storefront_products" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_storefront_products" TO "service_role";
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
GRANT TRUNCATE ON TABLE public."neroxa_organization_members" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_organization_members" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_organization_members" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_organization_members" TO "anon";
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_organization_members" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_organization_members" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_organization_members" TO "service_role";
REVOKE ALL ON TABLE public."neroxa_platform_members" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "postgres";
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "anon";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "anon";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "anon";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "anon";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "anon";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "anon";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "anon";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "anon";
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "authenticated";
GRANT INSERT ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_platform_members" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_platform_members" TO "service_role";
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
GRANT INSERT ON TABLE public."neroxa_orders" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_orders" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_orders" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_orders" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_orders" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_orders" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_orders" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_orders" TO "service_role";
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
GRANT INSERT ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT SELECT ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT UPDATE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT DELETE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT TRUNCATE ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT REFERENCES ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT TRIGGER ON TABLE public."neroxa_order_status_history" TO "service_role";
GRANT MAINTAIN ON TABLE public."neroxa_order_status_history" TO "service_role";
SET check_function_bodies=on;
COMMIT;
