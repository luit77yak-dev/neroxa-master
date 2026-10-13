-- REVIEW ONLY; depends on full phase2 + runtime hardening. Never remote-install automatically.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.create_public_order(jsonb)') IS NULL OR to_regprocedure('public.get_public_storefront_context(text)') IS NULL OR to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN RAISE EXCEPTION 'Grouped pricing prerequisites missing'; END IF;
 IF (SELECT format_type(a.atttypid,a.atttypmod) FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.neroxa_order_items'::regclass AND a.attname='size_id' AND NOT a.attisdropped) IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'Unexpected historical option identity'; END IF;
END $preflight$;
CREATE TABLE private.neroxa_group_order_intents (
 order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
 payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE private.neroxa_group_order_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_group_order_intents FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.neroxa_order_items ADD COLUMN IF NOT EXISTS selection_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $snapshot_type$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.neroxa_order_items'::regclass AND attname='selection_snapshot' AND atttypid='jsonb'::regtype AND attnotnull AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected snapshot column; stop instead of coercing history'; END IF; END $snapshot_type$;
CREATE OR REPLACE FUNCTION private.neroxa_prepare_group_item(p_instance uuid,p_item jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $group$
DECLARE
 p public.neroxa_storefront_products%rowtype; g record; a record; opt jsonb; choice jsonb;
 ids uuid[]; qty integer; n integer; unit numeric; delta numeric; snaps jsonb:='[]'; groups jsonb:='[]'; options jsonb:='[]';
 option_id text; choice_id text;
BEGIN
 LOCK TABLE public.neroxa_storefront_products,public.neroxa_storefront_categories,public.neroxa_storefront_addon_groups,public.neroxa_storefront_addons,public.neroxa_storefront_product_addon_groups IN SHARE MODE;
 IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' OR p_item->>'selection_contract' IS DISTINCT FROM 'GROUP_ADDONS_V1' THEN RAISE EXCEPTION 'Invalid selection contract' USING ERRCODE='22023'; END IF;
 IF nullif(p_item->>'second_product_id','') IS NOT NULL OR coalesce((p_item->>'is_half')::boolean,false) THEN RAISE EXCEPTION 'Half pizza contract pending' USING ERRCODE='22023'; END IF;
 IF coalesce(p_item->'addons','[]')<>'[]'::jsonb OR coalesce(p_item->'complements','[]')<>'[]'::jsonb THEN RAISE EXCEPTION 'Mixed product/addon identifiers' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_item->'quantity') IS DISTINCT FROM 'number' OR p_item->>'quantity' !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Invalid quantity' USING ERRCODE='22023'; END IF;
 qty:=(p_item->>'quantity')::integer;
 IF qty>10 THEN RAISE EXCEPTION 'Quantity exceeds limit' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.neroxa_storefront_products WHERE id=(p_item->>'product_id')::uuid AND instance_id=p_instance AND active;
 IF NOT FOUND OR p.metadata->>'available'='false' OR p.metadata->>'kind'='COMBO' OR (p.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.neroxa_storefront_categories c WHERE c.id=p.category_id AND c.instance_id=p_instance AND c.active)) THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='22023'; END IF;
 IF p.price IS NULL OR p.price<0 OR p.price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid base price' USING ERRCODE='22023'; END IF;
 unit:=p.price;
 IF jsonb_typeof(p_item->'group_addon_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_item->'group_addon_ids')>50 THEN RAISE EXCEPTION 'Invalid addon array' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_item->'group_addon_ids') x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION 'Addon IDs must be strings' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(x::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_item->'group_addon_ids') x;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Duplicate addon' USING ERRCODE='22023'; END IF;
 FOR a IN SELECT ad.*,gr.name group_name FROM public.neroxa_storefront_addons ad JOIN public.neroxa_storefront_addon_groups gr ON gr.id=ad.group_id JOIN public.neroxa_storefront_product_addon_groups l ON l.group_id=gr.id AND l.product_id=p.id WHERE ad.id=ANY(ids) AND ad.active AND gr.active AND gr.instance_id=p_instance LOOP
  IF a.price_delta<0 OR a.price_delta::text IN ('NaN','Infinity','-Infinity') OR a.price_delta<>round(a.price_delta,2) THEN RAISE EXCEPTION 'Invalid addon cents' USING ERRCODE='22023'; END IF;
  unit:=unit+a.price_delta;
  snaps:=snaps||jsonb_build_array(jsonb_build_object('addon_id',a.id,'group_id',a.group_id,'group_name',a.group_name,'name',a.name,'quantity',1,'unit_price',a.price_delta));
 END LOOP;
 IF jsonb_array_length(snaps)<>cardinality(ids) THEN RAISE EXCEPTION 'Addon outside product/instance or inactive' USING ERRCODE='22023'; END IF;
 FOR g IN SELECT gr.* FROM public.neroxa_storefront_addon_groups gr JOIN public.neroxa_storefront_product_addon_groups l ON l.group_id=gr.id WHERE l.product_id=p.id LOOP
  IF g.instance_id<>p_instance OR (NOT g.active AND (g.required OR g.min_selections>0)) THEN RAISE EXCEPTION 'Invalid linked group' USING ERRCODE='22023'; END IF;
  IF NOT g.active THEN CONTINUE; END IF;
  SELECT count(*) INTO n FROM public.neroxa_storefront_addons ad WHERE ad.group_id=g.id AND ad.id=ANY(ids);
  IF n<greatest(g.min_selections,CASE WHEN g.required THEN 1 ELSE 0 END) OR n>g.max_selections THEN RAISE EXCEPTION 'Group selection limits' USING ERRCODE='22023'; END IF;
  groups:=groups||jsonb_build_array(jsonb_build_object('group_id',g.id,'name',g.name,'required',g.required,'min',g.min_selections,'max',g.max_selections));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.metadata->'options','[]')) o GROUP BY o->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Ambiguous option groups' USING ERRCODE='22023'; END IF;
 FOR opt IN SELECT value FROM jsonb_array_elements(coalesce(p.metadata->'options','[]')) LOOP
  option_id:=opt->>'id';
  IF option_id NOT IN ('tamanho','borda') THEN RAISE EXCEPTION 'Preparation option contract pending' USING ERRCODE='22023'; END IF;
  choice_id:=nullif(p_item->>CASE WHEN option_id='tamanho' THEN 'size_id' ELSE 'crust_id' END,'');
  IF opt->>'active'='false' THEN IF choice_id IS NOT NULL OR opt->>'required'='true' THEN RAISE EXCEPTION 'Inactive option' USING ERRCODE='22023'; END IF; CONTINUE; END IF;
  IF choice_id IS NULL THEN
   IF opt->>'required'='true' THEN RAISE EXCEPTION 'Required option missing' USING ERRCODE='22023'; END IF;
   CONTINUE;
  END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(coalesce(opt->'choices','[]')) c WHERE c->>'id'=choice_id AND coalesce(c->>'active','true')='true' AND coalesce(c->>'available','true')='true';
  IF n<>1 THEN RAISE EXCEPTION 'Option unavailable/ambiguous' USING ERRCODE='22023'; END IF;
  SELECT c INTO choice FROM jsonb_array_elements(opt->'choices') c WHERE c->>'id'=choice_id;
  delta:=coalesce((choice->>'price')::numeric,0);
  IF delta<0 OR delta::text IN ('NaN','Infinity','-Infinity') OR delta<>round(delta,2) THEN RAISE EXCEPTION 'Invalid option cents' USING ERRCODE='22023'; END IF;
  unit:=unit+delta;
  options:=options||jsonb_build_array(jsonb_build_object('option_id',option_id,'choice_id',choice_id,'name',choice->>'name','price_delta',delta));
 END LOOP;
 IF (nullif(p_item->>'size_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options) o WHERE o->>'option_id'='tamanho')) OR (nullif(p_item->>'crust_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options) o WHERE o->>'option_id'='borda')) THEN RAISE EXCEPTION 'Unknown option' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_item->'expected_unit_price') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Price acknowledgement required' USING ERRCODE='22023'; END IF;
 IF (p_item->>'expected_unit_price')::numeric IS DISTINCT FROM unit THEN RAISE EXCEPTION 'Price changed; review catalog' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('product_id',p.id,'product_name',p.name,'product_image_url',p.image_url,'size_name',(SELECT o->>'name' FROM jsonb_array_elements(options) o WHERE o->>'option_id'='tamanho'),'crust_name',(SELECT o->>'name' FROM jsonb_array_elements(options) o WHERE o->>'option_id'='borda'),'crust_price',coalesce((SELECT (o->>'price_delta')::numeric FROM jsonb_array_elements(options) o WHERE o->>'option_id'='borda'),0),'quantity',qty,'unit_price',unit,'line_total',unit*qty,'addons',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->'addon_id','group_id',x->'group_id','name',x->'name','price',x->'unit_price','quantity',1,'entity_type','ADDON','selection_contract','GROUP_ADDONS_V1')),'[]'::jsonb) FROM jsonb_array_elements(snaps) x),'selection_snapshot',jsonb_build_object('version',2,'contract','GROUP_ADDONS_V1','pricing_rule','BASE_PLUS_DELTAS_V1','instance_id',p_instance,'product_id',p.id,'product_name',p.name,'base_price',p.price,'quantity',qty,'options',options,'groups',groups,'addons',snaps,'unit_price',unit,'line_total',unit*qty));
END $group$;
REVOKE ALL ON FUNCTION private.neroxa_prepare_group_item(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
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
   IF EXISTS(SELECT 1 FROM public.neroxa_storefront_product_addon_groups l WHERE l.product_id=(v_item->>'product_id')::uuid) THEN RAISE EXCEPTION 'Product requires explicit grouped contract' USING ERRCODE='22023'; END IF;
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
    'settings', v_settings, 'delivery_zones', v_zones, 'addon_groups', v_addon_groups
  );
end;
$function$;



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
    'quantity', i.quantity, 'notes', i.notes, 'unitPrice', i.unit_price, 'lineTotal', i.line_total, 'selectionSnapshot', i.selection_snapshot
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
  IF v_item ? 'group_addon_ids' OR v_item->>'selection_contract'='GROUP_ADDONS_V1' OR EXISTS(SELECT 1 FROM public.neroxa_storefront_product_addon_groups l WHERE l.product_id=(v_item->>'product_id')::uuid) THEN RAISE EXCEPTION 'Grouped append requires private capability' USING ERRCODE='22023'; END IF;
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
