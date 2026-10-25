-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 4d4baf9edbcbd7d269c52b38ff3fde5cbeb1f7be40ea945eef6c5ebd7eae1180; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',19) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
BEGIN;
DO $$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.update_admin_order_status(uuid,text,text)'::regprocedure) IS DISTINCT FROM 'bece1eb06c354c83bcf917d7698e4a69' THEN RAISE EXCEPTION 'Unexpected admin transition body'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.update_admin_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS neroxa_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order public.neroxa_orders; v_old text;
begin
 select * into v_order from public.neroxa_orders where id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if not (public.neroxa_is_platform_member() OR neroxa_private.has_instance_role(v_order.instance_id,ARRAY['OWNER','ADMIN','MANAGER','OPERATOR']::public.neroxa_organization_role[])) then raise exception 'Acesso negado' USING ERRCODE='42501'; end if;
 if p_status not in ('RECEIVED','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CANCELLED') then raise exception 'Status inválido'; end if;
 v_old:=v_order.status;
 IF p_status<>v_old AND NOT (
 (v_old='RECEIVED' AND p_status IN ('CONFIRMED','CANCELLED')) OR
 (v_old='CONFIRMED' AND p_status IN ('PREPARING','CANCELLED')) OR
 (v_old='PREPARING' AND p_status IN ('READY','CANCELLED')) OR
 (v_old='READY' AND (p_status='CANCELLED' OR (v_order.fulfillment='DELIVERY' AND p_status='OUT_FOR_DELIVERY') OR (v_order.fulfillment='PICKUP' AND p_status='DELIVERED'))) OR
 (v_old='OUT_FOR_DELIVERY' AND p_status='DELIVERED')
 ) THEN RAISE EXCEPTION 'Invalid order transition' USING ERRCODE='22023'; END IF;
 update public.neroxa_orders set status=p_status,updated_at=now(),
 confirmed_at=case when p_status='CONFIRMED' and confirmed_at is null then now() else confirmed_at end,
 preparing_at=case when p_status='PREPARING' and preparing_at is null then now() else preparing_at end,
 ready_at=case when p_status='READY' and ready_at is null then now() else ready_at end,
 out_for_delivery_at=case when p_status='OUT_FOR_DELIVERY' and out_for_delivery_at is null then now() else out_for_delivery_at end,
 delivered_at=case when p_status='DELIVERED' and delivered_at is null then now() else delivered_at end,
 cancelled_at=case when p_status='CANCELLED' and cancelled_at is null then now() else cancelled_at end
 where id=p_order_id returning * into v_order;
 IF v_old<>p_status THEN
 insert into public.neroxa_order_status_history(order_id,from_status,to_status,changed_by_user_id,note)
 values(p_order_id,v_old,p_status,auth.uid(),nullif(trim(p_note),''));
 END IF;
 return v_order;
end;
$function$;
COMMIT;
