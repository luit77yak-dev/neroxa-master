-- Restore the database-level concurrency guard for active subscriptions.
-- This matches the commercial contract/subscription flow and prevents
-- duplicate non-terminal subscriptions for the same organization and plan.

create unique index if not exists idx_neroxa_subscriptions_active_org_plan
  on public.neroxa_subscriptions(organization_id, plan_id)
  where status in ('TRIAL','ACTIVE','PAUSED','PAST_DUE');
