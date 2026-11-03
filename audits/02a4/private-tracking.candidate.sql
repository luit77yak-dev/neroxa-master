-- Preparatory server-only contract. NOT an enabled buyer endpoint.
BEGIN;
DO $$ BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' OR to_regclass('public.neroxa_orders') IS NULL THEN RAISE EXCEPTION 'Disposable Master baseline required'; END IF;
END $$;
CREATE TABLE private.neroxa_tracking_capabilities (
 order_id uuid PRIMARY KEY REFERENCES public.neroxa_orders(id) ON DELETE CASCADE,
 instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id),
 token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(expires_at>created_at)
);
ALTER TABLE private.neroxa_tracking_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.neroxa_tracking_capabilities FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.neroxa_register_tracking_capability(p_instance_id uuid,p_order_id uuid,p_checkout_key uuid,p_token_sha256 text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted uuid; BEGIN
 IF p_token_sha256 IS NULL OR p_token_sha256 !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
 SELECT 1 FROM public.neroxa_orders o JOIN public.neroxa_system_instances i ON i.id=o.instance_id
 WHERE o.id=p_order_id AND o.instance_id=p_instance_id AND o.idempotency_key=p_checkout_key AND i.status='ACTIVE') THEN RAISE EXCEPTION 'Tracking registration denied' USING ERRCODE='42501'; END IF;
 INSERT INTO private.neroxa_tracking_capabilities(order_id,instance_id,token_sha256,expires_at)
 VALUES(p_order_id,p_instance_id,p_token_sha256,clock_timestamp()+interval '24 hours') ON CONFLICT(order_id) DO NOTHING RETURNING order_id INTO inserted;
 RETURN inserted IS NOT NULL;
END $$;
CREATE FUNCTION public.neroxa_track_order_with_capability(p_instance_id uuid,p_order_id uuid,p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'Tracking denied' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('order_id',o.id,'status',o.status,'total',o.total,'updated_at',o.updated_at,
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'line_total',i.line_total)),'[]'::jsonb) FROM public.neroxa_order_items i WHERE i.order_id=o.id)) INTO result
 FROM public.neroxa_orders o JOIN private.neroxa_tracking_capabilities c ON c.order_id=o.id AND c.instance_id=o.instance_id
 JOIN public.neroxa_system_instances s ON s.id=o.instance_id
 WHERE o.id=p_order_id AND o.instance_id=p_instance_id AND s.status='ACTIVE'
 AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 AND c.token_sha256=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex');
 IF result IS NULL THEN RAISE EXCEPTION 'Tracking denied' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.neroxa_register_tracking_capability(uuid,uuid,uuid,text), public.neroxa_track_order_with_capability(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.neroxa_register_tracking_capability(uuid,uuid,uuid,text), public.neroxa_track_order_with_capability(uuid,uuid,text) TO service_role;
COMMIT;
-- Trusted server must bind domain/Origin -> instance, reserve quota before call,
-- emit opaque 32-byte token once at checkout and never log token or hash.
-- No unsafe inverse grants. Buyer HTTP integration/issuance not enabled here.
