-- =============================================
-- Criar integration_logs que foi perdida em splits anteriores
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'salmon_to_stock',
  action TEXT NOT NULL,
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'ERROR',
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read integration logs"
  ON public.integration_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- GOVERNANCE PHASE 1.3: Migrate has_role → has_permission
-- =============================================

-- 0) Create missing permissions
INSERT INTO public.permissions (key, module, submodule, action, description) VALUES
  ('pricing:read', 'pricing', 'general', 'read', 'Visualizar precificação e canais de venda'),
  ('pricing:manage', 'pricing', 'general', 'manage', 'Editar precificação e canais de venda'),
  ('analytics:read', 'analytics', 'general', 'read', 'Visualizar insights de IA e scores'),
  ('analytics:manage', 'analytics', 'general', 'manage', 'Gerenciar insights e cenários'),
  ('system:admin', 'system', 'general', 'admin', 'Administração do sistema'),
  ('system:read', 'system', 'general', 'read', 'Visualizar logs do sistema')
ON CONFLICT (key) DO NOTHING;

-- Grant to admin role
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'pricing:read'), ('admin', 'pricing:manage'),
  ('admin', 'analytics:read'), ('admin', 'analytics:manage'),
  ('admin', 'system:admin'), ('admin', 'system:read')
ON CONFLICT (role, permission_key) DO NOTHING;

-- =============================================
-- ONDA 1: RH (20 tables)
-- =============================================
DROP POLICY IF EXISTS "Masters can read rh_audit" ON public.rh_audit_log;
CREATE POLICY "perm_rh_audit_select" ON public.rh_audit_log FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));

DROP POLICY IF EXISTS "Gerente can read rh_banco_horas" ON public.rh_banco_horas;
DROP POLICY IF EXISTS "Masters can manage rh_banco_horas" ON public.rh_banco_horas;
CREATE POLICY "perm_rh_banco_horas_select" ON public.rh_banco_horas FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_banco_horas_write" ON public.rh_banco_horas FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Financeiro can read rh_beneficios" ON public.rh_beneficios;
DROP POLICY IF EXISTS "Gerente can read rh_beneficios" ON public.rh_beneficios;
DROP POLICY IF EXISTS "Masters can manage rh_beneficios" ON public.rh_beneficios;
CREATE POLICY "perm_rh_beneficios_select" ON public.rh_beneficios FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_beneficios_write" ON public.rh_beneficios FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can read rh_colaboradores" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "Masters can manage rh_colaboradores" ON public.rh_colaboradores;
CREATE POLICY "perm_rh_colaboradores_select" ON public.rh_colaboradores FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_colaboradores_write" ON public.rh_colaboradores FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_comunicados" ON public.rh_comunicados;
DROP POLICY IF EXISTS "Masters can manage rh_comunicados" ON public.rh_comunicados;
CREATE POLICY "perm_rh_comunicados_select" ON public.rh_comunicados FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_comunicados_write" ON public.rh_comunicados FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Financeiro can read rh_custos_mensais" ON public.rh_custos_mensais;
DROP POLICY IF EXISTS "Gerente can read rh_custos_mensais" ON public.rh_custos_mensais;
DROP POLICY IF EXISTS "Masters can manage rh_custos_mensais" ON public.rh_custos_mensais;
CREATE POLICY "perm_rh_custos_select" ON public.rh_custos_mensais FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_custos_write" ON public.rh_custos_mensais FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_disponibilidade" ON public.rh_disponibilidade;
DROP POLICY IF EXISTS "Masters can manage rh_disponibilidade" ON public.rh_disponibilidade;
CREATE POLICY "perm_rh_disponibilidade_select" ON public.rh_disponibilidade FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_disponibilidade_write" ON public.rh_disponibilidade FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_documentos" ON public.rh_documentos;
DROP POLICY IF EXISTS "Masters can manage rh_documentos" ON public.rh_documentos;
CREATE POLICY "perm_rh_documentos_select" ON public.rh_documentos FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_documentos_write" ON public.rh_documentos FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_epis" ON public.rh_epis;
DROP POLICY IF EXISTS "Masters can manage rh_epis" ON public.rh_epis;
CREATE POLICY "perm_rh_epis_select" ON public.rh_epis FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_epis_write" ON public.rh_epis FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_escala_slots" ON public.rh_escala_slots;
DROP POLICY IF EXISTS "Masters can manage rh_escala_slots" ON public.rh_escala_slots;
CREATE POLICY "perm_rh_escala_slots_select" ON public.rh_escala_slots FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_escala_slots_write" ON public.rh_escala_slots FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_escalas" ON public.rh_escalas;
DROP POLICY IF EXISTS "Masters can manage rh_escalas" ON public.rh_escalas;
CREATE POLICY "perm_rh_escalas_select" ON public.rh_escalas FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_escalas_write" ON public.rh_escalas FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_exames" ON public.rh_exames;
DROP POLICY IF EXISTS "Masters can manage rh_exames" ON public.rh_exames;
CREATE POLICY "perm_rh_exames_select" ON public.rh_exames FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_exames_write" ON public.rh_exames FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_ferias_afastamentos" ON public.rh_ferias_afastamentos;
DROP POLICY IF EXISTS "Masters can manage rh_ferias_afastamentos" ON public.rh_ferias_afastamentos;
CREATE POLICY "perm_rh_ferias_select" ON public.rh_ferias_afastamentos FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_ferias_write" ON public.rh_ferias_afastamentos FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can read rh_ferias_saldo" ON public.rh_ferias_saldo;
DROP POLICY IF EXISTS "Masters can manage rh_ferias_saldo" ON public.rh_ferias_saldo;
CREATE POLICY "perm_rh_ferias_saldo_select" ON public.rh_ferias_saldo FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_ferias_saldo_write" ON public.rh_ferias_saldo FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Financeiro can read rh_folha_pagamento" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "Masters can manage rh_folha_pagamento" ON public.rh_folha_pagamento;
CREATE POLICY "perm_rh_folha_select" ON public.rh_folha_pagamento FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_folha_write" ON public.rh_folha_pagamento FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_incidentes" ON public.rh_incidentes;
DROP POLICY IF EXISTS "Masters can manage rh_incidentes" ON public.rh_incidentes;
CREATE POLICY "perm_rh_incidentes_select" ON public.rh_incidentes FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_incidentes_write" ON public.rh_incidentes FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can insert rh_ocorrencias" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "Gerente can read rh_ocorrencias" ON public.rh_ocorrencias_disciplinares;
DROP POLICY IF EXISTS "Masters can manage rh_ocorrencias" ON public.rh_ocorrencias_disciplinares;
CREATE POLICY "perm_rh_ocorrencias_select" ON public.rh_ocorrencias_disciplinares FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_ocorrencias_write" ON public.rh_ocorrencias_disciplinares FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_onboarding" ON public.rh_onboarding;
DROP POLICY IF EXISTS "Masters can manage rh_onboarding" ON public.rh_onboarding;
CREATE POLICY "perm_rh_onboarding_select" ON public.rh_onboarding FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_onboarding_write" ON public.rh_onboarding FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can read rh_ponto_ajustes" ON public.rh_ponto_ajustes;
DROP POLICY IF EXISTS "Masters can manage rh_ponto_ajustes" ON public.rh_ponto_ajustes;
CREATE POLICY "perm_rh_ponto_ajustes_select" ON public.rh_ponto_ajustes FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_ponto_ajustes_write" ON public.rh_ponto_ajustes FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_ponto" ON public.rh_ponto_registros;
DROP POLICY IF EXISTS "Masters can manage rh_ponto" ON public.rh_ponto_registros;
CREATE POLICY "perm_rh_ponto_select" ON public.rh_ponto_registros FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_ponto_write" ON public.rh_ponto_registros FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_progresso" ON public.rh_progresso_treinamento;
DROP POLICY IF EXISTS "Masters can manage rh_progresso" ON public.rh_progresso_treinamento;
CREATE POLICY "perm_rh_progresso_select" ON public.rh_progresso_treinamento FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_progresso_write" ON public.rh_progresso_treinamento FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_tarefas" ON public.rh_tarefas;
DROP POLICY IF EXISTS "Masters can manage rh_tarefas" ON public.rh_tarefas;
CREATE POLICY "perm_rh_tarefas_select" ON public.rh_tarefas FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_tarefas_write" ON public.rh_tarefas FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_trilhas" ON public.rh_trilhas_treinamento;
DROP POLICY IF EXISTS "Masters can manage rh_trilhas" ON public.rh_trilhas_treinamento;
CREATE POLICY "perm_rh_trilhas_select" ON public.rh_trilhas_treinamento FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_trilhas_write" ON public.rh_trilhas_treinamento FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

DROP POLICY IF EXISTS "Gerente can manage rh_trocas" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS "Masters can manage rh_trocas" ON public.rh_trocas_turno;
CREATE POLICY "perm_rh_trocas_select" ON public.rh_trocas_turno FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'rh:read'));
CREATE POLICY "perm_rh_trocas_write" ON public.rh_trocas_turno FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'rh:manage')) WITH CHECK (public.has_permission(auth.uid(), 'rh:manage'));

-- =============================================
-- ONDA 2: Requisições de Estoque
-- =============================================
DROP POLICY IF EXISTS "Authorized can update requisicao_itens" ON public.requisicao_estoque_itens;
DROP POLICY IF EXISTS "Can read requisicao_itens via requisicao" ON public.requisicao_estoque_itens;
CREATE POLICY "perm_req_itens_select" ON public.requisicao_estoque_itens FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'stock:requisitions:read'));
CREATE POLICY "perm_req_itens_write" ON public.requisicao_estoque_itens FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'stock:requisitions:create')) WITH CHECK (public.has_permission(auth.uid(), 'stock:requisitions:create'));

DROP POLICY IF EXISTS "Authorized can read all requisicoes" ON public.requisicoes_estoque;
DROP POLICY IF EXISTS "Authorized can update requisicoes" ON public.requisicoes_estoque;
CREATE POLICY "perm_req_select" ON public.requisicoes_estoque FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'stock:requisitions:read'));
CREATE POLICY "perm_req_write" ON public.requisicoes_estoque FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'stock:requisitions:create')) WITH CHECK (public.has_permission(auth.uid(), 'stock:requisitions:create'));

-- =============================================
-- ONDA 3: ACL / Governance
-- =============================================
DROP POLICY IF EXISTS "Masters can manage all roles" ON public.user_roles;
CREATE POLICY "perm_user_roles_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'users:manage')) WITH CHECK (public.has_permission(auth.uid(), 'users:manage'));

DROP POLICY IF EXISTS "Masters can manage user_permissions" ON public.user_permissions;
CREATE POLICY "perm_user_permissions_manage" ON public.user_permissions FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'users:manage')) WITH CHECK (public.has_permission(auth.uid(), 'users:manage'));

DROP POLICY IF EXISTS "Masters can manage role_permissions" ON public.role_permissions;
CREATE POLICY "perm_role_permissions_manage" ON public.role_permissions FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'users:manage')) WITH CHECK (public.has_permission(auth.uid(), 'users:manage'));

DROP POLICY IF EXISTS "Masters can manage job_roles" ON public.job_roles;
CREATE POLICY "perm_job_roles_manage" ON public.job_roles FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'users:manage')) WITH CHECK (public.has_permission(auth.uid(), 'users:manage'));

-- =============================================
-- ONDA 4: Config / AI / Ficha / Metas / Audit / Turnos
-- =============================================
DROP POLICY IF EXISTS "Admin or Compras can manage canais_venda" ON public.canais_venda;
CREATE POLICY "perm_canais_venda_select" ON public.canais_venda FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'pricing:read'));
CREATE POLICY "perm_canais_venda_write" ON public.canais_venda FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pricing:manage')) WITH CHECK (public.has_permission(auth.uid(), 'pricing:manage'));

DROP POLICY IF EXISTS "Admin or Compras can manage config_precificacao" ON public.config_precificacao;
CREATE POLICY "perm_config_prec_select" ON public.config_precificacao FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'pricing:read'));
CREATE POLICY "perm_config_prec_write" ON public.config_precificacao FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pricing:manage')) WITH CHECK (public.has_permission(auth.uid(), 'pricing:manage'));

DROP POLICY IF EXISTS "Admin or Compras can manage precificacao_canal" ON public.precificacao_canal;
CREATE POLICY "perm_prec_canal_select" ON public.precificacao_canal FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'pricing:read'));
CREATE POLICY "perm_prec_canal_write" ON public.precificacao_canal FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'pricing:manage')) WITH CHECK (public.has_permission(auth.uid(), 'pricing:manage'));

DROP POLICY IF EXISTS "Admin or Compras can manage ficha_componentes" ON public.ficha_componentes;
CREATE POLICY "perm_ficha_comp_select" ON public.ficha_componentes FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recipes:read'));
CREATE POLICY "perm_ficha_comp_write" ON public.ficha_componentes FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'recipes:edit')) WITH CHECK (public.has_permission(auth.uid(), 'recipes:edit'));

DROP POLICY IF EXISTS "Admin or Compras can manage ficha_componente_itens" ON public.ficha_componente_itens;
CREATE POLICY "perm_ficha_itens_select" ON public.ficha_componente_itens FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recipes:read'));
CREATE POLICY "perm_ficha_itens_write" ON public.ficha_componente_itens FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'recipes:edit')) WITH CHECK (public.has_permission(auth.uid(), 'recipes:edit'));

DROP POLICY IF EXISTS "Admin can manage metas_cmv" ON public.metas_cmv;
CREATE POLICY "perm_metas_cmv_select" ON public.metas_cmv FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'cmv:read'));
CREATE POLICY "perm_metas_cmv_write" ON public.metas_cmv FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'settings:manage')) WITH CHECK (public.has_permission(auth.uid(), 'settings:manage'));

DROP POLICY IF EXISTS "Admin or Compras can manage cenarios_simulacao" ON public.cenarios_simulacao;
CREATE POLICY "perm_cenarios_select" ON public.cenarios_simulacao FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'recipes:read'));
CREATE POLICY "perm_cenarios_write" ON public.cenarios_simulacao FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'recipes:edit')) WITH CHECK (public.has_permission(auth.uid(), 'recipes:edit'));

DROP POLICY IF EXISTS "Admin or Compras can manage ai_insights" ON public.ai_insights;
CREATE POLICY "perm_ai_insights_select" ON public.ai_insights FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'analytics:read'));
CREATE POLICY "perm_ai_insights_write" ON public.ai_insights FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'analytics:manage')) WITH CHECK (public.has_permission(auth.uid(), 'analytics:manage'));

DROP POLICY IF EXISTS "Admin can manage ai_score" ON public.ai_score_historico;
CREATE POLICY "perm_ai_score_select" ON public.ai_score_historico FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'analytics:read'));
CREATE POLICY "perm_ai_score_write" ON public.ai_score_historico FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'analytics:manage')) WITH CHECK (public.has_permission(auth.uid(), 'analytics:manage'));

DROP POLICY IF EXISTS "Admins can read integration logs" ON public.integration_logs;
CREATE POLICY "perm_integration_logs_select" ON public.integration_logs FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'system:read'));

DROP POLICY IF EXISTS "Masters or Compras can read audit" ON public.audit_log;
CREATE POLICY "perm_audit_log_select" ON public.audit_log FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'system:read'));

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "perm_audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'system:read'));

DROP POLICY IF EXISTS "Admin can manage turnos" ON public.turnos;
CREATE POLICY "perm_turnos_select" ON public.turnos FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'settings:manage'));
CREATE POLICY "perm_turnos_write" ON public.turnos FOR ALL TO authenticated USING (public.has_permission(auth.uid(), 'settings:manage')) WITH CHECK (public.has_permission(auth.uid(), 'settings:manage'));

-- Storage
DROP POLICY IF EXISTS "Gerente can manage rh docs" ON storage.objects;
DROP POLICY IF EXISTS "Masters can manage rh docs" ON storage.objects;
CREATE POLICY "perm_rh_docs_storage" ON storage.objects FOR ALL TO authenticated
  USING ((bucket_id = 'rh-documentos') AND public.has_permission(auth.uid(), 'rh:manage'))
  WITH CHECK ((bucket_id = 'rh-documentos') AND public.has_permission(auth.uid(), 'rh:manage'));
