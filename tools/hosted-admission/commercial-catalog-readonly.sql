-- NEROXA V1 / F02 HOSTED_PREFLIGHT: MCP catalog reconnaissance only
-- READ-ONLY. No secrets, no personal rows, no migrations, no temporary grants.
-- A positive result here is NOT proof of TLS/libpq, server identity or SQL_RELEASE admission.
-- This query is safe to run before and after a release; fail-closed state is expected now.
WITH tables AS (
 SELECT
  count(*) FILTER (WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS public_tables,
  count(*) FILTER (WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) AS public_rls_tables,
  count(*) FILTER (WHERE n.nspname='neroxa_v1' AND c.relkind IN ('r','p')) AS new_release_tables
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
), funcs AS (
 SELECT
  count(*) FILTER (WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')) AS anon_executable_definers,
  count(*) FILTER (WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')) AS authenticated_executable_definers,
  count(*) FILTER (WHERE n.nspname='public' AND p.proname IN (
    'create_public_order','get_public_order_status','append_public_order_items_with_payment'
  )) AS legacy_checkout_tracking_rpcs,
  count(*) FILTER (WHERE n.nspname='public' AND p.proname IN (
    'neroxa_register_buyer_capabilities','neroxa_register_tracking_capability',
    'neroxa_register_order_amendment_capability'
  )) AS capability_registration_functions
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
), roles AS (
 SELECT count(*) FILTER (WHERE rolname LIKE 'neroxa%') AS candidate_neroxa_roles FROM pg_roles
), business AS (
 SELECT
 (SELECT count(*) FROM public.neroxa_organizations) AS organizations,
 (SELECT count(*) FROM public.neroxa_orders) AS orders,
 (SELECT count(*) FROM public.neroxa_storefront_settings) AS storefront_settings,
 (SELECT count(*) FROM public.neroxa_subscriptions) AS subscriptions,
 (SELECT count(*) FROM public.neroxa_contracts) AS contracts,
 (SELECT count(*) FROM public.neroxa_plans) AS base_plans,
 (SELECT count(*) FROM public.neroxa_platform_members) AS platform_members
)
SELECT
 current_database() AS database_name,
 current_setting('server_version') AS postgres_version,
 tables.*, funcs.*, roles.*, business.*,
 -- These are explicit placeholders; this SQL connection cannot attest its own Supabase project identity.
 false AS tls_libpq_host_identity_verified,
 false AS sql_release_admitted,
 false AS cloudflare_hosted_server_admitted
FROM tables, funcs, roles, business;
