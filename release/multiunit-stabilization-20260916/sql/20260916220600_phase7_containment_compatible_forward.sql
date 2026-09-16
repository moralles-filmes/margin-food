-- Generated compatible F7 containment forward; historical source is unchanged.
-- Fase 7: privilégios fora de RLS, caches e helpers internos. Nenhuma reescrita de dados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'PHASE7_MIGRATION_REQUIRES_POSTGRES'; END IF;
 IF to_regnamespace('log_private') IS NULL
    OR to_regprocedure('public.deactivate_produto(uuid)') IS NULL
    OR to_regprocedure('public.upsert_supplier_price(text,uuid,numeric,text)') IS NULL
 THEN RAISE EXCEPTION 'PHASE7_REQUIRES_F3_F6_FORWARD_CHAIN'; END IF;
 IF has_function_privilege('authenticated','public.cleanup_old_audit_logs(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.refresh_materialized_views()','EXECUTE')
 THEN RAISE EXCEPTION 'PHASE7_REQUIRES_PHASE2_CONTAINMENT'; END IF;
 IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND (
      (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
      (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
      (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
      (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
      (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
    )) <> 17 THEN RAISE EXCEPTION 'PHASE7_HOTFIX_POLICY_COUNT_DRIFT'; END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text) FROM pg_policies p WHERE p.schemaname='public' AND (
      (p.tablename='stock_categories' AND p.policyname IN ('tenant_select_stock_categories','tenant_insert_stock_categories','tenant_update_stock_categories','tenant_delete_stock_categories','operational_active_lookup')) OR
      (p.tablename='stock_locations' AND p.policyname IN ('tenant_select_stock_locations','tenant_insert_stock_locations','tenant_update_stock_locations','tenant_delete_stock_locations','operational_active_lookup')) OR
      (p.tablename='stock_sectors' AND p.policyname IN ('tenant_select_stock_sectors','tenant_insert_stock_sectors','tenant_update_stock_sectors','tenant_delete_stock_sectors','operational_active_lookup')) OR
      (p.tablename='turnos' AND p.policyname='operational_active_lookup') OR
      (p.tablename='job_roles' AND p.policyname='tenant_select_job_roles')
    )) <> '9a49d198cabb2ec4f9fd1984e8c20404' THEN RAISE EXCEPTION 'PHASE7_HOTFIX_POLICY_DIGEST_DRIFT'; END IF;
END $preflight$;

-- DML preservado; nenhum caller de aplicação executa DDL/TRUNCATE/MAINTAIN.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.admin_actions_log FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ai_insights FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ai_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ai_score_historico FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.alertas_falta_estoque FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.app_config FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.aprovacoes_solic_compra_mercado FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.audit_inventario_log FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.canais_venda FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cenarios_simulacao FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cmv_cache FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.company_memberships FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.config_precificacao FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.confirmacoes_recebimento FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_fornecedores FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_ia_config FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_respostas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_sugestoes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_whatsapp_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacao_zapi_config FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.cotacoes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.dashboard_cache FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.faturamento_periodos_legacy FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.faturamento_periodos_legacy_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ficha_componente_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.ficha_componentes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_categorias FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_centros_custo FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_conciliacao_ignoradas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_config FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas_pagar FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas_pagar_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas_receber FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas_receber_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_contas_saldo_cache FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_dre_linhas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_lancamento_rateios FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_lancamentos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_lancamentos_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_orcamentos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_plano_contas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_agenda_items FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_decision_actions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_decision_revisions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_decisions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_minutes_revisions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_session_participants FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_presentation_sessions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_rateios FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.fin_regras_categorizacao FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.financeiro_fechamento_caixa FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.financeiro_fechamento_caixa_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.financeiro_fechamento_marca_valores FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.financeiro_fechamento_marcas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.inventario_conferentes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.inventario_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.inventario_itens_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.inventarios FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.inventarios_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.job_roles FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.listas_fixas_setor FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.listas_fixas_setor_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.metas_cmv FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.movimentacoes_estoque FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.movimentacoes_estoque_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.notifications FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.permissions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.planning_metas_compra FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.precificacao_canal FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.produtos_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_ignored_rules FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_order_items FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_order_items_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_orders FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_orders_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_reminders FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_requisition_audit FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_requisition_items FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.purchase_requisitions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rbac_legacy_usage FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.recebimento_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.recebimento_itens_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.recebimentos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.recebimentos_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.requisicao_estoque_itens FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.requisicoes_estoque FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_audit_log FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_banco_horas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_beneficios FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_colaboradores FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_comunicados FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_custos_mensais FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_disponibilidade FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_documentos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_epis FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_escala_slots FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_escalas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_exames FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_ferias_afastamentos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_ferias_saldo FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_folha_pagamento FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_incidentes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_ocorrencias_disciplinares FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_onboarding FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_ponto_ajustes FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_ponto_registros FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_progresso_treinamento FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_tarefas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_trilhas_treinamento FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.rh_trocas_turno FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.role_permissions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_auditorias_compra FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_config FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_daily_records FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_daily_records_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_entries FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_entries_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_manipulations FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_manipulations_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_metas_provisionadas FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.salmon_purchase_targets FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.security_risk_register FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.solic_compra_mercado FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.solic_compra_mercado_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.solic_compra_mercado_item FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.solicitacoes_compra FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.stock_categories FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.stock_locations FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.stock_sectors FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.stock_sku_counter FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.suppliers_bkp_reset_20260301 FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.system_bugs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.turnos FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.unidades_medida FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.user_permissions FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_consumo_itens_semana FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_fin_dre_mensal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_fin_fluxo_caixa_diario FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_giro_estoque FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mv_pedidos_status_resumo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_set_cache(text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rbac_sql_lint_report_internal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rbac_top_legacy_usage(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_saldo_cache(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_cache(text,jsonb,integer) FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
