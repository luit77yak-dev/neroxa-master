-- EXECUTABLE IN ISOLATED DB ONLY after candidate schema and policies have been applied.
-- This is a fixture-independent assertion suite. It intentionally fails if
-- the structural isolation prerequisites are missing.
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM information_schema.columns
 WHERE table_schema='public' AND column_name='instance_id'
 AND table_name IN ('neroxa_storefront_settings','neroxa_storefront_delivery_zones');
 IF n<>2 THEN RAISE EXCEPTION 'FAIL: settings/zones require instance_id; found % of 2',n; END IF;

 SELECT count(*) INTO n FROM pg_policies
 WHERE schemaname='public'
 AND tablename IN ('neroxa_storefront_settings','neroxa_storefront_delivery_zones')
 AND policyname IN ('organization manager storefront settings write',
 'organization member storefront settings select',
 'organization manager delivery zones write',
 'organization member delivery zones select');
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: organization-wide settings/zones policies still exist: %',n; END IF;

 SELECT count(*) INTO n FROM pg_policies
 WHERE schemaname='public'
 AND tablename IN ('neroxa_storefront_products','neroxa_storefront_categories','neroxa_orders')
 AND policyname IN ('organization manager storefront products write',
 'organization member storefront products select',
 'organization manager storefront categories write',
 'organization member storefront categories select',
 'organization manager orders update','organization member orders select');
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: broad org policies remain: %',n; END IF;
END $$;
-- Next: fixture-specific JWT tests using two instances in same organization.
-- Expected: A-only identity can access A, cannot access B, and vice versa.
-- This script does not create users, impersonate tokens, or modify production.
