alter table public.neroxa_plans
  add column if not exists system_id uuid references public.neroxa_systems(id) on delete set null;

create index if not exists idx_neroxa_plans_system_id
  on public.neroxa_plans(system_id);

comment on column public.neroxa_plans.system_id is
  'Optional technical system-base scope for the commercial plan. Null means the plan is not fixed to one system-base.';
