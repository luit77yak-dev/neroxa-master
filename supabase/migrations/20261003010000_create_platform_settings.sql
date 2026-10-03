create table if not exists public.neroxa_platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.neroxa_platform_settings enable row level security;

drop policy if exists "Platform members can view platform settings" on public.neroxa_platform_settings;
create policy "Platform members can view platform settings"
on public.neroxa_platform_settings
for select
using (public.neroxa_is_platform_member());

drop policy if exists "Admins can manage platform settings" on public.neroxa_platform_settings;
create policy "Admins can manage platform settings"
on public.neroxa_platform_settings
for all
using (public.neroxa_has_platform_role(array['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]))
with check (public.neroxa_has_platform_role(array['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]));

insert into public.neroxa_platform_settings (key, value)
values
  ('platform', '{"name":"Neroxa","timezone":"America/Sao_Paulo","currency":"BRL","maintenance_mode":false}'::jsonb),
  ('security', '{"session_timeout_minutes":480,"require_reauthentication_for_sensitive_actions":true}'::jsonb)
on conflict (key) do nothing;
