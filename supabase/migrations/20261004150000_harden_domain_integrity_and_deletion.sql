-- Domain integrity and safe deletion rules
-- One primary domain per instance, primary domains cannot be disabled,
-- and deleting a domain requires it to be non-primary and disabled.

create unique index if not exists neroxa_system_domains_one_primary_per_instance
  on public.neroxa_system_domains (system_instance_id)
  where is_primary = true;

alter table public.neroxa_system_domains
  drop constraint if exists neroxa_system_domains_primary_not_disabled;

alter table public.neroxa_system_domains
  add constraint neroxa_system_domains_primary_not_disabled
  check (not (is_primary and status = 'DISABLED'));

alter table public.neroxa_system_domains
  drop constraint if exists neroxa_system_domains_domain_format;

alter table public.neroxa_system_domains
  add constraint neroxa_system_domains_domain_format
  check (
    length(trim(domain)) > 0
    and domain = lower(domain)
    and position(' ' in domain) = 0
    and position('/' in domain) = 0
    and position('://' in domain) = 0
  );

create or replace function public.reset_neroxa_domain_verification_on_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if new.domain is distinct from old.domain then
    new.status := 'PENDING'::public.neroxa_domain_status;
    new.verified_at := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_neroxa_system_domains_reset_verification on public.neroxa_system_domains;

create trigger trg_neroxa_system_domains_reset_verification
before update on public.neroxa_system_domains
for each row
execute function public.reset_neroxa_domain_verification_on_change();

drop policy if exists "neroxa admins delete domains" on public.neroxa_system_domains;

create policy "neroxa admins delete disabled non-primary domains"
on public.neroxa_system_domains
for delete
to authenticated
using (
  is_primary = false
  and status = 'DISABLED'::public.neroxa_domain_status
  and public.neroxa_has_platform_role(
    array[
      'SUPER_ADMIN'::public.neroxa_platform_role,
      'ADMIN'::public.neroxa_platform_role,
      'SUPPORT'::public.neroxa_platform_role
    ]
  )
);
