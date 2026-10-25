-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: b75d348d626d6c4ea27163bf5d539ad3ae8d4d9103b54cff3a4d4deb6d5d0cbb; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',27) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- ISOLATED RELEASE CANDIDATE. NEVER APPLY TO PRODUCTION DURING AUDIT.
-- Must run AFTER the anonymous JWT matrix and BEFORE gateway quota tests.
-- Durable PostgreSQL fixed-window quotas: store 60/min, contact 5/10 min.
-- Client PII is never stored; caller submits keyed HMAC-SHA256 hex digest.
-- Does NOT replace edge-level IP/routing protection or per-tenant WAF limits.
BEGIN;

CREATE TABLE private.neroxa_checkout_quota_counters (
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
  scope text NOT NULL CHECK (scope IN ('store', 'contact')),
  window_start timestamptz NOT NULL,
  identity_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance_id, scope, window_start, identity_hash)
);

ALTER TABLE private.neroxa_checkout_quota_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.neroxa_checkout_quota_counters
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neroxa_checkout_reserve_quota(
  p_instance_id uuid,
  p_contact_fingerprint text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $quota$
DECLARE
  v_current timestamptz := clock_timestamp();
  v_minute timestamptz;
  v_ten_minutes timestamptz;
  v_attempts integer;
BEGIN
  IF p_instance_id IS NULL OR
     p_contact_fingerprint !~ '^[0-9a-f]{64}$' OR
     p_contact_fingerprint IS NULL
  THEN
    RAISE EXCEPTION 'Invalid checkout quota identity' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.neroxa_system_instances i
    WHERE i.id = p_instance_id AND i.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Inactive or unknown store' USING ERRCODE='22023';
  END IF;

  v_minute := to_timestamp(floor(extract(epoch FROM v_current) / 60)::bigint * 60);
  v_ten_minutes := to_timestamp(floor(extract(epoch FROM v_current) / 600)::bigint * 600);

  -- Consistent global-before-contact lock order. INSERT/ON CONFLICT guards
  -- against concurrent overbooking across independent serverless workers.
  INSERT INTO private.neroxa_checkout_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'store', v_minute, 'store-total', 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_checkout_quota_counters.attempts + 1
  WHERE private.neroxa_checkout_quota_counters.attempts < 60
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    RAISE EXCEPTION 'Checkout store quota exceeded' USING ERRCODE='PT429';
  END IF;
  v_attempts := NULL;

  INSERT INTO private.neroxa_checkout_quota_counters
    (instance_id, scope, window_start, identity_hash, attempts)
  VALUES (p_instance_id, 'contact', v_ten_minutes, p_contact_fingerprint, 1)
  ON CONFLICT (instance_id, scope, window_start, identity_hash)
  DO UPDATE SET attempts = private.neroxa_checkout_quota_counters.attempts + 1
  WHERE private.neroxa_checkout_quota_counters.attempts < 5
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NULL THEN
    -- RAISE rolls back both increments in this function transaction.
    RAISE EXCEPTION 'Checkout contact quota exceeded' USING ERRCODE='PT429';
  END IF;
  RETURN true;
END
$quota$;

REVOKE ALL ON FUNCTION public.neroxa_checkout_reserve_quota(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neroxa_checkout_reserve_quota(uuid,text) TO service_role;

DO $gate$
BEGIN
  IF has_function_privilege('anon',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
       'public.neroxa_checkout_reserve_quota(uuid,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Unsafe checkout quota EXECUTE privileges';
  END IF;
END
$gate$;

COMMIT;

-- Operations: archive/delete expired counters with a dedicated scheduled
-- maintenance workflow only after the retention policy has been reviewed.
-- No cleanup job is enabled in this candidate.
