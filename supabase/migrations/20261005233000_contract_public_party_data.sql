-- Freeze the Neroxa provider identity on each contract version and expose it on the public document.
alter table public.neroxa_contracts
  add column if not exists neroxa_entity_type text,
  add column if not exists neroxa_trade_name text,
  add column if not exists neroxa_legal_name text,
  add column if not exists neroxa_tax_id text;

create or replace function public.send_neroxa_contract_for_signature(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_contract public.neroxa_contracts%rowtype;
  v_number text;
  v_profile jsonb;
  v_legal_name text;
  v_trade_name text;
  v_tax_id text;
  v_signer_name text;
  v_signer_role text;
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

  select value into v_profile
  from public.neroxa_platform_settings
  where key = 'legal_profile'
  limit 1;

  v_legal_name := btrim(coalesce(v_profile->>'legal_name', ''));
  v_trade_name := btrim(coalesce(v_profile->>'trade_name', ''));
  v_tax_id := btrim(coalesce(v_profile->>'tax_id', ''));
  v_signer_name := btrim(coalesce(v_profile->>'signer_name', ''));
  v_signer_role := btrim(coalesce(v_profile->>'signer_role', ''));

  if v_legal_name = '' then raise exception 'Configure o nome completo da prestadora em Configurações > Identificação da Neroxa'; end if;
  if v_tax_id = '' then raise exception 'Configure o CPF da prestadora em Configurações > Identificação da Neroxa'; end if;
  if v_signer_name = '' then raise exception 'Configure o responsável pela assinatura da Neroxa em Configurações > Identificação da Neroxa'; end if;
  if v_signer_role = '' then raise exception 'Configure o cargo do responsável pela Neroxa em Configurações > Identificação da Neroxa'; end if;

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
    signature_requested_at = now(),
    neroxa_entity_type = 'INDIVIDUAL',
    neroxa_trade_name = coalesce(nullif(v_trade_name, ''), 'Neroxa | Soluções Personalizadas'),
    neroxa_legal_name = v_legal_name,
    neroxa_tax_id = v_tax_id,
    neroxa_signer_name = v_signer_name,
    neroxa_signer_role = v_signer_role
  where id = p_contract_id;

  return p_contract_id;
end;
$$;

revoke execute on function public.send_neroxa_contract_for_signature(uuid) from public;
grant execute on function public.send_neroxa_contract_for_signature(uuid) to authenticated;

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
    'customer_document', v_client.document,
    'neroxa_entity_type', v_contract.neroxa_entity_type,
    'neroxa_trade_name', v_contract.neroxa_trade_name,
    'neroxa_legal_name', v_contract.neroxa_legal_name,
    'neroxa_tax_id', v_contract.neroxa_tax_id,
    'customer_signed_at', v_contract.customer_signed_at,
    'neroxa_signer_name', v_contract.neroxa_signer_name,
    'neroxa_signer_role', v_contract.neroxa_signer_role,
    'neroxa_signed_at', v_contract.neroxa_signed_at
  );
end;
$$;

revoke execute on function public.get_neroxa_public_contract(uuid) from public;
grant execute on function public.get_neroxa_public_contract(uuid) to anon, authenticated;
