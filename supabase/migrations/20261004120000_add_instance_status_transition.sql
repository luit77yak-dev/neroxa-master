-- Controlled instance status transitions for Master operations.
-- SUPPORT and ADMIN may operate instance lifecycle without bypassing the
-- provisioning-job lifecycle. ARCHIVED is terminal.

begin;

create or replace function public.transition_neroxa_instance_status(
  p_instance_id uuid,
  p_status public.neroxa_instance_status
)
returns public.neroxa_instance_status
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_instance public.neroxa_system_instances%rowtype;
begin
  if not public.neroxa_has_platform_role(array[
    'SUPER_ADMIN'::public.neroxa_platform_role,
    'ADMIN'::public.neroxa_platform_role,
    'SUPPORT'::public.neroxa_platform_role
  ]) then
    raise exception 'Sem permissão para alterar o status da instância';
  end if;

  select *
    into v_instance
    from public.neroxa_system_instances
   where id = p_instance_id
   for update;

  if not found then
    raise exception 'Instância não encontrada';
  end if;

  if v_instance.status = p_status then
    return v_instance.status;
  end if;

  if v_instance.status = 'ARCHIVED' then
    raise exception 'Uma instância arquivada não pode ter o status alterado';
  end if;

  if v_instance.status = 'PROVISIONING'
     and p_status not in ('ACTIVE', 'SUSPENDED', 'ARCHIVED') then
    raise exception 'Uma instância em provisionamento só pode ficar ativa, suspensa ou arquivada';
  end if;

  if v_instance.status = 'ACTIVE'
     and p_status not in ('SUSPENDED', 'ARCHIVED') then
    raise exception 'Uma instância ativa só pode ser suspensa ou arquivada';
  end if;

  if v_instance.status = 'SUSPENDED'
     and p_status not in ('ACTIVE', 'ARCHIVED') then
    raise exception 'Uma instância suspensa só pode ser reativada ou arquivada';
  end if;

  update public.neroxa_system_instances
     set status = p_status,
         updated_at = now()
   where id = p_instance_id;

  return p_status;
end;
$$;

revoke execute on function public.transition_neroxa_instance_status(uuid, public.neroxa_instance_status) from public, anon;
grant execute on function public.transition_neroxa_instance_status(uuid, public.neroxa_instance_status) to authenticated, service_role;

-- A manual SUSPENDED/ARCHIVED state must not be overwritten by a provisioning
-- job completing later. Only PROVISIONING instances are promoted to ACTIVE.
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
      and status = 'PROVISIONING';
  else
    update public.neroxa_system_instances
    set status = 'PROVISIONING', updated_at = now()
    where id = new.system_instance_id
      and status not in ('ARCHIVED', 'SUSPENDED');
  end if;

  return new;
end;
$$;

commit;
