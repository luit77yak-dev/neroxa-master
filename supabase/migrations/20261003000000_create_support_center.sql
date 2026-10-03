do $$ begin
  create type public.neroxa_support_ticket_status as enum ('OPEN','IN_PROGRESS','WAITING_CLIENT','RESOLVED','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.neroxa_support_ticket_priority as enum ('LOW','NORMAL','HIGH','URGENT');
exception when duplicate_object then null; end $$;

create table if not exists public.neroxa_support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.neroxa_organizations(id) on delete cascade,
  subject text not null check (length(btrim(subject)) > 0),
  description text not null check (length(btrim(description)) > 0),
  category text not null default 'GENERAL',
  priority public.neroxa_support_ticket_priority not null default 'NORMAL',
  status public.neroxa_support_ticket_status not null default 'OPEN',
  assignee_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  last_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.neroxa_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.neroxa_support_tickets(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists neroxa_support_tickets_org_idx on public.neroxa_support_tickets(organization_id);
create index if not exists neroxa_support_tickets_status_idx on public.neroxa_support_tickets(status);
create index if not exists neroxa_support_tickets_assignee_idx on public.neroxa_support_tickets(assignee_user_id);
create index if not exists neroxa_support_messages_ticket_idx on public.neroxa_support_messages(ticket_id, created_at);

alter table public.neroxa_support_tickets enable row level security;
alter table public.neroxa_support_messages enable row level security;

drop policy if exists "neroxa support tickets access" on public.neroxa_support_tickets;
drop policy if exists "neroxa support tickets manage" on public.neroxa_support_tickets;
create policy "neroxa support tickets access" on public.neroxa_support_tickets for select to authenticated
using ((select neroxa_is_platform_member()));
create policy "neroxa support tickets manage" on public.neroxa_support_tickets for all to authenticated
using ((select neroxa_has_platform_role(array['SUPER_ADMIN'::neroxa_platform_role,'ADMIN'::neroxa_platform_role,'SUPPORT'::neroxa_platform_role])))
with check ((select neroxa_has_platform_role(array['SUPER_ADMIN'::neroxa_platform_role,'ADMIN'::neroxa_platform_role,'SUPPORT'::neroxa_platform_role])));

drop policy if exists "neroxa support messages access" on public.neroxa_support_messages;
drop policy if exists "neroxa support messages manage" on public.neroxa_support_messages;
create policy "neroxa support messages access" on public.neroxa_support_messages for select to authenticated
using ((select neroxa_is_platform_member()));
create policy "neroxa support messages manage" on public.neroxa_support_messages for all to authenticated
using ((select neroxa_has_platform_role(array['SUPER_ADMIN'::neroxa_platform_role,'ADMIN'::neroxa_platform_role,'SUPPORT'::neroxa_platform_role])))
with check ((select neroxa_has_platform_role(array['SUPER_ADMIN'::neroxa_platform_role,'ADMIN'::neroxa_platform_role,'SUPPORT'::neroxa_platform_role])));
