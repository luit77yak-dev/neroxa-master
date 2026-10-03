alter table public.neroxa_subscriptions
  add column if not exists contract_id uuid references public.neroxa_contracts(id);

create unique index if not exists idx_neroxa_subscriptions_contract_id
  on public.neroxa_subscriptions(contract_id)
  where contract_id is not null;

create index if not exists idx_neroxa_subscriptions_organization_id
  on public.neroxa_subscriptions(organization_id);
-- Prevent concurrent non-terminal subscriptions for the same organization and plan.
-- The partial unique index makes the database the final concurrency guard;
-- the activation RPC remains responsible for the friendly business error.
create unique index if not exists idx_neroxa_subscriptions_active_org_plan
  on public.neroxa_subscriptions(organization_id, plan_id)
  where status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE');


create or replace function public.activate_neroxa_contract_and_subscription(p_contract_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_existing uuid;
  v_subscription_id uuid;
  v_period_start date := current_date;
  v_period_end date;
  v_reference_month date := date_trunc('month', current_date)::date;
begin
  if not public.neroxa_has_platform_role(array['SUPER_ADMIN'::public.neroxa_platform_role, 'ADMIN'::public.neroxa_platform_role]) then
    raise exception 'Sem permissão para ativar contratos comerciais';
  end if;

  select *
    into v_contract
  from public.neroxa_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if v_contract.status <> 'DRAFT' then
    raise exception 'Somente contratos em rascunho podem ser ativados';
  end if;

  if v_contract.proposal_id is not null
     and not exists (
       select 1
       from public.neroxa_proposals p
       where p.id = v_contract.proposal_id
         and p.status = 'ACCEPTED'
     ) then
    raise exception 'O contrato só pode ser ativado após a aceitação da proposta vinculada';
  end if;

  update public.neroxa_contracts
  set status = 'ACTIVE', started_at = current_date, signed_at = now()
  where id = p_contract_id;

  if v_contract.commercial_model = 'SUBSCRIPTION' then
    if v_contract.plan_id is null then
      raise exception 'Contrato de assinatura precisa estar vinculado a um plano';
    end if;
    if v_contract.billing_period not in ('MONTHLY', 'YEARLY') then
      raise exception 'Contrato de assinatura precisa ter periodicidade mensal ou anual';
    end if;
    if v_contract.recurring_value is null or v_contract.recurring_value <= 0 then
      raise exception 'Contrato de assinatura precisa ter valor recorrente válido';
    end if;

    select s.id into v_existing
    from public.neroxa_subscriptions s
    where s.contract_id = p_contract_id
    limit 1;

    if v_existing is not null then
      return v_existing;
    end if;

    if exists (
      select 1 from public.neroxa_subscriptions s
      where s.organization_id = v_contract.client_id
        and s.plan_id = v_contract.plan_id
        and s.status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE')
    ) then
      raise exception 'Este cliente já possui uma assinatura não encerrada para este plano';
    end if;

    if v_contract.billing_period = 'YEARLY' then
      v_period_end := (v_period_start + interval '1 year')::date;
    else
      v_period_end := (v_period_start + interval '1 month')::date;
    end if;

    begin
      insert into public.neroxa_subscriptions (
        organization_id, contract_id, plan_id, status, price, started_at,
        current_period_start, current_period_end, gateway_provider, gateway_status
      )
      values (
        v_contract.client_id, p_contract_id, v_contract.plan_id, 'TRIAL',
        v_contract.recurring_value, now(), v_period_start, v_period_end,
        null, 'NOT_CONFIGURED'
      )
      returning id into v_subscription_id;
    exception
      when unique_violation then
        raise exception 'Este cliente já possui uma assinatura não encerrada para este plano';
    end;

    insert into public.neroxa_billing_records (
      organization_id, subscription_id, reference_month, amount, due_date,
      status, payment_method, external_id, gateway_provider,
      gateway_payment_id, gateway_status, gateway_event_id
    )
    values (
      v_contract.client_id, v_subscription_id, v_reference_month,
      v_contract.recurring_value, v_period_start, 'PENDING', null, null,
      null, null, 'PENDING', null
    );

    return v_subscription_id;
  end if;

  return null;
end;
$$;

revoke execute on function public.activate_neroxa_contract_and_subscription(uuid) from public;
grant execute on function public.activate_neroxa_contract_and_subscription(uuid) to authenticated;
