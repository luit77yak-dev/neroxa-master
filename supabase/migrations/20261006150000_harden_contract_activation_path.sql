-- Harden contract activation: only the explicit activation RPC may move a DRAFT contract to ACTIVE.
-- The RPC sets a transaction-local flag immediately before the status update.
-- Direct table updates remain blocked even when the contract is fully signed.

create or replace function public.activate_neroxa_contract_and_subscription(p_contract_id uuid)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
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

  select * into v_contract
  from public.neroxa_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if v_contract.status <> 'DRAFT' then
    raise exception 'Somente contratos em rascunho podem ser ativados';
  end if;

  if v_contract.signature_status <> 'SIGNED' then
    raise exception 'O contrato precisa estar assinado pelas duas partes antes da ativação';
  end if;

  if v_contract.proposal_id is not null and not exists (
    select 1
    from public.neroxa_proposals p
    where p.id = v_contract.proposal_id
      and p.status = 'ACCEPTED'
  ) then
    raise exception 'O contrato só pode ser ativado após a aceitação da proposta vinculada';
  end if;

  if v_contract.commercial_model = 'SUBSCRIPTION' then
    if v_contract.plan_id is null then
      raise exception 'Contrato de assinatura precisa estar vinculado a um plano';
    end if;

    if v_contract.billing_period not in ('MONTHLY','YEARLY') then
      raise exception 'Contrato de assinatura precisa ter periodicidade mensal ou anual';
    end if;

    if v_contract.recurring_value is null or v_contract.recurring_value <= 0 then
      raise exception 'Contrato de assinatura precisa ter valor recorrente válido';
    end if;

    select s.id
    into v_existing
    from public.neroxa_subscriptions s
    where s.contract_id = p_contract_id
    limit 1;

    if v_existing is not null then
      perform set_config('neroxa.allow_contract_activation', 'true', true);

      update public.neroxa_contracts
      set status = 'ACTIVE',
          started_at = coalesce(started_at, current_date)
      where id = p_contract_id;

      return v_existing;
    end if;

    if exists (
      select 1
      from public.neroxa_subscriptions s
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

    insert into public.neroxa_subscriptions (
      organization_id,
      contract_id,
      plan_id,
      status,
      price,
      started_at,
      current_period_start,
      current_period_end,
      gateway_provider,
      gateway_status
    ) values (
      v_contract.client_id,
      p_contract_id,
      v_contract.plan_id,
      'TRIAL',
      v_contract.recurring_value,
      now(),
      v_period_start,
      v_period_end,
      null,
      'NOT_CONFIGURED'
    )
    returning id into v_subscription_id;

    insert into public.neroxa_billing_records (
      organization_id,
      subscription_id,
      reference_month,
      amount,
      due_date,
      status,
      payment_method,
      external_id,
      gateway_provider,
      gateway_payment_id,
      gateway_status,
      gateway_event_id
    ) values (
      v_contract.client_id,
      v_subscription_id,
      v_reference_month,
      v_contract.recurring_value,
      v_period_start,
      'PENDING',
      null,
      null,
      null,
      null,
      'PENDING',
      null
    );

    perform set_config('neroxa.allow_contract_activation', 'true', true);

    update public.neroxa_contracts
    set status = 'ACTIVE',
        started_at = coalesce(started_at, current_date)
    where id = p_contract_id;

    return v_subscription_id;
  end if;

  perform set_config('neroxa.allow_contract_activation', 'true', true);

  update public.neroxa_contracts
  set status = 'ACTIVE',
      started_at = coalesce(started_at, current_date)
  where id = p_contract_id;

  return null;
end;
$$;

create or replace function public.validate_neroxa_contract_status_transition()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'DRAFT' and new.status = 'ACTIVE' then
    if current_setting('neroxa.allow_contract_activation', true) is distinct from 'true' then
      raise exception 'Ativação de contrato deve ocorrer exclusivamente pelo fluxo oficial de ativação';
    end if;
  elsif old.status = 'DRAFT' and new.status not in ('DRAFT','ACTIVE') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status = 'ACTIVE' and new.status not in ('SUSPENDED','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status = 'SUSPENDED' and new.status not in ('ACTIVE','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  elsif old.status in ('TERMINATED','EXPIRED') then
    raise exception 'Contract % is final and cannot transition to %', old.status, new.status;
  end if;

  if new.status = 'ACTIVE' and new.signature_status is distinct from 'SIGNED' then
    raise exception 'Contrato só pode ser ativado após as duas assinaturas';
  end if;

  return new;
end;
$$;
