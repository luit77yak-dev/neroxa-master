-- Master M only, after scoped02A2 and exact manifest. No Auth schema DDL.
BEGIN;
DO $$ BEGIN
 IF current_setting('neroxa.mission02a2_disposable',true) IS DISTINCT FROM 'on' OR
 (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('neroxa_private.has_delivery_instance_role(uuid,public.neroxa_organization_role[])')) IS DISTINCT FROM 'd2a409935bbbc1b97a2d8fc28ae46652' THEN RAISE EXCEPTION 'Unexpected scoped helper / disposable context'; END IF;
 IF NOT has_table_privilege(current_user,'auth.sessions','SELECT') THEN RAISE EXCEPTION 'Normal executor cannot inspect Auth sessions; do not elevate'; END IF;
END $$;
CREATE OR REPLACE FUNCTION neroxa_private.has_delivery_instance_role(
 target_instance uuid, allowed_roles public.neroxa_organization_role[] DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM auth.sessions s
  WHERE s.id=CASE WHEN coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   THEN (auth.jwt()->>'session_id')::uuid ELSE NULL END
   AND s.user_id=(SELECT auth.uid())
 ) AND CASE WHEN EXISTS (
  SELECT 1 FROM public.neroxa_platform_members p
  WHERE p.user_id=(SELECT auth.uid()) AND p.active
 ) THEN public.neroxa_is_platform_member() AND EXISTS (
  SELECT 1 FROM public.neroxa_instance_members m
  JOIN public.neroxa_system_instances i ON i.id=m.instance_id
  WHERE m.user_id=(SELECT auth.uid()) AND m.instance_id=target_instance
   AND m.active AND i.status <> 'ARCHIVED'
   AND (allowed_roles IS NULL OR m.role=ANY(allowed_roles))
 ) ELSE neroxa_private.has_instance_role(target_instance,allowed_roles) END
$$;
COMMIT;
-- ACL/owner/signature preserved. Global Master is_neroxa_staff unchanged.
-- No unsafe inverse body/grants as recovery: maintain containment, roll forward.
