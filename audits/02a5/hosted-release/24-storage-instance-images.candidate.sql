-- Derived candidate for iefaoaqzltvpfabyeelj; no operational admission.
-- Source SHA256: 5739b1226bb2d9ee7b760ddfaa8b0ffcd65048ec92dd938a41a194713795962e; original content/comments preserved below.
DO $release$ BEGIN IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',24) THEN RAISE EXCEPTION 'Release transport/session admission required'; END IF; END $release$;
-- M only; native Storage RLS already enabled. No ownership/role changes.
BEGIN;
DO $$ BEGIN
 IF NOT pg_temp.neroxa_release_admitted('6611843683eeade08d666b51b8bf4a476e3a7442d20d7f91fe84f70ded0437c1',24) OR
 NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass),false) THEN RAISE EXCEPTION 'Disposable native Storage RLS required'; END IF;
END $$;
CREATE FUNCTION neroxa_private.delivery_image_path_scope(path text,write_access boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+[.]png$' THEN
 neroxa_private.has_delivery_instance_role(split_part(path,'/',1)::uuid,CASE WHEN write_access THEN ARRAY['OWNER','ADMIN','MANAGER']::public.neroxa_organization_role[] ELSE NULL END)
 ELSE false END
$$;
REVOKE ALL ON FUNCTION neroxa_private.delivery_image_path_scope(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION neroxa_private.delivery_image_path_scope(text,boolean) TO authenticated;
-- Restrictive cap protects this bucket from any pre-existing permissive policy.
CREATE POLICY mission02a4_image_cap ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id<>'product-images' OR neroxa_private.delivery_image_path_scope(name,false))
 WITH CHECK(bucket_id<>'product-images' OR neroxa_private.delivery_image_path_scope(name,true));
CREATE POLICY mission02a4_image_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='product-images' AND neroxa_private.delivery_image_path_scope(name,false));
CREATE POLICY mission02a4_image_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='product-images' AND neroxa_private.delivery_image_path_scope(name,true));
CREATE POLICY mission02a4_image_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='product-images' AND neroxa_private.delivery_image_path_scope(name,true))
 WITH CHECK(bucket_id='product-images' AND neroxa_private.delivery_image_path_scope(name,true));
CREATE POLICY mission02a4_image_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='product-images' AND neroxa_private.delivery_image_path_scope(name,true));
CREATE POLICY mission02a4_no_anon_images ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING(bucket_id<>'product-images') WITH CHECK(bucket_id<>'product-images');
COMMIT;
-- API bootstrap/preflight MUST require bucket private, image/png allowlist, 1MiB
-- max and no public bypass URL; SQL does not change native bucket ownership.
-- Public storefront asset delivery is a separate signed/proxied contract gate.
