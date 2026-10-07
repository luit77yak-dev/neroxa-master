-- Require AAL2 for authenticated platform access and role checks.
-- Public customer/proposal flows do not use these helpers and remain unchanged.
create or replace function public.neroxa_is_platform_member()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.neroxa_platform_members m
      where m.user_id = (select auth.uid())
        and m.active
    );
$$;

create or replace function public.neroxa_has_platform_role(p_roles public.neroxa_platform_role[])
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal2') = 'aal2', false)
    and exists (
      select 1
      from public.neroxa_platform_members m
      where m.user_id = (select auth.uid())
        and m.active
        and m.role = any(p_roles)
    );
$$;
