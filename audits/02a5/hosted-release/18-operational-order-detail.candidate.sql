-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: beff5f1acf436176435806f697c89a21e646dd6f3b4eb4c031ef345763867790; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',18) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- REVIEW ONLY; after existing admin ACL and instance authorization.
BEGIN;
CREATE FUNCTION public.get_admin_order_detail(p_instance_id uuid,p_order_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('order',to_jsonb(o),'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) FROM public.neroxa_order_items i WHERE i.order_id=o.id),'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at,h.id),'[]'::jsonb) FROM public.neroxa_order_status_history h WHERE h.order_id=o.id))
 FROM public.neroxa_orders o WHERE auth.uid() IS NOT NULL AND o.id=p_order_id AND o.instance_id=p_instance_id
 AND EXISTS(SELECT 1 FROM public.get_admin_orders(p_instance_id,NULL) a WHERE a.id=o.id)
$$;
REVOKE ALL ON FUNCTION public.get_admin_order_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_order_detail(uuid,uuid) TO authenticated;
COMMIT;
