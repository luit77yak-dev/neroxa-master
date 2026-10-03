create unique index if not exists idx_neroxa_system_instances_subscription_id
  on public.neroxa_system_instances(subscription_id)
  where subscription_id is not null;

create or replace function public.prepare_neroxa_implementation_from_subscription(
  p_subscription_id uuid, p_name text, p_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_subscription public.neroxa_subscriptions%rowtype;
  v_plan public.neroxa_plans%rowtype;
  v_instance_id uuid;
begin
  if not public.neroxa_has_platform_role(array['SUPER_ADMIN'::public.neroxa_platform_role,'ADMIN'::public.neroxa_platform_role,'SUPPORT'::public.neroxa_platform_role]) then
    raise exception 'Sem permissão para preparar a implantação';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_slug), '') is null then
    raise exception 'Nome e slug da instância são obrigatórios';
  end if;
  select * into v_subscription from public.neroxa_subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'Assinatura não encontrada'; end if;
  if v_subscription.status <> 'ACTIVE' then raise exception 'Somente assinaturas ativas podem iniciar uma implantação'; end if;
  select * into v_plan from public.neroxa_plans where id = v_subscription.plan_id;
  if not found then raise exception 'Plano da assinatura não encontrado'; end if;
  if not v_plan.active then raise exception 'O plano da assinatura está inativo'; end if;
  if v_plan.commercial_model <> 'SUBSCRIPTION' then raise exception 'Somente assinaturas recorrentes podem iniciar este fluxo de implantação'; end if;
  if v_plan.system_id is null then raise exception 'O plano não possui um sistema-base configurado'; end if;
  select id into v_instance_id from public.neroxa_system_instances where subscription_id = p_subscription_id limit 1;
  if v_instance_id is not null then return v_instance_id; end if;
  insert into public.neroxa_system_instances (organization_id,plan_id,subscription_id,system_id,name,slug,system_type,status)
  values (v_subscription.organization_id,v_subscription.plan_id,p_subscription_id,v_plan.system_id,trim(p_name),lower(trim(p_slug)),coalesce(v_plan.slug,'CUSTOM'),'PROVISIONING')
  returning id into v_instance_id;
  insert into public.neroxa_provisioning_jobs (organization_id,system_instance_id,action,status,payload)
  values (v_subscription.organization_id,v_instance_id,'PROVISION_INSTANCE','PENDING',
    jsonb_build_object('subscription_id',p_subscription_id,'plan_id',v_subscription.plan_id,'system_id',v_plan.system_id,'instance_id',v_instance_id));
  return v_instance_id;
end;
$$;
revoke execute on function public.prepare_neroxa_implementation_from_subscription(uuid,text,text) from public;
grant execute on function public.prepare_neroxa_implementation_from_subscription(uuid,text,text) to authenticated;
