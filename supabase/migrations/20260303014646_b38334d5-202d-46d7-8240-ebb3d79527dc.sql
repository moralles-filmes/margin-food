
-- Fix remaining RH tables that failed due to existing policy name collision

-- ── rh_folha_pagamento (retry with DROP IF EXISTS for existing ones) ──
DROP POLICY IF EXISTS "perm_rh_folha_write" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "perm_rh_folha_select" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "Colaborador can read own folha" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_select" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_select_own" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_insert" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_update" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "rh_folha_delete" ON public.rh_folha_pagamento;

CREATE POLICY "rh_folha_select" ON public.rh_folha_pagamento
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:folha:view','system:global:manage']));

CREATE POLICY "rh_folha_select_own" ON public.rh_folha_pagamento
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_folha_pagamento.colaborador_id AND c.user_id = auth.uid()));

CREATE POLICY "rh_folha_insert" ON public.rh_folha_pagamento
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']));

CREATE POLICY "rh_folha_update" ON public.rh_folha_pagamento
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_folha_delete" ON public.rh_folha_pagamento
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']));

-- ── rh_incidentes ──
DROP POLICY IF EXISTS "perm_rh_incidentes_write" ON public.rh_incidentes;
DROP POLICY IF EXISTS "perm_rh_incidentes_select" ON public.rh_incidentes;
DROP POLICY IF EXISTS "rh_incidentes_select" ON public.rh_incidentes;
DROP POLICY IF EXISTS "rh_incidentes_insert" ON public.rh_incidentes;
DROP POLICY IF EXISTS "rh_incidentes_update" ON public.rh_incidentes;
DROP POLICY IF EXISTS "rh_incidentes_delete" ON public.rh_incidentes;

CREATE POLICY "rh_incidentes_select" ON public.rh_incidentes
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:sst:view','system:global:manage']));

CREATE POLICY "rh_incidentes_insert" ON public.rh_incidentes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage']));

CREATE POLICY "rh_incidentes_update" ON public.rh_incidentes
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_incidentes_delete" ON public.rh_incidentes
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:sst:manage','system:global:manage']));

-- ── rh_ocorrencias_disciplinares ──
DROP POLICY IF EXISTS "perm_rh_ocorrencias_write" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "perm_rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "rh_ocorrencias_insert" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "rh_ocorrencias_update" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "rh_ocorrencias_delete" ON public.rh_ocorrencias_disciplinares;

CREATE POLICY "rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:disciplinar:view','system:global:manage']));

CREATE POLICY "rh_ocorrencias_insert" ON public.rh_ocorrencias_disciplinares
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:disciplinar:create','system:global:manage']));

CREATE POLICY "rh_ocorrencias_update" ON public.rh_ocorrencias_disciplinares
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:disciplinar:edit','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_ocorrencias_delete" ON public.rh_ocorrencias_disciplinares
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:disciplinar:delete','system:global:manage']));

-- ── rh_onboarding ──
DROP POLICY IF EXISTS "perm_rh_onboarding_write" ON public.rh_onboarding;
DROP POLICY IF EXISTS "perm_rh_onboarding_select" ON public.rh_onboarding;
DROP POLICY IF EXISTS "rh_onboarding_select" ON public.rh_onboarding;
DROP POLICY IF EXISTS "rh_onboarding_insert" ON public.rh_onboarding;
DROP POLICY IF EXISTS "rh_onboarding_update" ON public.rh_onboarding;
DROP POLICY IF EXISTS "rh_onboarding_delete" ON public.rh_onboarding;

CREATE POLICY "rh_onboarding_select" ON public.rh_onboarding
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:onboarding:view','system:global:manage']));

CREATE POLICY "rh_onboarding_insert" ON public.rh_onboarding
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:onboarding:create','system:global:manage']));

CREATE POLICY "rh_onboarding_update" ON public.rh_onboarding
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:onboarding:edit','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_onboarding_delete" ON public.rh_onboarding
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:onboarding:delete','system:global:manage']));

-- ── rh_ponto_ajustes ──
DROP POLICY IF EXISTS "perm_rh_ponto_ajustes_write" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "perm_rh_ponto_ajustes_select" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "rh_ponto_ajustes_select" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "rh_ponto_ajustes_insert" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "rh_ponto_ajustes_update" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "rh_ponto_ajustes_delete" ON public.rh_ponto_ajustes;

CREATE POLICY "rh_ponto_ajustes_select" ON public.rh_ponto_ajustes
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:view','system:global:manage']));

CREATE POLICY "rh_ponto_ajustes_insert" ON public.rh_ponto_ajustes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage']));

CREATE POLICY "rh_ponto_ajustes_update" ON public.rh_ponto_ajustes
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_ponto_ajustes_delete" ON public.rh_ponto_ajustes
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage']));

-- ── rh_ponto_registros ──
DROP POLICY IF EXISTS "perm_rh_ponto_write" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "perm_rh_ponto_select" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "Authenticated can insert own ponto" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "Colaborador can read own ponto" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "rh_ponto_select" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "rh_ponto_select_own" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "rh_ponto_insert" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "rh_ponto_update" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "rh_ponto_delete" ON public.rh_ponto_registros;

CREATE POLICY "rh_ponto_select" ON public.rh_ponto_registros
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:view','system:global:manage']));

CREATE POLICY "rh_ponto_select_own" ON public.rh_ponto_registros
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_ponto_registros.colaborador_id AND c.user_id = auth.uid()));

CREATE POLICY "rh_ponto_insert" ON public.rh_ponto_registros
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_ponto_update" ON public.rh_ponto_registros
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_ponto_delete" ON public.rh_ponto_registros
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:ponto:manage','system:global:manage']));

-- ── rh_progresso_treinamento ──
DROP POLICY IF EXISTS "perm_rh_progresso_write" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "perm_rh_progresso_select" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "Colaborador can read own progresso" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "rh_progresso_select" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "rh_progresso_select_own" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "rh_progresso_insert" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "rh_progresso_update" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "rh_progresso_delete" ON public.rh_progresso_treinamento;

CREATE POLICY "rh_progresso_select" ON public.rh_progresso_treinamento
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:view','system:global:manage']));

CREATE POLICY "rh_progresso_select_own" ON public.rh_progresso_treinamento
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_progresso_treinamento.colaborador_id AND c.user_id = auth.uid()));

CREATE POLICY "rh_progresso_insert" ON public.rh_progresso_treinamento
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']));

CREATE POLICY "rh_progresso_update" ON public.rh_progresso_treinamento
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_progresso_delete" ON public.rh_progresso_treinamento
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']));

-- ── rh_tarefas ──
DROP POLICY IF EXISTS "perm_rh_tarefas_write" ON public.rh_tarefas;
DROP POLICY IF EXISTS "perm_rh_tarefas_select" ON public.rh_tarefas;
DROP POLICY IF EXISTS "rh_tarefas_select" ON public.rh_tarefas;
DROP POLICY IF EXISTS "rh_tarefas_insert" ON public.rh_tarefas;
DROP POLICY IF EXISTS "rh_tarefas_update" ON public.rh_tarefas;
DROP POLICY IF EXISTS "rh_tarefas_delete" ON public.rh_tarefas;

CREATE POLICY "rh_tarefas_select" ON public.rh_tarefas
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE POLICY "rh_tarefas_insert" ON public.rh_tarefas
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_tarefas_update" ON public.rh_tarefas
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_tarefas_delete" ON public.rh_tarefas
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id());

-- ── rh_trilhas_treinamento ──
DROP POLICY IF EXISTS "perm_rh_trilhas_write" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "perm_rh_trilhas_select" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "rh_trilhas_select" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "rh_trilhas_insert" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "rh_trilhas_update" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "rh_trilhas_delete" ON public.rh_trilhas_treinamento;

CREATE POLICY "rh_trilhas_select" ON public.rh_trilhas_treinamento
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:view','system:global:manage']));

CREATE POLICY "rh_trilhas_insert" ON public.rh_trilhas_treinamento
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']));

CREATE POLICY "rh_trilhas_update" ON public.rh_trilhas_treinamento
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_trilhas_delete" ON public.rh_trilhas_treinamento
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage','system:global:manage']));

-- ── rh_trocas_turno ──
DROP POLICY IF EXISTS "perm_rh_trocas_write" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "perm_rh_trocas_select" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "rh_trocas_select" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "rh_trocas_insert" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "rh_trocas_update" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "rh_trocas_delete" ON public.rh_trocas_turno;

CREATE POLICY "rh_trocas_select" ON public.rh_trocas_turno
  FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id());

CREATE POLICY "rh_trocas_insert" ON public.rh_trocas_turno
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_trocas_update" ON public.rh_trocas_turno
  FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

CREATE POLICY "rh_trocas_delete" ON public.rh_trocas_turno
  FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id());
