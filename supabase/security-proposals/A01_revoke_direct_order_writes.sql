-- A01: candidate patch, NOT a migration and NOT applied to any database.
-- Review against the authoritative schema and test locally before promoting.
-- SECURITY: keep SELECT for legitimate org members; remove direct write paths.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.neroxa_orders,
  public.neroxa_order_items,
  public.neroxa_order_status_history
FROM PUBLIC, anon, authenticated;
-- The existing administrative RPCs are SECURITY DEFINER; preserve only
-- deliberately approved EXECUTE grants after auditing their bodies.
-- Never grant DML back to authenticated as a workaround for broken UI.
DO $check$
DECLARE
  role_name text;
  relation_name text;
  privilege_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH relation_name IN ARRAY ARRAY[
      'public.neroxa_orders',
      'public.neroxa_order_items',
      'public.neroxa_order_status_history'
    ] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
        IF has_table_privilege(role_name, relation_name, privilege_name) THEN
          RAISE EXCEPTION 'Direct write still granted: role %, relation %, privilege %', role_name, relation_name, privilege_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$check$;
COMMIT;
