-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 45da99d6ef1d4f0afadd65473b5c2ed7360f1e5766ec3af7aa6e61fdfbcb9daf; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',15) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- REVIEW ONLY: explicit new availability contract; after GROUP pricing.
BEGIN;
CREATE TABLE public.neroxa_storefront_availability (
 instance_id uuid PRIMARY KEY REFERENCES public.neroxa_system_instances(id),
 enabled boolean NOT NULL DEFAULT false, timezone text NOT NULL
);
CREATE TABLE public.neroxa_storefront_weekly_hours (
 instance_id uuid NOT NULL REFERENCES public.neroxa_storefront_availability(instance_id),
 weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 opens_at time NOT NULL, closes_at time NOT NULL,
 PRIMARY KEY(instance_id,weekday,opens_at),
 CHECK(opens_at<>closes_at AND opens_at<time '24:00' AND extract(second FROM opens_at)=0 AND extract(second FROM closes_at)=0)
);
CREATE TABLE public.neroxa_storefront_special_days (
 instance_id uuid NOT NULL REFERENCES public.neroxa_storefront_availability(instance_id),
 date date NOT NULL, closed boolean NOT NULL DEFAULT true,
 PRIMARY KEY(instance_id,date)
);
CREATE TABLE public.neroxa_storefront_special_hours (
 instance_id uuid NOT NULL, date date NOT NULL, opens_at time NOT NULL, closes_at time NOT NULL,
 PRIMARY KEY(instance_id,date,opens_at),
 FOREIGN KEY(instance_id,date) REFERENCES public.neroxa_storefront_special_days(instance_id,date),
 CHECK(opens_at<>closes_at AND opens_at<time '24:00' AND extract(second FROM opens_at)=0 AND extract(second FROM closes_at)=0)
);
CREATE FUNCTION private.neroxa_guard_availability() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.instance_id IS DISTINCT FROM OLD.instance_id THEN RAISE EXCEPTION 'Availability instance immutable' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='neroxa_storefront_availability' THEN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Explicit valid IANA timezone required' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.neroxa_guard_availability() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; permission text := 'neroxa_private.has_instance_role(instance_id,ARRAY[''OWNER'',''ADMIN'',''MANAGER'']::public.neroxa_organization_role[]) OR public.neroxa_has_platform_role(ARRAY[''SUPER_ADMIN'',''ADMIN'']::public.neroxa_platform_role[])'; BEGIN
 FOREACH t IN ARRAY ARRAY['neroxa_storefront_availability','neroxa_storefront_weekly_hours','neroxa_storefront_special_days','neroxa_storefront_special_hours'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY availability_read ON public.%I FOR SELECT TO authenticated USING (%s)',t,permission);
 EXECUTE format('CREATE POLICY availability_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',t,permission);
 EXECUTE format('CREATE POLICY availability_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',t,permission,permission);
 EXECUTE format('CREATE POLICY availability_delete ON public.%I FOR DELETE TO authenticated USING (%s)',t,permission);
 EXECUTE format('CREATE TRIGGER availability_identity BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.neroxa_guard_availability()',t);
 END LOOP;
END $$;
CREATE FUNCTION private.neroxa_store_is_open(p_instance uuid,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.neroxa_storefront_availability; local_at timestamp; d date; t time; prev date; special boolean; is_closed boolean;
BEGIN
 SELECT * INTO cfg FROM public.neroxa_storefront_availability WHERE instance_id=p_instance;
 IF NOT FOUND OR NOT cfg.enabled OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=cfg.timezone) THEN RETURN false; END IF;
 local_at := p_at AT TIME ZONE cfg.timezone; d:=local_at::date; t:=local_at::time; prev:=d-1;
 SELECT closed INTO is_closed FROM public.neroxa_storefront_special_days WHERE instance_id=p_instance AND date=d;
 special:=FOUND;
 IF special THEN
  IF is_closed THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.neroxa_storefront_special_hours h WHERE h.instance_id=p_instance AND h.date=d AND ((h.opens_at<h.closes_at AND t>=h.opens_at AND t<h.closes_at) OR (h.opens_at>h.closes_at AND t>=h.opens_at)));
 END IF;
 IF EXISTS(SELECT 1 FROM public.neroxa_storefront_weekly_hours h WHERE h.instance_id=p_instance AND h.weekday=extract(dow FROM d)::int AND ((h.opens_at<h.closes_at AND t>=h.opens_at AND t<h.closes_at) OR (h.opens_at>h.closes_at AND t>=h.opens_at))) THEN RETURN true; END IF;
 SELECT closed INTO is_closed FROM public.neroxa_storefront_special_days WHERE instance_id=p_instance AND date=prev;
 IF FOUND THEN
  IF is_closed THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.neroxa_storefront_special_hours h WHERE h.instance_id=p_instance AND h.date=prev AND h.opens_at>h.closes_at AND t<h.closes_at);
 END IF;
 RETURN EXISTS(SELECT 1 FROM public.neroxa_storefront_weekly_hours h WHERE h.instance_id=p_instance AND h.weekday=extract(dow FROM prev)::int AND h.opens_at>h.closes_at AND t<h.closes_at);
END $$;
REVOKE ALL ON FUNCTION private.neroxa_store_is_open(uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.neroxa_public_availability(p_instance uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.neroxa_storefront_availability; checked timestamptz:=clock_timestamp(); opened boolean;
BEGIN
 SELECT * INTO cfg FROM public.neroxa_storefront_availability WHERE instance_id=p_instance;
 opened:=private.neroxa_store_is_open(p_instance,checked);
 RETURN jsonb_build_object('contract','INSTANCE_AVAILABILITY_V1','instance_id',p_instance,'configured',FOUND,'open',opened,'timezone',cfg.timezone,'checked_at',checked,
 'weekly_hours',(SELECT coalesce(jsonb_agg(to_jsonb(h)-'instance_id'),'[]'::jsonb) FROM public.neroxa_storefront_weekly_hours h WHERE h.instance_id=p_instance),
 'special_days',(SELECT coalesce(jsonb_agg(to_jsonb(h)-'instance_id'),'[]'::jsonb) FROM public.neroxa_storefront_special_days h WHERE h.instance_id=p_instance),
 'special_hours',(SELECT coalesce(jsonb_agg(to_jsonb(h)-'instance_id'),'[]'::jsonb) FROM public.neroxa_storefront_special_hours h WHERE h.instance_id=p_instance));
END $$;
REVOKE ALL ON FUNCTION private.neroxa_public_availability(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.neroxa_assert_store_open(p_instance uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 LOCK TABLE public.neroxa_storefront_availability,public.neroxa_storefront_weekly_hours,public.neroxa_storefront_special_days,public.neroxa_storefront_special_hours IN SHARE MODE;
 IF NOT private.neroxa_store_is_open(p_instance,clock_timestamp()) THEN RAISE EXCEPTION 'Store unavailable' USING ERRCODE='PT423'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.neroxa_assert_store_open(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Verified function bodies below retain original signatures, ACLs and recovery-before-sale ordering.

DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.create_public_order(jsonb)'::regprocedure) IS DISTINCT FROM '49af4aa15b530cd9fc614ec1c594c962' THEN RAISE EXCEPTION 'Availability preflight: unexpected create_public_order body'; END IF; END $$;
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

DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.get_public_storefront_catalog(text)'::regprocedure) IS DISTINCT FROM '85d9df673084d014f635704e867e1e2a' THEN RAISE EXCEPTION 'Availability preflight: unexpected get_public_storefront_catalog body'; END IF; END $$;
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
        where l.group_id = g.id AND EXISTS(SELECT 1 FROM public.neroxa_storefront_products linked WHERE linked.id=l.product_id AND linked.instance_id=v_instance AND linked.active)
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
    'selection_contract', 'GROUP_ADDONS_V1', 'context', v_context, 'categories', v_categories, 'products', v_products,
    'availability', private.neroxa_public_availability(v_instance), 'settings', v_settings, 'delivery_zones', v_zones, 'addon_groups', v_addon_groups
  );
end;
$function$;

DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.append_public_order_items_with_payment(uuid,text,jsonb,text)'::regprocedure) IS DISTINCT FROM '4b2f907823bb97da3355ab4a399f3168' THEN RAISE EXCEPTION 'Availability preflight: unexpected append_public_order_items_with_payment body'; END IF; END $$;
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
 perform private.neroxa_assert_store_open(v_order.instance_id);
 if v_order.status not in ('RECEIVED','CONFIRMED','PREPARING','READY') then raise exception 'Este pedido não aceita novos itens';end if;
 for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  IF v_item ? 'group_addon_ids' OR v_item->>'selection_contract'='GROUP_ADDONS_V1' OR private.neroxa_requires_group_contract(v_order.instance_id,(v_item->>'product_id')::uuid) THEN RAISE EXCEPTION 'Grouped append requires private capability' USING ERRCODE='22023'; END IF;
  v_qty:=greatest(1,coalesce((v_item->>'quantity')::int,1));
  v_unit:=public.calculate_public_order_line_price(v_order.instance_id,nullif(v_item->>'product_id','')::uuid,nullif(v_item->>'second_product_id','')::uuid,nullif(v_item->>'size_id',''),nullif(v_item->>'crust_id',''),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb));
  insert into public.neroxa_order_items(order_id,product_id,product_name,product_image_url,second_product_id,is_half,addons,complements,quantity,notes,unit_price,line_total)
  select v_order.id,p.id,p.name,p.image_url,nullif(v_item->>'second_product_id','')::uuid,coalesce((v_item->>'is_half')::boolean,false),coalesce(v_item->'addons','[]'::jsonb),coalesce(v_item->'complements','[]'::jsonb),v_qty,nullif(v_item->>'notes',''),v_unit,v_unit*v_qty
  from public.neroxa_storefront_products p where p.id=nullif(v_item->>'product_id','')::uuid and p.instance_id=v_order.instance_id and p.active;
  if not found then raise exception 'Produto não disponível';end if;
  v_add:=v_add+v_unit*v_qty;
 end loop;
 update public.neroxa_orders as o set subtotal=o.subtotal+v_add,total=o.total+v_add,payment_method=coalesce(p_payment_method,o.payment_method),updated_at=now() where o.id=v_order.id returning o.* into v_order;
 order_id:=v_order.id;order_number:=v_order.order_number;subtotal:=v_order.subtotal;total:=v_order.total;return next;
end $function$
;
COMMIT;
