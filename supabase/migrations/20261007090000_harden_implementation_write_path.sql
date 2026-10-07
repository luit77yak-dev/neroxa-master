-- Harden implementation writes so instances/jobs can only be created
-- through the official subscription preparation / retry RPCs.

create or replace function public.guard_neroxa_implementation_write_path()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('neroxa.implementation_write_path', true) is distinct from 'official' then
    raise exception 'Escrita de implantação deve ocorrer exclusivamente pelo fluxo oficial';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_neroxa_system_instance_insert on public.neroxa_system_instances;
create trigger trg_guard_neroxa_system_instance_insert
before insert on public.neroxa_system_instances
for each row execute function public.guard_neroxa_implementation_write_path();

drop trigger if exists trg_guard_neroxa_provisioning_job_insert on public.neroxa_provisioning_jobs;
create trigger trg_guard_neroxa_provisioning_job_insert
before insert on public.neroxa_provisioning_jobs
for each row execute function public.guard_neroxa_implementation_write_path();

create or replace function public.prepare_neroxa_implementation_from_subscription(
  p_subscription_id uuid, p_name text, p_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subscription public.neroxa_subscriptions%rowtype;
  v_plan public.neroxa_plans%rowtype;
  v_instance public.neroxa_system_instances%rowtype;
  v_job public.neroxa_provisioning_jobs%rowtype;
  v_instance_id uuid;
begin
  if not public.neroxa_has_platform_role(
    array[
      'SUPER_ADMIN'::public.neroxa_platform_role,
      'ADMIN'::public.neroxa_platform_role,
      'SUPPORT'::public.neroxa_platform_role
    ]
  ) then
    raise exception 'Sem permissão para preparar a implantação';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_slug), '') is null then
    raise exception 'Nome e slug da instância são obrigatórios';
  end if;

  select * into v_subscription
  from public.neroxa_subscriptions
  where id = p_subscription_id
  for update;

  if not found then raise exception 'Assinatura não encontrada'; end if;
  if v_subscription.status <> 'ACTIVE' then
    raise exception 'Somente assinaturas ativas podem iniciar uma implantação';
  end if;

  select * into v_plan
  from public.neroxa_plans
  where id = v_subscription.plan_id;

  if not found then raise exception 'Plano da assinatura não encontrado'; end if;
  if not v_plan.active then raise exception 'O plano da assinatura está inativo'; end if;
  if v_plan.commercial_model <> 'SUBSCRIPTION' then
    raise exception 'Somente assinaturas recorrentes podem iniciar este fluxo de implantação';
  end if;
  if v_plan.system_id is null then raise exception 'O plano não possui um sistema-base configurado'; end if;

  select * into v_instance
  from public.neroxa_system_instances
  where subscription_id = p_subscription_id
  limit 1;

  if found then
    if v_instance.status = 'ARCHIVED' then
      raise exception 'A implantação existente está arquivada e não pode ser reutilizada';
    end if;
    if v_instance.status = 'ACTIVE' then return v_instance.id; end if;
    if v_instance.status = 'SUSPENDED' then
      raise exception 'A implantação existente está suspensa e precisa ser reativada antes de uma nova preparação';
    end if;

    select * into v_job
    from public.neroxa_provisioning_jobs
    where system_instance_id = v_instance.id
    order by created_at desc, id desc
    limit 1;

    if found and v_job.status in ('PENDING','RUNNING') then return v_instance.id; end if;

    perform set_config('neroxa.implementation_write_path', 'official', true);

    insert into public.neroxa_provisioning_jobs
      (organization_id, system_instance_id, action, status, payload)
    values (
      v_subscription.organization_id,
      v_instance.id,
      'PROVISION_INSTANCE',
      'PENDING',
      jsonb_build_object(
        'subscription_id', p_subscription_id,
        'plan_id', v_subscription.plan_id,
        'system_id', v_plan.system_id,
        'instance_id', v_instance.id,
        'retry', true
      )
    );

    return v_instance.id;
  end if;

  perform set_config('neroxa.implementation_write_path', 'official', true);

  insert into public.neroxa_system_instances
    (organization_id, plan_id, subscription_id, system_id, name, slug, system_type, status)
  values (
    v_subscription.organization_id,
    v_subscription.plan_id,
    p_subscription_id,
    v_plan.system_id,
    trim(p_name),
    lower(trim(p_slug)),
    coalesce(v_plan.slug, 'CUSTOM'),
    'PROVISIONING'
  )
  returning id into v_instance_id;

  insert into public.neroxa_provisioning_jobs
    (organization_id, system_instance_id, action, status, payload)
  values (
    v_subscription.organization_id,
    v_instance_id,
    'PROVISION_INSTANCE',
    'PENDING',
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'plan_id', v_subscription.plan_id,
      'system_id', v_plan.system_id,
      'instance_id', v_instance_id,
      'retry', false
    )
  );

  return v_instance_id;
end;
$$;

create or replace function public.retry_neroxa_provisioning_job(p_job_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job public.neroxa_provisioning_jobs%rowtype;
  v_instance public.neroxa_system_instances%rowtype;
  v_existing uuid;
  v_new_job uuid;
begin
  if not public.neroxa_has_platform_role(
    array[
      'SUPER_ADMIN'::public.neroxa_platform_role,
      'ADMIN'::public.neroxa_platform_role,
      'SUPPORT'::public.neroxa_platform_role
    ]
  ) then
    raise exception 'Sem permissão para tentar novamente o provisionamento';
  end if;

  select * into v_job
  from public.neroxa_provisioning_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'Job de provisionamento não encontrado'; end if;
  if v_job.status not in ('FAILED','CANCELLED') then
    raise exception 'Somente jobs falhos ou cancelados podem ser tentados novamente';
  end if;

  if v_job.system_instance_id is null then
    raise exception 'O job não está vinculado a uma instância';
  end if;

  select * into v_instance
  from public.neroxa_system_instances
  where id = v_job.system_instance_id
  for update;

  if not found then raise exception 'Instância do job não encontrada'; end if;
  if v_instance.status = 'ARCHIVED' then
    raise exception 'Uma instância arquivada não pode receber novo provisionamento';
  end if;

  select id into v_existing
  from public.neroxa_provisioning_jobs
  where system_instance_id = v_instance.id
    and status in ('PENDING','RUNNING')
    and id <> v_job.id
  order by created_at desc, id desc
  limit 1;

  if v_existing is not null then
    raise exception 'Já existe um job de provisionamento ativo para esta instância';
  end if;

  perform set_config('neroxa.implementation_write_path', 'official', true);

  insert into public.neroxa_provisioning_jobs
    (organization_id, system_instance_id, action, status, payload)
  values (
    v_job.organization_id,
    v_job.system_instance_id,
    v_job.action,
    'PENDING',
    jsonb_set(coalesce(v_job.payload, '{}'::jsonb), '{retry}', 'true'::jsonb, true)
  )
  returning id into v_new_job;

  return v_new_job;
end;
$$;

revoke execute on function public.prepare_neroxa_implementation_from_subscription(uuid,text,text) from public, anon;
grant execute on function public.prepare_neroxa_implementation_from_subscription(uuid,text,text) to authenticated, service_role;

revoke execute on function public.retry_neroxa_provisioning_job(uuid) from public, anon;
grant execute on function public.retry_neroxa_provisioning_job(uuid) to authenticated, service_role;
