-- Fix overly permissive INSERT policy on rbac_legacy_usage
DROP POLICY IF EXISTS "authenticated_insert_legacy_usage" ON public.rbac_legacy_usage;
CREATE POLICY "authenticated_insert_legacy_usage" ON public.rbac_legacy_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());