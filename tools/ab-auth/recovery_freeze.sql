-- TEST ONLY: disposable historical rehearsal. Not a production migration/runbook implementation.
CREATE TABLE private.ab_recovery_control(singleton boolean PRIMARY KEY CHECK(singleton), frozen boolean NOT NULL);
INSERT INTO private.ab_recovery_control VALUES(true,false);
REVOKE ALL ON private.ab_recovery_control FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.ab_recovery_write_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT frozen FROM private.ab_recovery_control WHERE singleton) THEN
  RAISE EXCEPTION 'Disposable recovery maintenance window' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.ab_recovery_write_gate() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'neroxa_%' LOOP
 EXECUTE format('CREATE TRIGGER zz_ab_recovery_freeze BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.ab_recovery_write_gate()',r.relname);
 END LOOP;
END $$;
-- A synthetic VERIFIED domain, never a real domain or external DNS operation.
INSERT INTO public.neroxa_system_domains(system_instance_id,domain,status)
VALUES('b0000000-0000-4000-8000-000000000001','recovery-a1.invalid','VERIFIED');
