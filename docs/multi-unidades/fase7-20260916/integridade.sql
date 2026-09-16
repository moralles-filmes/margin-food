-- Agregados apenas; classificações de identidade/membership/legado precisam revisão.
BEGIN TRANSACTION READ ONLY;
select jsonb_build_object('captured_at',now(),'counts',(select jsonb_agg(to_jsonb(x)) from (select 'admin_actions_log' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."admin_actions_log"
union all
select 'ai_insights' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."ai_insights"
union all
select 'ai_logs' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."ai_logs"
union all
select 'ai_score_historico' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."ai_score_historico"
union all
select 'alertas_falta_estoque' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."alertas_falta_estoque"
union all
select 'app_config' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."app_config"
union all
select 'aprovacoes_solic_compra_mercado' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."aprovacoes_solic_compra_mercado"
union all
select 'audit_inventario_log' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."audit_inventario_log"
union all
select 'audit_log' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."audit_log"
union all
select 'audit_logs' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."audit_logs"
union all
select 'canais_venda' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."canais_venda"
union all
select 'cenarios_simulacao' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cenarios_simulacao"
union all
select 'cmv_cache' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cmv_cache"
union all
select 'companies' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."companies"
union all
select 'company_memberships' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."company_memberships"
union all
select 'config_precificacao' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."config_precificacao"
union all
select 'confirmacoes_recebimento' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."confirmacoes_recebimento"
union all
select 'cotacao_fornecedores' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_fornecedores"
union all
select 'cotacao_ia_config' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_ia_config"
union all
select 'cotacao_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_itens"
union all
select 'cotacao_respostas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_respostas"
union all
select 'cotacao_sugestoes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_sugestoes"
union all
select 'cotacao_whatsapp_logs' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_whatsapp_logs"
union all
select 'cotacao_zapi_config' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacao_zapi_config"
union all
select 'cotacoes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."cotacoes"
union all
select 'dashboard_cache' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."dashboard_cache"
union all
select 'faturamento_periodos_legacy' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."faturamento_periodos_legacy"
union all
select 'faturamento_periodos_legacy_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."faturamento_periodos_legacy_bkp_reset_20260301"
union all
select 'ficha_componente_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."ficha_componente_itens"
union all
select 'ficha_componentes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."ficha_componentes"
union all
select 'fin_audit_logs' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_audit_logs"
union all
select 'fin_categorias' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_categorias"
union all
select 'fin_centros_custo' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_centros_custo"
union all
select 'fin_conciliacao_ignoradas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_conciliacao_ignoradas"
union all
select 'fin_conciliacao_vinculos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_conciliacao_vinculos"
union all
select 'fin_config' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_config"
union all
select 'fin_contas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas"
union all
select 'fin_contas_pagar' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas_pagar"
union all
select 'fin_contas_pagar_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas_pagar_bkp_reset_20260301"
union all
select 'fin_contas_receber' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas_receber"
union all
select 'fin_contas_receber_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas_receber_bkp_reset_20260301"
union all
select 'fin_contas_saldo_cache' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_contas_saldo_cache"
union all
select 'fin_dre_linhas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_dre_linhas"
union all
select 'fin_lancamento_rateios' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_lancamento_rateios"
union all
select 'fin_lancamentos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_lancamentos"
union all
select 'fin_lancamentos_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_lancamentos_bkp_reset_20260301"
union all
select 'fin_orcamentos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_orcamentos"
union all
select 'fin_plano_contas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_plano_contas"
union all
select 'fin_presentation_agenda_items' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_agenda_items"
union all
select 'fin_presentation_decision_actions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_decision_actions"
union all
select 'fin_presentation_decision_revisions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_decision_revisions"
union all
select 'fin_presentation_decisions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_decisions"
union all
select 'fin_presentation_minutes_revisions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_minutes_revisions"
union all
select 'fin_presentation_session_participants' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_session_participants"
union all
select 'fin_presentation_sessions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_presentation_sessions"
union all
select 'fin_rateios' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_rateios"
union all
select 'fin_regras_categorizacao' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."fin_regras_categorizacao"
union all
select 'financeiro_fechamento_caixa' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."financeiro_fechamento_caixa"
union all
select 'financeiro_fechamento_caixa_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."financeiro_fechamento_caixa_bkp_reset_20260301"
union all
select 'financeiro_fechamento_marca_valores' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."financeiro_fechamento_marca_valores"
union all
select 'financeiro_fechamento_marcas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."financeiro_fechamento_marcas"
union all
select 'integration_logs' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."integration_logs"
union all
select 'inventario_conferentes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."inventario_conferentes"
union all
select 'inventario_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."inventario_itens"
union all
select 'inventario_itens_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."inventario_itens_bkp_reset_20260301"
union all
select 'inventarios' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."inventarios"
union all
select 'inventarios_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."inventarios_bkp_reset_20260301"
union all
select 'job_roles' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."job_roles"
union all
select 'listas_fixas_setor' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."listas_fixas_setor"
union all
select 'listas_fixas_setor_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."listas_fixas_setor_itens"
union all
select 'metas_cmv' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."metas_cmv"
union all
select 'movimentacoes_estoque' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."movimentacoes_estoque"
union all
select 'movimentacoes_estoque_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."movimentacoes_estoque_bkp_reset_20260301"
union all
select 'notifications' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."notifications"
union all
select 'permissions' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."permissions"
union all
select 'planning_metas_compra' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."planning_metas_compra"
union all
select 'precificacao_canal' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."precificacao_canal"
union all
select 'produtos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."produtos"
union all
select 'produtos_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."produtos_bkp_reset_20260301"
union all
select 'profiles' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."profiles"
union all
select 'purchase_ignored_rules' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_ignored_rules"
union all
select 'purchase_order_items' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_order_items"
union all
select 'purchase_order_items_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_order_items_bkp_reset_20260301"
union all
select 'purchase_orders' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_orders"
union all
select 'purchase_orders_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_orders_bkp_reset_20260301"
union all
select 'purchase_reminders' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_reminders"
union all
select 'purchase_requisition_audit' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_requisition_audit"
union all
select 'purchase_requisition_items' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_requisition_items"
union all
select 'purchase_requisitions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."purchase_requisitions"
union all
select 'rbac_legacy_usage' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rbac_legacy_usage"
union all
select 'recebimento_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."recebimento_itens"
union all
select 'recebimento_itens_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."recebimento_itens_bkp_reset_20260301"
union all
select 'recebimentos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."recebimentos"
union all
select 'recebimentos_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."recebimentos_bkp_reset_20260301"
union all
select 'requisicao_estoque_itens' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."requisicao_estoque_itens"
union all
select 'requisicoes_estoque' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."requisicoes_estoque"
union all
select 'rh_audit_log' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_audit_log"
union all
select 'rh_banco_horas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_banco_horas"
union all
select 'rh_beneficios' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_beneficios"
union all
select 'rh_colaboradores' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_colaboradores"
union all
select 'rh_comunicados' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_comunicados"
union all
select 'rh_custos_mensais' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_custos_mensais"
union all
select 'rh_disponibilidade' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_disponibilidade"
union all
select 'rh_documentos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_documentos"
union all
select 'rh_epis' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_epis"
union all
select 'rh_escala_slots' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_escala_slots"
union all
select 'rh_escalas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_escalas"
union all
select 'rh_exames' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_exames"
union all
select 'rh_ferias_afastamentos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_ferias_afastamentos"
union all
select 'rh_ferias_saldo' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_ferias_saldo"
union all
select 'rh_folha_pagamento' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_folha_pagamento"
union all
select 'rh_incidentes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_incidentes"
union all
select 'rh_ocorrencias_disciplinares' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_ocorrencias_disciplinares"
union all
select 'rh_onboarding' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_onboarding"
union all
select 'rh_ponto_ajustes' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_ponto_ajustes"
union all
select 'rh_ponto_registros' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_ponto_registros"
union all
select 'rh_progresso_treinamento' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_progresso_treinamento"
union all
select 'rh_tarefas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_tarefas"
union all
select 'rh_trilhas_treinamento' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_trilhas_treinamento"
union all
select 'rh_trocas_turno' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."rh_trocas_turno"
union all
select 'role_permissions' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."role_permissions"
union all
select 'salmon_auditorias_compra' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_auditorias_compra"
union all
select 'salmon_config' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_config"
union all
select 'salmon_daily_records' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_daily_records"
union all
select 'salmon_daily_records_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_daily_records_bkp_reset_20260301"
union all
select 'salmon_entries' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_entries"
union all
select 'salmon_entries_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_entries_bkp_reset_20260301"
union all
select 'salmon_manipulations' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_manipulations"
union all
select 'salmon_manipulations_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_manipulations_bkp_reset_20260301"
union all
select 'salmon_metas_provisionadas' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_metas_provisionadas"
union all
select 'salmon_purchase_targets' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."salmon_purchase_targets"
union all
select 'security_risk_register' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."security_risk_register"
union all
select 'solic_compra_mercado' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."solic_compra_mercado"
union all
select 'solic_compra_mercado_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."solic_compra_mercado_bkp_reset_20260301"
union all
select 'solic_compra_mercado_item' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."solic_compra_mercado_item"
union all
select 'solicitacoes_compra' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."solicitacoes_compra"
union all
select 'stock_categories' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."stock_categories"
union all
select 'stock_locations' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."stock_locations"
union all
select 'stock_sectors' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."stock_sectors"
union all
select 'stock_sku_counter' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."stock_sku_counter"
union all
select 'supplier_item_prices' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."supplier_item_prices"
union all
select 'suppliers' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."suppliers"
union all
select 'suppliers_bkp_reset_20260301' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."suppliers_bkp_reset_20260301"
union all
select 'system_bugs' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."system_bugs"
union all
select 'turnos' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."turnos"
union all
select 'unidades_medida' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."unidades_medida"
union all
select 'user_permissions' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."user_permissions"
union all
select 'user_roles' as relation, count(*) as rows, count(*) filter(where company_id is null) as tenant_null, count(*) filter(where company_id='00000000-0000-0000-0000-000000000001') as placeholder, count(distinct company_id) as tenants from public."user_roles"
union all
select 'z_canary_test' as relation, count(*) as rows, null::bigint as tenant_null, null::bigint as placeholder, null::bigint as tenants from public."z_canary_test") x),'foreign_keys',(select jsonb_agg(to_jsonb(x)) from (select 'alertas_falta_estoque.alertas_falta_estoque_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."alertas_falta_estoque" s left join public."produtos" t on s.produto_id=t.id
union all
select 'alertas_falta_estoque.alertas_falta_estoque_requisicao_id_fkey' as relation, count(*) filter(where s.requisicao_id is not null) as references_present, count(*) filter(where s.requisicao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."alertas_falta_estoque" s left join public."requisicoes_estoque" t on s.requisicao_id=t.id
union all
select 'aprovacoes_solic_compra_mercado.aprovacoes_solic_compra_mercado_solicitacao_id_fkey' as relation, count(*) filter(where s.solicitacao_id is not null) as references_present, count(*) filter(where s.solicitacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."aprovacoes_solic_compra_mercado" s left join public."solic_compra_mercado" t on s.solicitacao_id=t.id
union all
select 'audit_inventario_log.audit_inventario_log_inventario_id_fkey' as relation, count(*) filter(where s.inventario_id is not null) as references_present, count(*) filter(where s.inventario_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."audit_inventario_log" s left join public."inventarios" t on s.inventario_id=t.id
union all
select 'cenarios_simulacao.cenarios_simulacao_componente_id_fkey' as relation, count(*) filter(where s.componente_id is not null) as references_present, count(*) filter(where s.componente_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cenarios_simulacao" s left join public."ficha_componentes" t on s.componente_id=t.id
union all
select 'company_memberships.company_memberships_job_role_id_fkey' as relation, count(*) filter(where s.job_role_id is not null) as references_present, count(*) filter(where s.job_role_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."company_memberships" s left join public."job_roles" t on s.job_role_id=t.id
union all
select 'company_memberships.company_memberships_user_id_fkey' as relation, count(*) filter(where s.user_id is not null) as references_present, count(*) filter(where s.user_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."company_memberships" s left join public."profiles" t on s.user_id=t.id
union all
select 'confirmacoes_recebimento.confirmacoes_recebimento_recebimento_id_fkey' as relation, count(*) filter(where s.recebimento_id is not null) as references_present, count(*) filter(where s.recebimento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."confirmacoes_recebimento" s left join public."recebimentos" t on s.recebimento_id=t.id
union all
select 'confirmacoes_recebimento.confirmacoes_recebimento_solicitacao_id_fkey' as relation, count(*) filter(where s.solicitacao_id is not null) as references_present, count(*) filter(where s.solicitacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."confirmacoes_recebimento" s left join public."solic_compra_mercado" t on s.solicitacao_id=t.id
union all
select 'cotacao_fornecedores.cotacao_fornecedores_cotacao_id_fkey' as relation, count(*) filter(where s.cotacao_id is not null) as references_present, count(*) filter(where s.cotacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_fornecedores" s left join public."cotacoes" t on s.cotacao_id=t.id
union all
select 'cotacao_fornecedores.cotacao_fornecedores_supplier_id_fkey' as relation, count(*) filter(where s.supplier_id is not null) as references_present, count(*) filter(where s.supplier_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_fornecedores" s left join public."suppliers" t on s.supplier_id=t.id
union all
select 'cotacao_itens.cotacao_itens_cotacao_id_fkey' as relation, count(*) filter(where s.cotacao_id is not null) as references_present, count(*) filter(where s.cotacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_itens" s left join public."cotacoes" t on s.cotacao_id=t.id
union all
select 'cotacao_itens.cotacao_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'cotacao_respostas.cotacao_respostas_cotacao_fornecedor_id_fkey' as relation, count(*) filter(where s.cotacao_fornecedor_id is not null) as references_present, count(*) filter(where s.cotacao_fornecedor_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_respostas" s left join public."cotacao_fornecedores" t on s.cotacao_fornecedor_id=t.id
union all
select 'cotacao_respostas.cotacao_respostas_cotacao_item_id_fkey' as relation, count(*) filter(where s.cotacao_item_id is not null) as references_present, count(*) filter(where s.cotacao_item_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_respostas" s left join public."cotacao_itens" t on s.cotacao_item_id=t.id
union all
select 'cotacao_sugestoes.cotacao_sugestoes_cotacao_id_fkey' as relation, count(*) filter(where s.cotacao_id is not null) as references_present, count(*) filter(where s.cotacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_sugestoes" s left join public."cotacoes" t on s.cotacao_id=t.id
union all
select 'cotacao_whatsapp_logs.cotacao_whatsapp_logs_cotacao_fornecedor_id_fkey' as relation, count(*) filter(where s.cotacao_fornecedor_id is not null) as references_present, count(*) filter(where s.cotacao_fornecedor_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_whatsapp_logs" s left join public."cotacao_fornecedores" t on s.cotacao_fornecedor_id=t.id
union all
select 'cotacao_whatsapp_logs.cotacao_whatsapp_logs_cotacao_id_fkey' as relation, count(*) filter(where s.cotacao_id is not null) as references_present, count(*) filter(where s.cotacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."cotacao_whatsapp_logs" s left join public."cotacoes" t on s.cotacao_id=t.id
union all
select 'ficha_componente_itens.ficha_componente_itens_componente_pai_id_fkey' as relation, count(*) filter(where s.componente_pai_id is not null) as references_present, count(*) filter(where s.componente_pai_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."ficha_componente_itens" s left join public."ficha_componentes" t on s.componente_pai_id=t.id
union all
select 'ficha_componente_itens.ficha_componente_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."ficha_componente_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'fin_categorias.fin_categorias_centro_custo_padrao_id_fkey' as relation, count(*) filter(where s.centro_custo_padrao_id is not null) as references_present, count(*) filter(where s.centro_custo_padrao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_categorias" s left join public."fin_centros_custo" t on s.centro_custo_padrao_id=t.id
union all
select 'fin_categorias.fin_categorias_parent_id_fkey' as relation, count(*) filter(where s.parent_id is not null) as references_present, count(*) filter(where s.parent_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_categorias" s left join public."fin_categorias" t on s.parent_id=t.id
union all
select 'fin_categorias.fin_categorias_plano_contas_id_fkey' as relation, count(*) filter(where s.plano_contas_id is not null) as references_present, count(*) filter(where s.plano_contas_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_categorias" s left join public."fin_plano_contas" t on s.plano_contas_id=t.id
union all
select 'fin_conciliacao_ignoradas.fin_conciliacao_ignoradas_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_conciliacao_ignoradas" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_conciliacao_ignoradas.fin_conciliacao_ignoradas_lancamento_origem_id_fkey' as relation, count(*) filter(where s.lancamento_origem_id is not null) as references_present, count(*) filter(where s.lancamento_origem_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_conciliacao_ignoradas" s left join public."fin_lancamentos" t on s.lancamento_origem_id=t.id
union all
select 'fin_conciliacao_vinculos.fin_conciliacao_vinculos_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_conciliacao_vinculos" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_conciliacao_vinculos.fin_conciliacao_vinculos_lancamento_id_fkey' as relation, count(*) filter(where s.lancamento_id is not null) as references_present, count(*) filter(where s.lancamento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_conciliacao_vinculos" s left join public."fin_lancamentos" t on s.lancamento_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_lancamento_id_fkey' as relation, count(*) filter(where s.lancamento_id is not null) as references_present, count(*) filter(where s.lancamento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_lancamentos" t on s.lancamento_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_lancamento_pai_id_fkey' as relation, count(*) filter(where s.lancamento_pai_id is not null) as references_present, count(*) filter(where s.lancamento_pai_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_contas_pagar" t on s.lancamento_pai_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_plano_contas_id_fkey' as relation, count(*) filter(where s.plano_contas_id is not null) as references_present, count(*) filter(where s.plano_contas_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."fin_plano_contas" t on s.plano_contas_id=t.id
union all
select 'fin_contas_pagar.fin_contas_pagar_supplier_id_fkey' as relation, count(*) filter(where s.supplier_id is not null) as references_present, count(*) filter(where s.supplier_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_pagar" s left join public."suppliers" t on s.supplier_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_lancamento_id_fkey' as relation, count(*) filter(where s.lancamento_id is not null) as references_present, count(*) filter(where s.lancamento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_lancamentos" t on s.lancamento_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_lancamento_pai_id_fkey' as relation, count(*) filter(where s.lancamento_pai_id is not null) as references_present, count(*) filter(where s.lancamento_pai_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_contas_receber" t on s.lancamento_pai_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_plano_contas_id_fkey' as relation, count(*) filter(where s.plano_contas_id is not null) as references_present, count(*) filter(where s.plano_contas_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."fin_plano_contas" t on s.plano_contas_id=t.id
union all
select 'fin_contas_receber.fin_contas_receber_supplier_id_fkey' as relation, count(*) filter(where s.supplier_id is not null) as references_present, count(*) filter(where s.supplier_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_receber" s left join public."suppliers" t on s.supplier_id=t.id
union all
select 'fin_contas_saldo_cache.fin_contas_saldo_cache_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_contas_saldo_cache" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_lancamento_rateios.fin_lancamento_rateios_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamento_rateios" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_lancamento_rateios.fin_lancamento_rateios_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamento_rateios" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_conta_destino_id_fkey' as relation, count(*) filter(where s.conta_destino_id is not null) as references_present, count(*) filter(where s.conta_destino_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_contas" t on s.conta_destino_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_conta_id_fkey' as relation, count(*) filter(where s.conta_id is not null) as references_present, count(*) filter(where s.conta_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_contas" t on s.conta_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_lancamento_pai_id_fkey' as relation, count(*) filter(where s.lancamento_pai_id is not null) as references_present, count(*) filter(where s.lancamento_pai_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_lancamentos" t on s.lancamento_pai_id=t.id
union all
select 'fin_lancamentos.fin_lancamentos_plano_contas_id_fkey' as relation, count(*) filter(where s.plano_contas_id is not null) as references_present, count(*) filter(where s.plano_contas_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_lancamentos" s left join public."fin_plano_contas" t on s.plano_contas_id=t.id
union all
select 'fin_orcamentos.fin_orcamentos_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_orcamentos" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_plano_contas.fin_plano_contas_pai_id_fkey' as relation, count(*) filter(where s.pai_id is not null) as references_present, count(*) filter(where s.pai_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_plano_contas" s left join public."fin_plano_contas" t on s.pai_id=t.id
union all
select 'fin_presentation_agenda_items.fin_presentation_agenda_items_session_id_fkey' as relation, count(*) filter(where s.session_id is not null) as references_present, count(*) filter(where s.session_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_agenda_items" s left join public."fin_presentation_sessions" t on s.session_id=t.id
union all
select 'fin_presentation_decision_actions.fin_presentation_decision_actions_decision_id_fkey' as relation, count(*) filter(where s.decision_id is not null) as references_present, count(*) filter(where s.decision_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_decision_actions" s left join public."fin_presentation_decisions" t on s.decision_id=t.id
union all
select 'fin_presentation_decision_revisions.fin_presentation_decision_revisions_decision_id_fkey' as relation, count(*) filter(where s.decision_id is not null) as references_present, count(*) filter(where s.decision_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_decision_revisions" s left join public."fin_presentation_decisions" t on s.decision_id=t.id
union all
select 'fin_presentation_decisions.fin_presentation_decisions_current_revision_fk' as relation, count(*) filter(where s.current_revision_id is not null) as references_present, count(*) filter(where s.current_revision_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_decisions" s left join public."fin_presentation_decision_revisions" t on s.current_revision_id=t.id
union all
select 'fin_presentation_minutes_revisions.fin_presentation_minutes_revisions_session_id_fkey' as relation, count(*) filter(where s.session_id is not null) as references_present, count(*) filter(where s.session_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_minutes_revisions" s left join public."fin_presentation_sessions" t on s.session_id=t.id
union all
select 'fin_presentation_session_participants.fin_presentation_session_participants_session_id_fkey' as relation, count(*) filter(where s.session_id is not null) as references_present, count(*) filter(where s.session_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_session_participants" s left join public."fin_presentation_sessions" t on s.session_id=t.id
union all
select 'fin_presentation_sessions.fin_presentation_sessions_current_revision_fk' as relation, count(*) filter(where s.current_revision_id is not null) as references_present, count(*) filter(where s.current_revision_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_sessions" s left join public."fin_presentation_minutes_revisions" t on s.current_revision_id=t.id
union all
select 'fin_presentation_sessions.fin_presentation_sessions_previous_session_id_fkey' as relation, count(*) filter(where s.previous_session_id is not null) as references_present, count(*) filter(where s.previous_session_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_presentation_sessions" s left join public."fin_presentation_sessions" t on s.previous_session_id=t.id
union all
select 'fin_rateios.fin_rateios_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_rateios" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'fin_rateios.fin_rateios_lancamento_id_fkey' as relation, count(*) filter(where s.lancamento_id is not null) as references_present, count(*) filter(where s.lancamento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_rateios" s left join public."fin_lancamentos" t on s.lancamento_id=t.id
union all
select 'fin_regras_categorizacao.fin_regras_categorizacao_categoria_id_fkey' as relation, count(*) filter(where s.categoria_id is not null) as references_present, count(*) filter(where s.categoria_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_regras_categorizacao" s left join public."fin_categorias" t on s.categoria_id=t.id
union all
select 'fin_regras_categorizacao.fin_regras_categorizacao_centro_custo_id_fkey' as relation, count(*) filter(where s.centro_custo_id is not null) as references_present, count(*) filter(where s.centro_custo_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."fin_regras_categorizacao" s left join public."fin_centros_custo" t on s.centro_custo_id=t.id
union all
select 'financeiro_fechamento_marca_valores.financeiro_fechamento_marca_valores_fechamento_fk' as relation, count(*) filter(where s.company_id is not null and s.fechamento_id is not null) as references_present, count(*) filter(where s.company_id is not null and s.fechamento_id is not null and t.company_id is null) as orphans, count(*) filter(where t.company_id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."financeiro_fechamento_marca_valores" s left join public."financeiro_fechamento_caixa" t on s.company_id=t.company_id and s.fechamento_id=t.id
union all
select 'financeiro_fechamento_marca_valores.financeiro_fechamento_marca_valores_marca_fk' as relation, count(*) filter(where s.company_id is not null and s.marca_id is not null) as references_present, count(*) filter(where s.company_id is not null and s.marca_id is not null and t.company_id is null) as orphans, count(*) filter(where t.company_id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."financeiro_fechamento_marca_valores" s left join public."financeiro_fechamento_marcas" t on s.company_id=t.company_id and s.marca_id=t.id
union all
select 'financeiro_fechamento_marcas.financeiro_fechamento_marcas_categoria_fk' as relation, count(*) filter(where s.company_id is not null and s.categoria_id is not null) as references_present, count(*) filter(where s.company_id is not null and s.categoria_id is not null and t.company_id is null) as orphans, count(*) filter(where t.company_id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."financeiro_fechamento_marcas" s left join public."fin_categorias" t on s.company_id=t.company_id and s.categoria_id=t.id
union all
select 'inventario_itens.inventario_itens_inventario_id_fkey' as relation, count(*) filter(where s.inventario_id is not null) as references_present, count(*) filter(where s.inventario_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."inventario_itens" s left join public."inventarios" t on s.inventario_id=t.id
union all
select 'inventario_itens.inventario_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."inventario_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'inventarios.inventarios_turno_id_fkey' as relation, count(*) filter(where s.turno_id is not null) as references_present, count(*) filter(where s.turno_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."inventarios" s left join public."turnos" t on s.turno_id=t.id
union all
select 'listas_fixas_setor_itens.listas_fixas_setor_itens_lista_fixa_id_fkey' as relation, count(*) filter(where s.lista_fixa_id is not null) as references_present, count(*) filter(where s.lista_fixa_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."listas_fixas_setor_itens" s left join public."listas_fixas_setor" t on s.lista_fixa_id=t.id
union all
select 'listas_fixas_setor_itens.listas_fixas_setor_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."listas_fixas_setor_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'movimentacoes_estoque.fk_mov_estorno' as relation, count(*) filter(where s.estorno_de_id is not null) as references_present, count(*) filter(where s.estorno_de_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."movimentacoes_estoque" s left join public."movimentacoes_estoque" t on s.estorno_de_id=t.id
union all
select 'movimentacoes_estoque.fk_mov_produto' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."movimentacoes_estoque" s left join public."produtos" t on s.produto_id=t.id
union all
select 'precificacao_canal.precificacao_canal_canal_id_fkey' as relation, count(*) filter(where s.canal_id is not null) as references_present, count(*) filter(where s.canal_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."precificacao_canal" s left join public."canais_venda" t on s.canal_id=t.id
union all
select 'precificacao_canal.precificacao_canal_componente_id_fkey' as relation, count(*) filter(where s.componente_id is not null) as references_present, count(*) filter(where s.componente_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."precificacao_canal" s left join public."ficha_componentes" t on s.componente_id=t.id
union all
select 'profiles.profiles_job_role_id_fkey' as relation, count(*) filter(where s.job_role_id is not null) as references_present, count(*) filter(where s.job_role_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."profiles" s left join public."job_roles" t on s.job_role_id=t.id
union all
select 'purchase_ignored_rules.purchase_ignored_rules_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_ignored_rules" s left join public."produtos" t on s.produto_id=t.id
union all
select 'purchase_order_items.purchase_order_items_order_id_fkey' as relation, count(*) filter(where s.order_id is not null) as references_present, count(*) filter(where s.order_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_order_items" s left join public."purchase_orders" t on s.order_id=t.id
union all
select 'purchase_order_items.purchase_order_items_stock_item_id_fkey' as relation, count(*) filter(where s.stock_item_id is not null) as references_present, count(*) filter(where s.stock_item_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_order_items" s left join public."produtos" t on s.stock_item_id=t.id
union all
select 'purchase_requisition_audit.purchase_requisition_audit_requisition_id_fkey' as relation, count(*) filter(where s.requisition_id is not null) as references_present, count(*) filter(where s.requisition_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_requisition_audit" s left join public."purchase_requisitions" t on s.requisition_id=t.id
union all
select 'purchase_requisition_items.purchase_requisition_items_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_requisition_items" s left join public."produtos" t on s.produto_id=t.id
union all
select 'purchase_requisition_items.purchase_requisition_items_requisition_id_fkey' as relation, count(*) filter(where s.requisition_id is not null) as references_present, count(*) filter(where s.requisition_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."purchase_requisition_items" s left join public."purchase_requisitions" t on s.requisition_id=t.id
union all
select 'recebimento_itens.recebimento_itens_item_id_fkey' as relation, count(*) filter(where s.item_id is not null) as references_present, count(*) filter(where s.item_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."recebimento_itens" s left join public."solic_compra_mercado_item" t on s.item_id=t.id
union all
select 'recebimento_itens.recebimento_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."recebimento_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'recebimento_itens.recebimento_itens_recebimento_id_fkey' as relation, count(*) filter(where s.recebimento_id is not null) as references_present, count(*) filter(where s.recebimento_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."recebimento_itens" s left join public."recebimentos" t on s.recebimento_id=t.id
union all
select 'recebimentos.recebimentos_solicitacao_id_fkey' as relation, count(*) filter(where s.solicitacao_id is not null) as references_present, count(*) filter(where s.solicitacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."recebimentos" s left join public."solic_compra_mercado" t on s.solicitacao_id=t.id
union all
select 'requisicao_estoque_itens.requisicao_estoque_itens_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."requisicao_estoque_itens" s left join public."produtos" t on s.produto_id=t.id
union all
select 'requisicao_estoque_itens.requisicao_estoque_itens_requisicao_id_fkey' as relation, count(*) filter(where s.requisicao_id is not null) as references_present, count(*) filter(where s.requisicao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."requisicao_estoque_itens" s left join public."requisicoes_estoque" t on s.requisicao_id=t.id
union all
select 'rh_banco_horas.rh_banco_horas_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_banco_horas" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_beneficios.rh_beneficios_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_beneficios" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_disponibilidade.rh_disponibilidade_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_disponibilidade" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_documentos.rh_documentos_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_documentos" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_epis.rh_epis_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_epis" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_escala_slots.rh_escala_slots_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_escala_slots" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_escala_slots.rh_escala_slots_escala_id_fkey' as relation, count(*) filter(where s.escala_id is not null) as references_present, count(*) filter(where s.escala_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_escala_slots" s left join public."rh_escalas" t on s.escala_id=t.id
union all
select 'rh_exames.rh_exames_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_exames" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_ferias_afastamentos.rh_ferias_afastamentos_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_ferias_afastamentos" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_ferias_saldo.rh_ferias_saldo_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_ferias_saldo" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_folha_pagamento.rh_folha_pagamento_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_folha_pagamento" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_incidentes.rh_incidentes_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_incidentes" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_ocorrencias_disciplinares.rh_ocorrencias_disciplinares_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_ocorrencias_disciplinares" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_onboarding.rh_onboarding_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_onboarding" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_onboarding.rh_onboarding_mentor_id_fkey' as relation, count(*) filter(where s.mentor_id is not null) as references_present, count(*) filter(where s.mentor_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_onboarding" s left join public."rh_colaboradores" t on s.mentor_id=t.id
union all
select 'rh_ponto_ajustes.rh_ponto_ajustes_ponto_id_fkey' as relation, count(*) filter(where s.ponto_id is not null) as references_present, count(*) filter(where s.ponto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_ponto_ajustes" s left join public."rh_ponto_registros" t on s.ponto_id=t.id
union all
select 'rh_ponto_registros.rh_ponto_registros_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_ponto_registros" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_progresso_treinamento.rh_progresso_treinamento_colaborador_id_fkey' as relation, count(*) filter(where s.colaborador_id is not null) as references_present, count(*) filter(where s.colaborador_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_progresso_treinamento" s left join public."rh_colaboradores" t on s.colaborador_id=t.id
union all
select 'rh_progresso_treinamento.rh_progresso_treinamento_trilha_id_fkey' as relation, count(*) filter(where s.trilha_id is not null) as references_present, count(*) filter(where s.trilha_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_progresso_treinamento" s left join public."rh_trilhas_treinamento" t on s.trilha_id=t.id
union all
select 'rh_tarefas.rh_tarefas_responsavel_id_fkey' as relation, count(*) filter(where s.responsavel_id is not null) as references_present, count(*) filter(where s.responsavel_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_tarefas" s left join public."rh_colaboradores" t on s.responsavel_id=t.id
union all
select 'rh_trocas_turno.rh_trocas_turno_slot_original_id_fkey' as relation, count(*) filter(where s.slot_original_id is not null) as references_present, count(*) filter(where s.slot_original_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_trocas_turno" s left join public."rh_escala_slots" t on s.slot_original_id=t.id
union all
select 'rh_trocas_turno.rh_trocas_turno_solicitante_id_fkey' as relation, count(*) filter(where s.solicitante_id is not null) as references_present, count(*) filter(where s.solicitante_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_trocas_turno" s left join public."rh_colaboradores" t on s.solicitante_id=t.id
union all
select 'rh_trocas_turno.rh_trocas_turno_substituto_id_fkey' as relation, count(*) filter(where s.substituto_id is not null) as references_present, count(*) filter(where s.substituto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."rh_trocas_turno" s left join public."rh_colaboradores" t on s.substituto_id=t.id
union all
select 'salmon_entries.salmon_entries_supplier_id_fkey' as relation, count(*) filter(where s.supplier_id is not null) as references_present, count(*) filter(where s.supplier_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."salmon_entries" s left join public."suppliers" t on s.supplier_id=t.id
union all
select 'salmon_manipulations.salmon_manipulations_entry_id_fkey' as relation, count(*) filter(where s.entry_id is not null) as references_present, count(*) filter(where s.entry_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."salmon_manipulations" s left join public."salmon_entries" t on s.entry_id=t.id
union all
select 'solic_compra_mercado_item.solic_compra_mercado_item_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."solic_compra_mercado_item" s left join public."produtos" t on s.produto_id=t.id
union all
select 'solic_compra_mercado_item.solic_compra_mercado_item_solicitacao_id_fkey' as relation, count(*) filter(where s.solicitacao_id is not null) as references_present, count(*) filter(where s.solicitacao_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."solic_compra_mercado_item" s left join public."solic_compra_mercado" t on s.solicitacao_id=t.id
union all
select 'solicitacoes_compra.solicitacoes_compra_produto_id_fkey' as relation, count(*) filter(where s.produto_id is not null) as references_present, count(*) filter(where s.produto_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."solicitacoes_compra" s left join public."produtos" t on s.produto_id=t.id
union all
select 'supplier_item_prices.supplier_item_prices_stock_item_id_fkey' as relation, count(*) filter(where s.stock_item_id is not null) as references_present, count(*) filter(where s.stock_item_id is not null and t.id is null) as orphans, count(*) filter(where t.id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."supplier_item_prices" s left join public."produtos" t on s.stock_item_id=t.id
union all
select 'user_permissions.user_permissions_membership_fk' as relation, count(*) filter(where s.user_id is not null and s.company_id is not null) as references_present, count(*) filter(where s.user_id is not null and s.company_id is not null and t.user_id is null) as orphans, count(*) filter(where t.user_id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."user_permissions" s left join public."company_memberships" t on s.user_id=t.user_id and s.company_id=t.company_id
union all
select 'user_roles.user_roles_membership_fk' as relation, count(*) filter(where s.user_id is not null and s.company_id is not null) as references_present, count(*) filter(where s.user_id is not null and s.company_id is not null and t.user_id is null) as orphans, count(*) filter(where t.user_id is not null and s.company_id is distinct from t.company_id) as cross_tenant from public."user_roles" s left join public."company_memberships" t on s.user_id=t.user_id and s.company_id=t.company_id) x));
COMMIT;
