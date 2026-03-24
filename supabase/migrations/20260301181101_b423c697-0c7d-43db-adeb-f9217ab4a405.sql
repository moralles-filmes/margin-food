
-- ============================================================
-- BATCH 3: TENANTIZE — RH tables + remaining
-- ============================================================
DO $$
DECLARE
  default_co uuid := '00000000-0000-0000-0000-000000000001';
  tbl text;
  tbls text[] := ARRAY[
    'rh_colaboradores','rh_folha_pagamento',
    'rh_banco_horas','rh_beneficios','rh_comunicados',
    'rh_custos_mensais','rh_disponibilidade','rh_documentos',
    'rh_epis','rh_escala_slots','rh_escalas',
    'rh_exames','rh_ferias_afastamentos','rh_ferias_saldo',
    'rh_incidentes','rh_ocorrencias_disciplinares',
    'rh_onboarding','rh_ponto_ajustes','rh_ponto_registros',
    'rh_progresso_treinamento','rh_tarefas',
    'rh_trilhas_treinamento','rh_trocas_turno',
    'rh_audit_log','purchase_requisition_audit'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name='company_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', tbl);
      EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', tbl, default_co);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT get_current_company_id()', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES companies(id)', tbl, tbl || '_company_fk');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || tbl || '_company_id', tbl);
    END IF;
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;

-- ============================================================
-- BATCH 3B: FORCE RLS on remaining tables (system/audit/global)
-- ============================================================
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'ai_insights','ai_logs','ai_score_historico',
    'audit_inventario_log','audit_log','audit_logs',
    'fin_audit_logs','integration_logs',
    'dashboard_cache',
    'rbac_legacy_usage'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;
