
-- ============================================================
-- EMERGENCY: Recreate tenant-aware RLS policies for 13 RH tables
-- that lost ALL policies during legacy cleanup
-- ============================================================

-- 1. rh_colaboradores (has INSERT only, needs SELECT/UPDATE/DELETE)
CREATE POLICY "rh_colaboradores_select" ON public.rh_colaboradores
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:prontuario:view','rh:prontuario:manage','system:global:manage'])
  );

CREATE POLICY "rh_colaboradores_select_own" ON public.rh_colaboradores
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "rh_colaboradores_update" ON public.rh_colaboradores
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:prontuario:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_colaboradores_delete" ON public.rh_colaboradores
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:prontuario:manage','system:global:manage'])
  );

-- 2. rh_banco_horas (0 policies)
CREATE POLICY "rh_banco_horas_select" ON public.rh_banco_horas
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ponto:view','rh:folha:view','system:global:manage'])
  );

CREATE POLICY "rh_banco_horas_insert" ON public.rh_banco_horas
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage'])
  );

CREATE POLICY "rh_banco_horas_update" ON public.rh_banco_horas
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_banco_horas_delete" ON public.rh_banco_horas
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage'])
  );

-- 3. rh_beneficios (0 policies)
CREATE POLICY "rh_beneficios_select" ON public.rh_beneficios
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:beneficios:view','rh:beneficios:manage','system:global:manage'])
  );

CREATE POLICY "rh_beneficios_insert" ON public.rh_beneficios
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:beneficios:manage','system:global:manage'])
  );

CREATE POLICY "rh_beneficios_update" ON public.rh_beneficios
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:beneficios:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_beneficios_delete" ON public.rh_beneficios
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:beneficios:manage','system:global:manage'])
  );

-- 4. rh_comunicados (0 policies)
CREATE POLICY "rh_comunicados_select" ON public.rh_comunicados
  FOR SELECT USING (
    company_id = get_current_company_id()
  );

CREATE POLICY "rh_comunicados_insert" ON public.rh_comunicados
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:comunicacao:manage','system:global:manage'])
  );

CREATE POLICY "rh_comunicados_update" ON public.rh_comunicados
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:comunicacao:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_comunicados_delete" ON public.rh_comunicados
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:comunicacao:manage','system:global:manage'])
  );

-- 5. rh_custos_mensais (0 policies)
CREATE POLICY "rh_custos_mensais_select" ON public.rh_custos_mensais
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:custos:view','rh:custos:manage','system:global:manage'])
  );

CREATE POLICY "rh_custos_mensais_insert" ON public.rh_custos_mensais
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:custos:manage','system:global:manage'])
  );

CREATE POLICY "rh_custos_mensais_update" ON public.rh_custos_mensais
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:custos:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_custos_mensais_delete" ON public.rh_custos_mensais
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:custos:manage','system:global:manage'])
  );

-- 6. rh_disponibilidade (0 policies)
CREATE POLICY "rh_disponibilidade_select" ON public.rh_disponibilidade
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:view','rh:escalas:manage','system:global:manage'])
  );

CREATE POLICY "rh_disponibilidade_insert" ON public.rh_disponibilidade
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
  );

CREATE POLICY "rh_disponibilidade_update" ON public.rh_disponibilidade
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_disponibilidade_delete" ON public.rh_disponibilidade
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  );

-- 7. rh_documentos (0 policies)
CREATE POLICY "rh_documentos_select" ON public.rh_documentos
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:documentos:view','rh:documentos:manage','system:global:manage'])
  );

CREATE POLICY "rh_documentos_insert" ON public.rh_documentos
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:documentos:manage','system:global:manage'])
  );

CREATE POLICY "rh_documentos_update" ON public.rh_documentos
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:documentos:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_documentos_delete" ON public.rh_documentos
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:documentos:manage','system:global:manage'])
  );

-- 8. rh_epis (0 policies)
CREATE POLICY "rh_epis_select" ON public.rh_epis
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:view','rh:sst:manage','system:global:manage'])
  );

CREATE POLICY "rh_epis_insert" ON public.rh_epis
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  );

CREATE POLICY "rh_epis_update" ON public.rh_epis
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_epis_delete" ON public.rh_epis
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  );

-- 9. rh_escalas (0 policies)
CREATE POLICY "rh_escalas_select" ON public.rh_escalas
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:view','rh:escalas:manage','system:global:manage'])
  );

CREATE POLICY "rh_escalas_insert" ON public.rh_escalas
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  );

CREATE POLICY "rh_escalas_update" ON public.rh_escalas
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_escalas_delete" ON public.rh_escalas
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  );

-- 10. rh_escala_slots (0 policies)
CREATE POLICY "rh_escala_slots_select" ON public.rh_escala_slots
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:view','rh:escalas:manage','system:global:manage'])
  );

CREATE POLICY "rh_escala_slots_insert" ON public.rh_escala_slots
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  );

CREATE POLICY "rh_escala_slots_update" ON public.rh_escala_slots
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_escala_slots_delete" ON public.rh_escala_slots
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:escalas:manage','system:global:manage'])
  );

-- 11. rh_exames (0 policies)
CREATE POLICY "rh_exames_select" ON public.rh_exames
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:view','rh:sst:manage','system:global:manage'])
  );

CREATE POLICY "rh_exames_insert" ON public.rh_exames
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  );

CREATE POLICY "rh_exames_update" ON public.rh_exames
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_exames_delete" ON public.rh_exames
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage'])
  );

-- 12. rh_ferias_afastamentos (has INSERT only, needs SELECT/UPDATE/DELETE)
CREATE POLICY "rh_ferias_select" ON public.rh_ferias_afastamentos
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:view','rh:ferias:manage','system:global:manage'])
  );

CREATE POLICY "rh_ferias_select_own" ON public.rh_ferias_afastamentos
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND EXISTS (
      SELECT 1 FROM rh_colaboradores c
      WHERE c.id = rh_ferias_afastamentos.colaborador_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "rh_ferias_update" ON public.rh_ferias_afastamentos
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_ferias_delete" ON public.rh_ferias_afastamentos
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:manage','system:global:manage'])
  );

-- 13. rh_ferias_saldo (0 policies)
CREATE POLICY "rh_ferias_saldo_select" ON public.rh_ferias_saldo
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:view','rh:ferias:manage','system:global:manage'])
  );

CREATE POLICY "rh_ferias_saldo_select_own" ON public.rh_ferias_saldo
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND EXISTS (
      SELECT 1 FROM rh_colaboradores c
      WHERE c.id = rh_ferias_saldo.colaborador_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "rh_ferias_saldo_insert" ON public.rh_ferias_saldo
  FOR INSERT WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:manage','system:global:manage'])
  );

CREATE POLICY "rh_ferias_saldo_update" ON public.rh_ferias_saldo
  FOR UPDATE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:manage','system:global:manage'])
  ) WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "rh_ferias_saldo_delete" ON public.rh_ferias_saldo
  FOR DELETE USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:ferias:manage','system:global:manage'])
  );

-- 14. rh_audit_log (has INSERT only, needs SELECT)
CREATE POLICY "rh_audit_log_select" ON public.rh_audit_log
  FOR SELECT USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['rh:prontuario:manage','system:global:manage'])
  );
