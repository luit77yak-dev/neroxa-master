-- Harden public contract signing data access.
-- Public customer flows remain available only through the dedicated RPCs.
-- Direct table access is denied to anon/authenticated except admin read access.

alter table public.neroxa_contract_signatures enable row level security;

revoke all on table public.neroxa_contract_signatures from anon, authenticated;
grant select on table public.neroxa_contract_signatures to authenticated;

drop policy if exists "neroxa contract signatures admin read" on public.neroxa_contract_signatures;
create policy "neroxa contract signatures admin read"
on public.neroxa_contract_signatures
for select
to authenticated
using (
  public.neroxa_has_platform_role(
    array['SUPER_ADMIN','ADMIN']::public.neroxa_platform_role[]
  )
);

-- Pin SECURITY DEFINER functions to the public schema and remove pg_temp
-- from the function search path.
alter function public.get_neroxa_public_contract(uuid)
  set search_path = public;
alter function public.send_neroxa_contract_for_signature(uuid)
  set search_path = public;
alter function public.sign_neroxa_contract(uuid, text, text)
  set search_path = public;
alter function public.sign_neroxa_contract_as_customer(uuid, text, text, boolean)
  set search_path = public;

-- Internal contract-management RPCs are authenticated/admin operations.
revoke execute on function public.send_neroxa_contract_for_signature(uuid)
  from public, anon;
grant execute on function public.send_neroxa_contract_for_signature(uuid)
  to authenticated;

revoke execute on function public.sign_neroxa_contract(uuid, text, text)
  from public, anon;
grant execute on function public.sign_neroxa_contract(uuid, text, text)
  to authenticated;

revoke execute on function public.activate_neroxa_contract_and_subscription(uuid)
  from public, anon;
grant execute on function public.activate_neroxa_contract_and_subscription(uuid)
  to authenticated;
