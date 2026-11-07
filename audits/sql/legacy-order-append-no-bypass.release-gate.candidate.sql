-- CANDIDATE FOR FUTURE SECURE AMENDMENT CUTOVER — DO NOT APPLY TO PRODUCTION.
--
-- The historical public append RPC authorizes mutation by order UUID + phone.
-- This is insufficient as a buyer capability, even with products constrained
-- to the order's instance. A separate token-authorized replacement is required
-- BEFORE revoking EXECUTE in any serving environment.
--
-- WARNING: CURRENT DELIVERY CLIENTS WILL LOSE "ITEM ESQUECIDO" IF THIS IS
-- APPLIED BEFORE A COORDINATED TOKEN ENDPOINT, CLIENT ROLLOUT AND ROLLBACK.
-- The tracking status RPC is intentionally NOT changed here: it also needs an
-- identity/PII redesign, but revoking it immediately would break tracking.
BEGIN;

DO $gate$
BEGIN
  IF to_regprocedure(
    'public.append_public_order_items_with_payment(uuid,text,jsonb,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Expected append RPC signature missing; abort cutover';
  END IF;

  -- When an older optional append wrapper exists, it is also a possible bypass.
  IF to_regprocedure(
    'public.append_public_order_items(uuid,text,jsonb)'
  ) IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.append_public_order_items(uuid,text,jsonb)
      FROM PUBLIC, anon, authenticated;
  END IF;
END
$gate$;

REVOKE EXECUTE ON FUNCTION
  public.append_public_order_items_with_payment(uuid,text,jsonb,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.append_public_order_items_with_payment(uuid,text,jsonb,text)
  TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon',
       'public.append_public_order_items_with_payment(uuid,text,jsonb,text)',
       'EXECUTE')
    OR has_function_privilege('authenticated',
       'public.append_public_order_items_with_payment(uuid,text,jsonb,text)',
       'EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.append_public_order_items_with_payment(uuid,text,jsonb,text)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION 'Unsafe append RPC privileges after staged revocation';
  END IF;
END
$verify$;

COMMIT;
