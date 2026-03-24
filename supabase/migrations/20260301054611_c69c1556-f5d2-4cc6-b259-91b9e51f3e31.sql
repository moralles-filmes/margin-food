-- Etapa 4: Add company_id to ai_logs and ai_insights for multi-tenant readiness

-- 1) Add columns
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ai_insights ADD COLUMN IF NOT EXISTS company_id uuid;

-- 2) Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_logs_company') THEN
    ALTER TABLE public.ai_logs ADD CONSTRAINT fk_ai_logs_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_insights_company') THEN
    ALTER TABLE public.ai_insights ADD CONSTRAINT fk_ai_insights_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_ai_logs_company_created ON public.ai_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_company_created ON public.ai_insights(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_user_created ON public.ai_logs(user_id, created_at DESC);

-- 4) Backfill using default company (first company in the system)
UPDATE public.ai_logs
SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

UPDATE public.ai_insights
SET company_id = (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

-- 5) Update RLS policies for ai_logs to include company_id filter
DROP POLICY IF EXISTS "Users can read own ai_logs" ON public.ai_logs;
CREATE POLICY "Users can read own ai_logs" ON public.ai_logs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND (company_id IS NULL OR company_id = public.get_current_company_id())
  );

DROP POLICY IF EXISTS "Users can insert own ai_logs" ON public.ai_logs;
CREATE POLICY "Users can insert own ai_logs" ON public.ai_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (company_id IS NULL OR company_id = public.get_current_company_id())
  );

DROP POLICY IF EXISTS "Analytics can read all ai_logs" ON public.ai_logs;
CREATE POLICY "Analytics can read all ai_logs" ON public.ai_logs
  FOR SELECT TO authenticated
  USING (
    (company_id IS NULL OR company_id = public.get_current_company_id())
    AND (
      has_permission(auth.uid(), 'analytics:read')
      OR has_permission(auth.uid(), 'system:admin')
      OR has_permission(auth.uid(), 'system:global:manage')
    )
  );

-- 6) Update RLS policies for ai_insights to include company_id filter
DROP POLICY IF EXISTS "Authenticated can read ai_insights" ON public.ai_insights;

DROP POLICY IF EXISTS "perm_ai_insights_select" ON public.ai_insights;
CREATE POLICY "perm_ai_insights_select" ON public.ai_insights
  FOR SELECT TO authenticated
  USING (
    (company_id IS NULL OR company_id = public.get_current_company_id())
    AND has_permission(auth.uid(), 'analytics:read')
  );

DROP POLICY IF EXISTS "perm_ai_insights_write" ON public.ai_insights;
CREATE POLICY "perm_ai_insights_write" ON public.ai_insights
  FOR ALL TO authenticated
  USING (
    (company_id IS NULL OR company_id = public.get_current_company_id())
    AND has_permission(auth.uid(), 'analytics:manage')
  )
  WITH CHECK (
    (company_id IS NULL OR company_id = public.get_current_company_id())
    AND has_permission(auth.uid(), 'analytics:manage')
  );