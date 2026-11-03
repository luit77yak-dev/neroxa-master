-- Regression guard for audit A01/A02. Read-only: safe to run against a test schema.
-- Run after applying the proposed security migration in an isolated database.
DO $audit$
DECLARE
  role_name text;
  operation text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
      IF has_table_privilege(role_name, 'public.neroxa_orders', operation) THEN
        RAISE EXCEPTION 'Unsafe direct privilege: %.% on neroxa_orders', role_name, operation;
      END IF;
      IF has_table_privilege(role_name, 'public.neroxa_order_items', operation) THEN
        RAISE EXCEPTION 'Unsafe direct privilege: %.% on neroxa_order_items', role_name, operation;
      END IF;
      IF has_table_privilege(role_name, 'public.neroxa_order_status_history', operation) THEN
        RAISE EXCEPTION 'Unsafe direct privilege: %.% on neroxa_order_status_history', role_name, operation;
      END IF;
    END LOOP;
  END LOOP;
END
$audit$;
