-- DISPOSABLE REHEARSAL FIXTURE ONLY — never production.
-- Applied after phase-2 cutover, before the logical pg_dump of the isolated local database.
-- Two shops of the same organization acquire divergent settings, zones, orders, items and history.
BEGIN;
UPDATE public.neroxa_storefront_settings
SET hero_title='After cutover A1', description='Synthetic A1', min_order_amount=21.00
WHERE instance_id='b0000000-0000-4000-8000-000000000001';
UPDATE public.neroxa_storefront_settings
SET hero_title='After cutover A2', description='Synthetic A2', min_order_amount=42.00
WHERE instance_id='b0000000-0000-4000-8000-000000000002';
INSERT INTO public.neroxa_storefront_delivery_zones
(id, organization_id, instance_id, name, neighborhoods, delivery_fee, minimum_order, sort_order)
VALUES ('c0000000-0000-4000-8000-000000000004',
'a0000000-0000-4000-8000-000000000001',
'b0000000-0000-4000-8000-000000000002',
'Synthetic A2 Zone', ARRAY['A2 Center']::text[], 8.00, 42.00, 3);
INSERT INTO public.neroxa_orders
(id, instance_id, organization_id, order_number, customer_name, customer_phone,
 fulfillment, payment_method, status, subtotal, delivery_fee, total)
VALUES
('d0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001',
 'a0000000-0000-4000-8000-000000000001',2,'Synthetic A1','00000000001',
 'PICKUP','PIX','RECEIVED',21.00,0,21.00),
('d0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000002',
 'a0000000-0000-4000-8000-000000000001',2,'Synthetic A2','00000000002',
 'PICKUP','PIX','RECEIVED',42.00,0,42.00);
INSERT INTO public.neroxa_order_items
(id, order_id, product_name, quantity, unit_price, line_total)
VALUES
('e0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000004','Synthetic A1 item',1,21.00,21.00),
('e0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','Synthetic A2 item',1,42.00,42.00);
INSERT INTO public.neroxa_order_status_history
(id, order_id, to_status, note)
VALUES
('f0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000004','RECEIVED','Synthetic post cutover A1'),
('f0000000-0000-4000-8000-000000000005','d0000000-0000-4000-8000-000000000005','RECEIVED','Synthetic post cutover A2');
COMMIT;
