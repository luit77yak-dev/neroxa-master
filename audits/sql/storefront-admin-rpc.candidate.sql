-- CANDIDATE: admin order RPCs only; isolated database verification required.
-- Preserve existing return signatures and timestamp transitions.
CREATE OR REPLACE FUNCTION public.get_admin_orders(p_instance_id uuid,p_status text DEFAULT NULL)
RETURNS SETOF public.neroxa_orders LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
 SELECT o.* FROM public.neroxa_orders o
 WHERE o.instance_id=p_instance_id
 AND (p_status IS NULL OR o.status=p_status)
 AND (
   public.neroxa_is_platform_member()
   OR neroxa_private.has_instance_role(p_instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])
 )
 ORDER BY o.created_at DESC
$$;

-- Do not replace update_admin_order_status yet: preserve its full audit
-- transition implementation, and insert this authorization check immediately
-- after SELECT ... FOR UPDATE and the not-found check:
--
-- IF NOT (
--   public.neroxa_is_platform_member()
--   OR neroxa_private.has_instance_role(v_order.instance_id,
--     ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])
-- ) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
--
-- Remove the previous platform-only guard in the same atomic change.
-- This is an implementation note, not a complete update RPC migration.
