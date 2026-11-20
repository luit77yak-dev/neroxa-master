-- EVIDENCE ONLY: SQL already applied to commercial Supabase on 2026-11-20.
-- Supabase migration: 20261120185812_neroxa_v1_f02_passwordless_preflight_login_20261120
-- Do not include in the 33-unit SQL_RELEASE and do not automatically replay.
-- No password or user business data is recorded here.
-- NEROXA V1 / F02: isolated hosted-preflight identity only.
-- Not SQL_RELEASE. No password is provisioned or emitted by this migration.
-- This role cannot authenticate by password until a secure operator action.
CREATE ROLE neroxa_f02_preflight
  WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
       NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2
       PASSWORD NULL
       VALID UNTIL '2026-12-15 00:00:00+00';

-- Preserve the explicitly granted anon/authenticated/service_role permissions.
-- Remove only the broad grant from PUBLIC that would otherwise make the
-- catalog-only preflight role able to execute a SECURITY DEFINER function.
REVOKE EXECUTE ON FUNCTION public.calculate_public_order_line_price(
  uuid, uuid, uuid, text, text, jsonb, jsonb
) FROM PUBLIC;

COMMENT ON ROLE neroxa_f02_preflight IS
  'NEROXA F02 commercial catalog-only HOSTED_PREFLIGHT; temporary passwordless restricted LOGIN. No application runtime grants, no SQL_RELEASE rights.';
