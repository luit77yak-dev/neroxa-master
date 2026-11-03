-- A05 candidate patch. Not a migration; test on an isolated PostgreSQL clone first.
-- Enforce MFA in every platform membership write policy, including all permissive paths.
BEGIN;
ALTER POLICY "neroxa admins manage platform members"
  ON public.neroxa_platform_members
  WITH CHECK (
    coalesce(auth.jwt() ->> 'aal' = 'aal2', false)
    AND private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::public.neroxa_platform_role,'ADMIN'::public.neroxa_platform_role])
  );
ALTER POLICY "neroxa admins update platform members"
  ON public.neroxa_platform_members
  USING (
    coalesce(auth.jwt() ->> 'aal' = 'aal2', false)
    AND private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::public.neroxa_platform_role,'ADMIN'::public.neroxa_platform_role])
  )
  WITH CHECK (
    coalesce(auth.jwt() ->> 'aal' = 'aal2', false)
    AND private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::public.neroxa_platform_role,'ADMIN'::public.neroxa_platform_role])
  );
ALTER POLICY "neroxa admins delete platform members"
  ON public.neroxa_platform_members
  USING (
    coalesce(auth.jwt() ->> 'aal' = 'aal2', false)
    AND private.neroxa_has_platform_role(ARRAY['SUPER_ADMIN'::public.neroxa_platform_role,'ADMIN'::public.neroxa_platform_role])
  );
COMMIT;
-- Review all other permissive write policies and direct grants before promotion.
