-- Neroxa Master authorization matrix
-- Expected RPC access:
-- SUPER_ADMIN: activate contract, prepare implementation, transition domain, update provisioning
-- ADMIN:       activate contract, prepare implementation, transition domain, update provisioning
-- SUPPORT:     prepare implementation, transition domain, update provisioning
-- FINANCE:     none of the operational RPCs above
-- no role:     none
-- anon:        none
--
-- This file is intentionally non-destructive. Execute the blocks below in a
-- privileged SQL session when test users for each role exist.

-- 1) Function privilege boundary: administrative RPCs must not be executable by anon/public.
select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'activate_neroxa_contract_and_subscription',
    'prepare_neroxa_implementation_from_subscription',
    'transition_neroxa_domain_status',
    'update_neroxa_provisioning_job_status'
  )
order by p.proname;

-- 2) Current role-helper checks for the seeded SUPER_ADMIN and a no-role UUID.
-- These statements only read authorization state.
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
select
  public.neroxa_has_platform_role(array['SUPER_ADMIN']::public.neroxa_platform_role[]) as no_role_super_admin,
  public.neroxa_has_platform_role(array['ADMIN']::public.neroxa_platform_role[]) as no_role_admin,
  public.neroxa_has_platform_role(array['SUPPORT']::public.neroxa_platform_role[]) as no_role_support,
  public.neroxa_has_platform_role(array['FINANCE']::public.neroxa_platform_role[]) as no_role_finance;
rollback;

-- 3) For each real test user, set request.jwt.claim.sub to that user's UUID
-- and run the helper against the four role arrays. Expected result is true only
-- when the user's active platform role is included in the requested array.
--
-- 4) For RPC-level tests, use deliberately nonexistent target UUIDs. The
-- important assertion is that an authorized role gets past the permission
-- guard while an unauthorized role receives the function's permission error.
-- No persistent data should be created by these checks.
