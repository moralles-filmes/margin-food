CREATE OR REPLACE FUNCTION public.reject_ponto_record(p_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record rh_ponto_registros%ROWTYPE;
  v_caller uuid;
  v_company uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION '401: Não autenticado';
  END IF;

  -- Tenant resolution
  SELECT company_id INTO v_company FROM profiles WHERE id = v_caller;
  IF v_company IS NULL OR v_company = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '403: Tenant não resolvido';
  END IF;

  -- Permission check
  IF NOT has_permission(v_caller, 'rh:ponto:manage') THEN
    RAISE EXCEPTION '403: Sem permissão rh:ponto:manage';
  END IF;

  -- Lock the record
  SELECT * INTO v_record
  FROM rh_ponto_registros
  WHERE id = p_id AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Registro não encontrado';
  END IF;

  -- Idempotency: already rejected
  IF v_record.status = 'REJEITADO' THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Já rejeitado');
  END IF;

  -- Reject
  UPDATE rh_ponto_registros SET
    status = 'REJEITADO',
    rejeitado_por = v_caller,
    rejeitado_em = now(),
    motivo_rejeicao = COALESCE(NULLIF(p_reason, ''), 'Rejeitado pelo gestor'),
    updated_at = now()
  WHERE id = p_id;

  -- Audit
  INSERT INTO rh_audit_log (acao, entidade, entidade_id, company_id, user_id, antes, depois)
  VALUES (
    'rejeitar_ponto',
    'rh_ponto_registros',
    p_id::text,
    v_company,
    v_caller,
    jsonb_build_object('status', v_record.status, 'aprovado', v_record.aprovado),
    jsonb_build_object('status', 'REJEITADO', 'motivo', p_reason)
  );

  RETURN jsonb_build_object('status', 'ok', 'message', 'Ponto rejeitado');
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- H3: Block hard DELETE on all critical RH tables
-- ═══════════════════════════════════════════════════════════

-- rh_colaboradores
DROP POLICY IF EXISTS "rh_colaboradores_delete" ON rh_colaboradores;
CREATE POLICY "rh_colaboradores_delete" ON rh_colaboradores
  FOR DELETE TO authenticated USING (false);

-- rh_banco_horas
DROP POLICY IF EXISTS "rh_banco_horas_delete" ON rh_banco_horas;
CREATE POLICY "rh_banco_horas_delete" ON rh_banco_horas
  FOR DELETE TO authenticated USING (false);

-- rh_beneficios
DROP POLICY IF EXISTS "rh_beneficios_delete" ON rh_beneficios;
CREATE POLICY "rh_beneficios_delete" ON rh_beneficios
  FOR DELETE TO authenticated USING (false);

-- rh_comunicados
DROP POLICY IF EXISTS "rh_comunicados_delete" ON rh_comunicados;
CREATE POLICY "rh_comunicados_delete" ON rh_comunicados
  FOR DELETE TO authenticated USING (false);

-- rh_ferias_afastamentos
DROP POLICY IF EXISTS "rh_ferias_afastamentos_delete" ON rh_ferias_afastamentos;
CREATE POLICY "rh_ferias_afastamentos_delete" ON rh_ferias_afastamentos
  FOR DELETE TO authenticated USING (false);

-- rh_ferias_saldo
DROP POLICY IF EXISTS "rh_ferias_saldo_delete" ON rh_ferias_saldo;
CREATE POLICY "rh_ferias_saldo_delete" ON rh_ferias_saldo
  FOR DELETE TO authenticated USING (false);

-- rh_folha_pagamento
DROP POLICY IF EXISTS "rh_folha_pagamento_delete" ON rh_folha_pagamento;
CREATE POLICY "rh_folha_pagamento_delete" ON rh_folha_pagamento
  FOR DELETE TO authenticated USING (false);

-- rh_onboarding
DROP POLICY IF EXISTS "rh_onboarding_delete" ON rh_onboarding;
CREATE POLICY "rh_onboarding_delete" ON rh_onboarding
  FOR DELETE TO authenticated USING (false);

-- rh_trilhas_treinamento
DROP POLICY IF EXISTS "rh_trilhas_treinamento_delete" ON rh_trilhas_treinamento;
CREATE POLICY "rh_trilhas_treinamento_delete" ON rh_trilhas_treinamento
  FOR DELETE TO authenticated USING (false);

-- rh_progresso_treinamento
DROP POLICY IF EXISTS "rh_progresso_treinamento_delete" ON rh_progresso_treinamento;
CREATE POLICY "rh_progresso_treinamento_delete" ON rh_progresso_treinamento
  FOR DELETE TO authenticated USING (false);

-- rh_tarefas
DROP POLICY IF EXISTS "rh_tarefas_delete" ON rh_tarefas;
CREATE POLICY "rh_tarefas_delete" ON rh_tarefas
  FOR DELETE TO authenticated USING (false);

-- rh_escalas
DROP POLICY IF EXISTS "rh_escalas_delete" ON rh_escalas;
CREATE POLICY "rh_escalas_delete" ON rh_escalas
  FOR DELETE TO authenticated USING (false);

-- rh_escala_slots
DROP POLICY IF EXISTS "rh_escala_slots_delete" ON rh_escala_slots;
CREATE POLICY "rh_escala_slots_delete" ON rh_escala_slots
  FOR DELETE TO authenticated USING (false);

-- rh_trocas_turno
DROP POLICY IF EXISTS "rh_trocas_turno_delete" ON rh_trocas_turno;
CREATE POLICY "rh_trocas_turno_delete" ON rh_trocas_turno
  FOR DELETE TO authenticated USING (false);

-- rh_documentos
DROP POLICY IF EXISTS "rh_documentos_delete" ON rh_documentos;
CREATE POLICY "rh_documentos_delete" ON rh_documentos
  FOR DELETE TO authenticated USING (false);

-- rh_epis
DROP POLICY IF EXISTS "rh_epis_delete" ON rh_epis;
CREATE POLICY "rh_epis_delete" ON rh_epis
  FOR DELETE TO authenticated USING (false);

-- rh_exames
DROP POLICY IF EXISTS "rh_exames_delete" ON rh_exames;
CREATE POLICY "rh_exames_delete" ON rh_exames
  FOR DELETE TO authenticated USING (false);

-- rh_incidentes
DROP POLICY IF EXISTS "rh_incidentes_delete" ON rh_incidentes;
CREATE POLICY "rh_incidentes_delete" ON rh_incidentes
  FOR DELETE TO authenticated USING (false);

-- rh_audit_log (never delete audit)
DROP POLICY IF EXISTS "rh_audit_log_delete" ON rh_audit_log;
CREATE POLICY "rh_audit_log_delete" ON rh_audit_log
  FOR DELETE TO authenticated USING (false);

-- rh_custos_mensais (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rh_custos_mensais') THEN
    EXECUTE 'DROP POLICY IF EXISTS "rh_custos_mensais_delete" ON rh_custos_mensais';
    EXECUTE 'CREATE POLICY "rh_custos_mensais_delete" ON rh_custos_mensais FOR DELETE TO authenticated USING (false)';
  END IF;
END $$;

-- rh_ocorrencias_disciplinares (if exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rh_ocorrencias_disciplinares') THEN
    EXECUTE 'DROP POLICY IF EXISTS "rh_ocorrencias_disciplinares_delete" ON rh_ocorrencias_disciplinares';
    EXECUTE 'CREATE POLICY "rh_ocorrencias_disciplinares_delete" ON rh_ocorrencias_disciplinares FOR DELETE TO authenticated USING (false)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- W8-W12: Add trg_set_updated_at triggers to RH tables
-- ═══════════════════════════════════════════════════════════

-- Ensure the function exists (may already exist from other modules)