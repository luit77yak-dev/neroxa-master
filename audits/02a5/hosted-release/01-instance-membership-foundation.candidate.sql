-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 7889d4d9bdc37cf01457a8d0608e997e143f8bbfd377130b16f72539487c72d0; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',1) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- CANDIDATE / NOT EXECUTED. Requires isolated Master-compatible test database.
-- Phase 1: explicit per-instance membership, deny by default.
CREATE TABLE public.neroxa_instance_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.neroxa_system_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.neroxa_organization_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id,user_id)
);
CREATE INDEX neroxa_instance_members_user_active_idx
  ON public.neroxa_instance_members(user_id,instance_id) WHERE active;
ALTER TABLE public.neroxa_instance_members ENABLE ROW LEVEL SECURITY;
-- No public policies: membership is managed by a reviewed privileged backend path.
-- IMPORTANT: before deploying, implement audited membership grant/revoke workflow,
-- preventing self-grants and verifying the instance's organization membership.

-- Phase 2: membership lookup. SECURITY DEFINER is narrowly scoped to avoid
-- recursion; not exposed as an RPC to anonymous users.
CREATE SCHEMA IF NOT EXISTS neroxa_private;
CREATE OR REPLACE FUNCTION neroxa_private.has_instance_role(
  target_instance uuid,
  allowed_roles public.neroxa_organization_role[] DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.neroxa_instance_members m
   JOIN public.neroxa_system_instances i ON i.id=m.instance_id
   JOIN public.neroxa_organization_members om
     ON om.organization_id=i.organization_id AND om.user_id=m.user_id
   WHERE m.instance_id=target_instance
     AND m.user_id=(SELECT auth.uid())
     AND m.active AND om.active
     AND (allowed_roles IS NULL OR m.role=ANY(allowed_roles))
 )
$$;
REVOKE ALL ON FUNCTION neroxa_private.has_instance_role(uuid,public.neroxa_organization_role[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA neroxa_private TO authenticated;
GRANT EXECUTE ON FUNCTION neroxa_private.has_instance_role(uuid,public.neroxa_organization_role[]) TO authenticated;

-- IMPORTANT: This is a foundation, NOT the RLS policy replacement.
-- Existing permissive policies MUST be dropped/replaced atomically before use.
-- Settings and zones are organization-scoped; migrate to instance_id with
-- deterministic backfill and frontend/RPC compatibility checks first.
-- Do not apply this candidate to production.
