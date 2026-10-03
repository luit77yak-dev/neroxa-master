-- Harden Neroxa Master RLS policies and index foreign keys.
-- Auth leaked-password protection remains intentionally unchanged.

begin;

-- Restrict Master data policies to authenticated sessions.
alter policy "neroxa plan products access" on public.neroxa_plan_products to authenticated;
alter policy "neroxa admins insert plan products" on public.neroxa_plan_products to authenticated;
alter policy "neroxa admins update plan products" on public.neroxa_plan_products to authenticated;
alter policy "neroxa admins delete plan products" on public.neroxa_plan_products to authenticated;

alter policy "neroxa products access" on public.neroxa_products to authenticated;
alter policy "neroxa admins insert products" on public.neroxa_products to authenticated;
alter policy "neroxa admins update products" on public.neroxa_products to authenticated;
alter policy "neroxa admins delete products" on public.neroxa_products to authenticated;

alter policy "Platform members can view platform settings" on public.neroxa_platform_settings to authenticated;

drop policy if exists "Admins can manage platform settings" on public.neroxa_platform_settings;
create policy "Admins can insert platform settings"
on public.neroxa_platform_settings
for insert
to authenticated
with check (neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));

create policy "Admins can update platform settings"
on public.neroxa_platform_settings
for update
to authenticated
using (neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]))
with check (neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));

create policy "Admins can delete platform settings"
on public.neroxa_platform_settings
for delete
to authenticated
using (neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::neroxa_platform_role, 'ADMIN'::neroxa_platform_role]));

-- Remove redundant SELECT policies: the existing manage policies already
-- authorize SELECT for the same support roles.
drop policy if exists "neroxa support messages access" on public.neroxa_support_messages;
drop policy if exists "neroxa support tickets access" on public.neroxa_support_tickets;

-- Cover the currently unindexed foreign keys reported by the Supabase advisor.
create index if not exists idx_neroxa_checkout_sessions_organization_id on public.neroxa_checkout_sessions(organization_id);
create index if not exists idx_neroxa_checkout_sessions_plan_id on public.neroxa_checkout_sessions(plan_id);
create index if not exists idx_neroxa_checkout_sessions_subscription_id on public.neroxa_checkout_sessions(subscription_id);
create index if not exists idx_neroxa_client_contacts_client_id on public.neroxa_client_contacts(client_id);
create index if not exists idx_neroxa_contracts_client_id on public.neroxa_contracts(client_id);
create index if not exists idx_neroxa_contracts_proposal_id on public.neroxa_contracts(proposal_id);
create index if not exists idx_neroxa_plan_products_product_id on public.neroxa_plan_products(product_id);
create index if not exists idx_neroxa_platform_settings_updated_by_user_id on public.neroxa_platform_settings(updated_by_user_id);
create index if not exists idx_neroxa_products_system_id on public.neroxa_products(system_id);
create index if not exists idx_neroxa_proposals_client_id on public.neroxa_proposals(client_id);
create index if not exists idx_neroxa_support_messages_author_user_id on public.neroxa_support_messages(author_user_id);
create index if not exists idx_neroxa_support_tickets_created_by_user_id on public.neroxa_support_tickets(created_by_user_id);

commit;
