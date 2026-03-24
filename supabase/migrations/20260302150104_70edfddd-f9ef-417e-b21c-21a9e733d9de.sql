-- P0 FIX: metas_cmv RLS + UNIQUE indexes

-- 1) Drop all bad RLS policies on metas_cmv
DROP POLICY IF EXISTS "Authenticated can read metas_cmv" ON public.metas_cmv;
DROP POLICY IF EXISTS "perm_metas_cmv_select" ON public.metas_cmv;
DROP POLICY IF EXISTS "perm_metas_cmv_write" ON public.metas_cmv;

-- 2) Create tenant-safe RLS policies for metas_cmv
CREATE POLICY "metas_cmv_select" ON public.metas_cmv
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['cmv:semanal:view', 'system:global:manage'])
  );

CREATE POLICY "metas_cmv_insert" ON public.metas_cmv
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit', 'system:global:manage'])
  );

CREATE POLICY "metas_cmv_update" ON public.metas_cmv
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit', 'system:global:manage'])
  );

CREATE POLICY "metas_cmv_delete" ON public.metas_cmv
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit', 'system:global:manage'])
  );

-- 3) Drop global UNIQUE on metas_cmv(mes_ano) and create tenant-scoped UNIQUE
ALTER TABLE public.metas_cmv DROP CONSTRAINT IF EXISTS metas_cmv_mes_ano_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_cmv_company_mes_ano
  ON public.metas_cmv (company_id, mes_ano);