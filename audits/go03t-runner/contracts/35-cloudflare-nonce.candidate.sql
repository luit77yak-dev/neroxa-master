-- Local candidate only; separate admission, no changes to original 33-unit manifest.
BEGIN;
DO $$ BEGIN
 IF pg_temp.neroxa_go02_admitted('GO02_COMMERCIAL_CHECKOUT_V1',35) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GO02 nonce extension not admitted';
 END IF;
END $$;
CREATE TABLE private.neroxa_cloudflare_grant_nonces (
 nonce text PRIMARY KEY CHECK (nonce ~ '^[0-9a-f]{64}$'),
 binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.neroxa_cloudflare_grant_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_cloudflare_grant_nonces FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_claim_cloudflare_grant(p_nonce text,p_expires_at timestamptz,p_binding text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF p_nonce IS NULL OR p_nonce !~ '^[0-9a-f]{64}$'
 OR p_binding IS NULL OR p_binding !~ '^[0-9a-f]{64}$'
 OR p_expires_at IS NULL OR NOT isfinite(p_expires_at)
 OR p_expires_at <= clock_timestamp() OR p_expires_at > clock_timestamp()+interval '15 minutes' THEN
  RAISE EXCEPTION 'Cloudflare nonce invalid' USING ERRCODE='42501';
 END IF;
 INSERT INTO private.neroxa_cloudflare_grant_nonces(nonce,binding_sha256,expires_at)
 VALUES(p_nonce,p_binding,p_expires_at) ON CONFLICT(nonce) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_claim_cloudflare_grant(text,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_claim_cloudflare_grant(text,timestamptz,text) TO service_role;
-- No automatic deletion: expired receipts cannot become replayable via cleanup.
COMMIT;
