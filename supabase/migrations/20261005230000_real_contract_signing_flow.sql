-- Real two-party electronic contract signing flow.
-- Keeps the existing commercial lifecycle, but separates signing from activation.

alter table public.neroxa_contracts
  add column if not exists signature_status text not null default 'NOT_SENT',
  add column if not exists public_signature_token uuid default gen_random_uuid(),
  add column if not exists signature_requested_at timestamptz,
  add column if not exists customer_signer_name text,
  add column if not exists customer_signer_document text,
  add column if not exists customer_signed_at timestamptz,
  add column if not exists neroxa_signer_user_id uuid,
  add column if not exists neroxa_signer_name text,
  add column if not exists neroxa_signer_role text,
  add column if not exists neroxa_signed_at timestamptz,
  add column if not exists issued_at timestamptz,
  add column if not exists term_months integer;

update public.neroxa_contracts
set public_signature_token = gen_random_uuid()
where public_signature_token is null;

alter table public.neroxa_contracts
  alter column public_signature_token set not null;

create unique index if not exists uq_neroxa_contracts_public_signature_token
  on public.neroxa_contracts(public_signature_token);

alter table public.neroxa_contracts
  drop constraint if exists neroxa_contracts_signature_status_check;

alter table public.neroxa_contracts
  add constraint neroxa_contracts_signature_status_check
  check (signature_status in (
    'NOT_SENT',
    'PENDING_CUSTOMER',
    'PENDING_NEROXA',
    'SIGNED',
    'DECLINED',
    'CANCELLED'
  ));

-- Existing records are drafts. Keep them unsent until explicitly sent.
update public.neroxa_contracts
set signature_status = 'NOT_SENT'
where status = 'DRAFT' and signature_status is null;

create table if not exists public.neroxa_contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.neroxa_contracts(id) on delete cascade,
  party text not null check (party in ('CUSTOMER','NEROXA')),
  signer_user_id uuid,
  signer_name text not null,
  signer_document text,
  signer_role text,
  signed_at timestamptz not null default now(),
  contract_version integer not null,
  signature_method text not null default 'ELECTRONIC_ACCEPTANCE',
  created_at timestamptz not null default now()
);

create unique index if not exists uq_neroxa_contract_signatures_party_version
  on public.neroxa_contract_signatures(contract_id, party, contract_version);

create index if not exists idx_neroxa_contract_signatures_contract_id
  on public.neroxa_contract_signatures(contract_id);

alter table public.neroxa_contracts enable row level security;
alter table public.neroxa_contract_signatures enable row level security;

-- Replace the old status trigger with the signed-before-active lifecycle.
create or replace function public.validate_neroxa_contract_status_transition()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'DRAFT' and new.status not in ('DRAFT','ACTIVE') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  end if;

  if old.status = 'ACTIVE' and new.status not in ('SUSPENDED','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  end if;

  if old.status = 'SUSPENDED' and new.status not in ('ACTIVE','TERMINATED','EXPIRED') then
    raise exception 'Invalid contract transition: % -> %', old.status, new.status;
  end if;

  if old.status in ('TERMINATED','EXPIRED') then
    raise exception 'Contract % is final and cannot transition to %', old.status, new.status;
  end if;

  if new.status = 'ACTIVE' and (
    new.signature_status is distinct from 'SIGNED'
  ) then
    raise exception 'Contrato só pode ser ativado após as duas assinaturas';
  end if;

  return new;
end;
$$;

-- Commercial terms remain immutable after activation/termination/expiry and now also after signing.
create or replace function public.prevent_neroxa_contract_commercial_change()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if old.status in ('ACTIVE','SUSPENDED','TERMINATED','EXPIRED')
     or old.signature_status = 'SIGNED' then
    if new.client_id is distinct from old.client_id
      or new.proposal_id is distinct from old.proposal_id
      or new.plan_id is distinct from old.plan_id
      or new.system_id is distinct from old.system_id
      or new.commercial_model is distinct from old.commercial_model
      or new.billing_period is distinct from old.billing_period
      or new.recurring_value is distinct from old.recurring_value
      or new.setup_value is distinct from old.setup_value
      or new.maintenance_value is distinct from old.maintenance_value
      or new.currency is distinct from old.currency
      or new.version is distinct from old.version
      or new.title is distinct from old.title
      or new.contract_number is distinct from old.contract_number then
      raise exception 'Commercial terms of a signed/contracted contract are immutable';
    end if;
  end if;
  return new;
end;
$$;

-- Public read: exposes only the document data needed for signing, never internal IDs/documents.
create or replace function public.get_neroxa_public_contract(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_client public.neroxa_organizations%rowtype;
begin
  select * into v_contract
  from public.neroxa_contracts
  where public_signature_token = p_token
    and signature_status in ('PENDING_CUSTOMER','PENDING_NEROXA','SIGNED')
  limit 1;

  if not found then
    raise exception 'Contrato não encontrado, indisponível ou já encerrado';
  end if;

  select * into v_client
  from public.neroxa_organizations
  where id = v_contract.client_id
  limit 1;

  return jsonb_build_object(
    'id', v_contract.id,
    'contract_number', v_contract.contract_number,
    'title', v_contract.title,
    'status', v_contract.status,
    'signature_status', v_contract.signature_status,
    'version', v_contract.version,
    'commercial_model', v_contract.commercial_model,
    'billing_period', v_contract.billing_period,
    'recurring_value', v_contract.recurring_value,
    'setup_value', v_contract.setup_value,
    'maintenance_value', v_contract.maintenance_value,
    'currency', v_contract.currency,
    'issued_at', v_contract.issued_at,
    'term_months', v_contract.term_months,
    'started_at', v_contract.started_at,
    'customer_name', coalesce(v_client.trade_name, v_client.legal_name),
    'customer_signed_at', v_contract.customer_signed_at,
    'neroxa_signed_at', v_contract.neroxa_signed_at
  );
end;
$$;

-- Customer signature: public token + explicit confirmation. Idempotent for the same contract/version.
create or replace function public.sign_neroxa_contract_as_customer(
  p_token uuid,
  p_signer_name text,
  p_signer_document text,
  p_confirmed boolean
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_name text := btrim(coalesce(p_signer_name, ''));
  v_document text := nullif(btrim(coalesce(p_signer_document, '')), '');
begin
  if not p_confirmed then
    raise exception 'É necessário confirmar a leitura e concordância com o contrato';
  end if;

  if length(v_name) < 3 then
    raise exception 'Informe o nome completo do responsável pela assinatura';
  end if;

  select * into v_contract
  from public.neroxa_contracts
  where public_signature_token = p_token
  for update;

  if not found then
    raise exception 'Link de assinatura inválido ou expirado';
  end if;

  if v_contract.signature_status = 'PENDING_NEROXA' or v_contract.signature_status = 'SIGNED' then
    return true;
  end if;

  if v_contract.signature_status <> 'PENDING_CUSTOMER' then
    raise exception 'Este contrato não está aguardando assinatura do cliente';
  end if;

  if exists (
    select 1 from public.neroxa_contract_signatures
    where contract_id = v_contract.id
      and party = 'CUSTOMER'
      and contract_version = v_contract.version
  ) then
    return true;
  end if;

  insert into public.neroxa_contract_signatures (
    contract_id, party, signer_name, signer_document,
    signed_at, contract_version
  ) values (
    v_contract.id, 'CUSTOMER', v_name, v_document,
    now(), v_contract.version
  );

  update public.neroxa_contracts
  set
    signature_status = 'PENDING_NEROXA',
    customer_signer_name = v_name,
    customer_signer_document = v_document,
    customer_signed_at = now()
  where id = v_contract.id;

  return true;
end;
$$;

-- Neroxa signature: authenticated Master administrator only.
create or replace function public.sign_neroxa_contract(
  p_contract_id uuid,
  p_signer_name text,
  p_signer_role text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_name text := btrim(coalesce(p_signer_name, ''));
  v_role text := btrim(coalesce(p_signer_role, ''));
begin
  if not public.neroxa_has_platform_role(array['SUPER_ADMIN'::public.neroxa_platform_role, 'ADMIN'::public.neroxa_platform_role]) then
    raise exception 'Sem permissão para assinar contratos em nome da Neroxa';
  end if;

  if length(v_name) < 3 then
    raise exception 'Informe o nome do responsável pela Neroxa';
  end if;

  if length(v_role) < 2 then
    raise exception 'Informe o cargo do responsável pela Neroxa';
  end if;

  select * into v_contract
  from public.neroxa_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if v_contract.signature_status = 'SIGNED' then
    return true;
  end if;

  if v_contract.signature_status <> 'PENDING_NEROXA' then
    raise exception 'O contrato ainda não está aguardando assinatura da Neroxa';
  end if;

  insert into public.neroxa_contract_signatures (
    contract_id, party, signer_user_id, signer_name, signer_role,
    signed_at, contract_version
  ) values (
    v_contract.id, 'NEROXA', auth.uid(), v_name, v_role,
    now(), v_contract.version
  );

  update public.neroxa_contracts
  set
    signature_status = 'SIGNED',
    neroxa_signer_user_id = auth.uid(),
    neroxa_signer_name = v_name,
    neroxa_signer_role = v_role,
    neroxa_signed_at = now(),
    signed_at = now()
  where id = v_contract.id;

  return true;
end;
$$;

-- Sending for signature is a separate authenticated action.
create or replace function public.send_neroxa_contract_for_signature(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_number text;
begin
  if not public.neroxa_has_platform_role(array['SUPER_ADMIN'::public.neroxa_platform_role, 'ADMIN'::public.neroxa_platform_role]) then
    raise exception 'Sem permissão para enviar contratos para assinatura';
  end if;

  select * into v_contract
  from public.neroxa_contracts
  where id = p_contract_id
  for update;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  if v_contract.status <> 'DRAFT' then
    raise exception 'Somente contratos em rascunho podem ser enviados para assinatura';
  end if;

  if v_contract.proposal_id is not null and not exists (
    select 1 from public.neroxa_proposals p
    where p.id = v_contract.proposal_id and p.status = 'ACCEPTED'
  ) then
    raise exception 'O contrato só pode ser enviado após a aceitação da proposta vinculada';
  end if;

  if coalesce(btrim(v_contract.contract_number), '') = '' then
    v_number := 'NRX-' || to_char(current_date, 'YYYY') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  else
    v_number := v_contract.contract_number;
  end if;

  update public.neroxa_contracts
  set
    contract_number = v_number,
    issued_at = coalesce(issued_at, now()),
    signature_status = 'PENDING_CUSTOMER',
    signature_requested_at = now()
  where id = p_contract_id;

  return p_contract_id;
end;
$$;

-- Only the explicit activation RPC can move a signed contract to ACTIVE.
create or replace function public.activate_neroxa_contract_and_subscription(p_contract_id uuid)
returns uuid
language plpgsql
set search_path to 'public'
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

  select * into v_contract from public.neroxa_contracts where id = p_contract_id for update;
  if not found then raise exception 'Contrato não encontrado'; end if;
  if v_contract.status <> 'DRAFT' then raise exception 'Somente contratos em rascunho podem ser ativados'; end if;
  if v_contract.signature_status <> 'SIGNED' then raise exception 'O contrato precisa estar assinado pelas duas partes antes da ativação'; end if;

  if v_contract.proposal_id is not null and not exists (
    select 1 from public.neroxa_proposals p
    where p.id = v_contract.proposal_id and p.status = 'ACCEPTED'
  ) then
    raise exception 'O contrato só pode ser ativado após a aceitação da proposta vinculada';
  end if;

  if v_contract.commercial_model = 'SUBSCRIPTION' then
    if v_contract.plan_id is null then raise exception 'Contrato de assinatura precisa estar vinculado a um plano'; end if;
    if v_contract.billing_period not in ('MONTHLY','YEARLY') then raise exception 'Contrato de assinatura precisa ter periodicidade mensal ou anual'; end if;
    if v_contract.recurring_value is null or v_contract.recurring_value <= 0 then raise exception 'Contrato de assinatura precisa ter valor recorrente válido'; end if;

    select s.id into v_existing from public.neroxa_subscriptions s where s.contract_id = p_contract_id limit 1;
    if v_existing is not null then
      update public.neroxa_contracts set status='ACTIVE', started_at=coalesce(started_at,current_date) where id=p_contract_id;
      return v_existing;
    end if;

    if exists (
      select 1 from public.neroxa_subscriptions s
      where s.organization_id=v_contract.client_id
        and s.plan_id=v_contract.plan_id
        and s.status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE')
    ) then
      raise exception 'Este cliente já possui uma assinatura não encerrada para este plano';
    end if;

    if v_contract.billing_period='YEARLY' then
      v_period_end := (v_period_start + interval '1 year')::date;
    else
      v_period_end := (v_period_start + interval '1 month')::date;
    end if;

    insert into public.neroxa_subscriptions (
      organization_id, contract_id, plan_id, status, price,
      started_at, current_period_start, current_period_end,
      gateway_provider, gateway_status
    ) values (
      v_contract.client_id, p_contract_id, v_contract.plan_id, 'TRIAL',
      v_contract.recurring_value, now(), v_period_start, v_period_end,
      null, 'NOT_CONFIGURED'
    ) returning id into v_subscription_id;

    insert into public.neroxa_billing_records (
      organization_id, subscription_id, reference_month, amount,
      due_date, status, payment_method, external_id,
      gateway_provider, gateway_payment_id, gateway_status, gateway_event_id
    ) values (
      v_contract.client_id, v_subscription_id, v_reference_month,
      v_contract.recurring_value, v_period_start, 'PENDING',
      null, null, null, null, 'PENDING', null
    );

    update public.neroxa_contracts
    set status='ACTIVE', started_at=coalesce(started_at,current_date)
    where id=p_contract_id;

    return v_subscription_id;
  end if;

  update public.neroxa_contracts
  set status='ACTIVE', started_at=coalesce(started_at,current_date)
  where id=p_contract_id;

  return null;
end;
$$;

revoke execute on function public.get_neroxa_public_contract(uuid) from public;
revoke execute on function public.sign_neroxa_contract_as_customer(uuid,text,text,boolean) from public;
revoke execute on function public.send_neroxa_contract_for_signature(uuid) from public;

grant execute on function public.get_neroxa_public_contract(uuid) to anon, authenticated;
grant execute on function public.sign_neroxa_contract_as_customer(uuid,text,text,boolean) to anon, authenticated;
grant execute on function public.send_neroxa_contract_for_signature(uuid) to authenticated;
grant execute on function public.sign_neroxa_contract(uuid,text,text) to authenticated;

create or replace function public.prevent_neroxa_contract_status_without_signature()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = 'ACTIVE' and new.signature_status <> 'SIGNED' then
    raise exception 'Contrato só pode ficar ativo após as duas assinaturas';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_neroxa_contract_status_without_signature on public.neroxa_contracts;
create trigger trg_neroxa_contract_status_without_signature
before insert or update on public.neroxa_contracts
for each row execute function public.prevent_neroxa_contract_status_without_signature();
