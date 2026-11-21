SET search_path=public,extensions;
CREATE SCHEMA private; CREATE SCHEMA extensions; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE ROLE "anon" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE "authenticated" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE "service_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE "go03t_untrusted" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE TYPE public."neroxa_billing_period" AS ENUM ('MONTHLY','YEARLY','ONE_TIME');
CREATE TYPE public."neroxa_billing_status" AS ENUM ('PENDING','PAID','OVERDUE','CANCELLED','REFUNDED');
CREATE TYPE public."neroxa_domain_status" AS ENUM ('PENDING','VERIFYING','VERIFIED','FAILED','DISABLED');
CREATE TYPE public."neroxa_instance_status" AS ENUM ('PROVISIONING','ACTIVE','SUSPENDED','ARCHIVED');
CREATE TYPE public."neroxa_organization_role" AS ENUM ('OWNER','ADMIN','MANAGER','OPERATOR');
CREATE TYPE public."neroxa_platform_role" AS ENUM ('SUPER_ADMIN','ADMIN','SUPPORT','FINANCE');
CREATE TYPE public."neroxa_provisioning_status" AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE public."neroxa_subscription_status" AS ENUM ('TRIAL','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED');
CREATE TYPE public."neroxa_support_ticket_priority" AS ENUM ('LOW','NORMAL','HIGH','URGENT');
CREATE TYPE public."neroxa_support_ticket_status" AS ENUM ('OPEN','IN_PROGRESS','WAITING_CLIENT','RESOLVED','CLOSED');
CREATE TABLE public."neroxa_contracts"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"client_id" uuid NOT NULL,"proposal_id" uuid,"status" text DEFAULT 'DRAFT'::text NOT NULL,"contract_number" text,"title" text NOT NULL,"started_at" date,"ended_at" date,"signed_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"plan_id" uuid,"system_id" uuid,"commercial_model" text DEFAULT 'SUBSCRIPTION'::text NOT NULL,"billing_period" text,"recurring_value" numeric(12,2),"setup_value" numeric(12,2) DEFAULT 0 NOT NULL,"maintenance_value" numeric(12,2),"currency" text DEFAULT 'BRL'::text NOT NULL,"version" integer DEFAULT 1 NOT NULL,"signature_status" text DEFAULT 'NOT_SENT'::text NOT NULL,"public_signature_token" uuid DEFAULT gen_random_uuid() NOT NULL,"signature_requested_at" timestamp with time zone,"customer_signer_name" text,"customer_signer_document" text,"customer_signed_at" timestamp with time zone,"neroxa_signer_user_id" uuid,"neroxa_signer_name" text,"neroxa_signer_role" text,"neroxa_signed_at" timestamp with time zone,"issued_at" timestamp with time zone,"term_months" integer,"neroxa_entity_type" text,"neroxa_trade_name" text,"neroxa_legal_name" text,"neroxa_tax_id" text);
CREATE TABLE public."neroxa_order_items"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"order_id" uuid NOT NULL,"product_id" uuid,"product_name" text NOT NULL,"product_image_url" text,"second_product_id" uuid,"second_product_name" text,"is_half" boolean DEFAULT false NOT NULL,"size_id" uuid,"size_name" text,"crust_id" uuid,"crust_name" text,"crust_price" numeric(12,2) DEFAULT 0 NOT NULL,"addons" jsonb DEFAULT '[]'::jsonb NOT NULL,"complements" jsonb DEFAULT '[]'::jsonb NOT NULL,"quantity" integer NOT NULL,"notes" text,"unit_price" numeric(12,2) NOT NULL,"line_total" numeric(12,2) NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_order_status_history"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"order_id" uuid NOT NULL,"from_status" text,"to_status" text NOT NULL,"changed_by_user_id" uuid,"note" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_orders"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"organization_id" uuid NOT NULL,"order_number" bigint NOT NULL,"customer_name" text NOT NULL,"customer_phone" text NOT NULL,"fulfillment" text NOT NULL,"payment_method" text NOT NULL,"status" text DEFAULT 'RECEIVED'::text NOT NULL,"subtotal" numeric(12,2) DEFAULT 0 NOT NULL,"delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,"total" numeric(12,2) DEFAULT 0 NOT NULL,"address_street" text,"address_number" text,"address_neighborhood" text,"address_complement" text,"address_reference" text,"notes" text,"idempotency_key" uuid,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"confirmed_at" timestamp with time zone,"preparing_at" timestamp with time zone,"ready_at" timestamp with time zone,"out_for_delivery_at" timestamp with time zone,"delivered_at" timestamp with time zone,"cancelled_at" timestamp with time zone);
CREATE TABLE public."neroxa_organizations"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"legal_name" text NOT NULL,"trade_name" text,"document" text,"email" text,"phone" text,"contact_name" text,"active" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"status" text DEFAULT 'LEAD'::text NOT NULL,"notes" text,"acquired_at" timestamp with time zone,"contracted_at" timestamp with time zone,"activated_at" timestamp with time zone,"paused_at" timestamp with time zone,"cancelled_at" timestamp with time zone);
CREATE TABLE public."neroxa_plans"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"name" text NOT NULL,"slug" text NOT NULL,"description" text,"price_monthly" numeric(12,2) DEFAULT 0 NOT NULL,"setup_price" numeric(12,2) DEFAULT 0 NOT NULL,"billing_period" neroxa_billing_period DEFAULT 'MONTHLY'::neroxa_billing_period NOT NULL,"active" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"gateway_provider" text,"gateway_plan_id" text,"gateway_status" text DEFAULT 'NOT_CONFIGURED'::text NOT NULL,"gateway_synced_at" timestamp with time zone,"commercial_model" text DEFAULT 'SUBSCRIPTION'::text NOT NULL,"maintenance_price" numeric(12,2),"system_id" uuid);
CREATE TABLE public."neroxa_proposals"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"client_id" uuid NOT NULL,"status" text DEFAULT 'DRAFT'::text NOT NULL,"title" text NOT NULL,"notes" text,"valid_until" date,"sent_at" timestamp with time zone,"accepted_at" timestamp with time zone,"rejected_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"plan_id" uuid,"system_id" uuid,"commercial_model" text DEFAULT 'SUBSCRIPTION'::text NOT NULL,"billing_period" text,"recurring_value" numeric(12,2),"setup_value" numeric(12,2) DEFAULT 0 NOT NULL,"maintenance_value" numeric(12,2),"currency" text DEFAULT 'BRL'::text NOT NULL,"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,"version" integer DEFAULT 1 NOT NULL);
CREATE TABLE public."neroxa_storefront_addon_groups"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"name" text NOT NULL,"required" boolean DEFAULT false NOT NULL,"min_selections" integer DEFAULT 0 NOT NULL,"max_selections" integer DEFAULT 1 NOT NULL,"active" boolean DEFAULT true NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_storefront_addons"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"group_id" uuid NOT NULL,"name" text NOT NULL,"price_delta" numeric DEFAULT 0 NOT NULL,"active" boolean DEFAULT true NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_storefront_categories"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"name" text NOT NULL,"slug" text NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL,"active" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"description" text,"image_url" text);
CREATE TABLE public."neroxa_storefront_delivery_zones"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"organization_id" uuid NOT NULL,"name" text NOT NULL,"neighborhoods" text[] DEFAULT '{}'::text[] NOT NULL,"minimum_order" numeric(12,2) DEFAULT 0 NOT NULL,"delivery_fee" numeric(12,2) DEFAULT 0 NOT NULL,"estimated_minutes" integer,"active" boolean DEFAULT true NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_storefront_product_addon_groups"("product_id" uuid NOT NULL,"group_id" uuid NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL);
CREATE TABLE public."neroxa_storefront_products"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"instance_id" uuid NOT NULL,"category_id" uuid,"name" text NOT NULL,"slug" text NOT NULL,"description" text,"image_url" text,"price" numeric(12,2),"active" boolean DEFAULT true NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL,"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_subscriptions"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"organization_id" uuid NOT NULL,"plan_id" uuid NOT NULL,"status" neroxa_subscription_status DEFAULT 'TRIAL'::neroxa_subscription_status NOT NULL,"price" numeric(12,2) DEFAULT 0 NOT NULL,"started_at" timestamp with time zone DEFAULT now() NOT NULL,"current_period_start" date,"current_period_end" date,"cancelled_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"gateway_provider" text,"gateway_subscription_id" text,"gateway_status" text,"checkout_url" text,"gateway_synced_at" timestamp with time zone,"contract_id" uuid);
CREATE TABLE public."neroxa_system_domains"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"system_instance_id" uuid NOT NULL,"domain" text NOT NULL,"is_primary" boolean DEFAULT false NOT NULL,"status" neroxa_domain_status DEFAULT 'PENDING'::neroxa_domain_status NOT NULL,"verified_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public."neroxa_system_instances"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"organization_id" uuid NOT NULL,"plan_id" uuid,"name" text NOT NULL,"system_type" text NOT NULL,"slug" text NOT NULL,"status" neroxa_instance_status DEFAULT 'PROVISIONING'::neroxa_instance_status NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"subscription_id" uuid,"system_id" uuid);
CREATE TABLE public."neroxa_systems"("id" uuid DEFAULT gen_random_uuid() NOT NULL,"name" text NOT NULL,"slug" text NOT NULL,"system_type" text NOT NULL,"description" text,"version" text DEFAULT '1.0.0'::text NOT NULL,"active" boolean DEFAULT true NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_billing_period_check" CHECK (billing_period IS NULL OR (billing_period = ANY (ARRAY['MONTHLY'::text, 'YEARLY'::text, 'ONE_TIME'::text])));
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_commercial_model_check" CHECK (commercial_model = ANY (ARRAY['SUBSCRIPTION'::text, 'PERMANENT'::text]));
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_signature_status_check" CHECK (signature_status = ANY (ARRAY['NOT_SENT'::text, 'PENDING_CUSTOMER'::text, 'PENDING_NEROXA'::text, 'SIGNED'::text, 'DECLINED'::text, 'CANCELLED'::text]));
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'TERMINATED'::text, 'EXPIRED'::text]));
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_line_total_check" CHECK (line_total >= 0::numeric);
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_quantity_check" CHECK (quantity > 0);
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_unit_price_check" CHECK (unit_price >= 0::numeric);
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_delivery_fee_check" CHECK (delivery_fee >= 0::numeric);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_fulfillment_check" CHECK (fulfillment = ANY (ARRAY['DELIVERY'::text, 'PICKUP'::text]));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_idempotency_key_key" UNIQUE (instance_id, idempotency_key);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_order_number_key" UNIQUE (instance_id, order_number);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_payment_method_check" CHECK (payment_method = ANY (ARRAY['CASH'::text, 'PIX'::text, 'CARD_ON_DELIVERY'::text, 'CARD_ON_SITE'::text]));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_status_check" CHECK (status = ANY (ARRAY['RECEIVED'::text, 'CONFIRMED'::text, 'PREPARING'::text, 'READY'::text, 'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'CANCELLED'::text]));
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_subtotal_check" CHECK (subtotal >= 0::numeric);
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_total_check" CHECK (total >= 0::numeric);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_email_not_blank" CHECK (email IS NULL OR length(btrim(email)) > 0);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_legal_name_not_blank" CHECK (length(btrim(legal_name)) > 0);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_organizations" ADD CONSTRAINT "neroxa_organizations_status_check" CHECK (status = ANY (ARRAY['LEAD'::text, 'PROPOSAL'::text, 'NEGOTIATION'::text, 'CONTRACTED'::text, 'IMPLEMENTATION'::text, 'ACTIVE'::text, 'PAUSED'::text, 'DELINQUENT'::text, 'CANCELLED'::text]));
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_commercial_model_check" CHECK (commercial_model = ANY (ARRAY['SUBSCRIPTION'::text, 'PERMANENT'::text]));
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_price_monthly_check" CHECK (price_monthly >= 0::numeric);
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_setup_price_check" CHECK (setup_price >= 0::numeric);
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_slug_key" UNIQUE (slug);
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_billing_period_check" CHECK (billing_period IS NULL OR (billing_period = ANY (ARRAY['MONTHLY'::text, 'YEARLY'::text, 'ONE_TIME'::text])));
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_commercial_model_check" CHECK (commercial_model = ANY (ARRAY['SUBSCRIPTION'::text, 'PERMANENT'::text]));
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SENT'::text, 'NEGOTIATION'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'CANCELLED'::text]));
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
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_pkey" PRIMARY KEY (product_id, group_id);
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_instance_id_slug_key" UNIQUE (instance_id, slug);
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_subscriptions" ADD CONSTRAINT "neroxa_subscriptions_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_subscriptions" ADD CONSTRAINT "neroxa_subscriptions_price_check" CHECK (price >= 0::numeric);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_domain_format" CHECK (length(TRIM(BOTH FROM domain)) > 0 AND domain = lower(domain) AND POSITION((' '::text) IN (domain)) = 0 AND POSITION(('/'::text) IN (domain)) = 0 AND POSITION(('://'::text) IN (domain)) = 0);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_domain_key" UNIQUE (domain);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_primary_not_disabled" CHECK (NOT (is_primary AND status = 'DISABLED'::neroxa_domain_status));
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_slug_key" UNIQUE (slug);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_pkey" PRIMARY KEY (id);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_slug_format" CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_slug_key" UNIQUE (slug);
ALTER TABLE public."neroxa_systems" ADD CONSTRAINT "neroxa_systems_type_check" CHECK (system_type = ANY (ARRAY['DELIVERY'::text, 'FOOD'::text, 'CLINIC'::text, 'BEAUTY'::text, 'BARBER'::text, 'FITNESS'::text, 'CUSTOM'::text]));
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES neroxa_organizations(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES neroxa_plans(id);
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES neroxa_proposals(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_contracts" ADD CONSTRAINT "neroxa_contracts_system_id_fkey" FOREIGN KEY (system_id) REFERENCES neroxa_systems(id);
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES neroxa_orders(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES neroxa_storefront_products(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_items" ADD CONSTRAINT "neroxa_order_items_second_product_id_fkey" FOREIGN KEY (second_product_id) REFERENCES neroxa_storefront_products(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_changed_by_user_id_fkey" FOREIGN KEY (changed_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_order_status_history" ADD CONSTRAINT "neroxa_order_status_history_order_id_fkey" FOREIGN KEY (order_id) REFERENCES neroxa_orders(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_orders" ADD CONSTRAINT "neroxa_orders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_plans" ADD CONSTRAINT "neroxa_plans_system_id_fkey" FOREIGN KEY (system_id) REFERENCES neroxa_systems(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES neroxa_organizations(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES neroxa_plans(id);
ALTER TABLE public."neroxa_proposals" ADD CONSTRAINT "neroxa_proposals_system_id_fkey" FOREIGN KEY (system_id) REFERENCES neroxa_systems(id);
ALTER TABLE public."neroxa_storefront_addon_groups" ADD CONSTRAINT "neroxa_storefront_addon_groups_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_addons" ADD CONSTRAINT "neroxa_storefront_addons_group_id_fkey" FOREIGN KEY (group_id) REFERENCES neroxa_storefront_addon_groups(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_categories" ADD CONSTRAINT "neroxa_storefront_categories_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_delivery_zones" ADD CONSTRAINT "neroxa_storefront_delivery_zones_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES neroxa_organizations(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES neroxa_storefront_addon_groups(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_product_addon_groups" ADD CONSTRAINT "neroxa_storefront_product_addon_groups_product_id_fkey" FOREIGN KEY (product_id) REFERENCES neroxa_storefront_products(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES neroxa_storefront_categories(id) ON DELETE SET NULL;
ALTER TABLE public."neroxa_storefront_products" ADD CONSTRAINT "neroxa_storefront_products_instance_id_fkey" FOREIGN KEY (instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_subscriptions" ADD CONSTRAINT "neroxa_subscriptions_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES neroxa_contracts(id);
ALTER TABLE public."neroxa_subscriptions" ADD CONSTRAINT "neroxa_subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES neroxa_plans(id);
ALTER TABLE public."neroxa_system_domains" ADD CONSTRAINT "neroxa_system_domains_system_instance_id_fkey" FOREIGN KEY (system_instance_id) REFERENCES neroxa_system_instances(id) ON DELETE CASCADE;
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES neroxa_plans(id);
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES neroxa_subscriptions(id) ON DELETE RESTRICT;
ALTER TABLE public."neroxa_system_instances" ADD CONSTRAINT "neroxa_system_instances_system_id_fkey" FOREIGN KEY (system_id) REFERENCES neroxa_systems(id) ON DELETE RESTRICT;
SET check_function_bodies=off;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.neroxa_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_neroxa_contract_commercial_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ begin if old.status in ('ACTIVE','SUSPENDED','TERMINATED','EXPIRED') or old.signature_status='SIGNED' then if new.client_id is distinct from old.client_id or new.proposal_id is distinct from old.proposal_id or new.plan_id is distinct from old.plan_id or new.system_id is distinct from old.system_id or new.commercial_model is distinct from old.commercial_model or new.billing_period is distinct from old.billing_period or new.recurring_value is distinct from old.recurring_value or new.setup_value is distinct from old.setup_value or new.maintenance_value is distinct from old.maintenance_value or new.currency is distinct from old.currency or new.version is distinct from old.version or new.title is distinct from old.title or new.contract_number is distinct from old.contract_number then raise exception 'Commercial terms of a signed/contracted contract are immutable'; end if; end if; return new; end; $function$;
CREATE OR REPLACE FUNCTION public.reset_neroxa_domain_verification_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin if new.domain is distinct from old.domain then new.status := 'PENDING'::public.neroxa_domain_status; new.verified_at := null; end if; return new; end; $function$;
CREATE OR REPLACE FUNCTION public.set_neroxa_systems_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_billing_with_subscription_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if old.status is distinct from new.status
     and new.status in ('CANCELLED','EXPIRED')
  then
    update public.neroxa_billing_records
    set status = 'CANCELLED'
    where subscription_id = new.id
      and status = 'PENDING';
  end if;

  return new;
end;
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.sync_instance_status_with_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('ACTIVE','PAUSED','CANCELLED') then
    update public.neroxa_system_instances
    set status = case
      when new.status = 'ACTIVE' then 'ACTIVE'::neroxa_instance_status
      when new.status = 'PAUSED' then 'SUSPENDED'::neroxa_instance_status
      when new.status = 'CANCELLED' then 'ARCHIVED'::neroxa_instance_status
    end,
    updated_at = now()
    where subscription_id = new.id;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_neroxa_contract_terminal_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_subscription record;
begin
  if new.status in ('TERMINATED','EXPIRED') and old.status is distinct from new.status then
    for v_subscription in
      select id, organization_id, status
      from public.neroxa_subscriptions
      where contract_id = new.id
        and status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE')
      for update
    loop
      update public.neroxa_subscriptions
      set status = 'CANCELLED',
          cancelled_at = coalesce(cancelled_at, now()),
          updated_at = now()
      where id = v_subscription.id;

      insert into public.neroxa_audit_logs (
        actor_id,
        organization_id,
        action,
        resource_type,
        resource_id,
        details
      )
      values (
        auth.uid(),
        v_subscription.organization_id,
        'SUBSCRIPTION_STATUS_CHANGED',
        'SUBSCRIPTION',
        v_subscription.id,
        jsonb_build_object(
          'status', 'CANCELLED',
          'previousStatus', v_subscription.status,
          'reason', 'CONTRACT_TERMINAL_LIFECYCLE',
          'contractId', new.id,
          'contractStatus', new.status
        )
      );
    end loop;

    update public.neroxa_billing_records b
    set status = 'CANCELLED'
    where b.subscription_id in (
      select s.id
      from public.neroxa_subscriptions s
      where s.contract_id = new.id
    )
      and b.status = 'PENDING';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.validate_neroxa_contract_proposal_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_proposal public.neroxa_proposals%rowtype;
begin
  if new.proposal_id is null then
    return new;
  end if;

  select *
    into v_proposal
  from public.neroxa_proposals
  where id = new.proposal_id
  for share;

  if not found then
    raise exception 'Proposta vinculada ao contrato não encontrada';
  end if;

  if v_proposal.status <> 'ACCEPTED' then
    raise exception 'Contrato só pode ser criado a partir de proposta aceita';
  end if;

  if new.client_id is distinct from v_proposal.client_id
    or new.plan_id is distinct from v_proposal.plan_id
    or new.system_id is distinct from v_proposal.system_id
    or new.commercial_model is distinct from v_proposal.commercial_model
    or new.billing_period is distinct from v_proposal.billing_period
    or new.recurring_value is distinct from v_proposal.recurring_value
    or new.setup_value is distinct from v_proposal.setup_value
    or new.maintenance_value is distinct from v_proposal.maintenance_value
    or new.currency is distinct from v_proposal.currency
  then
    raise exception 'Dados comerciais do contrato não correspondem à proposta aceita';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.validate_neroxa_contract_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'DRAFT' and new.status = 'ACTIVE' then
    if current_setting('neroxa.allow_contract_activation', true) is distinct from 'true' then
      raise exception 'Ativação de contrato deve ocorrer exclusivamente pelo fluxo oficial de ativação';
    end if;
  elsif old.status = 'DRAFT' and new.status not in ('DRAFT','ACTIVE') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status = 'ACTIVE' and new.status not in ('SUSPENDED','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status = 'SUSPENDED' and new.status not in ('ACTIVE','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status in ('TERMINATED','EXPIRED') then
    raise exception 'Contract % is final and cannot transition to %', old.status, new.status;
  end if;
  if new.status = 'ACTIVE' and new.signature_status is distinct from 'SIGNED' then raise exception 'Contrato só pode ser ativado após as duas assinaturas'; end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.validate_neroxa_proposal_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'DRAFT' and new.status not in ('SENT','CANCELLED') then
    raise exception 'Invalid proposal transition: % -> %', old.status, new.status;
  end if;
  if old.status = 'SENT' and new.status not in ('NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CANCELLED') then
    raise exception 'Invalid proposal transition: % -> %', old.status, new.status;
  end if;
  if old.status = 'NEGOTIATION' and new.status not in ('SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED') then
    raise exception 'Invalid proposal transition: % -> %', old.status, new.status;
  end if;
  if old.status in ('ACCEPTED','REJECTED','EXPIRED','CANCELLED') then
    raise exception 'Proposal % is final and cannot transition to %', old.status, new.status;
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.validate_neroxa_subscription_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
      or new.plan_id is distinct from old.plan_id
      or new.contract_id is distinct from old.contract_id
    then
      raise exception 'Organização, plano e contrato da assinatura não podem ser alterados após a criação';
    end if;

    if old.status = 'TRIAL' and new.status not in ('TRIAL','ACTIVE','CANCELLED','EXPIRED') then
      raise exception 'Transição de assinatura inválida: TRIAL -> %', new.status;
    elsif old.status = 'ACTIVE' and new.status not in ('ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED') then
      raise exception 'Transição de assinatura inválida: ACTIVE -> %', new.status;
    elsif old.status = 'PAST_DUE' and new.status not in ('PAST_DUE','ACTIVE','PAUSED','CANCELLED') then
      raise exception 'Transição de assinatura inválida: PAST_DUE -> %', new.status;
    elsif old.status = 'PAUSED' and new.status not in ('PAUSED','ACTIVE','CANCELLED') then
      raise exception 'Transição de assinatura inválida: PAUSED -> %', new.status;
    elsif old.status in ('CANCELLED','EXPIRED') and new.status is distinct from old.status then
      raise exception 'Assinatura em estado terminal não pode ser reaberta';
    end if;
  end if;

  if new.current_period_start is not null
    and new.current_period_end is not null
    and new.current_period_end <= new.current_period_start
  then
    raise exception 'O fim do período da assinatura deve ser posterior ao início';
  end if;

  if new.status = 'CANCELLED' then
    if new.cancelled_at is null then
      raise exception 'Assinatura cancelada precisa possuir cancelled_at';
    end if;
  elsif new.cancelled_at is not null then
    raise exception 'Somente assinaturas canceladas podem possuir cancelled_at';
  end if;

  if new.status in ('ACTIVE','PAST_DUE','PAUSED','TRIAL')
    and new.current_period_start is null
  then
    raise exception 'Assinatura em ciclo ativo precisa possuir current_period_start';
  end if;

  if new.status in ('ACTIVE','PAST_DUE','PAUSED','TRIAL')
    and new.current_period_end is null
  then
    raise exception 'Assinatura em ciclo ativo precisa possuir current_period_end';
  end if;

  return new;
end;
$function$;
CREATE TRIGGER trg_neroxa_contract_commercial_immutability BEFORE UPDATE ON neroxa_contracts FOR EACH ROW EXECUTE FUNCTION prevent_neroxa_contract_commercial_change();
CREATE TRIGGER trg_neroxa_contract_proposal_integrity BEFORE INSERT OR UPDATE OF proposal_id, client_id, plan_id, system_id, commercial_model, billing_period, recurring_value, setup_value, maintenance_value, currency ON neroxa_contracts FOR EACH ROW EXECUTE FUNCTION validate_neroxa_contract_proposal_integrity();
CREATE TRIGGER trg_neroxa_contract_status_transition BEFORE UPDATE OF status ON neroxa_contracts FOR EACH ROW EXECUTE FUNCTION validate_neroxa_contract_status_transition();
CREATE TRIGGER trg_sync_neroxa_contract_terminal_lifecycle AFTER UPDATE OF status ON neroxa_contracts FOR EACH ROW EXECUTE FUNCTION sync_neroxa_contract_terminal_lifecycle();
CREATE TRIGGER neroxa_organizations_set_updated_at BEFORE UPDATE ON neroxa_organizations FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_neroxa_plans_updated_at BEFORE UPDATE ON neroxa_plans FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_neroxa_proposal_status_transition BEFORE UPDATE OF status ON neroxa_proposals FOR EACH ROW EXECUTE FUNCTION validate_neroxa_proposal_status_transition();
CREATE TRIGGER trg_neroxa_subscription_integrity BEFORE INSERT OR UPDATE ON neroxa_subscriptions FOR EACH ROW EXECUTE FUNCTION validate_neroxa_subscription_integrity();
CREATE TRIGGER trg_neroxa_subscriptions_updated_at BEFORE UPDATE ON neroxa_subscriptions FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_sync_billing_with_subscription_terminal AFTER UPDATE OF status ON neroxa_subscriptions FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION sync_billing_with_subscription_terminal();
CREATE TRIGGER trg_sync_instance_status_with_subscription AFTER UPDATE OF status ON neroxa_subscriptions FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION sync_instance_status_with_subscription();
CREATE TRIGGER trg_neroxa_system_domains_reset_verification BEFORE UPDATE ON neroxa_system_domains FOR EACH ROW EXECUTE FUNCTION reset_neroxa_domain_verification_on_change();
CREATE TRIGGER trg_neroxa_system_domains_updated_at BEFORE UPDATE ON neroxa_system_domains FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_guard_neroxa_system_instance_insert BEFORE INSERT ON neroxa_system_instances FOR EACH ROW EXECUTE FUNCTION guard_neroxa_implementation_write_path();
CREATE TRIGGER trg_neroxa_system_instances_updated_at BEFORE UPDATE ON neroxa_system_instances FOR EACH ROW EXECUTE FUNCTION neroxa_set_updated_at();
CREATE TRIGGER trg_sync_domains_with_instance_status AFTER UPDATE OF status ON neroxa_system_instances FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION sync_domains_with_instance_status();
CREATE TRIGGER trg_set_neroxa_systems_updated_at BEFORE UPDATE ON neroxa_systems FOR EACH ROW EXECUTE FUNCTION set_neroxa_systems_updated_at();
SET check_function_bodies=on;
ALTER TABLE public."neroxa_contracts" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_contracts" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_order_items" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_order_items" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_order_status_history" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_order_status_history" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_orders" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_orders" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_organizations" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_organizations" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_plans" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_plans" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_proposals" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_proposals" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_addon_groups" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_addon_groups" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_addons" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_addons" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_categories" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_categories" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_delivery_zones" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_delivery_zones" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_product_addon_groups" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_product_addon_groups" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_storefront_products" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_storefront_products" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_subscriptions" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_subscriptions" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_system_domains" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_system_domains" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_system_instances" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_system_instances" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public."neroxa_systems" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."neroxa_systems" FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
ALTER TABLE public.neroxa_storefront_delivery_zones ADD COLUMN instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id);
CREATE TABLE private.neroxa_group_order_intents (
 order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
 payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);
ALTER TABLE private.neroxa_group_order_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_group_order_intents FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.neroxa_order_items ADD COLUMN IF NOT EXISTS selection_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
DO $snapshot_type$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.neroxa_order_items'::regclass AND attname='selection_snapshot' AND atttypid='jsonb'::regtype AND attnotnull AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected snapshot column; stop instead of coercing history'; END IF; END $snapshot_type$;
CREATE OR REPLACE FUNCTION private.neroxa_requires_group_contract(p_instance uuid,p_product uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $requires$
 SELECT EXISTS(SELECT 1 FROM public.neroxa_storefront_products p WHERE p.id=p_product AND p.instance_id=p_instance AND (
 EXISTS(SELECT 1 FROM public.neroxa_storefront_product_addon_groups l WHERE l.product_id=p.id)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(p.metadata->'options','null'::jsonb),'[]'::jsonb)) opt WHERE opt->>'required'='true')
 ));
$requires$;
REVOKE ALL ON FUNCTION private.neroxa_requires_group_contract(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(p.metadata->'options','null'::jsonb),'[]'::jsonb)) o GROUP BY o->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Ambiguous option groups' USING ERRCODE='22023'; END IF;
 FOR opt IN SELECT value FROM jsonb_array_elements(coalesce(nullif(p.metadata->'options','null'::jsonb),'[]'::jsonb)) LOOP
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
CREATE FUNCTION private.neroxa_assert_store_open(p_instance uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 LOCK TABLE public.neroxa_storefront_availability,public.neroxa_storefront_weekly_hours,public.neroxa_storefront_special_days,public.neroxa_storefront_special_hours IN SHARE MODE;
 IF NOT private.neroxa_store_is_open(p_instance,clock_timestamp()) THEN RAISE EXCEPTION 'Store unavailable' USING ERRCODE='PT423'; END IF;
END $$;
ALTER TABLE private.neroxa_group_order_intents ADD COLUMN recovery_expires_at timestamptz;
CREATE FUNCTION private.neroxa_lease_group_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.recovery_expires_at IS NULL THEN NEW.recovery_expires_at:=clock_timestamp()+interval '24 hours'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.neroxa_lease_group_intent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER group_intent_lease BEFORE INSERT ON private.neroxa_group_order_intents FOR EACH ROW EXECUTE FUNCTION private.neroxa_lease_group_intent();

CREATE TABLE private.neroxa_checkout_reconciliation(
 instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),checkout_key uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('CONFIRMED','FENCED_ABSENT')),order_id uuid REFERENCES public.neroxa_orders(id),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(instance_id,checkout_key),CHECK((outcome='CONFIRMED')=(order_id IS NOT NULL))
);
ALTER TABLE private.neroxa_checkout_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_checkout_reconciliation FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.neroxa_tracking_capabilities (
 order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
 instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at>created_at)
);
ALTER TABLE private.neroxa_tracking_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_tracking_capabilities FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_register_tracking_capability(p_instance_id uuid,p_order_id uuid,p_checkout_key uuid,p_token_sha256 text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted uuid; BEGIN
 IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
 SELECT 1 FROM public.neroxa_orders o JOIN public.neroxa_system_instances i ON i.id=o.instance_id
 WHERE o.id=p_order_id AND o.instance_id=p_instance_id AND o.idempotency_key=p_checkout_key AND i.status='ACTIVE') THEN RAISE EXCEPTION 'Tracking registration denied' USING ERRCODE='42501'; END IF;
 INSERT INTO private.neroxa_tracking_capabilities(order_id,instance_id,token_sha256,expires_at)
 VALUES(p_order_id,p_instance_id,p_token_sha256,clock_timestamp()+interval '24 hours') ON CONFLICT(order_id) DO NOTHING RETURNING order_id INTO inserted;
 RETURN inserted IS NOT NULL;
END $$;

BEGIN;

CREATE TABLE private.neroxa_checkout_quota_counters (
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
  scope text NOT NULL CHECK (scope IN ('store', 'contact')),
  window_start timestamptz NOT NULL,
  identity_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, scope, window_start, identity_hash)
);

ALTER TABLE private.neroxa_checkout_quota_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.neroxa_checkout_quota_counters
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neroxa_checkout_reserve_quota(
  p_instance_id uuid,
  p_contact_fingerprint text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $quota$
DECLARE
  v_current timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_ten_minutes timestamptz;
  v_attempts integer;
BEGIN
  IF p_instance_id IS NULL OR
     p_contact_fingerprint !~ '^[0-9a-f]{64}$' OR
     p_contact_fingerprint IS NULL
  THEN
    RAISE EXCEPTION 'Invalid checkout quota identity' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.neroxa_system_instances i
    WHERE i.id = p_instance_id AND i.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Inactive or unknown store' USING ERRCODE='22023';
  END IF;

  v_minute := to_timestamp(floor(extract(epoch FROM v_current) / 60)::bigint * 60);
  v_ten_minutes := to_timestamp(floor(extract(epoch FROM v_current) / 600)::bigint * 600);

  -- Consistent global-before-contact lock order. INSERT/ON CONFLICT guards
  -- against concurrent overbooking across independent serverless workers.
  INSERT INTO private.neroxa_checkout_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'store', v_minute, 'store-total', 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_checkout_quota_counters.attempts + 1
  WHERE private.neroxa_checkout_quota_counters.attempts < 60
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'Checkout store quota exceeded' USING ERRCODE='PT429';
  END IF;
  v_attempts := NULL;

  INSERT INTO private.neroxa_checkout_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'contact', v_ten_minutes, p_contact_fingerprint, 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_checkout_quota_counters.attempts + 1
  WHERE private.neroxa_checkout_quota_counters.attempts < 5
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- RAISE rolls back both increments in this function transaction.
    RAISE EXCEPTION 'Checkout contact quota exceeded' USING ERRCODE='PT429';
  END IF;
  RETURN true;
END
$quota$;

REVOKE ALL ON FUNCTION public.neroxa_checkout_reserve_quota(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neroxa_checkout_reserve_quota(uuid,text) TO service_role;

DO $gate$
BEGIN
  IF has_function_privilege('anon',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Unsafe checkout quota EXECUTE privileges';
  END IF;
END
$gate$;

COMMIT;
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
CREATE FUNCTION pg_temp.neroxa_release_admitted(text,integer) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1' AND $2=33 $$;
BEGIN;
DO $$ BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',33)
 THEN RAISE EXCEPTION 'Disposable candidate baseline required'; END IF;
END $$;
CREATE FUNCTION public.neroxa_register_buyer_capabilities(
 p_instance_id uuid,p_order_id uuid,p_checkout_key uuid,
 p_tracking_sha256 text,p_amendment_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tracking_inserted boolean; amendment_inserted boolean;
BEGIN
 -- Serialize issuance for the same committed checkout, including concurrent retries.
 PERFORM 1 FROM public.neroxa_orders o
 JOIN public.neroxa_system_instances i ON i.id=o.instance_id
 WHERE o.id=p_order_id AND o.instance_id=p_instance_id
 AND o.idempotency_key=p_checkout_key AND i.status='ACTIVE'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'Buyer registration denied' USING ERRCODE='42501'; END IF;
 tracking_inserted:=public.neroxa_register_tracking_capability(
  p_instance_id,p_order_id,p_checkout_key,p_tracking_sha256);
 amendment_inserted:=public.neroxa_register_order_amendment_capability(
  p_instance_id,p_order_id,p_checkout_key,p_amendment_sha256);
 IF tracking_inserted IS DISTINCT FROM amendment_inserted THEN
  -- Never rotate a prior secret or silently accept an inconsistent older issuance.
  -- Exception rolls back any newly inserted half, keeping prior records intact.
  RAISE EXCEPTION 'Incomplete earlier capability issuance; reconciliation required' USING ERRCODE='55000';
 END IF;
 RETURN tracking_inserted;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)
 TO service_role;
COMMIT;

REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted;
REVOKE ALL ON FUNCTION public.neroxa_register_tracking_capability(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted; GRANT EXECUTE ON FUNCTION public.neroxa_register_tracking_capability(uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role,go03t_untrusted; GRANT EXECUTE ON FUNCTION public.neroxa_register_order_amendment_capability(uuid,uuid,uuid,text) TO service_role;
