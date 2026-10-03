alter table public.neroxa_plans
  add column if not exists commercial_model text not null default 'SUBSCRIPTION'
    check (commercial_model in ('SUBSCRIPTION', 'PERMANENT')),
  add column if not exists maintenance_price numeric(12,2);

comment on column public.neroxa_plans.commercial_model is
  'Commercial modality: recurring subscription or permanent purchase.';

comment on column public.neroxa_plans.maintenance_price is
  'Optional recurring maintenance amount for permanent-purchase plans; null until commercially defined.';
