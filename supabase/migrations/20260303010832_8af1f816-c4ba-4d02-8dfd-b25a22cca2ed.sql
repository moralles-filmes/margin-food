-- ============================================================
-- IDEMPOTENT RLS CLEANUP: Remove FORCE RLS from existing tables
-- ============================================================

DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'admin_actions_log','ai_insights','ai_logs','ai_score_historico',
    'aprovacoes_solic_compra_mercado','audit_inventario_log','audit_log','audit_logs',
    'canais_venda','cenarios_simulacao','companies','config_precificacao',
    'confirmacoes_recebimento','dashboard_cache','faturamento_periodos_legacy',
    'ficha_componente_itens','ficha_componentes','fin_audit_logs','fin_categorias',
    'fin_centros_custo','fin_contas','fin_contas_pagar','fin_contas_receber',
    'fin_dre_linhas','fin_lancamento_rateios','fin_lancamentos','fin_orcamentos',
    'fin_plano_contas','fin_rateios','fin_regras_categorizacao','financeiro_fechamento_caixa',
    'integration_logs','inventario_itens','inventarios','job_roles','metas_cmv',
    'movimentacoes_estoque','notifications','permissions','planning_metas_compra',
    'precificacao_canal','produtos','profiles','purchase_ignored_rules',
    'purchase_order_items','purchase_orders','purchase_reminders','purchase_requisition_audit',
    'purchase_requisition_items','purchase_requisitions','rbac_legacy_usage',
    'recebimento_itens','recebimentos','requisicao_estoque_itens','requisicoes_estoque',
    'rh_audit_log','rh_banco_horas','rh_beneficios','rh_colaboradores','rh_comunicados',
    'rh_custos_mensais','rh_disponibilidade','rh_documentos','rh_epis','rh_escala_slots',
    'rh_escalas','rh_exames','rh_ferias_afastamentos','rh_ferias_saldo','rh_folha_pagamento',
    'rh_incidentes','rh_ocorrencias_disciplinares','rh_onboarding','rh_ponto_ajustes',
    'rh_ponto_registros','rh_progresso_treinamento','rh_tarefas','rh_trilhas_treinamento',
    'rh_trocas_turno','role_permissions','salmon_config','salmon_daily_records',
    'salmon_entries','salmon_manipulations','salmon_purchase_targets','security_risk_register',
    'solic_compra_mercado','solic_compra_mercado_item','solicitacoes_compra',
    'stock_categories','stock_locations','stock_sku_counter','supplier_item_prices',
    'suppliers','system_bugs','turnos','user_permissions','user_roles'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', tbl);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not set NO FORCE RLS on table %: %', tbl, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;