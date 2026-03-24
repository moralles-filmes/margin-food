
-- P0.3: ai_score_historico multi-tenant hardening

-- 1. Add company_id column (nullable first for backfill)
ALTER TABLE public.ai_score_historico ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- 2. Backfill existing rows with the single known tenant
-- UPDATE public.ai_score_historico
-- SET company_id = '68fd6ab4-0088-4671-b77f-7991ac26c42a'
-- WHERE company_id IS NULL;

-- 3. Make NOT NULL
ALTER TABLE public.ai_score_historico ALTER COLUMN company_id SET NOT NULL;

-- 4. Create indexes for tenant-scoped queries
CREATE INDEX idx_ai_score_historico_company_created ON public.ai_score_historico (company_id, created_at DESC);
CREATE INDEX idx_ai_score_historico_company_periodo ON public.ai_score_historico (company_id, periodo);

-- 5. Drop the dangerous SELECT true policy
DROP POLICY IF EXISTS "Authenticated can read ai_score" ON public.ai_score_historico;

-- 6. Drop legacy policies
DROP POLICY IF EXISTS "perm_ai_score_select" ON public.ai_score_historico;
DROP POLICY IF EXISTS "perm_ai_score_write" ON public.ai_score_historico;

-- 7. Create tenant-scoped SELECT policy
CREATE POLICY "ai_score_select_tenant" ON public.ai_score_historico
FOR SELECT TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_any_permission(auth.uid(), ARRAY['ia:consultor-geral:view', 'system:global:manage'])
);

-- 8. Create tenant-scoped INSERT policy (for backend/admin only)
CREATE POLICY "ai_score_insert_tenant" ON public.ai_score_historico
FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_current_company_id()
  AND has_permission(auth.uid(), 'system:global:manage')
);

-- 9. Create tenant-scoped UPDATE policy
CREATE POLICY "ai_score_update_tenant" ON public.ai_score_historico
FOR UPDATE TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_permission(auth.uid(), 'system:global:manage')
)
WITH CHECK (
  company_id = get_current_company_id()
  AND has_permission(auth.uid(), 'system:global:manage')
);

-- 10. Create tenant-scoped DELETE policy
CREATE POLICY "ai_score_delete_tenant" ON public.ai_score_historico
FOR DELETE TO authenticated
USING (
  company_id = get_current_company_id()
  AND has_permission(auth.uid(), 'system:global:manage')
);
