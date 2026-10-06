-- Harden proposal -> contract integrity at the database layer.
-- A proposal can produce at most one contract, and linked contracts must
-- preserve the accepted proposal's commercial snapshot.

create unique index if not exists uq_neroxa_contracts_proposal_id
  on public.neroxa_contracts(proposal_id)
  where proposal_id is not null;

create or replace function public.validate_neroxa_contract_proposal_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_proposal public.neroxa_proposals%rowtype;
begin
  if new.proposal_id is null then
    return new;
  end if;

  select *
    into v_proposal
  from public.neroxa_proposals
  where id = new.proposal_id
  for share;

  if not found then
    raise exception 'Proposta vinculada ao contrato não encontrada';
  end if;

  if v_proposal.status <> 'ACCEPTED' then
    raise exception 'Contrato só pode ser criado a partir de proposta aceita';
  end if;

  if new.client_id is distinct from v_proposal.client_id
    or new.plan_id is distinct from v_proposal.plan_id
    or new.system_id is distinct from v_proposal.system_id
    or new.commercial_model is distinct from v_proposal.commercial_model
    or new.billing_period is distinct from v_proposal.billing_period
    or new.recurring_value is distinct from v_proposal.recurring_value
    or new.setup_value is distinct from v_proposal.setup_value
    or new.maintenance_value is distinct from v_proposal.maintenance_value
    or new.currency is distinct from v_proposal.currency
  then
    raise exception 'Dados comerciais do contrato não correspondem à proposta aceita';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_neroxa_contract_proposal_integrity
  on public.neroxa_contracts;

create trigger trg_neroxa_contract_proposal_integrity
before insert or update of
  proposal_id,
  client_id,
  plan_id,
  system_id,
  commercial_model,
  billing_period,
  recurring_value,
  setup_value,
  maintenance_value,
  currency
on public.neroxa_contracts
for each row
execute function public.validate_neroxa_contract_proposal_integrity();
