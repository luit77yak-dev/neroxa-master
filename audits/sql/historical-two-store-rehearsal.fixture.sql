-- FIXTURE ONLY — isolated historical Master clone, NEVER production.
-- Seed before phase1. Deliberately ambiguous legacy settings/zones for two stores.
BEGIN;
INSERT INTO public.neroxa_organizations(id,legal_name,trade_name,status)
VALUES ('a0000000-0000-4000-8000-000000000001','Ensaio Neroxa Organização A','Ensaio A','ACTIVE'),
       ('a0000000-0000-4000-8000-000000000002','Ensaio Neroxa Organização B','Ensaio B','ACTIVE');
INSERT INTO public.neroxa_system_instances(id,organization_id,name,system_type,slug,status)
VALUES
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Loja A1','DELIVERY','rehearsal-a1','ACTIVE'),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Loja A2','DELIVERY','rehearsal-a2','ACTIVE'),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','Loja B1','DELIVERY','rehearsal-b1','ACTIVE');
INSERT INTO public.neroxa_storefront_settings(organization_id,description,hero_title,min_order_amount,delivery_enabled)
VALUES ('a0000000-0000-4000-8000-000000000001','Configuração legada ambígua','Cardápio legado A',25.00,true),
       ('a0000000-0000-4000-8000-000000000002','Configuração legada de loja única','Cardápio legado B',10.00,true);
INSERT INTO public.neroxa_storefront_delivery_zones(id,organization_id,name,neighborhoods,delivery_fee,minimum_order,sort_order)
VALUES ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Zona legada A','{Centro}',5.00,25.00,1),
       ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Zona legada A2','{Jardim}',7.00,25.00,2),
       ('c0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','Zona legada B','{Setor Sul}',3.00,10.00,1);
COMMIT;
-- Expected: phase1 automatic backfill resolves B1 only; A1/A2 remain NULL.
-- Never assign A rows automatically. Explicit business mapping/duplication decision required.
