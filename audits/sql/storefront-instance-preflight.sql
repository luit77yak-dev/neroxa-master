-- Read-only preflight, safe on Master or clone.
SELECT 'settings' AS source,s.organization_id,count(i.id) AS instance_count,count(*) AS row_count
FROM public.neroxa_storefront_settings s LEFT JOIN public.neroxa_system_instances i
ON i.organization_id=s.organization_id GROUP BY s.organization_id
UNION ALL
SELECT 'zones',z.organization_id,count(DISTINCT i.id),count(DISTINCT z.id)
FROM public.neroxa_storefront_delivery_zones z LEFT JOIN public.neroxa_system_instances i
ON i.organization_id=z.organization_id GROUP BY z.organization_id
ORDER BY source,organization_id;
-- IMPORTANT: settings count(*) is inflated by the join when multiple instances exist;
-- use count(distinct s.organization_id) for settings row count if needed.
