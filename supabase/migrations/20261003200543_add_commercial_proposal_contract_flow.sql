alter table public.neroxa_proposals
  add column if not exists plan_id uuid references public.neroxa_plans(id),
  add column if not exists system_id uuid references public.neroxa_systems(id),
  add column if not exists commercial_model text not null default 'SUBSCRIPTION',
  add column if not exists billing_period text,
  add column if not exists recurring_value numeric(12,2),
  add column if not exists setup_value numeric(12,2) not null default 0,
  add column if not exists maintenance_value numeric(12,2),
  add column if not exists currency text not null default 'BRL';

alter table public.neroxa_contracts
  add column if not exists plan_id uuid references public.neroxa_plans(id),
  add column if not exists system_id uuid references public.neroxa_systems(id),
  add column if not exists commercial_model text not null default 'SUBSCRIPTION',
  add column if not exists billing_period text,
  add column if not exists recurring_value numeric(12,2),
  add column if not exists setup_value numeric(12,2) not null default 0,
  add column if not exists maintenance_value numeric(12,2),
  add column if not exists currency text not null default 'BRL',
  add column if not exists version integer not null default 1;

alter table public.neroxa_proposals
  add constraint neroxa_proposals_commercial_model_check check (commercial_model in ('SUBSCRIPTION','PERMANENT'));

alter table public.neroxa_proposals
  add constraint neroxa_proposals_billing_period_check check (billing_period is null or billing_period in ('MONTHLY','YEARLY','ONE_TIME'));

alter table public.neroxa_contracts
  add constraint neroxa_contracts_commercial_model_check check (commercial_model in ('SUBSCRIPTION','PERMANENT'));

alter table public.neroxa_contracts
  add constraint neroxa_contracts_billing_period_check check (billing_period is null or billing_period in ('MONTHLY','YEARLY','ONE_TIME'));

create index if not exists idx_neroxa_proposals_plan_id on public.neroxa_proposals(plan_id);
create index if not exists idx_neroxa_contracts_plan_id on public.neroxa_contracts(plan_id);

create or replace function public.validate_neroxa_proposal_status_transition()
returns trigger language plpgsql
as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'DRAFT' and new.status not in ('SENT','CANCELLED') then raise exception 'Invalid proposal transition: % -> %', old.status, new.status; end if;
  if old.status = 'SENT' and new.status not in ('NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CANCELLED') then raise exception 'Invalid proposal transition: % -> %', old.status, new.status; end if;
  if old.status = 'NEGOTIATION' and new.status not in ('SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED') then raise exception 'Invalid proposal transition: % -> %', old.status, new.status; end if;
  if old.status in ('ACCEPTED','REJECTED','EXPIRED','CANCELLED') then raise exception 'Proposal % is final and cannot transition to %', old.status, new.status; end if;
  return new;
end;
$$;

drop trigger if exists trg_neroxa_proposal_status_transition on public.neroxa_proposals;
create trigger trg_neroxa_proposal_status_transition
before update of status on public.neroxa_proposals
for each row execute function public.validate_neroxa_proposal_status_transition();

create or replace function public.validate_neroxa_contract_status_transition()
returns trigger language plpgsql
as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'DRAFT' and new.status not in ('ACTIVE') then raise exception 'Invalid contract transition: % -> %', old.status, new.status; end if;
  if old.status = 'ACTIVE' and new.status not in ('SUSPENDED','TERMINATED','EXPIRED') then raise exception 'Invalid contract transition: % -> %', old.status, new.status; end if;
  if old.status = 'SUSPENDED' and new.status not in ('ACTIVE','TERMINATED','EXPIRED') then raise exception 'Invalid contract transition: % -> %', old.status, new.status; end if;
  if old.status in ('TERMINATED','EXPIRED') then raise exception 'Contract % is final and cannot transition to %', old.status, new.status; end if;
  return new;
end;
$$;

drop trigger if exists trg_neroxa_contract_status_transition on public.neroxa_contracts;
create trigger trg_neroxa_contract_status_transition
before update of status on public.neroxa_contracts
for each row execute function public.validate_neroxa_contract_status_transition();

create or replace function public.prevent_neroxa_contract_commercial_change()
returns trigger language plpgsql
as $$
begin
  if old.status in ('ACTIVE','SUSPENDED','TERMINATED','EXPIRED') then
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
      or new.version is distinct from old.version then
      raise exception 'Commercial terms of a contracted contract are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_neroxa_contract_commercial_immutability on public.neroxa_contracts;
create trigger trg_neroxa_contract_commercial_immutability
before update on public.neroxa_contracts
for each row execute function public.prevent_neroxa_contract_commercial_change();
