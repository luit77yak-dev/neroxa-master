-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 1485a05028bf46f0b3840d983ebc0187a689b894588ad705fdedd614382eb903; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',33) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- Disposable integration candidate; no production application authorized.
-- Reuse the existing service-only registration contracts in one transaction.
BEGIN;
DO $$ BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',33)
 THEN RAISE EXCEPTION 'Disposable candidate baseline required'; END IF;
END $$;
CREATE FUNCTION public.neroxa_register_buyer_capabilities(
 p_instance_id uuid,p_order_id uuid,p_checkout_key uuid,
 p_tracking_sha256 text,p_amendment_sha256 text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tracking_inserted boolean; amendment_inserted boolean;
BEGIN
 -- Serialize issuance for the same committed checkout, including concurrent retries.
 PERFORM 1 FROM public.neroxa_orders o
 JOIN public.neroxa_system_instances i ON i.id=o.instance_id
 WHERE o.id=p_order_id AND o.instance_id=p_instance_id
 AND o.idempotency_key=p_checkout_key AND i.status='ACTIVE'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'Buyer registration denied' USING ERRCODE='42501'; END IF;
 tracking_inserted:=public.neroxa_register_tracking_capability(
  p_instance_id,p_order_id,p_checkout_key,p_tracking_sha256);
 amendment_inserted:=public.neroxa_register_order_amendment_capability(
  p_instance_id,p_order_id,p_checkout_key,p_amendment_sha256);
 IF tracking_inserted IS DISTINCT FROM amendment_inserted THEN
  -- Never rotate a prior secret or silently accept an inconsistent older issuance.
  -- Exception rolls back any newly inserted half, keeping prior records intact.
  RAISE EXCEPTION 'Incomplete earlier capability issuance; reconciliation required' USING ERRCODE='55000';
 END IF;
 RETURN tracking_inserted;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_register_buyer_capabilities(uuid,uuid,uuid,text,text)
 TO service_role;
COMMIT;
