-- Keep both tenant and user lookups as InitPlans. Wrapping only the outer
-- permission function still lets PostgreSQL re-evaluate auth.uid() per row.
DROP POLICY IF EXISTS "fin_conciliacao_ignoradas_tenant_select"
  ON public.fin_conciliacao_ignoradas;

CREATE POLICY "fin_conciliacao_ignoradas_tenant_select"
  ON public.fin_conciliacao_ignoradas
  FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[
      'financeiro:conciliacao:view',
      'financeiro:conciliacao:reconcile',
      'financeiro:conciliacao:manage',
      'finance:manage',
      'system:global:manage'
    ]))
  );
