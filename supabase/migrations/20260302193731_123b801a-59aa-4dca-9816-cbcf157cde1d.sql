-- P1: RLS CLEANUP — ai_logs, ai_insights
-- Remove legacy: analytics:read, analytics:manage, system:admin, company_id IS NULL

-- ai_logs: DROP legacy policies
DROP POLICY IF EXISTS "Analytics can read all ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Users can read own ai_logs" ON public.ai_logs;
DROP POLICY IF EXISTS "Users can insert own ai_logs" ON public.ai_logs;

-- ai_logs: Clean tenant-scoped policies
CREATE POLICY "ai_logs_select_own" ON public.ai_logs FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND user_id = auth.uid());

CREATE POLICY "ai_logs_select_admin" ON public.ai_logs FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['ia:logs:view', 'system:global:manage']));

CREATE POLICY "ai_logs_insert_own" ON public.ai_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_current_company_id());

CREATE POLICY "ai_logs_update_own" ON public.ai_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_current_company_id())
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_current_company_id());

-- ai_insights: DROP legacy policies
DROP POLICY IF EXISTS "perm_ai_insights_select" ON public.ai_insights;
DROP POLICY IF EXISTS "perm_ai_insights_write" ON public.ai_insights;

-- ai_insights: Clean tenant-scoped policies
CREATE POLICY "ai_insights_select_tenant" ON public.ai_insights FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
    AND public.has_any_permission(auth.uid(), ARRAY['ia:consultor-geral:view', 'system:global:manage']));

CREATE POLICY "ai_insights_write_tenant" ON public.ai_insights FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage'))
  WITH CHECK (company_id = public.get_current_company_id()
    AND public.has_permission(auth.uid(), 'system:global:manage'));

-- RETENTION STRUCTURE
CREATE INDEX IF NOT EXISTS idx_ai_logs_retention ON public.ai_logs (company_id, created_at);
COMMENT ON TABLE public.ai_logs IS 'AI chat logs. Retention: 90 days.';
CREATE INDEX IF NOT EXISTS idx_ai_insights_retention ON public.ai_insights (company_id, created_at);
COMMENT ON TABLE public.ai_insights IS 'AI insights. Retention: 90 days.';