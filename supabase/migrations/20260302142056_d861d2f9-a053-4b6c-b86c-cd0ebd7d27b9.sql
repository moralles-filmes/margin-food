
-- ═══════════════════════════════════════════════════════
-- FIX 3/6: Tenant-isolate 4 salmon tables
-- Pattern: match salmon_entries (company_id + has_permission)
-- ═══════════════════════════════════════════════════════

-- ──── salmon_manipulations ────
DROP POLICY IF EXISTS salmon_manipulations_select ON public.salmon_manipulations;
DROP POLICY IF EXISTS salmon_manipulations_insert ON public.salmon_manipulations;
DROP POLICY IF EXISTS salmon_manipulations_update ON public.salmon_manipulations;
DROP POLICY IF EXISTS salmon_manipulations_delete ON public.salmon_manipulations;

CREATE POLICY "salmon_manipulations_select" ON public.salmon_manipulations
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:view','salmon:dashboard:view','system:global:manage']));

CREATE POLICY "salmon_manipulations_insert" ON public.salmon_manipulations
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:create','system:global:manage']));

CREATE POLICY "salmon_manipulations_update" ON public.salmon_manipulations
  FOR UPDATE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:edit','system:global:manage']))
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "salmon_manipulations_delete" ON public.salmon_manipulations
  FOR DELETE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:delete','system:global:manage']));

-- ──── salmon_config ────
DROP POLICY IF EXISTS salmon_config_select ON public.salmon_config;
DROP POLICY IF EXISTS salmon_config_insert ON public.salmon_config;
DROP POLICY IF EXISTS salmon_config_update ON public.salmon_config;

CREATE POLICY "salmon_config_select" ON public.salmon_config
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view','salmon:manipulacao:view','salmon:entradas:view','system:global:manage']));

CREATE POLICY "salmon_config_insert" ON public.salmon_config
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:edit','system:global:manage']));

CREATE POLICY "salmon_config_update" ON public.salmon_config
  FOR UPDATE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:edit','system:global:manage']))
  WITH CHECK (company_id = get_current_company_id());

-- ──── salmon_daily_records ────
DROP POLICY IF EXISTS salmon_daily_select ON public.salmon_daily_records;
DROP POLICY IF EXISTS salmon_daily_insert ON public.salmon_daily_records;
DROP POLICY IF EXISTS salmon_daily_update ON public.salmon_daily_records;
DROP POLICY IF EXISTS salmon_daily_delete ON public.salmon_daily_records;

CREATE POLICY "salmon_daily_select" ON public.salmon_daily_records
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view','salmon:metas:view','system:global:manage']));

CREATE POLICY "salmon_daily_insert" ON public.salmon_daily_records
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view','salmon:metas:create','system:global:manage']));

CREATE POLICY "salmon_daily_update" ON public.salmon_daily_records
  FOR UPDATE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view','salmon:metas:edit','system:global:manage']))
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "salmon_daily_delete" ON public.salmon_daily_records
  FOR DELETE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view','system:global:manage']));

-- ──── salmon_purchase_targets ────
DROP POLICY IF EXISTS salmon_targets_select ON public.salmon_purchase_targets;
DROP POLICY IF EXISTS salmon_targets_insert ON public.salmon_purchase_targets;
DROP POLICY IF EXISTS salmon_targets_update ON public.salmon_purchase_targets;
DROP POLICY IF EXISTS salmon_targets_delete ON public.salmon_purchase_targets;

CREATE POLICY "salmon_targets_select" ON public.salmon_purchase_targets
  FOR SELECT TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:metas:view','salmon:planejamento:view','system:global:manage']));

CREATE POLICY "salmon_targets_insert" ON public.salmon_purchase_targets
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:metas:create','system:global:manage']));

CREATE POLICY "salmon_targets_update" ON public.salmon_purchase_targets
  FOR UPDATE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:metas:edit','system:global:manage']))
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "salmon_targets_delete" ON public.salmon_purchase_targets
  FOR DELETE TO authenticated
  USING (company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['salmon:metas:delete','system:global:manage']));
