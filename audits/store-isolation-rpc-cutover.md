# RPC cutover and compatibility checklist (Draft PR #37)

## Safe rollout order

1. Add nullable instance_id and backfill only unambiguous organizations.
2. Update frontend writes to send explicit instance_id and reads to scope instance_id.
3. Refactor public catalog to read settings/zones by resolved domain instance; no org fallback when >1 instance.
4. Refactor create_public_order to require verified storefront instance/domain context; never select first ACTIVE instance. Validate org-instance relation, products, zone, idempotency and price within same instance.
5. Refactor calculate_public_order_line_price to read pricing settings for p_instance_id, not organization_id.
6. Preserve existing order transition audit in update_admin_order_status; replace authorization after fetching locked order, using its instance_id.
7. Remove legacy org-only policies, enforce instance_id NOT NULL after all rows resolved, migrate settings PK and add integrity constraints.
8. Recheck EXECUTE grants on SECURITY DEFINER RPCs, including public order status and append-item paths.

## A/B fixture contract

- One organization O; active instances A and B with different domains.
- Users ua, ub, uadmin, outsider, with valid auth JWTs.
- Both ua and ub belong to O, but instance membership only ua->A and ub->B.
- Admin role is platform scoped, MFA aal2; outsider has no membership.
- Different categories, products, settings, delivery zones and orders per instance.
- Verify ua cannot SELECT/INSERT/UPDATE/DELETE B via table API, and cannot use get_admin_orders/update_admin_order_status against B.
- Verify ub symmetric; verify A/B public catalogs, prices and create order route to correct instance.
- Verify platform admin works, anon cannot mutate private resources.
- Verify archived instance writes denied, category cross-instance links denied.
- Verify old org-only access policies absent.
- Real tests must run with Supabase Auth JWT claims and isolated database, not superuser SQL sessions.

## Blockers

- Settings organization_id PK must be replaced to support two rows in one org.
- Zone and settings FK must verify organization_id corresponds to instance organization.
- Full RPC definitions must be preserved before replacement; this PR does not yet replace them.
- Existing instance-membership role escalation controls need a reviewed privileged grant/revoke path.
- No CI or integration test has been run.
