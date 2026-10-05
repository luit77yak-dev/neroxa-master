-- Expose the customer CNPJ and Neroxa signer role on the public contract document.
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
    'customer_signed_at', v_contract.customer_signed_at,
    'neroxa_signer_name', v_contract.neroxa_signer_name,
    'neroxa_signer_role', v_contract.neroxa_signer_role,
    'neroxa_signed_at', v_contract.neroxa_signed_at
  );
end;
$$;

revoke execute on function public.get_neroxa_public_contract(uuid) from public;
grant execute on function public.get_neroxa_public_contract(uuid) to anon, authenticated;
