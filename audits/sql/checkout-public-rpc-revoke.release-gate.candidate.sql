-- CANDIDATE ONLY — gate AFTER the same-origin checkout is deployed and
-- every consumer has migrated. Do NOT apply to Neroxa production during audits.
-- Applying this early breaks the currently public checkout and the local
-- anonymous RPC test matrix until that matrix is explicitly migrated.
BEGIN;

-- A SECURITY DEFINER function can still be called directly by anyone with
-- EXECUTE. Hiding its URL or moving a caller to the server does not remove
-- direct public access. Eliminate PUBLIC and normal client-role execution.
REVOKE EXECUTE ON FUNCTION public.create_public_order(jsonb)
FROM PUBLIC, anon, authenticated;

-- The temporary server gateway uses a private, server-only key. Never expose
-- this credential to client bundles. A least-privilege role is preferable
-- for the final release once available and tested.
GRANT EXECUTE ON FUNCTION public.create_public_order(jsonb) TO service_role;

DO $gate$
BEGIN
  IF has_function_privilege('anon', 'public.create_public_order(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_public_order(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_public_order(jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Unsafe create_public_order EXECUTE privileges after release gate';
  END IF;
END $gate$;

COMMIT;
