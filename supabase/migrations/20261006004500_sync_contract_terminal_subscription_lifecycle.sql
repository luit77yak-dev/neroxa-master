create or replace function public.sync_neroxa_contract_terminal_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('TERMINATED','EXPIRED') and old.status is distinct from new.status then
    update public.neroxa_subscriptions
    set status = 'CANCELLED',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where contract_id = new.id
      and status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE');

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
$$;

drop trigger if exists trg_sync_neroxa_contract_terminal_lifecycle on public.neroxa_contracts;
create trigger trg_sync_neroxa_contract_terminal_lifecycle
after update of status on public.neroxa_contracts
for each row
execute function public.sync_neroxa_contract_terminal_lifecycle();
