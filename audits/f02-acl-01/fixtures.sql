-- SYNTHETIC ONLY. Initial fixtures, before the focal ACL comparison checkpoint.
BEGIN;
SET LOCAL neroxa.implementation_write_path='official';
INSERT INTO public.neroxa_organizations(id,legal_name,trade_name)
VALUES ('a0100000-0000-4000-8000-000000000001','F02 ACL fictitious','F02 ACL fictitious');
INSERT INTO public.neroxa_systems(id,name,slug,system_type)
VALUES ('a0100000-0000-4000-8000-000000000002','F02 ACL fixture','f02-acl-01','DELIVERY');
INSERT INTO public.neroxa_system_instances(id,organization_id,system_id,name,slug,system_type,status)
VALUES ('a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000002','F02 ACL fixture','f02-acl-01','DELIVERY','ACTIVE');
INSERT INTO public.neroxa_storefront_categories(id,instance_id,name,slug)
VALUES ('a0100000-0000-4000-8000-000000000004','a0100000-0000-4000-8000-000000000003','F02 ACL fixture','f02-acl-01');
INSERT INTO public.neroxa_storefront_settings(organization_id,payment_methods)
VALUES ('a0100000-0000-4000-8000-000000000001',ARRAY['CASH']);
INSERT INTO public.neroxa_storefront_products(id,instance_id,category_id,name,slug,price,metadata)
VALUES
('a0100000-0000-4000-8000-000000000011','a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000004','Fictitious pizza A','pizza-a',30,
'{"options":[{"id":"tamanho","choices":[{"id":"a0100000-0000-4000-8000-000000000021","price":4}]},{"id":"borda","choices":[{"id":"a0100000-0000-4000-8000-000000000022","price":3}]}]}'),
('a0100000-0000-4000-8000-000000000012','a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000004','Fictitious pizza B','pizza-b',40,
'{"options":[{"id":"tamanho","choices":[{"id":"a0100000-0000-4000-8000-000000000021","price":4}]}]}'),
('a0100000-0000-4000-8000-000000000013','a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000004','Fictitious addon','addon',2,'{}'),
('a0100000-0000-4000-8000-000000000014','a0100000-0000-4000-8000-000000000003','a0100000-0000-4000-8000-000000000004','Fictitious complement','complement',5,'{}');
CREATE ROLE f02_acl01_probe NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 2;
COMMIT;
