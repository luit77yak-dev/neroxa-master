create or replace function public.update_neroxa_provisioning_job_status(
  p_job_id uuid,
  p_status public.neroxa_provisioning_status,
  p_error_message text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.neroxa_provisioning_jobs%rowtype;
  v_latest_status public.neroxa_provisioning_status;
  v_now timestamptz := now();
begin
  if not public.neroxa_has_platform_role(array[
    'SUPER_ADMIN'::public.neroxa_platform_role,
    'ADMIN'::public.neroxa_platform_role,
    'SUPPORT'::public.neroxa_platform_role
  ]) then
    raise exception 'Sem permissão para atualizar o job de implantação';
  end if;

  select *
    into v_job
    from public.neroxa_provisioning_jobs
   where id = p_job_id
   for update;

  if not found then
    raise exception 'Job de implantação não encontrado';
  end if;

  if v_job.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    raise exception 'O job de implantação já foi encerrado';
  end if;

  if v_job.status = 'PENDING' and p_status not in ('RUNNING', 'FAILED', 'CANCELLED') then
    raise exception 'Um job pendente só pode iniciar, falhar ou ser cancelado';
  end if;

  if v_job.status = 'RUNNING' and p_status not in ('COMPLETED', 'FAILED', 'CANCELLED') then
    raise exception 'Um job em execução só pode concluir, falhar ou ser cancelado';
  end if;

  if v_job.system_instance_id is not null then
    perform 1
      from public.neroxa_system_instances
     where id = v_job.system_instance_id
     for update;

    if not found then
      raise exception 'Instância da implantação não encontrada';
    end if;
  end if;

  update public.neroxa_provisioning_jobs
     set status = p_status,
         error_message = case
           when p_status = 'FAILED' then nullif(trim(coalesce(p_error_message, '')), '')
           else null
         end,
         started_at = case
           when p_status = 'RUNNING' then coalesce(started_at, v_now)
           else started_at
         end,
         completed_at = case
           when p_status in ('COMPLETED', 'FAILED', 'CANCELLED') then coalesce(completed_at, v_now)
           else completed_at
         end
   where id = p_job_id;

  if v_job.system_instance_id is null then
    return;
  end if;

  select status
    into v_latest_status
    from public.neroxa_provisioning_jobs
   where system_instance_id = v_job.system_instance_id
   order by created_at desc, id desc
   limit 1;

  if v_latest_status = 'COMPLETED' then
    update public.neroxa_system_instances
       set status = 'ACTIVE',
           updated_at = v_now
     where id = v_job.system_instance_id
       and status <> 'ARCHIVED';
  else
    update public.neroxa_system_instances
       set status = 'PROVISIONING',
           updated_at = v_now
     where id = v_job.system_instance_id
       and status not in ('ARCHIVED', 'SUSPENDED');
  end if;
end;
$$;

revoke execute on function public.update_neroxa_provisioning_job_status(uuid, public.neroxa_provisioning_status, text) from public;
grant execute on function public.update_neroxa_provisioning_job_status(uuid, public.neroxa_provisioning_status, text) to authenticated;
