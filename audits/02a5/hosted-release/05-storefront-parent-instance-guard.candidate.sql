-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: ec8afaa42ec5f590c1cbb1c98ff191d652779c3b0d97adc2ff4599f7389084c5; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',5) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- CANDIDATE: prevent reassignment of an instance to another organization.
-- This closes a parent-row bypass of child tenant guards.
-- Test in isolated database; some legitimate administrative migration flows
-- may need a separately audited privileged procedure.
BEGIN;
CREATE OR REPLACE FUNCTION public.neroxa_prevent_instance_org_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
  RAISE EXCEPTION 'Instance organization reassignment forbidden'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS neroxa_instance_org_immutable
 ON public.neroxa_system_instances;
CREATE TRIGGER neroxa_instance_org_immutable
 BEFORE UPDATE OF organization_id ON public.neroxa_system_instances
 FOR EACH ROW EXECUTE FUNCTION public.neroxa_prevent_instance_org_reassignment();
COMMIT;
