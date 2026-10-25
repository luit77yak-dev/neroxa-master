-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: afb5c31c4588a26cc1e7c31cdc09d6f5360fce4fcef22281e5d3b80dcea60727; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',26) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- Isolated pre-gate buyer profile only. NOT an automatic migration or release gate.
BEGIN;
DO $$ BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',26) OR
 to_regprocedure('public.neroxa_track_order_with_capability(uuid,uuid,text)') IS NULL OR
 current_setting('is_superuser') <> 'off' THEN
 RAISE EXCEPTION 'Exact disposable tracking predecessor and normal executor required'; END IF;
END $$;
CREATE TABLE private.neroxa_tracking_ingress (
 fingerprint text PRIMARY KEY CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 window_start timestamptz NOT NULL, hits integer NOT NULL CHECK(hits BETWEEN 1 AND 120)
);
ALTER TABLE private.neroxa_tracking_ingress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_tracking_ingress FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_tracking_reserve_ingress(p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reserved integer; now_at timestamptz:=clock_timestamp(); BEGIN
 IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
 RAISE EXCEPTION 'Ingress unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO private.neroxa_tracking_ingress AS q(fingerprint,window_start,hits)
 VALUES(p_fingerprint,now_at,1)
 ON CONFLICT(fingerprint) DO UPDATE SET
 window_start=CASE WHEN q.window_start<=now_at-interval '1 minute' THEN now_at ELSE q.window_start END,
 hits=CASE WHEN q.window_start<=now_at-interval '1 minute' THEN 1 ELSE q.hits+1 END
 WHERE q.window_start<=now_at-interval '1 minute' OR q.hits<120
 RETURNING hits INTO reserved;
 RETURN reserved IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_tracking_reserve_ingress(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_tracking_reserve_ingress(text) TO service_role;
COMMIT;
-- No expiry exception, no phone grants. Do not roll back by enabling legacy access.
