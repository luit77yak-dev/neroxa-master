CREATE TYPE public.app_role AS ENUM ('OWNER', 'ADMIN', 'ATTENDANT', 'KITCHEN', 'DRIVER', 'CUSTOMER');
CREATE TYPE public.order_status AS ENUM ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
CREATE TYPE public.coupon_type AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_DELIVERY');
CREATE TYPE public.fulfillment_type AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'PIX', 'CARD_ON_DELIVERY', 'CARD_ON_SITE');
CREATE TYPE public.product_kind AS ENUM ('PIZZA', 'SIMPLE');
CREATE TYPE public.half_pizza_rule AS ENUM ('highest_half', 'average_halves', 'fixed_price');
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TABLE public.organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL, active boolean NOT NULL DEFAULT TRUE, demo_mode boolean NOT NULL DEFAULT FALSE, order_counter integer NOT NULL DEFAULT 1000, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE, full_name text, phone text, email text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.organization_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE, role public.app_role NOT NULL DEFAULT 'CUSTOMER', active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, user_id, role));
CREATE INDEX idx_org_members_user ON public.organization_members (user_id);
CREATE INDEX idx_org_members_org ON public.organization_members (organization_id);
CREATE TABLE public.organization_settings (organization_id uuid PRIMARY KEY REFERENCES public.organizations ON DELETE CASCADE, description text, whatsapp_phone text, address_street text, address_number text, address_neighborhood text, address_city text, address_state text, address_zip text, logo_url text, favicon_url text, hero_image_url text, hero_title text, hero_subtitle text, hero_cta_label text, primary_color text NOT NULL DEFAULT '25 85% 45%', secondary_color text NOT NULL DEFAULT '150 30% 25%', font_family text NOT NULL DEFAULT 'Sora', social_links jsonb NOT NULL DEFAULT CAST('{}' AS jsonb), payment_methods public.payment_method[] NOT NULL DEFAULT CAST(ARRAY['CASH', 'PIX', 'CARD_ON_DELIVERY'] AS public.payment_method[]), delivery_enabled boolean NOT NULL DEFAULT TRUE, pickup_enabled boolean NOT NULL DEFAULT TRUE, pickup_instructions text, min_order_amount numeric(10, 2) NOT NULL DEFAULT 0, estimated_delivery_minutes integer NOT NULL DEFAULT 45, estimated_pickup_minutes integer NOT NULL DEFAULT 25, half_pizza_pricing_rule public.half_pizza_rule NOT NULL DEFAULT 'highest_half', half_pizza_fixed_price numeric(10, 2), loyalty_points_per_currency numeric(10, 2) NOT NULL DEFAULT 1, scheduling_enabled boolean NOT NULL DEFAULT FALSE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid()
      AND m.active AND m.role = ANY(_roles)
  );
$$;
CREATE OR REPLACE FUNCTION public.is_org_staff(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_org_role(_org, ARRAY['OWNER','ADMIN','ATTENDANT','KITCHEN','DRIVER']::public.app_role[]);
$$;
CREATE OR REPLACE FUNCTION public.is_org_manager(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_org_role(_org, ARRAY['OWNER','ADMIN']::public.app_role[]);
$$;
CREATE OR REPLACE FUNCTION public.next_order_number(_org uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.organizations SET order_counter = order_counter + 1
  WHERE id = _org RETURNING order_counter INTO n;
  RETURN n;
END; $$;
CREATE TABLE public.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, description text, image_url text, sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX idx_categories_org ON public.categories (organization_id);
CREATE TABLE public.product_sizes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, slices integer, sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_sizes_org ON public.product_sizes (organization_id);
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, category_id uuid REFERENCES public.categories ON DELETE SET NULL, name text NOT NULL, description text, image_url text, kind public.product_kind NOT NULL DEFAULT 'SIMPLE', base_price numeric(10, 2) NOT NULL DEFAULT 0, allow_half boolean NOT NULL DEFAULT FALSE, active boolean NOT NULL DEFAULT TRUE, featured boolean NOT NULL DEFAULT FALSE, available boolean NOT NULL DEFAULT TRUE, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
CREATE INDEX idx_products_org ON public.products (organization_id);
CREATE INDEX idx_products_category ON public.products (category_id);
CREATE TABLE public.product_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products ON DELETE CASCADE, size_id uuid NOT NULL REFERENCES public.product_sizes ON DELETE CASCADE, price numeric(10, 2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (product_id, size_id));
CREATE INDEX idx_prices_org ON public.product_prices (organization_id);
CREATE TABLE public.product_crusts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, price numeric(10, 2) NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_crusts_org ON public.product_crusts (organization_id);
CREATE TABLE public.product_addons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, price numeric(10, 2) NOT NULL DEFAULT 0, sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_addons_org ON public.product_addons (organization_id);
CREATE TABLE public.coupons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, code text NOT NULL, description text, type public.coupon_type NOT NULL, value numeric(10, 2) NOT NULL DEFAULT 0, min_order_amount numeric(10, 2) NOT NULL DEFAULT 0, usage_limit integer, usage_count integer NOT NULL DEFAULT 0, starts_at timestamptz, ends_at timestamptz, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, code));
CREATE INDEX idx_coupons_org ON public.coupons (organization_id);
CREATE TABLE public.delivery_zones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, neighborhoods text[] NOT NULL DEFAULT '{}', minimum_order numeric(10, 2) NOT NULL DEFAULT 0, delivery_fee numeric(10, 2) NOT NULL DEFAULT 0, estimated_minutes integer, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_zones_org ON public.delivery_zones (organization_id);
CREATE TABLE public.drivers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, name text NOT NULL, phone text, user_id uuid REFERENCES auth.users ON DELETE SET NULL, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_drivers_org ON public.drivers (organization_id);
CREATE TABLE public.store_hours (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6), opens_at time, closes_at time, closed boolean NOT NULL DEFAULT FALSE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, weekday));
CREATE INDEX idx_hours_org ON public.store_hours (organization_id);
CREATE TABLE public.special_hours (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, date date NOT NULL, opens_at time, closes_at time, closed boolean NOT NULL DEFAULT TRUE, note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, date));
CREATE INDEX idx_special_hours_org ON public.special_hours (organization_id);
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, order_number integer NOT NULL, customer_user_id uuid REFERENCES auth.users ON DELETE SET NULL, customer_name text NOT NULL, customer_phone text NOT NULL, fulfillment public.fulfillment_type NOT NULL DEFAULT 'DELIVERY', payment_method public.payment_method NOT NULL DEFAULT 'CASH', status public.order_status NOT NULL DEFAULT 'RECEIVED', subtotal numeric(10, 2) NOT NULL DEFAULT 0, discount numeric(10, 2) NOT NULL DEFAULT 0, delivery_fee numeric(10, 2) NOT NULL DEFAULT 0, total numeric(10, 2) NOT NULL DEFAULT 0, coupon_id uuid REFERENCES public.coupons ON DELETE SET NULL, coupon_code text, delivery_zone_id uuid REFERENCES public.delivery_zones ON DELETE SET NULL, address_street text, address_number text, address_complement text, address_neighborhood text, address_reference text, notes text, driver_id uuid REFERENCES public.drivers ON DELETE SET NULL, idempotency_key text, is_demo boolean NOT NULL DEFAULT FALSE, source text NOT NULL DEFAULT 'PUBLIC', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, order_number), UNIQUE (organization_id, idempotency_key));
CREATE INDEX idx_orders_org ON public.orders (organization_id);
CREATE INDEX idx_orders_customer ON public.orders (customer_user_id);
CREATE INDEX idx_orders_status ON public.orders (organization_id, status);
CREATE INDEX idx_orders_created ON public.orders (organization_id, created_at DESC);
CREATE TABLE public.order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, order_id uuid NOT NULL REFERENCES public.orders ON DELETE CASCADE, product_id uuid REFERENCES public.products ON DELETE SET NULL, product_name text NOT NULL, second_product_id uuid REFERENCES public.products ON DELETE SET NULL, second_product_name text, is_half boolean NOT NULL DEFAULT FALSE, size_id uuid REFERENCES public.product_sizes ON DELETE SET NULL, size_name text, crust_id uuid REFERENCES public.product_crusts ON DELETE SET NULL, crust_name text, crust_price numeric(10, 2) NOT NULL DEFAULT 0, unit_price numeric(10, 2) NOT NULL DEFAULT 0, quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 99), total_price numeric(10, 2) NOT NULL DEFAULT 0, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_order_items_order ON public.order_items (order_id);
CREATE INDEX idx_order_items_org ON public.order_items (organization_id);
CREATE TABLE public.order_item_addons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, order_item_id uuid NOT NULL REFERENCES public.order_items ON DELETE CASCADE, addon_id uuid REFERENCES public.product_addons ON DELETE SET NULL, name text NOT NULL, price numeric(10, 2) NOT NULL DEFAULT 0, quantity integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_item_addons_item ON public.order_item_addons (order_item_id);
CREATE INDEX idx_item_addons_org ON public.order_item_addons (organization_id);
CREATE TABLE public.order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, order_id uuid NOT NULL REFERENCES public.orders ON DELETE CASCADE, status public.order_status NOT NULL, changed_by uuid REFERENCES auth.users ON DELETE SET NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_status_hist_order ON public.order_status_history (order_id);
CREATE INDEX idx_status_hist_org ON public.order_status_history (organization_id);
CREATE TABLE public.loyalty_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, user_id uuid REFERENCES auth.users ON DELETE CASCADE, phone text, points_balance integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX idx_loyalty_org_user ON public.loyalty_accounts (organization_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_loyalty_org ON public.loyalty_accounts (organization_id);
CREATE TABLE public.loyalty_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, loyalty_account_id uuid NOT NULL REFERENCES public.loyalty_accounts ON DELETE CASCADE, order_id uuid REFERENCES public.orders ON DELETE SET NULL, points integer NOT NULL, description text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_loyalty_tx_account ON public.loyalty_transactions (loyalty_account_id);
CREATE INDEX idx_loyalty_tx_org ON public.loyalty_transactions (organization_id);
CREATE TABLE public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations ON DELETE CASCADE, actor_id uuid REFERENCES auth.users ON DELETE SET NULL, actor_label text, action text NOT NULL, entity text NOT NULL, entity_id uuid, details jsonb NOT NULL DEFAULT CAST('{}' AS jsonb), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_audit_org ON public.audit_logs (organization_id, created_at DESC);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','profiles','organization_members','organization_settings','categories','product_sizes','products','product_prices','product_crusts','product_addons','coupons','delivery_zones','drivers','store_hours','special_hours','orders','loyalty_accounts']
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
GRANT SELECT ON TABLE public.organizations, public.organization_settings, public.categories, public.product_sizes, public.products, public.product_prices, public.product_crusts, public.product_addons, public.delivery_zones, public.store_hours, public.special_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations, public.organization_settings, public.categories, public.product_sizes, public.products, public.product_prices, public.product_crusts, public.product_addons, public.delivery_zones, public.store_hours, public.special_hours, public.coupons, public.drivers, public.orders, public.order_items, public.order_item_addons, public.order_status_history, public.loyalty_accounts, public.loyalty_transactions, public.audit_logs, public.profiles, public.organization_members TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.organizations, public.organization_settings, public.categories, public.product_sizes, public.products, public.product_prices, public.product_crusts, public.product_addons, public.delivery_zones, public.store_hours, public.special_hours, public.coupons, public.drivers, public.orders, public.order_items, public.order_item_addons, public.order_status_history, public.loyalty_accounts, public.loyalty_transactions, public.audit_logs, public.profiles, public.organization_members TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.product_crusts ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.store_hours ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.special_hours ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.order_item_addons ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY ;
CREATE POLICY org_public_read ON public.organizations AS PERMISSIVE FOR select TO anon, authenticated USING (active AND deleted_at IS NULL);
CREATE POLICY org_manager_update ON public.organizations AS PERMISSIVE FOR update TO authenticated USING (public.is_org_manager(id)) WITH CHECK (public.is_org_manager(id));
CREATE POLICY settings_public_read ON public.organization_settings AS PERMISSIVE FOR select TO anon, authenticated USING (TRUE);
CREATE POLICY settings_manager_write ON public.organization_settings AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY members_self_read ON public.organization_members AS PERMISSIVE FOR select TO authenticated USING (user_id = auth.uid() OR public.is_org_staff(organization_id));
CREATE POLICY members_manager_write ON public.organization_members AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY profiles_self ON public.profiles AS PERMISSIVE FOR all TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY categories_read ON public.categories AS PERMISSIVE FOR select TO anon, authenticated USING ((active AND deleted_at IS NULL) OR public.is_org_staff(organization_id));
CREATE POLICY categories_write ON public.categories AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY sizes_read ON public.product_sizes AS PERMISSIVE FOR select TO anon, authenticated USING (active OR public.is_org_staff(organization_id));
CREATE POLICY sizes_write ON public.product_sizes AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY products_read ON public.products AS PERMISSIVE FOR select TO anon, authenticated USING ((active AND deleted_at IS NULL) OR public.is_org_staff(organization_id));
CREATE POLICY products_write ON public.products AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY prices_read ON public.product_prices AS PERMISSIVE FOR select TO anon, authenticated USING (TRUE);
CREATE POLICY prices_write ON public.product_prices AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY crusts_read ON public.product_crusts AS PERMISSIVE FOR select TO anon, authenticated USING (active OR public.is_org_staff(organization_id));
CREATE POLICY crusts_write ON public.product_crusts AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY addons_read ON public.product_addons AS PERMISSIVE FOR select TO anon, authenticated USING (active OR public.is_org_staff(organization_id));
CREATE POLICY addons_write ON public.product_addons AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY zones_read ON public.delivery_zones AS PERMISSIVE FOR select TO anon, authenticated USING (active OR public.is_org_staff(organization_id));
CREATE POLICY zones_write ON public.delivery_zones AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY hours_read ON public.store_hours AS PERMISSIVE FOR select TO anon, authenticated USING (TRUE);
CREATE POLICY hours_write ON public.store_hours AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY special_hours_read ON public.special_hours AS PERMISSIVE FOR select TO anon, authenticated USING (TRUE);
CREATE POLICY special_hours_write ON public.special_hours AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY coupons_staff_read ON public.coupons AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id));
CREATE POLICY coupons_write ON public.coupons AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY drivers_staff_read ON public.drivers AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id));
CREATE POLICY drivers_write ON public.drivers AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY orders_read ON public.orders AS PERMISSIVE FOR select TO authenticated USING (customer_user_id = auth.uid() OR public.is_org_staff(organization_id));
CREATE POLICY orders_staff_insert ON public.orders AS PERMISSIVE FOR insert TO authenticated WITH CHECK (public.has_org_role(organization_id, CAST(ARRAY['OWNER', 'ADMIN', 'ATTENDANT'] AS public.app_role[])));
CREATE POLICY orders_staff_update ON public.orders AS PERMISSIVE FOR update TO authenticated USING (public.is_org_staff(organization_id)) WITH CHECK (public.is_org_staff(organization_id));
CREATE POLICY orders_manager_delete ON public.orders AS PERMISSIVE FOR delete TO authenticated USING (public.is_org_manager(organization_id));
CREATE POLICY order_items_read ON public.order_items AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id) OR EXISTS (SELECT 1 FROM public.orders AS o WHERE o.id = order_id AND o.customer_user_id = auth.uid()));
CREATE POLICY order_items_staff_write ON public.order_items AS PERMISSIVE FOR all TO authenticated USING (public.has_org_role(organization_id, CAST(ARRAY['OWNER', 'ADMIN', 'ATTENDANT'] AS public.app_role[]))) WITH CHECK (public.has_org_role(organization_id, CAST(ARRAY['OWNER', 'ADMIN', 'ATTENDANT'] AS public.app_role[])));
CREATE POLICY item_addons_read ON public.order_item_addons AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id) OR EXISTS (SELECT 1 FROM public.order_items AS i INNER JOIN public.orders AS o ON o.id = i.order_id WHERE i.id = order_item_id AND o.customer_user_id = auth.uid()));
CREATE POLICY item_addons_staff_write ON public.order_item_addons AS PERMISSIVE FOR all TO authenticated USING (public.has_org_role(organization_id, CAST(ARRAY['OWNER', 'ADMIN', 'ATTENDANT'] AS public.app_role[]))) WITH CHECK (public.has_org_role(organization_id, CAST(ARRAY['OWNER', 'ADMIN', 'ATTENDANT'] AS public.app_role[])));
CREATE POLICY status_hist_read ON public.order_status_history AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id) OR EXISTS (SELECT 1 FROM public.orders AS o WHERE o.id = order_id AND o.customer_user_id = auth.uid()));
CREATE POLICY status_hist_staff_insert ON public.order_status_history AS PERMISSIVE FOR insert TO authenticated WITH CHECK (public.is_org_staff(organization_id));
CREATE POLICY loyalty_read ON public.loyalty_accounts AS PERMISSIVE FOR select TO authenticated USING (user_id = auth.uid() OR public.is_org_staff(organization_id));
CREATE POLICY loyalty_write ON public.loyalty_accounts AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY loyalty_tx_read ON public.loyalty_transactions AS PERMISSIVE FOR select TO authenticated USING (public.is_org_staff(organization_id) OR EXISTS (SELECT 1 FROM public.loyalty_accounts AS a WHERE a.id = loyalty_account_id AND a.user_id = auth.uid()));
CREATE POLICY loyalty_tx_write ON public.loyalty_transactions AS PERMISSIVE FOR all TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
CREATE POLICY audit_read ON public.audit_logs AS PERMISSIVE FOR select TO authenticated USING (public.is_org_manager(organization_id));
CREATE POLICY audit_insert ON public.audit_logs AS PERMISSIVE FOR insert TO authenticated WITH CHECK (public.is_org_staff(organization_id));

REVOKE ALL PRIVILEGES ON FUNCTION public.set_updated_at () FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.handle_new_user () FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.next_order_number (uuid) FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_org_role (uuid, public.app_role[]) FROM anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_org_manager (uuid) FROM anon;

REVOKE ALL PRIVILEGES ON FUNCTION public.set_updated_at () FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.handle_new_user () FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.next_order_number (uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_org_role (uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_org_manager (uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_org_staff (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_org_role (uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_manager (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_staff (uuid) TO authenticated;
DROP POLICY categories_read ON public.categories;
CREATE POLICY categories_read_anon ON public.categories AS PERMISSIVE FOR select TO anon USING (active AND deleted_at IS NULL);
CREATE POLICY categories_read_auth ON public.categories AS PERMISSIVE FOR select TO authenticated USING ((active AND deleted_at IS NULL) OR public.is_org_staff(organization_id));
DROP POLICY sizes_read ON public.product_sizes;
CREATE POLICY sizes_read_anon ON public.product_sizes AS PERMISSIVE FOR select TO anon USING (active);
CREATE POLICY sizes_read_auth ON public.product_sizes AS PERMISSIVE FOR select TO authenticated USING (active OR public.is_org_staff(organization_id));
DROP POLICY products_read ON public.products;
CREATE POLICY products_read_anon ON public.products AS PERMISSIVE FOR select TO anon USING (active AND deleted_at IS NULL);
CREATE POLICY products_read_auth ON public.products AS PERMISSIVE FOR select TO authenticated USING ((active AND deleted_at IS NULL) OR public.is_org_staff(organization_id));
DROP POLICY crusts_read ON public.product_crusts;
CREATE POLICY crusts_read_anon ON public.product_crusts AS PERMISSIVE FOR select TO anon USING (active);
CREATE POLICY crusts_read_auth ON public.product_crusts AS PERMISSIVE FOR select TO authenticated USING (active OR public.is_org_staff(organization_id));
DROP POLICY addons_read ON public.product_addons;
CREATE POLICY addons_read_anon ON public.product_addons AS PERMISSIVE FOR select TO anon USING (active);
CREATE POLICY addons_read_auth ON public.product_addons AS PERMISSIVE FOR select TO authenticated USING (active OR public.is_org_staff(organization_id));
DROP POLICY zones_read ON public.delivery_zones;
CREATE POLICY zones_read_anon ON public.delivery_zones AS PERMISSIVE FOR select TO anon USING (active);
CREATE POLICY zones_read_auth ON public.delivery_zones AS PERMISSIVE FOR select TO authenticated USING (active OR public.is_org_staff(organization_id));

REVOKE ALL PRIVILEGES ON FUNCTION public.is_org_staff (uuid) FROM anon;

CREATE TABLE IF NOT EXISTS public.product_addon_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE, addon_id uuid NOT NULL REFERENCES public.product_addons (id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (product_id, addon_id));
GRANT SELECT ON TABLE public.product_addon_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_addon_links TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.product_addon_links TO service_role;
CREATE INDEX IF NOT EXISTS product_addon_links_organization_id_idx ON public.product_addon_links (organization_id);
CREATE INDEX IF NOT EXISTS product_addon_links_product_id_idx ON public.product_addon_links (product_id);
ALTER TABLE public.product_addon_links ENABLE ROW LEVEL SECURITY ;
CREATE POLICY "Public can view product addon links" ON public.product_addon_links AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products AS p INNER JOIN public.product_addons AS a ON a.id = product_addon_links.addon_id WHERE p.id = product_addon_links.product_id AND p.organization_id = product_addon_links.organization_id AND p.active AND p.available AND a.organization_id = product_addon_links.organization_id AND a.active));
CREATE POLICY "Owners and admins can manage product addon links" ON public.product_addon_links AS PERMISSIVE FOR all TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members AS m WHERE m.organization_id = product_addon_links.organization_id AND m.user_id = auth.uid() AND m.active AND m.role IN ('OWNER', 'ADMIN'))) WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members AS m WHERE m.organization_id = product_addon_links.organization_id AND m.user_id = auth.uid() AND m.active AND m.role IN ('OWNER', 'ADMIN')));
INSERT INTO public.product_addon_links (organization_id, product_id, addon_id, sort_order) SELECT p.organization_id, p.id, a.id, a.sort_order FROM public.products AS p INNER JOIN public.product_addons AS a ON a.organization_id = p.organization_id WHERE p.active AND a.active ON CONFLICT (product_id, addon_id) DO NOTHING;
DROP POLICY IF EXISTS "product images are publicly readable" ON storage.objects;
CREATE POLICY "product images are publicly readable" ON storage.objects AS PERMISSIVE FOR select TO PUBLIC USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS "staff can upload product images" ON storage.objects;
CREATE POLICY "staff can upload product images" ON storage.objects AS PERMISSIVE FOR insert TO authenticated WITH CHECK (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.organization_members AS om WHERE om.user_id = auth.uid() AND CAST(om.organization_id AS text) = ((storage.foldername(name)))[1] AND om.active = TRUE AND om.role IN ('OWNER', 'ADMIN')));
DROP POLICY IF EXISTS "staff can update product images" ON storage.objects;
CREATE POLICY "staff can update product images" ON storage.objects AS PERMISSIVE FOR update TO authenticated USING (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.organization_members AS om WHERE om.user_id = auth.uid() AND CAST(om.organization_id AS text) = ((storage.foldername(name)))[1] AND om.active = TRUE AND om.role IN ('OWNER', 'ADMIN'))) WITH CHECK (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.organization_members AS om WHERE om.user_id = auth.uid() AND CAST(om.organization_id AS text) = ((storage.foldername(name)))[1] AND om.active = TRUE AND om.role IN ('OWNER', 'ADMIN')));
DROP POLICY IF EXISTS "staff can delete product images" ON storage.objects;
CREATE POLICY "staff can delete product images" ON storage.objects AS PERMISSIVE FOR delete TO authenticated USING (bucket_id = 'product-images' AND EXISTS (SELECT 1 FROM public.organization_members AS om WHERE om.user_id = auth.uid() AND CAST(om.organization_id AS text) = ((storage.foldername(name)))[1] AND om.active = TRUE AND om.role IN ('OWNER', 'ADMIN')));
CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := (p_order->>'organization_id')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_subtotal numeric := COALESCE((p_order->>'subtotal')::numeric, 0);
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := p_order->>'idempotency_key';
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product_id uuid;
  v_second_product_id uuid;
  v_addon_id uuid;
BEGIN
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org AND active AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;
  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number INTO v_order_id, v_number FROM orders o
    WHERE o.organization_id = v_org AND o.idempotency_key = v_idempotency;
    IF v_order_id IS NOT NULL THEN RETURN QUERY SELECT v_order_id, v_number; RETURN; END IF;
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone FROM delivery_zones
    WHERE organization_id = v_org AND active
      AND EXISTS (SELECT 1 FROM unnest(neighborhoods) n WHERE lower(trim(n)) = lower(v_neighborhood))
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bairro não atendido'; END IF;
    v_zone_id := v_zone.id;
    v_delivery_fee := v_zone.delivery_fee;
  END IF;

  IF v_subtotal < COALESCE((SELECT min_order_amount FROM organization_settings WHERE organization_id = v_org),0) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo da loja';
  END IF;

  v_total := v_subtotal + v_delivery_fee;
  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    v_subtotal, 0, v_delivery_fee, v_total, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id=v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_order->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM products WHERE id = v_product_id AND organization_id = v_org AND active AND available AND deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'Produto inválido'; END IF;

    IF v_second_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM products WHERE id = v_second_product_id AND organization_id = v_org AND active AND available AND deleted_at IS NULL
    ) THEN RAISE EXCEPTION 'Segundo produto inválido'; END IF;

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_item->>'product_name',
      v_second_product_id, NULLIF(v_item->>'second_product_name',''),
      COALESCE((v_item->>'is_half')::boolean,false),
      NULLIF(v_item->>'size_id','')::uuid, NULLIF(v_item->>'size_name',''),
      NULLIF(v_item->>'crust_id','')::uuid, NULLIF(v_item->>'crust_name',''),
      COALESCE((v_item->>'crust_price')::numeric,0), COALESCE((v_item->>'unit_price')::numeric,0),
      GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer,1))),
      COALESCE((v_item->>'unit_price')::numeric,0) * GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer,1))),
      NULLIF(v_item->>'notes','')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      v_addon_id := NULLIF(v_addon->>'id','')::uuid;
      SELECT a.name, a.price INTO v_addon_row
      FROM product_addons a
      WHERE a.id = v_addon_id AND a.organization_id = v_org AND a.active
        AND EXISTS (
          SELECT 1 FROM product_addon_links l
          WHERE l.addon_id = a.id AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );
      IF NOT FOUND THEN RAISE EXCEPTION 'Adicional inválido para o produto'; END IF;
      INSERT INTO order_item_addons (organization_id, order_item_id, addon_id, name, price, quantity)
      VALUES (v_org, v_item_id, v_addon_id, v_addon_row.name, v_addon_row.price,
        GREATEST(1, COALESCE((v_item->>'quantity')::integer,1)));
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_customer_phone text) RETURNS TABLE (order_id uuid, order_number integer, status order_status, fulfillment fulfillment_type, created_at timestamptz, updated_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.fulfillment,
    o.created_at,
    o.updated_at
  FROM public.orders o
  WHERE o.id = p_order_id
    AND regexp_replace(o.customer_phone, '\\D', '', 'g')
        = regexp_replace(COALESCE(p_customer_phone, ''), '\\D', '', 'g')
  LIMIT 1;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_order_status (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_status (uuid, text) TO anon, authenticated;

DROP POLICY IF EXISTS settings_public_read ON public.organization_settings;
CREATE POLICY settings_public_read ON public.organization_settings AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.organizations AS o WHERE o.id = organization_id AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id));
DROP POLICY IF EXISTS special_hours_read ON public.special_hours;
CREATE POLICY special_hours_read ON public.special_hours AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.organizations AS o WHERE o.id = organization_id AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id));
DROP POLICY IF EXISTS prices_read ON public.product_prices;
CREATE POLICY prices_read ON public.product_prices AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products AS p INNER JOIN public.organizations AS o ON o.id = p.organization_id WHERE p.id = product_id AND p.organization_id = product_prices.organization_id AND p.active AND p.deleted_at IS NULL AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id));
DROP POLICY IF EXISTS hours_read ON public.store_hours;
CREATE POLICY hours_read ON public.store_hours AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.organizations AS o WHERE o.id = organization_id AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id));
GRANT EXECUTE ON FUNCTION public.is_org_staff (uuid) TO anon;

REVOKE EXECUTE ON FUNCTION public.is_org_staff (uuid) FROM anon;
DO $$ DECLARE t text; p text; BEGIN
FOR t, p IN SELECT * FROM (VALUES ('organization_settings','settings_public_read'),('special_hours','special_hours_read'),('store_hours','hours_read')) v LOOP
  EXECUTE format('DROP POLICY %I ON public.%I', p, t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.active AND o.deleted_at IS NULL))', p||'_anon', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id))', p, t);
END LOOP; END $$;
DROP POLICY prices_read ON public.product_prices;
CREATE POLICY prices_read_anon ON public.product_prices AS PERMISSIVE FOR select TO anon USING (EXISTS (SELECT 1 FROM public.products AS p INNER JOIN public.organizations AS o ON o.id = p.organization_id WHERE p.id = product_id AND p.organization_id = product_prices.organization_id AND p.active AND p.deleted_at IS NULL AND o.active AND o.deleted_at IS NULL));
CREATE POLICY prices_read ON public.product_prices AS PERMISSIVE FOR select TO authenticated USING (EXISTS (SELECT 1 FROM public.products AS p INNER JOIN public.organizations AS o ON o.id = p.organization_id WHERE p.id = product_id AND p.organization_id = product_prices.organization_id AND p.active AND p.deleted_at IS NULL AND o.active AND o.deleted_at IS NULL) OR public.is_org_staff(organization_id));

DROP POLICY IF EXISTS "product images are publicly readable" ON storage.objects;

CREATE OR REPLACE FUNCTION public.claim_first_owner() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare _org uuid;
begin
  if auth.uid() is null then return false; end if;
  select o.id into _org from organizations o
   where not exists (select 1 from organization_members m where m.organization_id = o.id and m.role = 'OWNER')
   order by o.created_at limit 1;
  if _org is null then return false; end if;
  insert into organization_members (organization_id, user_id, role) values (_org, auth.uid(), 'OWNER')
  on conflict do nothing;
  return true;
end $$;
REVOKE EXECUTE ON FUNCTION public.claim_first_owner () FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_owner () TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_customer_phone text) RETURNS TABLE (order_id uuid, order_number integer, status order_status, fulfillment fulfillment_type, created_at timestamptz, updated_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.order_number, o.status, o.fulfillment, o.created_at, o.updated_at
  FROM public.orders o
  WHERE o.id = p_order_id
    AND length(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')) >= 8
    AND regexp_replace(o.customer_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')
  LIMIT 1;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_order_status (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_status (uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_organization_id_change() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id cannot be changed';
  END IF;
  RETURN NEW;
END; $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organization_members','organization_settings','categories','product_sizes','products','product_prices','product_crusts','product_addons','coupons','delivery_zones','drivers','store_hours','special_hours','orders','order_items','order_item_addons','order_status_history','loyalty_accounts','loyalty_transactions','audit_logs']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_organization_id_change_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER prevent_organization_id_change_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.prevent_organization_id_change()', t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.get_public_storefront_settings(p_org uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'organization_id', s.organization_id, 'description', s.description, 'whatsapp_phone', s.whatsapp_phone,
    'logo_url', s.logo_url, 'hero_image_url', s.hero_image_url, 'hero_title', s.hero_title,
    'hero_subtitle', s.hero_subtitle, 'hero_cta_label', s.hero_cta_label, 'primary_color', s.primary_color,
    'secondary_color', s.secondary_color, 'font_family', s.font_family, 'payment_methods', s.payment_methods,
    'delivery_enabled', s.delivery_enabled, 'pickup_enabled', s.pickup_enabled, 'pickup_instructions', s.pickup_instructions,
    'min_order_amount', s.min_order_amount, 'estimated_delivery_minutes', s.estimated_delivery_minutes,
    'estimated_pickup_minutes', s.estimated_pickup_minutes, 'half_pizza_pricing_rule', s.half_pizza_pricing_rule,
    'half_pizza_fixed_price', s.half_pizza_fixed_price)
  FROM public.organization_settings s JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.organization_id = p_org AND o.active AND o.deleted_at IS NULL LIMIT 1;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_storefront_settings (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_settings (uuid) TO anon, authenticated;
DROP POLICY IF EXISTS settings_public_read ON public.organization_settings;
DROP POLICY IF EXISTS prices_read ON public.product_prices;
CREATE POLICY prices_read ON public.product_prices AS PERMISSIVE FOR select TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.organizations AS o WHERE o.id = product_prices.organization_id AND o.active AND o.deleted_at IS NULL));
DROP POLICY IF EXISTS orders_staff_update ON public.orders;
DROP POLICY IF EXISTS orders_manager_update ON public.orders;
CREATE POLICY orders_manager_update ON public.orders AS PERMISSIVE FOR update TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));
DROP POLICY IF EXISTS status_hist_staff_insert ON public.order_status_history;
CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_organization_id uuid, p_status public.order_status, p_note text = NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_org_staff(p_organization_id) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.orders SET status = p_status, updated_at = now() WHERE id = p_order_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  INSERT INTO public.order_status_history (organization_id, order_id, status, note)
  VALUES (p_organization_id, p_order_id, p_status, NULLIF(trim(COALESCE(p_note, '')), ''));
  RETURN true;
END; $$;
REVOKE ALL PRIVILEGES ON FUNCTION public.update_order_status (uuid, uuid, public.order_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_status (uuid, uuid, public.order_status, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := NULLIF(p_order->>'organization_id','')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_delivery_fee numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := NULLIF(trim(p_order->>'idempotency_key'),'');
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust record;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_product_name text;
  v_second_product_name text;
  v_size_id uuid;
  v_is_half boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Loja inválida'; END IF;
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org AND active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_number
    FROM orders o
    WHERE o.organization_id = v_org
      AND o.idempotency_key = v_idempotency;

    IF v_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_order_id, v_number;
      RETURN;
    END IF;
  END IF;

  IF jsonb_typeof(p_order->'items') <> 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'O pedido precisa ter pelo menos um item';
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE organization_id = v_org
      AND active
      AND EXISTS (
        SELECT 1
        FROM unnest(neighborhoods) n
        WHERE lower(trim(n)) = lower(v_neighborhood)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;

    v_zone_id := v_zone.id;
    v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
  END IF;

  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    0, 0, v_delivery_fee, v_delivery_fee, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id = v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;
    v_size_id := NULLIF(v_item->>'size_id','')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id','')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_crust := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_org
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    v_product_name := NULLIF(trim(COALESCE(v_product.name, v_item->>'product_name', '')), '');
    IF v_product_name IS NULL THEN
      RAISE EXCEPTION 'Produto sem nome cadastrado';
    END IF;

    v_second_product_name := NULL;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*
        INTO v_second_product
      FROM products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_org
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND OR NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      v_second_product_name := NULLIF(trim(COALESCE(v_second_product.name, '')), '');
      IF v_second_product_name IS NULL THEN
        RAISE EXCEPTION 'Segundo produto sem nome cadastrado';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM product_prices pp
      JOIN product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_org
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_org
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM product_prices pp
        JOIN product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_org
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_org
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE((SELECT half_pizza_pricing_rule FROM organization_settings WHERE organization_id = v_org), 'highest_half')
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price INTO v_base_price
          FROM organization_settings
          WHERE organization_id = v_org;
          v_base_price := COALESCE(v_base_price, GREATEST(v_base_price, v_second_size_price));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.*
        INTO v_crust
      FROM product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_org
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    ELSE
      v_crust := NULL;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust.price, 0)
      + v_addon_total,
      2
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_product_name, 
      v_second_product_id, CASE WHEN v_is_half THEN v_second_product_name ELSE NULL END,
      v_is_half, v_size_id, CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, CASE WHEN v_crust_id IS NOT NULL THEN v_crust.name ELSE NULL END,
      round(COALESCE(v_crust.price, 0), 2), v_unit_price, v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_org, v_item_id, NULLIF(v_addon->>'id','')::uuid,
        v_addon_row.name, round(v_addon_row.price, 2), v_quantity
      );
    END LOOP;
  END LOOP;

  IF v_fulfillment = 'DELIVERY'
     AND COALESCE(NULLIF(p_order->>'subtotal','')::numeric, v_subtotal) <
         COALESCE(
           (SELECT min_order_amount FROM organization_settings WHERE organization_id = v_org),
           0
         ) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo da loja';
  END IF;

  v_total := round(v_subtotal + v_delivery_fee, 2);

  UPDATE orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      total = v_total
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := NULLIF(p_order->>'organization_id','')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_delivery_fee numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := NULLIF(trim(p_order->>'idempotency_key'),'');
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust record;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_size_id uuid;
  v_is_half boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Loja inválida'; END IF;
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org AND active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_number
    FROM orders o
    WHERE o.organization_id = v_org
      AND o.idempotency_key = v_idempotency;

    IF v_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_order_id, v_number;
      RETURN;
    END IF;
  END IF;

  IF jsonb_typeof(p_order->'items') <> 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'O pedido precisa ter pelo menos um item';
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE organization_id = v_org
      AND active
      AND EXISTS (
        SELECT 1
        FROM unnest(neighborhoods) n
        WHERE lower(trim(n)) = lower(v_neighborhood)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;

    v_zone_id := v_zone.id;
    v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
  END IF;

  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    0, 0, v_delivery_fee, v_delivery_fee, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id = v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;
    v_size_id := NULLIF(v_item->>'size_id','')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id','')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_crust := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_org
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*
        INTO v_second_product
      FROM products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_org
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND OR NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM product_prices pp
      JOIN product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_org
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_org
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM product_prices pp
        JOIN product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_org
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_org
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE((SELECT half_pizza_pricing_rule FROM organization_settings WHERE organization_id = v_org), 'highest_half')
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price INTO v_base_price
          FROM organization_settings
          WHERE organization_id = v_org;
          v_base_price := COALESCE(v_base_price, GREATEST(COALESCE(v_product.base_price,0), COALESCE(v_second_product.base_price,0)));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.*
        INTO v_crust
      FROM product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_org
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    ELSE
      v_crust := NULL;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust.price, 0)
      + v_addon_total,
      2
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_product.name, 
      v_second_product_id, CASE WHEN v_is_half THEN v_second_product.name ELSE NULL END,
      v_is_half, v_size_id, CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, CASE WHEN v_crust_id IS NOT NULL THEN v_crust.name ELSE NULL END,
      round(COALESCE(v_crust.price, 0), 2), v_unit_price, v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_org, v_item_id, NULLIF(v_addon->>'id','')::uuid,
        v_addon_row.name, round(v_addon_row.price, 2), v_quantity
      );
    END LOOP;
  END LOOP;

  IF v_subtotal < COALESCE(
    (SELECT min_order_amount FROM organization_settings WHERE organization_id = v_org),
    0
  ) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo da loja';
  END IF;

  v_total := round(v_subtotal + v_delivery_fee, 2);

  UPDATE orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      total = v_total
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := NULLIF(p_order->>'organization_id','')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_delivery_fee numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := NULLIF(trim(p_order->>'idempotency_key'),'');
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust record;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_size_id uuid;
  v_is_half boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Loja inválida'; END IF;
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org AND active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_number
    FROM orders o
    WHERE o.organization_id = v_org
      AND o.idempotency_key = v_idempotency;

    IF v_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_order_id, v_number;
      RETURN;
    END IF;
  END IF;

  IF jsonb_typeof(p_order->'items') <> 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'O pedido precisa ter pelo menos um item';
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE organization_id = v_org
      AND active
      AND EXISTS (
        SELECT 1
        FROM unnest(neighborhoods) n
        WHERE lower(trim(n)) = lower(v_neighborhood)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;

    v_zone_id := v_zone.id;
    v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
  END IF;

  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    0, 0, v_delivery_fee, v_delivery_fee, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id = v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;
    v_size_id := NULLIF(v_item->>'size_id','')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id','')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_crust := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_org
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*
        INTO v_second_product
      FROM products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_org
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND OR NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM product_prices pp
      JOIN product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_org
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_org
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM product_prices pp
        JOIN product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_org
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_org
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE((SELECT half_pizza_pricing_rule FROM organization_settings WHERE organization_id = v_org), 'highest_half')
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price INTO v_base_price
          FROM organization_settings
          WHERE organization_id = v_org;
          v_base_price := COALESCE(v_base_price, GREATEST(v_base_price, v_second_size_price));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.*
        INTO v_crust
      FROM product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_org
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    ELSE
      v_crust := NULL;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust.price, 0)
      + v_addon_total,
      2
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_product.name, 
      v_second_product_id, CASE WHEN v_is_half THEN v_second_product.name ELSE NULL END,
      v_is_half, v_size_id, CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, CASE WHEN v_crust_id IS NOT NULL THEN v_crust.name ELSE NULL END,
      round(COALESCE(v_crust.price, 0), 2), v_unit_price, v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_org, v_item_id, NULLIF(v_addon->>'id','')::uuid,
        v_addon_row.name, round(v_addon_row.price, 2), v_quantity
      );
    END LOOP;
  END LOOP;

  IF v_subtotal < COALESCE(
    (SELECT min_order_amount FROM organization_settings WHERE organization_id = v_org),
    0
  ) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo da loja';
  END IF;

  v_total := round(v_subtotal + v_delivery_fee, 2);

  UPDATE orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      total = v_total
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;



CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := NULLIF(p_order->>'organization_id','')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_delivery_fee numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := NULLIF(trim(p_order->>'idempotency_key'),'');
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust record;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_size_id uuid;
  v_is_half boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Loja inválida'; END IF;
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org AND active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_number
    FROM orders o
    WHERE o.organization_id = v_org
      AND o.idempotency_key = v_idempotency;

    IF v_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_order_id, v_number;
      RETURN;
    END IF;
  END IF;

  IF jsonb_typeof(p_order->'items') <> 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'O pedido precisa ter pelo menos um item';
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE organization_id = v_org
      AND active
      AND EXISTS (
        SELECT 1
        FROM unnest(neighborhoods) n
        WHERE lower(trim(n)) = lower(v_neighborhood)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;

    v_zone_id := v_zone.id;
    v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
  END IF;

  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    0, 0, v_delivery_fee, v_delivery_fee, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id = v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;
    v_size_id := NULLIF(v_item->>'size_id','')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id','')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_crust := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_org
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*
        INTO v_second_product
      FROM products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_org
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND OR NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM product_prices pp
      JOIN product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_org
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_org
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM product_prices pp
        JOIN product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_org
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_org
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE((SELECT half_pizza_pricing_rule FROM organization_settings WHERE organization_id = v_org), 'highest_half')
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price INTO v_base_price
          FROM organization_settings
          WHERE organization_id = v_org;
          v_base_price := COALESCE(v_base_price, GREATEST(v_base_price, v_second_size_price));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.*
        INTO v_crust
      FROM product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_org
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    ELSE
      v_crust := NULL;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust.price, 0)
      + v_addon_total,
      2
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_product.name, 
      v_second_product_id, CASE WHEN v_is_half THEN v_second_product.name ELSE NULL END,
      v_is_half, v_size_id, CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, CASE WHEN v_crust_id IS NOT NULL THEN v_crust.name ELSE NULL END,
      round(COALESCE(v_crust.price, 0), 2), v_unit_price, v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_org, v_item_id, NULLIF(v_addon->>'id','')::uuid,
        v_addon_row.name, round(v_addon_row.price, 2), v_quantity
      );
    END LOOP;
  END LOOP;


  v_total := round(v_subtotal + v_delivery_fee, 2);

  UPDATE orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      total = v_total
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_public_order(p_order jsonb) RETURNS TABLE (order_id uuid, order_number integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org uuid := NULLIF(p_order->>'organization_id','')::uuid;
  v_order_id uuid;
  v_number integer;
  v_fulfillment fulfillment_type := COALESCE((p_order->>'fulfillment')::fulfillment_type, 'DELIVERY');
  v_payment payment_method := COALESCE((p_order->>'payment_method')::payment_method, 'CASH');
  v_name text := trim(COALESCE(p_order->>'customer_name',''));
  v_phone text := trim(COALESCE(p_order->>'customer_phone',''));
  v_delivery_fee numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_zone_id uuid;
  v_neighborhood text := trim(COALESCE(p_order->>'address_neighborhood',''));
  v_idempotency text := NULLIF(trim(p_order->>'idempotency_key'),'');
  v_zone record;
  v_item jsonb;
  v_item_id uuid;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_second_product_name text;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust_price numeric(10,2) := 0;
  v_crust_name text;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_size_id uuid;
  v_is_half boolean;
BEGIN
  IF v_org IS NULL THEN RAISE EXCEPTION 'Loja inválida'; END IF;
  IF v_name = '' OR v_phone = '' THEN RAISE EXCEPTION 'Nome e telefone são obrigatórios'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = v_org AND active AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  IF v_idempotency IS NOT NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_number
    FROM orders o
    WHERE o.organization_id = v_org
      AND o.idempotency_key = v_idempotency;

    IF v_order_id IS NOT NULL THEN
      RETURN QUERY SELECT v_order_id, v_number;
      RETURN;
    END IF;
  END IF;

  IF jsonb_typeof(p_order->'items') <> 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE EXCEPTION 'O pedido precisa ter pelo menos um item';
  END IF;

  IF v_fulfillment = 'DELIVERY' THEN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE organization_id = v_org
      AND active
      AND EXISTS (
        SELECT 1
        FROM unnest(neighborhoods) n
        WHERE lower(trim(n)) = lower(v_neighborhood)
      )
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bairro não atendido';
    END IF;

    v_zone_id := v_zone.id;
    v_delivery_fee := round(COALESCE(v_zone.delivery_fee, 0), 2);
  END IF;

  v_number := next_order_number(v_org);

  INSERT INTO orders (
    organization_id, order_number, customer_name, customer_phone, fulfillment,
    payment_method, status, subtotal, discount, delivery_fee, total,
    delivery_zone_id, address_street, address_number, address_complement,
    address_neighborhood, address_reference, notes, idempotency_key, is_demo, source
  ) VALUES (
    v_org, v_number, v_name, v_phone, v_fulfillment, v_payment, 'RECEIVED',
    0, 0, v_delivery_fee, v_delivery_fee, v_zone_id,
    NULLIF(trim(p_order->>'address_street'), ''),
    NULLIF(trim(p_order->>'address_number'), ''),
    NULLIF(trim(p_order->>'address_complement'), ''),
    NULLIF(v_neighborhood, ''),
    NULLIF(trim(p_order->>'address_reference'), ''),
    NULLIF(trim(p_order->>'notes'), ''),
    v_idempotency, (SELECT demo_mode FROM organizations WHERE id = v_org), 'PUBLIC'
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id','')::uuid;
    v_size_id := NULLIF(v_item->>'size_id','')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id','')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_second_product_name := NULL;
    v_crust_price := 0;
    v_crust_name := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_org
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*,
             p.name AS __second_product_name
        INTO v_second_product
      FROM products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_org
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;

      v_second_product_name := v_second_product.name;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM product_prices pp
      JOIN product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_org
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_org
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM product_prices pp
        JOIN product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_org
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_org
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE((SELECT half_pizza_pricing_rule FROM organization_settings WHERE organization_id = v_org), 'highest_half')
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price INTO v_base_price
          FROM organization_settings
          WHERE organization_id = v_org;
          v_base_price := COALESCE(v_base_price, GREATEST(v_base_price, v_second_size_price));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.*
        INTO v_crust
      FROM product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_org
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    ELSE
      v_crust := NULL;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust.price, 0)
      + v_addon_total,
      2
    );

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);

    INSERT INTO order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_org, v_order_id, v_product_id, v_product.name, 
      v_second_product_id, v_second_product_name,
      v_is_half, v_size_id, CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, v_crust_name,
      round(COALESCE(v_crust_price, 0), 2), v_unit_price, v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    ) RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons','[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM product_addons a
      WHERE a.id = NULLIF(v_addon->>'id','')::uuid
        AND a.organization_id = v_org
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_org
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_org, v_item_id, NULLIF(v_addon->>'id','')::uuid,
        v_addon_row.name, round(v_addon_row.price, 2), v_quantity
      );
    END LOOP;
  END LOOP;


  IF v_fulfillment = 'DELIVERY' AND v_subtotal < 1 THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo para entrega. O valor mínimo dos produtos é R$ 1,00, além da taxa de entrega';
  END IF;

  v_total := round(v_subtotal + v_delivery_fee, 2);

  UPDATE orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      total = v_total
  WHERE id = v_order_id;

  RETURN QUERY SELECT v_order_id, v_number;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_public_order (jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order (jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.append_public_order_items(p_order_id uuid, p_customer_phone text, p_items jsonb) RETURNS TABLE (order_id uuid, order_number integer, subtotal numeric, delivery_fee numeric, total numeric, status order_status) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order record;
  v_item jsonb;
  v_addon jsonb;
  v_addon_row record;
  v_product record;
  v_second_product record;
  v_second_product_name text;
  v_size record;
  v_second_size_price numeric(10,2);
  v_base_price numeric(10,2);
  v_unit_price numeric(10,2);
  v_quantity integer;
  v_crust_id uuid;
  v_crust_price numeric(10,2) := 0;
  v_crust_name text;
  v_addon_total numeric(10,2);
  v_product_id uuid;
  v_second_product_id uuid;
  v_size_id uuid;
  v_is_half boolean;
  v_item_id uuid;
  v_added_subtotal numeric(10,2) := 0;
  v_new_subtotal numeric(10,2);
  v_new_total numeric(10,2);
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Pedido inválido';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um item';
  END IF;

  SELECT
    o.id,
    o.organization_id,
    o.order_number,
    o.customer_phone,
    o.fulfillment,
    o.status,
    o.subtotal,
    o.delivery_fee,
    o.total
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND regexp_replace(o.customer_phone, '\D', '', 'g')
        = regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_order.status NOT IN ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY') THEN
    RAISE EXCEPTION 'Este pedido não pode mais receber novos itens';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = v_order.organization_id
      AND o.active
      AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Loja indisponível';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_second_product_id := NULLIF(v_item->>'second_product_id', '')::uuid;
    v_size_id := NULLIF(v_item->>'size_id', '')::uuid;
    v_crust_id := NULLIF(v_item->>'crust_id', '')::uuid;
    v_is_half := COALESCE((v_item->>'is_half')::boolean, false);
    v_size := NULL;
    v_second_size_price := NULL;
    v_second_product_name := NULL;
    v_crust_price := 0;
    v_crust_name := NULL;
    v_quantity := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    SELECT p.*
      INTO v_product
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.organization_id = v_order.organization_id
      AND p.active
      AND p.available
      AND p.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto inválido';
    END IF;

    IF v_is_half THEN
      IF NOT v_product.allow_half OR v_second_product_id IS NULL THEN
        RAISE EXCEPTION 'Meia pizza inválida';
      END IF;

      SELECT p.*
        INTO v_second_product
      FROM public.products p
      WHERE p.id = v_second_product_id
        AND p.organization_id = v_order.organization_id
        AND p.active
        AND p.available
        AND p.deleted_at IS NULL;

      IF NOT FOUND OR NOT v_second_product.allow_half THEN
        RAISE EXCEPTION 'Segundo produto inválido';
      END IF;

      IF v_second_product_id = v_product_id THEN
        RAISE EXCEPTION 'As duas metades devem ser válidas';
      END IF;

      v_second_product_name := v_second_product.name;
    ELSE
      IF v_second_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'Segundo produto não permitido neste item';
      END IF;
    END IF;

    v_base_price := COALESCE(v_product.base_price, 0);

    IF v_size_id IS NOT NULL THEN
      SELECT pp.price, ps.name
        INTO v_size
      FROM public.product_prices pp
      JOIN public.product_sizes ps ON ps.id = pp.size_id
      WHERE pp.product_id = v_product_id
        AND pp.organization_id = v_order.organization_id
        AND pp.size_id = v_size_id
        AND ps.organization_id = v_order.organization_id
        AND ps.active;

      IF FOUND THEN
        v_base_price := COALESCE(v_size.price, v_base_price);
      ELSE
        RAISE EXCEPTION 'Tamanho inválido para o produto';
      END IF;

      IF v_is_half THEN
        SELECT pp.price
          INTO v_second_size_price
        FROM public.product_prices pp
        JOIN public.product_sizes ps ON ps.id = pp.size_id
        WHERE pp.product_id = v_second_product_id
          AND pp.organization_id = v_order.organization_id
          AND pp.size_id = v_size_id
          AND ps.organization_id = v_order.organization_id
          AND ps.active;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tamanho inválido para a segunda metade';
        END IF;
      END IF;
    ELSE
      IF v_is_half THEN
        v_second_size_price := COALESCE(v_second_product.base_price, 0);
      END IF;
    END IF;

    IF v_is_half THEN
      CASE COALESCE(
        (SELECT half_pizza_pricing_rule
         FROM public.organization_settings
         WHERE organization_id = v_order.organization_id),
        'highest_half'
      )
        WHEN 'average_halves' THEN
          v_base_price := round((v_base_price + v_second_size_price) / 2, 2);
        WHEN 'fixed_price' THEN
          SELECT half_pizza_fixed_price
            INTO v_base_price
          FROM public.organization_settings
          WHERE organization_id = v_order.organization_id;
          v_base_price := COALESCE(v_base_price, GREATEST(v_base_price, v_second_size_price));
        ELSE
          v_base_price := GREATEST(v_base_price, v_second_size_price);
      END CASE;
    END IF;

    v_addon_total := 0;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb)) LOOP
      SELECT a.id, a.name, a.price
        INTO v_addon_row
      FROM public.product_addons a
      WHERE a.id = NULLIF(v_addon->>'id', '')::uuid
        AND a.organization_id = v_order.organization_id
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM public.product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_order.organization_id
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Adicional inválido para o produto';
      END IF;

      v_addon_total := v_addon_total + COALESCE(v_addon_row.price, 0);
    END LOOP;

    IF v_crust_id IS NOT NULL THEN
      SELECT c.price, c.name
        INTO v_crust_price, v_crust_name
      FROM public.product_crusts c
      WHERE c.id = v_crust_id
        AND c.organization_id = v_order.organization_id
        AND c.active;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Borda inválida';
      END IF;
    END IF;

    v_unit_price := round(
      v_base_price
      + COALESCE(v_crust_price, 0)
      + v_addon_total,
      2
    );

    v_added_subtotal := v_added_subtotal + (v_unit_price * v_quantity);

    INSERT INTO public.order_items (
      organization_id, order_id, product_id, product_name, second_product_id,
      second_product_name, is_half, size_id, size_name, crust_id, crust_name,
      crust_price, unit_price, quantity, total_price, notes
    ) VALUES (
      v_order.organization_id, v_order.id, v_product_id, v_product.name,
      v_second_product_id, v_second_product_name,
      v_is_half, v_size_id,
      CASE WHEN v_size_id IS NOT NULL THEN v_size.name ELSE NULL END,
      v_crust_id, v_crust_name,
      round(COALESCE(v_crust_price, 0), 2),
      v_unit_price,
      v_quantity,
      round(v_unit_price * v_quantity, 2),
      NULLIF(trim(v_item->>'notes'), '')
    )
    RETURNING id INTO v_item_id;

    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'addons', '[]'::jsonb)) LOOP
      SELECT a.name, a.price
        INTO v_addon_row
      FROM public.product_addons a
      WHERE a.id = NULLIF(v_addon->>'id', '')::uuid
        AND a.organization_id = v_order.organization_id
        AND a.active
        AND EXISTS (
          SELECT 1
          FROM public.product_addon_links l
          WHERE l.addon_id = a.id
            AND l.organization_id = v_order.organization_id
            AND (l.product_id = v_product_id OR l.product_id = v_second_product_id)
        );

      INSERT INTO public.order_item_addons (
        organization_id, order_item_id, addon_id, name, price, quantity
      ) VALUES (
        v_order.organization_id,
        v_item_id,
        NULLIF(v_addon->>'id', '')::uuid,
        v_addon_row.name,
        round(v_addon_row.price, 2),
        v_quantity
      );
    END LOOP;
  END LOOP;

  v_new_subtotal := round(COALESCE(v_order.subtotal, 0) + v_added_subtotal, 2);
  v_new_total := round(v_new_subtotal + COALESCE(v_order.delivery_fee, 0), 2);

  UPDATE public.orders
  SET subtotal = v_new_subtotal,
      total = v_new_total,
      updated_at = now()
  WHERE id = v_order.id;

  RETURN QUERY
  SELECT
    v_order.id,
    v_order.order_number,
    v_new_subtotal,
    COALESCE(v_order.delivery_fee, 0),
    v_new_total,
    v_order.status;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.append_public_order_items (uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_public_order_items (uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.append_public_order_items_with_payment(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method public.payment_method) RETURNS TABLE (order_id uuid, order_number integer, subtotal numeric, delivery_fee numeric, total numeric, status public.order_status) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Forma de pagamento obrigatória';
  END IF;

  UPDATE public.orders
  SET payment_method = p_payment_method,
      updated_at = now()
  WHERE id = p_order_id
    AND regexp_replace(customer_phone, '\D', '', 'g')
        = regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')
    AND status IN ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não pode receber complemento';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.append_public_order_items(
    p_order_id,
    p_customer_phone,
    p_items
  );
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.append_public_order_items_with_payment (uuid, text, jsonb, public.payment_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_public_order_items_with_payment (uuid, text, jsonb, public.payment_method) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.append_public_order_items_with_payment(p_order_id uuid, p_customer_phone text, p_items jsonb, p_payment_method public.payment_method) RETURNS TABLE (order_id uuid, order_number integer, subtotal numeric, delivery_fee numeric, total numeric, status public.order_status) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Forma de pagamento obrigatória';
  END IF;

  UPDATE public.orders AS o
  SET
    payment_method = p_payment_method,
    updated_at = now()
  WHERE o.id = p_order_id
    AND regexp_replace(o.customer_phone, '\D', '', 'g')
        = regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g')
    AND o.status IN (
      'RECEIVED',
      'CONFIRMED',
      'PREPARING',
      'READY'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não pode receber complemento';
  END IF;

  RETURN QUERY
  SELECT
    appended.order_id::uuid,
    appended.order_number::integer,
    appended.subtotal::numeric,
    appended.delivery_fee::numeric,
    appended.total::numeric,
    appended.status::public.order_status
  FROM public.append_public_order_items(
    p_order_id,
    p_customer_phone,
    p_items
  ) AS appended;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.append_public_order_items_with_payment (uuid, text, jsonb, public.payment_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_public_order_items_with_payment (uuid, text, jsonb, public.payment_method) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_order_status (uuid, text);
CREATE OR REPLACE FUNCTION public.get_public_order_status(p_order_id uuid, p_customer_phone text) RETURNS TABLE (order_id uuid, order_number integer, status public.order_status, fulfillment public.fulfillment_type, created_at timestamptz, updated_at timestamptz, subtotal numeric, delivery_fee numeric, total numeric, items jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.fulfillment,
    o.created_at,
    o.updated_at,
    o.subtotal,
    o.delivery_fee,
    o.total,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'lineId', oi.id::text,
            'productId', oi.product_id,
            'productName', oi.product_name,
            'imageUrl', (
              SELECT p.image_url
              FROM public.products AS p
              WHERE p.id = oi.product_id
              LIMIT 1
            ),
            'secondProductId', oi.second_product_id,
            'secondProductName', oi.second_product_name,
            'isHalf', oi.is_half,
            'sizeId', oi.size_id,
            'sizeName', oi.size_name,
            'crustId', oi.crust_id,
            'crustName', oi.crust_name,
            'crustPrice', oi.crust_price,
            'addons', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', COALESCE(oia.addon_id, oia.id),
                    'name', oia.name,
                    'price', oia.price
                  )
                  ORDER BY oia.created_at
                )
                FROM public.order_item_addons AS oia
                WHERE oia.order_item_id = oi.id
              ),
              '[]'::jsonb
            ),
            'complements', '[]'::jsonb,
            'quantity', oi.quantity,
            'notes', oi.notes,
            'unitPrice', oi.unit_price
          )
          ORDER BY oi.created_at
        )
        FROM public.order_items AS oi
        WHERE oi.order_id = o.id
      ),
      '[]'::jsonb
    ) AS items
  FROM public.orders AS o
  WHERE o.id = p_order_id
    AND regexp_replace(o.customer_phone, '\\D', '', 'g')
        = regexp_replace(COALESCE(p_customer_phone, ''), '\\D', '', 'g')
  LIMIT 1;
END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.get_public_order_status (uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_status (uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS public.neroxa_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL, description text, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.neroxa_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, name text NOT NULL, description text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.neroxa_role_permissions (role_id uuid NOT NULL REFERENCES public.neroxa_roles (id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES public.neroxa_permissions (id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (role_id, permission_id));
CREATE TABLE IF NOT EXISTS public.neroxa_staff_members (user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, active boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.neroxa_staff_roles (user_id uuid NOT NULL REFERENCES public.neroxa_staff_members (user_id) ON DELETE CASCADE, role_id uuid NOT NULL REFERENCES public.neroxa_roles (id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, role_id));
CREATE INDEX IF NOT EXISTS neroxa_staff_roles_role_id_idx ON public.neroxa_staff_roles (role_id);
CREATE INDEX IF NOT EXISTS neroxa_role_permissions_permission_id_idx ON public.neroxa_role_permissions (permission_id);
ALTER TABLE public.neroxa_roles ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_permissions ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_role_permissions ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_staff_members ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_staff_roles ENABLE ROW LEVEL SECURITY ;
CREATE OR REPLACE FUNCTION public.is_neroxa_staff(p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
  );
$$;
CREATE OR REPLACE FUNCTION public.has_neroxa_role(p_role_key text, p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    join public.neroxa_staff_roles sr on sr.user_id = sm.user_id
    join public.neroxa_roles r on r.id = sr.role_id
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
      and r.active
      and r.key = p_role_key
  );
$$;
CREATE OR REPLACE FUNCTION public.has_neroxa_permission(p_permission_key text, p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    join public.neroxa_staff_roles sr on sr.user_id = sm.user_id
    join public.neroxa_roles r on r.id = sr.role_id
    join public.neroxa_role_permissions rp on rp.role_id = r.id
    join public.neroxa_permissions p on p.id = rp.permission_id
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
      and r.active
      and p.key = p_permission_key
  );
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_neroxa_staff (uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_neroxa_role (text, uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_neroxa_permission (text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_neroxa_staff (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_neroxa_role (text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_neroxa_permission (text, uuid) TO authenticated;
DROP POLICY IF EXISTS neroxa_roles_staff_read ON public.neroxa_roles;
CREATE POLICY neroxa_roles_staff_read ON public.neroxa_roles AS PERMISSIVE FOR select TO authenticated USING (public.is_neroxa_staff());
DROP POLICY IF EXISTS neroxa_permissions_staff_read ON public.neroxa_permissions;
CREATE POLICY neroxa_permissions_staff_read ON public.neroxa_permissions AS PERMISSIVE FOR select TO authenticated USING (public.is_neroxa_staff());
DROP POLICY IF EXISTS neroxa_role_permissions_staff_read ON public.neroxa_role_permissions;
CREATE POLICY neroxa_role_permissions_staff_read ON public.neroxa_role_permissions AS PERMISSIVE FOR select TO authenticated USING (public.is_neroxa_staff());
DROP POLICY IF EXISTS neroxa_staff_members_self_read ON public.neroxa_staff_members;
CREATE POLICY neroxa_staff_members_self_read ON public.neroxa_staff_members AS PERMISSIVE FOR select TO authenticated USING (user_id = auth.uid() OR public.has_neroxa_permission('staff.read'));
DROP POLICY IF EXISTS neroxa_staff_roles_self_read ON public.neroxa_staff_roles;
CREATE POLICY neroxa_staff_roles_self_read ON public.neroxa_staff_roles AS PERMISSIVE FOR select TO authenticated USING (user_id = auth.uid() OR public.has_neroxa_permission('staff.read'));
INSERT INTO public.neroxa_roles (key, name, description) VALUES ('super_admin', 'Super administrador', 'Acesso completo à plataforma Neroxa.'), ('admin', 'Administrador', 'Administração operacional da Neroxa.'), ('finance', 'Financeiro', 'Operações financeiras e cobranças.'), ('support', 'Suporte', 'Atendimento e operação de suporte.') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.neroxa_permissions (key, name, description) VALUES ('dashboard.read', 'Visualizar dashboard', 'Acessar indicadores da plataforma.'), ('clients.read', 'Visualizar clientes', 'Consultar clientes e organizações.'), ('clients.write', 'Gerenciar clientes', 'Criar e atualizar clientes e organizações.'), ('plans.read', 'Visualizar planos', 'Consultar catálogo comercial.'), ('plans.write', 'Gerenciar planos', 'Criar e atualizar planos e recursos.'), ('contracts.read', 'Visualizar contratos', 'Consultar contratos.'), ('contracts.write', 'Gerenciar contratos', 'Criar e atualizar contratos.'), ('billing.read', 'Visualizar financeiro', 'Consultar cobranças e pagamentos.'), ('billing.write', 'Gerenciar financeiro', 'Registrar e atualizar operações financeiras.'), ('implementation.read', 'Visualizar implantação', 'Consultar projetos de implantação.'), ('implementation.write', 'Gerenciar implantação', 'Atualizar tarefas e projetos.'), ('domains.read', 'Visualizar domínios', 'Consultar domínios da plataforma.'), ('domains.write', 'Gerenciar domínios', 'Gerenciar vínculos de domínio.'), ('support.read', 'Visualizar suporte', 'Consultar chamados.'), ('support.write', 'Gerenciar suporte', 'Gerenciar chamados.'), ('staff.read', 'Visualizar equipe', 'Consultar equipe interna e papéis.'), ('staff.write', 'Gerenciar equipe', 'Gerenciar equipe e permissões.'), ('audit.read', 'Visualizar auditoria', 'Consultar registros de auditoria.') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r CROSS JOIN public.neroxa_permissions AS p WHERE r.key = 'super_admin' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('dashboard.read', 'clients.read', 'plans.read', 'contracts.read', 'billing.read', 'implementation.read', 'domains.read', 'support.read', 'audit.read') WHERE r.key = 'admin' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('dashboard.read', 'clients.read', 'billing.read', 'billing.write', 'contracts.read') WHERE r.key = 'finance' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('dashboard.read', 'clients.read', 'implementation.read', 'implementation.write', 'domains.read', 'support.read', 'support.write') WHERE r.key = 'support' ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.neroxa_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL, organization_id uuid REFERENCES public.organizations (id) ON DELETE SET NULL, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, before_data jsonb, after_data jsonb, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_audit_logs_created_at_idx ON public.neroxa_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS neroxa_audit_logs_organization_id_idx ON public.neroxa_audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS neroxa_audit_logs_entity_idx ON public.neroxa_audit_logs (entity_type, entity_id, created_at DESC);
ALTER TABLE public.neroxa_audit_logs ENABLE ROW LEVEL SECURITY ;
DROP POLICY IF EXISTS neroxa_audit_logs_staff_read ON public.neroxa_audit_logs;
CREATE POLICY neroxa_audit_logs_staff_read ON public.neroxa_audit_logs AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('audit.read'));
CREATE OR REPLACE FUNCTION public.record_neroxa_audit(p_action text, p_entity_type text, p_entity_id uuid = NULL, p_organization_id uuid = NULL, p_before_data jsonb = NULL, p_after_data jsonb = NULL, p_metadata jsonb = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_id uuid;
begin
  if not public.is_neroxa_staff() then
    raise exception 'not authorized';
  end if;

  insert into public.neroxa_audit_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    auth.uid(),
    p_organization_id,
    nullif(trim(p_action), ''),
    nullif(trim(p_entity_type), ''),
    p_entity_id,
    p_before_data,
    p_after_data,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.record_neroxa_audit (text, text, uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_neroxa_audit (text, text, uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.neroxa_roles, public.neroxa_permissions, public.neroxa_role_permissions, public.neroxa_staff_members, public.neroxa_staff_roles, public.neroxa_audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.neroxa_roles, public.neroxa_permissions, public.neroxa_role_permissions, public.neroxa_staff_members, public.neroxa_staff_roles, public.neroxa_audit_logs TO authenticated;
CREATE OR REPLACE FUNCTION public.is_neroxa_staff(p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
  );
$$;
CREATE OR REPLACE FUNCTION public.has_neroxa_role(p_role_key text, p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    join public.neroxa_staff_roles sr on sr.user_id = sm.user_id
    join public.neroxa_roles r on r.id = sr.role_id
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
      and r.active
      and r.key = p_role_key
  );
$$;
CREATE OR REPLACE FUNCTION public.has_neroxa_permission(p_permission_key text, p_user_id uuid = auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (
    select 1
    from public.neroxa_staff_members sm
    join public.neroxa_staff_roles sr on sr.user_id = sm.user_id
    join public.neroxa_roles r on r.id = sr.role_id
    join public.neroxa_role_permissions rp on rp.role_id = r.id
    join public.neroxa_permissions p on p.id = rp.permission_id
    where sm.user_id = coalesce(p_user_id, auth.uid())
      and sm.active
      and r.active
      and p.key = p_permission_key
  );
$$;
CREATE OR REPLACE FUNCTION public.record_neroxa_audit(p_action text, p_entity_type text, p_entity_id uuid = NULL, p_organization_id uuid = NULL, p_before_data jsonb = NULL, p_after_data jsonb = NULL, p_metadata jsonb = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
begin
  if not public.is_neroxa_staff() then
    raise exception 'not authorized';
  end if;

  insert into public.neroxa_audit_logs (
    actor_user_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    auth.uid(),
    p_organization_id,
    nullif(trim(p_action), ''),
    nullif(trim(p_entity_type), ''),
    p_entity_id,
    p_before_data,
    p_after_data,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.is_neroxa_staff (uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_neroxa_role (text, uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.has_neroxa_permission (text, uuid) FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON FUNCTION public.record_neroxa_audit (text, text, uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_neroxa_staff (uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_neroxa_role (text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_neroxa_permission (text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_neroxa_audit (text, text, uuid, uuid, jsonb, jsonb, jsonb) TO authenticated;

CREATE TYPE public.neroxa_client_status AS ENUM ('LEAD', 'PROPOSAL', 'NEGOTIATION', 'CONTRACTED', 'IMPLEMENTATION', 'ACTIVE', 'PAUSED', 'DELINQUENT', 'CANCELLED');
CREATE TABLE IF NOT EXISTS public.neroxa_clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations (id) ON DELETE RESTRICT, status public.neroxa_client_status NOT NULL DEFAULT 'LEAD', legal_name text, trade_name text, tax_id text, notes text, acquired_at timestamptz, contracted_at timestamptz, activated_at timestamptz, paused_at timestamptz, cancelled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_clients_status_idx ON public.neroxa_clients (status);
CREATE INDEX IF NOT EXISTS neroxa_clients_updated_at_idx ON public.neroxa_clients (updated_at DESC);
CREATE TABLE IF NOT EXISTS public.neroxa_client_contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE CASCADE, name text NOT NULL, role_title text, email text, phone text, whatsapp text, is_primary boolean NOT NULL DEFAULT FALSE, active boolean NOT NULL DEFAULT TRUE, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_client_contacts_client_id_idx ON public.neroxa_client_contacts (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS neroxa_client_contacts_primary_idx ON public.neroxa_client_contacts (client_id) WHERE is_primary AND active;
CREATE TRIGGER neroxa_clients_set_updated_at BEFORE UPDATE ON public.neroxa_clients FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER neroxa_client_contacts_set_updated_at BEFORE UPDATE ON public.neroxa_client_contacts FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
ALTER TABLE public.neroxa_clients ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_client_contacts ENABLE ROW LEVEL SECURITY ;
REVOKE ALL PRIVILEGES ON TABLE public.neroxa_clients, public.neroxa_client_contacts FROM anon, authenticated;
GRANT SELECT ON TABLE public.neroxa_clients, public.neroxa_client_contacts TO authenticated;
DROP POLICY IF EXISTS neroxa_clients_staff_read ON public.neroxa_clients;
CREATE POLICY neroxa_clients_staff_read ON public.neroxa_clients AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('clients.read'));
DROP POLICY IF EXISTS neroxa_client_contacts_staff_read ON public.neroxa_client_contacts;
CREATE POLICY neroxa_client_contacts_staff_read ON public.neroxa_client_contacts AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('clients.read'));

ALTER TABLE public.neroxa_clients ALTER COLUMN organization_id DROP NOT NULL ;
ALTER TABLE public.neroxa_clients DROP CONSTRAINT IF EXISTS neroxa_clients_organization_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS neroxa_clients_organization_id_unique_idx ON public.neroxa_clients (organization_id) WHERE organization_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_neroxa_client(p_legal_name text = NULL, p_trade_name text = NULL, p_tax_id text = NULL, p_notes text = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_client_id uuid;
  v_legal_name text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_trade_name text := nullif(trim(coalesce(p_trade_name, '')), '');
begin
  if not public.has_neroxa_permission('clients.write') then
    raise exception 'not authorized';
  end if;

  if v_legal_name is null and v_trade_name is null then
    raise exception 'legal_name or trade_name is required';
  end if;

  insert into public.neroxa_clients (
    legal_name,
    trade_name,
    tax_id,
    notes,
    acquired_at
  )
  values (
    v_legal_name,
    v_trade_name,
    nullif(trim(coalesce(p_tax_id, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    now()
  )
  returning id into v_client_id;

  perform public.record_neroxa_audit(
    'CLIENT_CREATED',
    'neroxa_client',
    v_client_id,
    null,
    null,
    jsonb_build_object(
      'legal_name', v_legal_name,
      'trade_name', v_trade_name,
      'status', 'LEAD'
    ),
    null
  );

  return v_client_id;
end;
$$;
CREATE OR REPLACE FUNCTION public.update_neroxa_client(p_client_id uuid, p_legal_name text = NULL, p_trade_name text = NULL, p_tax_id text = NULL, p_notes text = NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_legal_name text := nullif(trim(coalesce(p_legal_name, '')), '');
  v_trade_name text := nullif(trim(coalesce(p_trade_name, '')), '');
begin
  if not public.has_neroxa_permission('clients.write') then
    raise exception 'not authorized';
  end if;

  select to_jsonb(c) into v_before
  from public.neroxa_clients c
  where c.id = p_client_id;

  if v_before is null then
    raise exception 'client not found';
  end if;

  if v_legal_name is null and v_trade_name is null then
    raise exception 'legal_name or trade_name is required';
  end if;

  update public.neroxa_clients
  set
    legal_name = v_legal_name,
    trade_name = v_trade_name,
    tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_client_id;

  select to_jsonb(c) into v_after
  from public.neroxa_clients c
  where c.id = p_client_id;

  perform public.record_neroxa_audit(
    'CLIENT_UPDATED',
    'neroxa_client',
    p_client_id,
    (v_after ->> 'organization_id')::uuid,
    v_before,
    v_after,
    null
  );

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION public.link_neroxa_client_organization(p_client_id uuid, p_organization_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.has_neroxa_permission('clients.write') then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'organization not found';
  end if;

  select to_jsonb(c) into v_before
  from public.neroxa_clients c
  where c.id = p_client_id;

  if v_before is null then
    raise exception 'client not found';
  end if;

  update public.neroxa_clients
  set organization_id = p_organization_id
  where id = p_client_id;

  if not found then
    raise exception 'client not found';
  end if;

  select to_jsonb(c) into v_after
  from public.neroxa_clients c
  where c.id = p_client_id;

  perform public.record_neroxa_audit(
    'CLIENT_ORGANIZATION_LINKED',
    'neroxa_client',
    p_client_id,
    p_organization_id,
    v_before,
    v_after,
    null
  );

  return true;
exception
  when unique_violation then
    raise exception 'organization already linked to another client';
end;
$$;
CREATE OR REPLACE FUNCTION public.transition_neroxa_client_status(p_client_id uuid, p_new_status public.neroxa_client_status) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_current_status public.neroxa_client_status;
  v_organization_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_allowed boolean := false;
begin
  if not public.has_neroxa_permission('clients.write') then
    raise exception 'not authorized';
  end if;

  select c.status, c.organization_id, to_jsonb(c)
  into v_current_status, v_organization_id, v_before
  from public.neroxa_clients c
  where c.id = p_client_id;

  if v_before is null then
    raise exception 'client not found';
  end if;

  if v_current_status = p_new_status then
    return true;
  end if;

  v_allowed :=
    (v_current_status = 'LEAD' and p_new_status in ('PROPOSAL', 'CANCELLED'))
    or (v_current_status = 'PROPOSAL' and p_new_status in ('NEGOTIATION', 'CONTRACTED', 'CANCELLED'))
    or (v_current_status = 'NEGOTIATION' and p_new_status in ('PROPOSAL', 'CONTRACTED', 'CANCELLED'))
    or (v_current_status = 'CONTRACTED' and p_new_status in ('IMPLEMENTATION', 'CANCELLED'))
    or (v_current_status = 'IMPLEMENTATION' and p_new_status in ('ACTIVE', 'PAUSED', 'CANCELLED'))
    or (v_current_status = 'ACTIVE' and p_new_status in ('PAUSED', 'DELINQUENT', 'CANCELLED'))
    or (v_current_status = 'PAUSED' and p_new_status in ('ACTIVE', 'DELINQUENT', 'CANCELLED'))
    or (v_current_status = 'DELINQUENT' and p_new_status in ('ACTIVE', 'CANCELLED'));

  if not v_allowed then
    raise exception 'invalid client status transition from % to %', v_current_status, p_new_status;
  end if;

  update public.neroxa_clients
  set
    status = p_new_status,
    contracted_at = case
      when p_new_status = 'CONTRACTED' and contracted_at is null then now()
      else contracted_at
    end,
    activated_at = case
      when p_new_status = 'ACTIVE' and activated_at is null then now()
      else activated_at
    end,
    paused_at = case
      when p_new_status = 'PAUSED' then now()
      else paused_at
    end,
    cancelled_at = case
      when p_new_status = 'CANCELLED' then now()
      else cancelled_at
    end
  where id = p_client_id;

  select to_jsonb(c) into v_after
  from public.neroxa_clients c
  where c.id = p_client_id;

  perform public.record_neroxa_audit(
    'CLIENT_STATUS_CHANGED',
    'neroxa_client',
    p_client_id,
    v_organization_id,
    v_before,
    v_after,
    jsonb_build_object(
      'from_status', v_current_status,
      'to_status', p_new_status
    )
  );

  return true;
end;
$$;
CREATE OR REPLACE FUNCTION public.create_neroxa_client_contact(p_client_id uuid, p_name text, p_role_title text = NULL, p_email text = NULL, p_phone text = NULL, p_whatsapp text = NULL, p_is_primary boolean = FALSE, p_notes text = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_contact_id uuid;
  v_organization_id uuid;
begin
  if not public.has_neroxa_permission('clients.write') then
    raise exception 'not authorized';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'contact name is required';
  end if;

  select c.organization_id into v_organization_id
  from public.neroxa_clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'client not found';
  end if;

  if p_is_primary then
    update public.neroxa_client_contacts
    set is_primary = false
    where client_id = p_client_id and active;
  end if;

  insert into public.neroxa_client_contacts (
    client_id,
    name,
    role_title,
    email,
    phone,
    whatsapp,
    is_primary,
    notes
  )
  values (
    p_client_id,
    trim(p_name),
    nullif(trim(coalesce(p_role_title, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    p_is_primary,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_contact_id;

  perform public.record_neroxa_audit(
    'CLIENT_CONTACT_CREATED',
    'neroxa_client_contact',
    v_contact_id,
    v_organization_id,
    null,
    jsonb_build_object(
      'client_id', p_client_id,
      'name', trim(p_name),
      'is_primary', p_is_primary
    ),
    null
  );

  return v_contact_id;
end;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_client (text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_client (text, text, text, text) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.update_neroxa_client (uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_neroxa_client (uuid, text, text, text, text) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.link_neroxa_client_organization (uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_neroxa_client_organization (uuid, uuid) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.transition_neroxa_client_status (uuid, public.neroxa_client_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_neroxa_client_status (uuid, public.neroxa_client_status) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_client_contact (uuid, text, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_client_contact (uuid, text, text, text, text, text, boolean, text) TO authenticated;

CREATE TYPE public.neroxa_proposal_status AS ENUM ('DRAFT', 'SENT', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE public.neroxa_proposal_item_type AS ENUM ('ONE_TIME', 'RECURRING');
CREATE TYPE public.neroxa_contract_status AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'EXPIRED');
CREATE TABLE IF NOT EXISTS public.neroxa_proposals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE RESTRICT, status public.neroxa_proposal_status NOT NULL DEFAULT 'DRAFT', title text NOT NULL, notes text, valid_until date, sent_at timestamptz, accepted_at timestamptz, rejected_at timestamptz, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_proposals_client_id_idx ON public.neroxa_proposals (client_id);
CREATE INDEX IF NOT EXISTS neroxa_proposals_status_idx ON public.neroxa_proposals (status);
CREATE INDEX IF NOT EXISTS neroxa_proposals_updated_at_idx ON public.neroxa_proposals (updated_at DESC);
CREATE TABLE IF NOT EXISTS public.neroxa_proposal_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES public.neroxa_proposals (id) ON DELETE CASCADE, item_type public.neroxa_proposal_item_type NOT NULL, name text NOT NULL, description text, quantity numeric(12, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0), unit_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0), sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_proposal_items_proposal_idx ON public.neroxa_proposal_items (proposal_id, sort_order, created_at);
CREATE TABLE IF NOT EXISTS public.neroxa_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE RESTRICT, proposal_id uuid REFERENCES public.neroxa_proposals (id) ON DELETE RESTRICT, status public.neroxa_contract_status NOT NULL DEFAULT 'DRAFT', contract_number text UNIQUE, title text NOT NULL, started_at date, ended_at date, signed_at timestamptz, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_contracts_client_id_idx ON public.neroxa_contracts (client_id);
CREATE INDEX IF NOT EXISTS neroxa_contracts_status_idx ON public.neroxa_contracts (status);
CREATE INDEX IF NOT EXISTS neroxa_contracts_updated_at_idx ON public.neroxa_contracts (updated_at DESC);
CREATE TABLE IF NOT EXISTS public.neroxa_contract_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES public.neroxa_contracts (id) ON DELETE CASCADE, version_number integer NOT NULL CHECK (version_number > 0), summary text, terms jsonb NOT NULL DEFAULT CAST('{}' AS jsonb), recurring_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (recurring_value >= 0), setup_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (setup_value >= 0), valid_from date, valid_until date, signed_at timestamptz, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (contract_id, version_number));
CREATE INDEX IF NOT EXISTS neroxa_contract_versions_contract_idx ON public.neroxa_contract_versions (contract_id, version_number DESC);
CREATE TRIGGER neroxa_proposals_set_updated_at BEFORE UPDATE ON public.neroxa_proposals FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER neroxa_contracts_set_updated_at BEFORE UPDATE ON public.neroxa_contracts FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
ALTER TABLE public.neroxa_proposals ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_proposal_items ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_contracts ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_contract_versions ENABLE ROW LEVEL SECURITY ;
REVOKE ALL PRIVILEGES ON TABLE public.neroxa_proposals, public.neroxa_proposal_items, public.neroxa_contracts, public.neroxa_contract_versions FROM anon, authenticated;
GRANT SELECT ON TABLE public.neroxa_proposals, public.neroxa_proposal_items, public.neroxa_contracts, public.neroxa_contract_versions TO authenticated;
INSERT INTO public.neroxa_permissions (key, name, description) VALUES ('commercial.read', 'Visualizar comercial', 'Consultar leads, propostas e contratos.'), ('commercial.write', 'Gerenciar comercial', 'Criar e atualizar propostas e contratos.') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('commercial.read', 'commercial.write') WHERE r.key = 'super_admin' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key = 'commercial.read' WHERE r.key IN ('admin', 'finance') ON CONFLICT DO NOTHING;
CREATE POLICY neroxa_proposals_staff_read ON public.neroxa_proposals AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('commercial.read'));
CREATE POLICY neroxa_proposal_items_staff_read ON public.neroxa_proposal_items AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('commercial.read'));
CREATE POLICY neroxa_contracts_staff_read ON public.neroxa_contracts AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('commercial.read'));
CREATE POLICY neroxa_contract_versions_staff_read ON public.neroxa_contract_versions AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('commercial.read'));
CREATE OR REPLACE FUNCTION public.create_neroxa_proposal(p_client_id uuid, p_title text, p_notes text = NULL, p_valid_until date = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_id uuid; v_title text:=nullif(trim(coalesce(p_title,'')),'');
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 if v_title is null then raise exception 'proposal title is required'; end if;
 if not exists(select 1 from public.neroxa_clients c where c.id=p_client_id and c.status<>'CANCELLED') then raise exception 'active client record not found'; end if;
 insert into public.neroxa_proposals(client_id,title,notes,valid_until,created_by) values(p_client_id,v_title,nullif(trim(coalesce(p_notes,'')),''),p_valid_until,auth.uid()) returning id into v_id;
 perform public.record_neroxa_audit('PROPOSAL_CREATED','neroxa_proposal',v_id,null,null,jsonb_build_object('client_id',p_client_id,'title',v_title,'status','DRAFT'),null);
 return v_id;
end $$;
CREATE OR REPLACE FUNCTION public.add_neroxa_proposal_item(p_proposal_id uuid, p_item_type public.neroxa_proposal_item_type, p_name text, p_description text = NULL, p_quantity numeric = 1, p_unit_price numeric = 0) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_id uuid; v_name text:=nullif(trim(coalesce(p_name,'')),'');
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 if v_name is null then raise exception 'proposal item name is required'; end if;
 if p_quantity<=0 or p_unit_price<0 then raise exception 'invalid proposal item values'; end if;
 if not exists(select 1 from public.neroxa_proposals p where p.id=p_proposal_id and p.status in ('DRAFT','SENT','NEGOTIATION')) then raise exception 'proposal not found or not editable'; end if;
 insert into public.neroxa_proposal_items(proposal_id,item_type,name,description,quantity,unit_price,sort_order)
 select p_proposal_id,p_item_type,v_name,nullif(trim(coalesce(p_description,'')),''),p_quantity,p_unit_price,coalesce(max(i.sort_order),-1)+1 from public.neroxa_proposal_items i where i.proposal_id=p_proposal_id returning id into v_id;
 perform public.record_neroxa_audit('PROPOSAL_ITEM_ADDED','neroxa_proposal_item',v_id,null,null,jsonb_build_object('proposal_id',p_proposal_id,'name',v_name,'item_type',p_item_type,'quantity',p_quantity,'unit_price',p_unit_price),null);
 return v_id;
end $$;
CREATE OR REPLACE FUNCTION public.transition_neroxa_proposal_status(p_proposal_id uuid, p_new_status public.neroxa_proposal_status) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_current public.neroxa_proposal_status; v_before jsonb; v_after jsonb; v_client uuid; ok boolean:=false;
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 select p.status,p.client_id,to_jsonb(p) into v_current,v_client,v_before from public.neroxa_proposals p where p.id=p_proposal_id;
 if v_before is null then raise exception 'proposal not found'; end if;
 if v_current=p_new_status then return true; end if;
 ok:=(v_current='DRAFT' and p_new_status in ('SENT','CANCELLED'))
  or (v_current='SENT' and p_new_status in ('NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CANCELLED'))
  or (v_current='NEGOTIATION' and p_new_status in ('SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED'));
 if not ok then raise exception 'invalid proposal status transition from % to %',v_current,p_new_status; end if;
 update public.neroxa_proposals set status=p_new_status,sent_at=case when p_new_status='SENT' and sent_at is null then now() else sent_at end,accepted_at=case when p_new_status='ACCEPTED' then now() else accepted_at end,rejected_at=case when p_new_status='REJECTED' then now() else rejected_at end where id=p_proposal_id;
 select to_jsonb(p) into v_after from public.neroxa_proposals p where p.id=p_proposal_id;
 perform public.record_neroxa_audit('PROPOSAL_STATUS_CHANGED','neroxa_proposal',p_proposal_id,null,v_before,v_after,jsonb_build_object('client_id',v_client,'from_status',v_current,'to_status',p_new_status));
 return true;
end $$;
CREATE OR REPLACE FUNCTION public.create_neroxa_contract(p_client_id uuid, p_title text, p_proposal_id uuid = NULL, p_contract_number text = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_id uuid; v_title text:=nullif(trim(coalesce(p_title,'')),'');
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 if v_title is null then raise exception 'contract title is required'; end if;
 if not exists(select 1 from public.neroxa_clients c where c.id=p_client_id and c.status<>'CANCELLED') then raise exception 'active client record not found'; end if;
 if p_proposal_id is not null and not exists(select 1 from public.neroxa_proposals p where p.id=p_proposal_id and p.client_id=p_client_id and p.status='ACCEPTED') then raise exception 'contract proposal must be accepted and belong to client'; end if;
 insert into public.neroxa_contracts(client_id,proposal_id,contract_number,title,created_by) values(p_client_id,p_proposal_id,nullif(trim(coalesce(p_contract_number,'')),''),v_title,auth.uid()) returning id into v_id;
 perform public.record_neroxa_audit('CONTRACT_CREATED','neroxa_contract',v_id,null,null,jsonb_build_object('client_id',p_client_id,'proposal_id',p_proposal_id,'status','DRAFT'),null);
 return v_id;
end $$;
CREATE OR REPLACE FUNCTION public.create_neroxa_contract_version(p_contract_id uuid, p_summary text = NULL, p_terms jsonb = CAST('{}' AS jsonb), p_recurring_value numeric = 0, p_setup_value numeric = 0, p_valid_from date = NULL, p_valid_until date = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_id uuid; v_next integer; v_client uuid;
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 if p_recurring_value<0 or p_setup_value<0 then raise exception 'contract values cannot be negative'; end if;
 select c.client_id into v_client from public.neroxa_contracts c where c.id=p_contract_id and c.status<>'TERMINATED';
 if not found then raise exception 'contract not found or terminated'; end if;
 select coalesce(max(version_number),0)+1 into v_next from public.neroxa_contract_versions where contract_id=p_contract_id;
 insert into public.neroxa_contract_versions(contract_id,version_number,summary,terms,recurring_value,setup_value,valid_from,valid_until,created_by)
 values(p_contract_id,v_next,nullif(trim(coalesce(p_summary,'')),''),coalesce(p_terms,'{}'::jsonb),p_recurring_value,p_setup_value,p_valid_from,p_valid_until,auth.uid()) returning id into v_id;
 perform public.record_neroxa_audit('CONTRACT_VERSION_CREATED','neroxa_contract_version',v_id,null,null,jsonb_build_object('contract_id',p_contract_id,'client_id',v_client,'version_number',v_next,'recurring_value',p_recurring_value,'setup_value',p_setup_value),null);
 return v_id;
end $$;
CREATE OR REPLACE FUNCTION public.transition_neroxa_contract_status(p_contract_id uuid, p_new_status public.neroxa_contract_status) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare v_current public.neroxa_contract_status; v_before jsonb; v_after jsonb; v_client uuid; ok boolean:=false;
begin
 if not public.has_neroxa_permission('commercial.write') then raise exception 'not authorized'; end if;
 select c.status,c.client_id,to_jsonb(c) into v_current,v_client,v_before from public.neroxa_contracts c where c.id=p_contract_id;
 if v_before is null then raise exception 'contract not found'; end if;
 if v_current=p_new_status then return true; end if;
 ok:=(v_current='DRAFT' and p_new_status in ('ACTIVE','EXPIRED','TERMINATED'))
  or (v_current='ACTIVE' and p_new_status in ('SUSPENDED','TERMINATED','EXPIRED'))
  or (v_current='SUSPENDED' and p_new_status in ('ACTIVE','TERMINATED','EXPIRED'));
 if not ok then raise exception 'invalid contract status transition from % to %',v_current,p_new_status; end if;
 update public.neroxa_contracts set status=p_new_status,signed_at=case when p_new_status='ACTIVE' and signed_at is null then now() else signed_at end,started_at=case when p_new_status='ACTIVE' and started_at is null then current_date else started_at end where id=p_contract_id;
 select to_jsonb(c) into v_after from public.neroxa_contracts c where c.id=p_contract_id;
 perform public.record_neroxa_audit('CONTRACT_STATUS_CHANGED','neroxa_contract',p_contract_id,null,v_before,v_after,jsonb_build_object('client_id',v_client,'from_status',v_current,'to_status',p_new_status));
 return true;
end $$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_proposal (uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_proposal (uuid, text, text, date) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.add_neroxa_proposal_item (uuid, public.neroxa_proposal_item_type, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_neroxa_proposal_item (uuid, public.neroxa_proposal_item_type, text, text, numeric, numeric) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.transition_neroxa_proposal_status (uuid, public.neroxa_proposal_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_neroxa_proposal_status (uuid, public.neroxa_proposal_status) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_contract (uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_contract (uuid, text, uuid, text) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_contract_version (uuid, text, jsonb, numeric, numeric, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_contract_version (uuid, text, jsonb, numeric, numeric, date, date) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.transition_neroxa_contract_status (uuid, public.neroxa_contract_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_neroxa_contract_status (uuid, public.neroxa_contract_status) TO authenticated;

CREATE TYPE public.neroxa_subscription_status AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'DELINQUENT', 'CANCELLED', 'EXPIRED');
CREATE TYPE public.neroxa_billing_interval AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE public.neroxa_subscription_item_type AS ENUM ('PLAN', 'ADD_ON', 'SERVICE');
CREATE TABLE IF NOT EXISTS public.neroxa_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, description text, active boolean NOT NULL DEFAULT TRUE, billing_interval public.neroxa_billing_interval NOT NULL DEFAULT 'MONTHLY', base_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0), setup_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (setup_price >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_plans_active_idx ON public.neroxa_plans (active);
CREATE TABLE IF NOT EXISTS public.neroxa_plan_features (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES public.neroxa_plans (id) ON DELETE CASCADE, feature_key text NOT NULL, feature_name text NOT NULL, description text, included boolean NOT NULL DEFAULT TRUE, quantity numeric(12, 2) CHECK (quantity IS NULL OR quantity >= 0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (plan_id, feature_key));
CREATE INDEX IF NOT EXISTS neroxa_plan_features_plan_idx ON public.neroxa_plan_features (plan_id);
CREATE TABLE IF NOT EXISTS public.neroxa_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE RESTRICT, contract_id uuid NOT NULL REFERENCES public.neroxa_contracts (id) ON DELETE RESTRICT, contract_version_id uuid REFERENCES public.neroxa_contract_versions (id) ON DELETE RESTRICT, plan_id uuid NOT NULL REFERENCES public.neroxa_plans (id) ON DELETE RESTRICT, status public.neroxa_subscription_status NOT NULL DEFAULT 'PENDING', billing_interval public.neroxa_billing_interval NOT NULL, contracted_recurring_value numeric(12, 2) NOT NULL CHECK (contracted_recurring_value >= 0), contracted_setup_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (contracted_setup_value >= 0), started_at date, current_period_start date, current_period_end date, next_billing_date date, cancelled_at timestamptz, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_subscriptions_client_idx ON public.neroxa_subscriptions (client_id);
CREATE INDEX IF NOT EXISTS neroxa_subscriptions_contract_idx ON public.neroxa_subscriptions (contract_id);
CREATE INDEX IF NOT EXISTS neroxa_subscriptions_status_idx ON public.neroxa_subscriptions (status);
CREATE INDEX IF NOT EXISTS neroxa_subscriptions_billing_date_idx ON public.neroxa_subscriptions (next_billing_date) WHERE status IN ('ACTIVE', 'DELINQUENT');
CREATE UNIQUE INDEX IF NOT EXISTS neroxa_subscriptions_one_current_per_client_idx ON public.neroxa_subscriptions (client_id) WHERE status IN ('PENDING', 'ACTIVE', 'PAUSED', 'DELINQUENT');
CREATE TABLE IF NOT EXISTS public.neroxa_subscription_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES public.neroxa_subscriptions (id) ON DELETE CASCADE, item_type public.neroxa_subscription_item_type NOT NULL, name text NOT NULL, description text, quantity numeric(12, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0), unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0), recurring boolean NOT NULL DEFAULT TRUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_subscription_items_subscription_idx ON public.neroxa_subscription_items (subscription_id);
CREATE TRIGGER neroxa_plans_set_updated_at BEFORE UPDATE ON public.neroxa_plans FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER neroxa_subscriptions_set_updated_at BEFORE UPDATE ON public.neroxa_subscriptions FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
ALTER TABLE public.neroxa_plans ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_plan_features ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_subscriptions ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_subscription_items ENABLE ROW LEVEL SECURITY ;
REVOKE ALL PRIVILEGES ON TABLE public.neroxa_plans, public.neroxa_plan_features, public.neroxa_subscriptions, public.neroxa_subscription_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.neroxa_plans, public.neroxa_plan_features, public.neroxa_subscriptions, public.neroxa_subscription_items TO authenticated;
INSERT INTO public.neroxa_permissions (key, name, description) VALUES ('subscriptions.read', 'Visualizar assinaturas', 'Consultar planos e assinaturas de clientes.'), ('subscriptions.write', 'Gerenciar assinaturas', 'Criar, atualizar e alterar assinaturas e planos.') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('subscriptions.read', 'subscriptions.write') WHERE r.key = 'super_admin' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key = 'subscriptions.read' WHERE r.key IN ('admin', 'finance') ON CONFLICT DO NOTHING;
CREATE POLICY neroxa_plans_staff_read ON public.neroxa_plans AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('subscriptions.read'));
CREATE POLICY neroxa_plan_features_staff_read ON public.neroxa_plan_features AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('subscriptions.read'));
CREATE POLICY neroxa_subscriptions_staff_read ON public.neroxa_subscriptions AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('subscriptions.read'));
CREATE POLICY neroxa_subscription_items_staff_read ON public.neroxa_subscription_items AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('subscriptions.read'));
CREATE OR REPLACE FUNCTION public.create_neroxa_plan(p_name text, p_slug text, p_description text = NULL, p_billing_interval public.neroxa_billing_interval = 'MONTHLY', p_base_price numeric = 0, p_setup_price numeric = 0) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name,'')),'');
  v_slug text := lower(nullif(trim(coalesce(p_slug,'')),''));
begin
  if not public.has_neroxa_permission('subscriptions.write') then
    raise exception 'not authorized';
  end if;

  if v_name is null or v_slug is null then
    raise exception 'plan name and slug are required';
  end if;

  if p_base_price < 0 or p_setup_price < 0 then
    raise exception 'plan values cannot be negative';
  end if;

  insert into public.neroxa_plans(
    name,slug,description,billing_interval,base_price,setup_price
  )
  values(
    v_name,v_slug,nullif(trim(coalesce(p_description,'')), ''),
    p_billing_interval,p_base_price,p_setup_price
  )
  returning id into v_id;

  perform public.record_neroxa_audit(
    'PLAN_CREATED',
    'neroxa_plan',
    v_id,
    null,
    null,
    jsonb_build_object(
      'name',v_name,
      'slug',v_slug,
      'billing_interval',p_billing_interval,
      'base_price',p_base_price,
      'setup_price',p_setup_price
    ),
    null
  );

  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.create_neroxa_plan_feature(p_plan_id uuid, p_feature_key text, p_feature_name text, p_description text = NULL, p_included boolean = TRUE, p_quantity numeric = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_key text := lower(nullif(trim(coalesce(p_feature_key,'')),''));
  v_name text := nullif(trim(coalesce(p_feature_name,'')),'');
begin
  if not public.has_neroxa_permission('subscriptions.write') then
    raise exception 'not authorized';
  end if;

  if v_key is null or v_name is null then
    raise exception 'feature key and name are required';
  end if;

  if p_quantity is not null and p_quantity < 0 then
    raise exception 'feature quantity cannot be negative';
  end if;

  if not exists(
    select 1 from public.neroxa_plans
    where id=p_plan_id
  ) then
    raise exception 'plan not found';
  end if;

  insert into public.neroxa_plan_features(
    plan_id,feature_key,feature_name,description,included,quantity
  )
  values(
    p_plan_id,v_key,v_name,
    nullif(trim(coalesce(p_description,'')), ''),
    p_included,p_quantity
  )
  returning id into v_id;

  perform public.record_neroxa_audit(
    'PLAN_FEATURE_CREATED',
    'neroxa_plan_feature',
    v_id,
    null,
    null,
    jsonb_build_object('plan_id',p_plan_id,'feature_key',v_key,'feature_name',v_name),
    null
  );

  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.create_neroxa_subscription(p_client_id uuid, p_contract_id uuid, p_contract_version_id uuid, p_plan_id uuid, p_recurring_value numeric, p_setup_value numeric = 0, p_started_at date = CURRENT_DATE, p_next_billing_date date = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_interval public.neroxa_billing_interval;
  v_contract_client uuid;
  v_version_contract uuid;
  v_plan_active boolean;
begin
  if not public.has_neroxa_permission('subscriptions.write') then
    raise exception 'not authorized';
  end if;

  if p_recurring_value < 0 or p_setup_value < 0 then
    raise exception 'subscription values cannot be negative';
  end if;

  select c.client_id
  into v_contract_client
  from public.neroxa_contracts c
  where c.id=p_contract_id
    and c.status in ('ACTIVE','SUSPENDED');

  if v_contract_client is null then
    raise exception 'active contract not found';
  end if;

  if v_contract_client <> p_client_id then
    raise exception 'contract does not belong to client';
  end if;

  if p_contract_version_id is not null then
    select cv.contract_id
    into v_version_contract
    from public.neroxa_contract_versions cv
    where cv.id=p_contract_version_id;

    if v_version_contract is null or v_version_contract <> p_contract_id then
      raise exception 'contract version does not belong to contract';
    end if;
  end if;

  select p.billing_interval,p.active
  into v_interval,v_plan_active
  from public.neroxa_plans p
  where p.id=p_plan_id;

  if v_interval is null or not v_plan_active then
    raise exception 'active plan not found';
  end if;

  insert into public.neroxa_subscriptions(
    client_id,contract_id,contract_version_id,plan_id,status,
    billing_interval,contracted_recurring_value,contracted_setup_value,
    started_at,current_period_start,next_billing_date,created_by
  )
  values(
    p_client_id,p_contract_id,p_contract_version_id,p_plan_id,'PENDING',
    v_interval,p_recurring_value,p_setup_value,
    p_started_at,p_started_at,p_next_billing_date,auth.uid()
  )
  returning id into v_id;

  perform public.record_neroxa_audit(
    'SUBSCRIPTION_CREATED',
    'neroxa_subscription',
    v_id,
    null,
    null,
    jsonb_build_object(
      'client_id',p_client_id,
      'contract_id',p_contract_id,
      'contract_version_id',p_contract_version_id,
      'plan_id',p_plan_id,
      'billing_interval',v_interval,
      'contracted_recurring_value',p_recurring_value,
      'contracted_setup_value',p_setup_value,
      'status','PENDING'
    ),
    null
  );

  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.add_neroxa_subscription_item(p_subscription_id uuid, p_item_type public.neroxa_subscription_item_type, p_name text, p_description text = NULL, p_quantity numeric = 1, p_unit_price numeric = 0, p_recurring boolean = TRUE) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name,'')),'');
begin
  if not public.has_neroxa_permission('subscriptions.write') then
    raise exception 'not authorized';
  end if;

  if v_name is null then
    raise exception 'subscription item name is required';
  end if;

  if p_quantity <= 0 or p_unit_price < 0 then
    raise exception 'invalid subscription item values';
  end if;

  if not exists(
    select 1 from public.neroxa_subscriptions
    where id=p_subscription_id
      and status in ('PENDING','ACTIVE','PAUSED')
  ) then
    raise exception 'subscription not found or not editable';
  end if;

  insert into public.neroxa_subscription_items(
    subscription_id,item_type,name,description,quantity,unit_price,recurring
  )
  values(
    p_subscription_id,p_item_type,v_name,
    nullif(trim(coalesce(p_description,'')), ''),
    p_quantity,p_unit_price,p_recurring
  )
  returning id into v_id;

  perform public.record_neroxa_audit(
    'SUBSCRIPTION_ITEM_ADDED',
    'neroxa_subscription_item',
    v_id,
    null,
    null,
    jsonb_build_object(
      'subscription_id',p_subscription_id,
      'item_type',p_item_type,
      'name',v_name,
      'quantity',p_quantity,
      'unit_price',p_unit_price,
      'recurring',p_recurring
    ),
    null
  );

  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.transition_neroxa_subscription_status(p_subscription_id uuid, p_new_status public.neroxa_subscription_status) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_current public.neroxa_subscription_status;
  v_before jsonb;
  v_after jsonb;
  v_client uuid;
  v_start date;
  ok boolean := false;
begin
  if not public.has_neroxa_permission('subscriptions.write') then
    raise exception 'not authorized';
  end if;

  select s.status,s.client_id,to_jsonb(s)
  into v_current,v_client,v_before
  from public.neroxa_subscriptions s
  where s.id=p_subscription_id;

  if v_before is null then
    raise exception 'subscription not found';
  end if;

  if v_current=p_new_status then
    return true;
  end if;

  ok :=
    (v_current='PENDING' and p_new_status in ('ACTIVE','CANCELLED','EXPIRED'))
    or (v_current='ACTIVE' and p_new_status in ('PAUSED','DELINQUENT','CANCELLED','EXPIRED'))
    or (v_current='PAUSED' and p_new_status in ('ACTIVE','DELINQUENT','CANCELLED'))
    or (v_current='DELINQUENT' and p_new_status in ('ACTIVE','PAUSED','CANCELLED'))
    or (v_current='CANCELLED' and false)
    or (v_current='EXPIRED' and false);

  if not ok then
    raise exception 'invalid subscription status transition from % to %',v_current,p_new_status;
  end if;

  v_start := coalesce(
    (v_before->>'started_at')::date,
    current_date
  );

  update public.neroxa_subscriptions
  set
    status=p_new_status,
    started_at=case
      when p_new_status='ACTIVE' then coalesce(started_at,v_start)
      else started_at
    end,
    current_period_start=case
      when p_new_status='ACTIVE' then coalesce(current_period_start,v_start)
      else current_period_start
    end,
    cancelled_at=case
      when p_new_status='CANCELLED' then coalesce(cancelled_at,now())
      else cancelled_at
    end
  where id=p_subscription_id;

  select to_jsonb(s)
  into v_after
  from public.neroxa_subscriptions s
  where s.id=p_subscription_id;

  perform public.record_neroxa_audit(
    'SUBSCRIPTION_STATUS_CHANGED',
    'neroxa_subscription',
    p_subscription_id,
    null,
    v_before,
    v_after,
    jsonb_build_object(
      'client_id',v_client,
      'from_status',v_current,
      'to_status',p_new_status
    )
  );

  return true;
end
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_plan (text, text, text, public.neroxa_billing_interval, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_plan (text, text, text, public.neroxa_billing_interval, numeric, numeric) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_plan_feature (uuid, text, text, text, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_plan_feature (uuid, text, text, text, boolean, numeric) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_subscription (uuid, uuid, uuid, uuid, numeric, numeric, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_subscription (uuid, uuid, uuid, uuid, numeric, numeric, date, date) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.add_neroxa_subscription_item (uuid, public.neroxa_subscription_item_type, text, text, numeric, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_neroxa_subscription_item (uuid, public.neroxa_subscription_item_type, text, text, numeric, numeric, boolean) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.transition_neroxa_subscription_status (uuid, public.neroxa_subscription_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_neroxa_subscription_status (uuid, public.neroxa_subscription_status) TO authenticated;

CREATE TYPE public.neroxa_invoice_status AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'NEGOTIATION');
CREATE TYPE public.neroxa_invoice_item_type AS ENUM ('SUBSCRIPTION', 'ADD_ON', 'SERVICE', 'SETUP', 'ADJUSTMENT');
CREATE TYPE public.neroxa_payment_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'CANCELLED');
CREATE TYPE public.neroxa_payment_method AS ENUM ('PIX', 'CARD', 'BOLETO', 'BANK_TRANSFER', 'CASH', 'OTHER');
CREATE TABLE IF NOT EXISTS public.neroxa_invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE RESTRICT, subscription_id uuid REFERENCES public.neroxa_subscriptions (id) ON DELETE RESTRICT, invoice_number text NOT NULL UNIQUE, status public.neroxa_invoice_status NOT NULL DEFAULT 'PENDING', issue_date date NOT NULL DEFAULT CURRENT_DATE, due_date date NOT NULL, paid_at timestamptz, subtotal numeric(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0), discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0), total_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0), notes text, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_invoices_client_idx ON public.neroxa_invoices (client_id);
CREATE INDEX IF NOT EXISTS neroxa_invoices_subscription_idx ON public.neroxa_invoices (subscription_id);
CREATE INDEX IF NOT EXISTS neroxa_invoices_status_idx ON public.neroxa_invoices (status);
CREATE INDEX IF NOT EXISTS neroxa_invoices_due_date_idx ON public.neroxa_invoices (due_date) WHERE status IN ('PENDING', 'OVERDUE', 'NEGOTIATION');
CREATE TABLE IF NOT EXISTS public.neroxa_invoice_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.neroxa_invoices (id) ON DELETE CASCADE, item_type public.neroxa_invoice_item_type NOT NULL, name text NOT NULL, description text, quantity numeric(12, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0), unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0), total_price numeric(12, 2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_invoice_items_invoice_idx ON public.neroxa_invoice_items (invoice_id);
CREATE TABLE IF NOT EXISTS public.neroxa_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES public.neroxa_invoices (id) ON DELETE RESTRICT, client_id uuid NOT NULL REFERENCES public.neroxa_clients (id) ON DELETE RESTRICT, status public.neroxa_payment_status NOT NULL DEFAULT 'PENDING', method public.neroxa_payment_method NOT NULL, amount numeric(12, 2) NOT NULL CHECK (amount > 0), paid_at timestamptz, external_reference text, notes text, created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS neroxa_payments_invoice_idx ON public.neroxa_payments (invoice_id);
CREATE INDEX IF NOT EXISTS neroxa_payments_client_idx ON public.neroxa_payments (client_id);
CREATE INDEX IF NOT EXISTS neroxa_payments_status_idx ON public.neroxa_payments (status);
CREATE INDEX IF NOT EXISTS neroxa_payments_paid_at_idx ON public.neroxa_payments (paid_at) WHERE status = 'CONFIRMED';
CREATE TRIGGER neroxa_invoices_set_updated_at BEFORE UPDATE ON public.neroxa_invoices FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE TRIGGER neroxa_payments_set_updated_at BEFORE UPDATE ON public.neroxa_payments FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
ALTER TABLE public.neroxa_invoices ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_invoice_items ENABLE ROW LEVEL SECURITY ;
ALTER TABLE public.neroxa_payments ENABLE ROW LEVEL SECURITY ;
REVOKE ALL PRIVILEGES ON TABLE public.neroxa_invoices, public.neroxa_invoice_items, public.neroxa_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.neroxa_invoices, public.neroxa_invoice_items, public.neroxa_payments TO authenticated;
INSERT INTO public.neroxa_permissions (key, name, description) VALUES ('billing.read', 'Visualizar financeiro', 'Consultar faturas, pagamentos e inadimplência.'), ('billing.write', 'Gerenciar financeiro', 'Criar faturas, registrar pagamentos e atualizar o financeiro.') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key IN ('billing.read', 'billing.write') WHERE r.key = 'super_admin' ON CONFLICT DO NOTHING;
INSERT INTO public.neroxa_role_permissions (role_id, permission_id) SELECT r.id, p.id FROM public.neroxa_roles AS r INNER JOIN public.neroxa_permissions AS p ON p.key = 'billing.read' WHERE r.key IN ('admin', 'finance') ON CONFLICT DO NOTHING;
CREATE POLICY neroxa_invoices_staff_read ON public.neroxa_invoices AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('billing.read'));
CREATE POLICY neroxa_invoice_items_staff_read ON public.neroxa_invoice_items AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('billing.read'));
CREATE POLICY neroxa_payments_staff_read ON public.neroxa_payments AS PERMISSIVE FOR select TO authenticated USING (public.has_neroxa_permission('billing.read'));
CREATE OR REPLACE FUNCTION public.create_neroxa_invoice(p_client_id uuid, p_invoice_number text, p_due_date date, p_subscription_id uuid = NULL, p_notes text = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_number text := nullif(trim(coalesce(p_invoice_number,'')),'');
  v_subscription_client uuid;
begin
  if not public.has_neroxa_permission('billing.write') then
    raise exception 'not authorized';
  end if;
  if v_number is null then raise exception 'invoice number is required'; end if;
  if p_due_date is null then raise exception 'due date is required'; end if;

  if not exists (
    select 1 from public.neroxa_clients c
    where c.id=p_client_id and c.status <> 'CANCELLED'
  ) then
    raise exception 'active client not found';
  end if;

  if p_subscription_id is not null then
    select s.client_id into v_subscription_client
    from public.neroxa_subscriptions s
    where s.id=p_subscription_id;
    if v_subscription_client is null or v_subscription_client <> p_client_id then
      raise exception 'subscription does not belong to client';
    end if;
  end if;

  insert into public.neroxa_invoices(
    client_id,subscription_id,invoice_number,due_date,notes,created_by
  )
  values(
    p_client_id,p_subscription_id,v_number,p_due_date,
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  )
  returning id into v_id;

  perform public.record_neroxa_audit(
    'INVOICE_CREATED','neroxa_invoice',v_id,null,null,
    jsonb_build_object('client_id',p_client_id,'subscription_id',p_subscription_id,
      'invoice_number',v_number,'due_date',p_due_date,'status','PENDING'),null
  );
  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.add_neroxa_invoice_item(p_invoice_id uuid, p_item_type public.neroxa_invoice_item_type, p_name text, p_description text = NULL, p_quantity numeric = 1, p_unit_price numeric = 0) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name,'')),'');
  v_invoice_status public.neroxa_invoice_status;
begin
  if not public.has_neroxa_permission('billing.write') then raise exception 'not authorized'; end if;
  if v_name is null then raise exception 'invoice item name is required'; end if;
  if p_quantity <= 0 or p_unit_price < 0 then raise exception 'invalid invoice item values'; end if;

  select i.status into v_invoice_status from public.neroxa_invoices i where i.id=p_invoice_id;
  if v_invoice_status is null or v_invoice_status not in ('PENDING','NEGOTIATION') then
    raise exception 'invoice not editable';
  end if;

  insert into public.neroxa_invoice_items(invoice_id,item_type,name,description,quantity,unit_price)
  values(p_invoice_id,p_item_type,v_name,nullif(trim(coalesce(p_description,'')),''),p_quantity,p_unit_price)
  returning id into v_id;

  update public.neroxa_invoices i
  set subtotal = coalesce((select sum(ii.total_price) from public.neroxa_invoice_items ii where ii.invoice_id=i.id),0),
      total_amount = greatest(0,coalesce((select sum(ii.total_price) from public.neroxa_invoice_items ii where ii.invoice_id=i.id),0) - i.discount_amount)
  where i.id=p_invoice_id;

  perform public.record_neroxa_audit(
    'INVOICE_ITEM_ADDED','neroxa_invoice_item',v_id,null,null,
    jsonb_build_object('invoice_id',p_invoice_id,'item_type',p_item_type,'name',v_name,
      'quantity',p_quantity,'unit_price',p_unit_price),null
  );
  return v_id;
end
$$;
CREATE OR REPLACE FUNCTION public.transition_neroxa_invoice_status(p_invoice_id uuid, p_new_status public.neroxa_invoice_status) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_current public.neroxa_invoice_status;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.has_neroxa_permission('billing.write') then raise exception 'not authorized'; end if;
  select i.status,to_jsonb(i) into v_current,v_before
  from public.neroxa_invoices i where i.id=p_invoice_id;
  if v_before is null then raise exception 'invoice not found'; end if;
  if v_current=p_new_status then return true; end if;

  if not (
    (v_current='PENDING' and p_new_status in ('PAID','OVERDUE','CANCELLED','NEGOTIATION'))
    or (v_current='NEGOTIATION' and p_new_status in ('PENDING','PAID','CANCELLED','OVERDUE'))
    or (v_current='OVERDUE' and p_new_status in ('PAID','NEGOTIATION','CANCELLED'))
    or (v_current='PAID' and p_new_status in ('REFUNDED'))
  ) then
    raise exception 'invalid invoice status transition from % to %',v_current,p_new_status;
  end if;

  update public.neroxa_invoices
  set status=p_new_status,
      paid_at=case when p_new_status='PAID' then coalesce(paid_at,now()) else paid_at end
  where id=p_invoice_id;

  select to_jsonb(i) into v_after from public.neroxa_invoices i where i.id=p_invoice_id;

  perform public.record_neroxa_audit(
    'INVOICE_STATUS_CHANGED','neroxa_invoice',p_invoice_id,null,v_before,v_after,
    jsonb_build_object('from_status',v_current,'to_status',p_new_status)
  );
  return true;
end
$$;
CREATE OR REPLACE FUNCTION public.record_neroxa_payment(p_invoice_id uuid, p_method public.neroxa_payment_method, p_amount numeric, p_paid_at timestamptz = NULL, p_external_reference text = NULL, p_notes text = NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_total numeric;
  v_confirmed numeric;
  v_payment_status public.neroxa_payment_status := 'CONFIRMED';
begin
  if not public.has_neroxa_permission('billing.write') then raise exception 'not authorized'; end if;
  if p_amount <= 0 then raise exception 'payment amount must be positive'; end if;

  select i.client_id,i.total_amount into v_client_id,v_total
  from public.neroxa_invoices i where i.id=p_invoice_id and i.status <> 'CANCELLED';
  if v_client_id is null then raise exception 'invoice not found'; end if;

  select coalesce(sum(p.amount),0) into v_confirmed
  from public.neroxa_payments p
  where p.invoice_id=p_invoice_id and p.status='CONFIRMED';

  if v_confirmed + p_amount > v_total then raise exception 'payment exceeds invoice balance'; end if;

  insert into public.neroxa_payments(
    invoice_id,client_id,status,method,amount,paid_at,external_reference,notes,created_by
  )
  values(
    p_invoice_id,v_client_id,v_payment_status,p_method,p_amount,
    coalesce(p_paid_at,now()),nullif(trim(coalesce(p_external_reference,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  )
  returning id into v_id;

  if v_confirmed + p_amount >= v_total then
    update public.neroxa_invoices set status='PAID',paid_at=coalesce(p_paid_at,now()) where id=p_invoice_id;
  end if;

  perform public.record_neroxa_audit(
    'PAYMENT_RECORDED','neroxa_payment',v_id,null,null,
    jsonb_build_object('invoice_id',p_invoice_id,'amount',p_amount,'method',p_method),null
  );
  return v_id;
end
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.create_neroxa_invoice (uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neroxa_invoice (uuid, text, date, uuid, text) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.add_neroxa_invoice_item (uuid, public.neroxa_invoice_item_type, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_neroxa_invoice_item (uuid, public.neroxa_invoice_item_type, text, text, numeric, numeric) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.transition_neroxa_invoice_status (uuid, public.neroxa_invoice_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_neroxa_invoice_status (uuid, public.neroxa_invoice_status) TO authenticated;
REVOKE ALL PRIVILEGES ON FUNCTION public.record_neroxa_payment (uuid, public.neroxa_payment_method, numeric, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_neroxa_payment (uuid, public.neroxa_payment_method, numeric, timestamptz, text, text) TO authenticated;
