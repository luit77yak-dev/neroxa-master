create or replace function public.sync_neroxa_instance_from_provisioning_job()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_latest_status public.neroxa_provisioning_status;
begin
  if new.system_instance_id is null then
    return new;
  end if;

  select status into v_latest_status
  from public.neroxa_provisioning_jobs
  where system_instance_id = new.system_instance_id
  order by created_at desc, id desc
  limit 1;

  if v_latest_status = 'COMPLETED' then
    update public.neroxa_system_instances
    set status = 'ACTIVE', updated_at = now()
    where id = new.system_instance_id
      and status not in ('ARCHIVED', 'SUSPENDED');
  else
    update public.neroxa_system_instances
    set status = 'PROVISIONING', updated_at = now()
    where id = new.system_instance_id
      and status not in ('ARCHIVED', 'SUSPENDED');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_neroxa_sync_instance_from_provisioning_job
  on public.neroxa_provisioning_jobs;

create trigger trg_neroxa_sync_instance_from_provisioning_job
after update of status on public.neroxa_provisioning_jobs
for each row
when (old.status is distinct from new.status)
execute function public.sync_neroxa_instance_from_provisioning_job();
