# Matriz Fase 7

Detalhes por objeto, ACL efetiva, policies, colunas, relações, triggers, callers e writers: [matriz.json](matriz.json). Corpos completos: [catalogo-vivo.json](catalogo-vivo.json). Classificação é de finalidade; não significa autorização certificada.

| Objeto | Classe | Linhas | Consumidores diretos | Evidência |
|---|---|---:|---:|---|
| public.admin_actions_log | tenant operacional | 6 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.ai_insights | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.ai_logs | tenant operacional | 2 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.ai_score_historico | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.alertas_falta_estoque | tenant operacional | 35 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.app_config | global real | 0 | 0 | Configuração da plataforma; ACL e ausência de policy cliente. |
| public.aprovacoes_solic_compra_mercado | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.audit_inventario_log | tenant operacional | 1160 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.audit_log | mista/legada | 114 | 1 | Histórico misto; Fase 3 pendente. |
| public.audit_logs | mista/legada | 37339 | 3 | Histórico misto, nulos legítimos/ambíguos; Fase 3 pendente. |
| public.canais_venda | tenant operacional | 0 | 7 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cenarios_simulacao | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cmv_cache | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.companies | global real | 4 | 1 | Registro de unidades, descoberta/autorização própria. |
| public.company_memberships | tenant operacional | 19 | 4 | Acesso por unidade; identidade referenciada é global. |
| public.config_precificacao | tenant operacional | 1 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.confirmacoes_recebimento | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_fornecedores | tenant operacional | 2 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_ia_config | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_itens | tenant operacional | 2 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_respostas | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_sugestoes | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_whatsapp_logs | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacao_zapi_config | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.cotacoes | tenant operacional | 1 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.dashboard_cache | mista/legada | 0 | 0 | Cache por chave global; payload pode conter agregado tenant. Helpers fechados na Fase 7. |
| public.faturamento_periodos_legacy | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.faturamento_periodos_legacy_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.ficha_componente_itens | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.ficha_componentes | tenant operacional | 0 | 20 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_audit_logs | tenant operacional | 5382 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_categorias | tenant operacional | 270 | 14 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_centros_custo | tenant operacional | 8 | 10 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_conciliacao_ignoradas | tenant operacional | 43 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_conciliacao_vinculos | tenant operacional | 3225 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_config | tenant operacional | 1 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_contas | tenant operacional | 13 | 7 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_contas_pagar | tenant operacional | 717 | 7 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_contas_pagar_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.fin_contas_receber | tenant operacional | 0 | 5 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_contas_receber_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.fin_contas_saldo_cache | tenant operacional | 13 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_dre_linhas | tenant operacional | 12 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_lancamento_rateios | tenant operacional | 3521 | 11 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_lancamentos | tenant operacional | 3648 | 15 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_lancamentos_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.fin_orcamentos | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_plano_contas | tenant operacional | 1 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_agenda_items | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_decision_actions | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_decision_revisions | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_decisions | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_minutes_revisions | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_session_participants | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_presentation_sessions | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_rateios | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.fin_regras_categorizacao | tenant operacional | 0 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.financeiro_fechamento_caixa | tenant operacional | 31 | 5 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.financeiro_fechamento_caixa_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.financeiro_fechamento_marca_valores | tenant operacional | 186 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.financeiro_fechamento_marcas | tenant operacional | 6 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.integration_logs | mista/legada | 0 | 0 | Histórico operacional com modelo misto Fase 3. |
| public.inventario_conferentes | tenant operacional | 2 | 5 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.inventario_itens | tenant operacional | 5834 | 12 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.inventario_itens_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.inventarios | tenant operacional | 22 | 18 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.inventarios_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.job_roles | tenant operacional | 23 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.listas_fixas_setor | tenant operacional | 5 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.listas_fixas_setor_itens | tenant operacional | 71 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.metas_cmv | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.movimentacoes_estoque | tenant operacional | 2655 | 15 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.movimentacoes_estoque_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.mv_consumo_itens_semana | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| public.mv_fin_dre_mensal | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| public.mv_fin_fluxo_caixa_diario | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| public.mv_giro_estoque | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| public.mv_pedidos_status_resumo | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| public.notifications | tenant operacional | 9 | 12 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.permissions | global real | 14384 | 0 | Catálogo de chaves RBAC global. |
| public.planning_metas_compra | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.precificacao_canal | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.produtos | tenant operacional | 628 | 21 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.produtos_bkp_reset_20260301 | mista/legada | 1 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.profiles | mista/legada | 15 | 11 | Identidade compartilhada; empresa de origem não acompanha navegação. |
| public.purchase_ignored_rules | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_order_items | tenant operacional | 9 | 8 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_order_items_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.purchase_orders | tenant operacional | 3 | 8 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_orders_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.purchase_reminders | tenant operacional | 0 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_requisition_audit | tenant operacional | 0 | 5 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_requisition_items | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.purchase_requisitions | tenant operacional | 0 | 8 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rbac_legacy_usage | tenant operacional | 136 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.recebimento_itens | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.recebimento_itens_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.recebimentos | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.recebimentos_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.requisicao_estoque_itens | tenant operacional | 43 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.requisicoes_estoque | tenant operacional | 13 | 12 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_audit_log | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_banco_horas | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_beneficios | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_colaboradores | tenant operacional | 0 | 7 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_comunicados | tenant operacional | 0 | 5 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_custos_mensais | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_disponibilidade | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_documentos | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_epis | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_escala_slots | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_escalas | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_exames | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_ferias_afastamentos | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_ferias_saldo | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_folha_pagamento | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_incidentes | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_ocorrencias_disciplinares | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_onboarding | tenant operacional | 0 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_ponto_ajustes | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_ponto_registros | tenant operacional | 0 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_progresso_treinamento | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_tarefas | tenant operacional | 0 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_trilhas_treinamento | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.rh_trocas_turno | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.role_permissions | global real | 43123 | 1 | Templates de roles globais; administração global. |
| public.salmon_auditorias_compra | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_config | tenant operacional | 1 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_daily_records | tenant operacional | 0 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_daily_records_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.salmon_entries | tenant operacional | 5 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_entries_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.salmon_manipulations | tenant operacional | 3 | 3 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_manipulations_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.salmon_metas_provisionadas | tenant operacional | 0 | 2 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.salmon_purchase_targets | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.security_risk_register | global real | 1 | 0 | Registro de riscos da plataforma. |
| public.solic_compra_mercado | tenant operacional | 0 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.solic_compra_mercado_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.solic_compra_mercado_item | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.solicitacoes_compra | tenant operacional | 0 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.stock_categories | tenant operacional | 51 | 8 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.stock_locations | tenant operacional | 18 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.stock_sectors | tenant operacional | 28 | 11 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.stock_sku_counter | tenant operacional | 7 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.supplier_item_prices | tenant operacional | 4 | 0 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.suppliers | tenant operacional | 54 | 6 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.suppliers_bkp_reset_20260301 | mista/legada | 0 | 0 | Cópia histórica; preservar registros. Sem writer operacional localizado. |
| public.system_bugs | tenant operacional | 0 | 4 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.turnos | tenant operacional | 15 | 1 | Recurso operacional por empresa; contrato de consumidores, RLS e contagens no catálogo. |
| public.unidades_medida | global real | 16 | 0 | Unidades de medida compartilhadas; não representam unidades operacionais. |
| public.user_permissions | tenant operacional | 29065 | 1 | Acesso por unidade; identidade referenciada é global. |
| public.user_roles | tenant operacional | 19 | 5 | Acesso por unidade; identidade referenciada é global. |
| public.z_canary_test | indeterminada | 0 | 0 | Finalidade técnica não comprovada por consumidor funcional. |
| reporting.mv_consumo_itens_semana | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| reporting.mv_fin_dre_mensal | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| reporting.mv_fin_fluxo_caixa_diario | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |
| reporting.mv_giro_estoque | mista/legada | — | 0 | Cache materializado de dados tenant; sem RLS. Público fechado localmente; reporting somente owner. |

## Funções e overloads

| Assinatura | Tipo | Definer | anon/auth/service | Callers SQL/diretos |
|---|---|---|---|---|
| _fin_bordero_payload(uuid,date,date) | function | false | false/false/false | 1/0 |
| _fin_dfc_effective_allocations(uuid,date,date) | function | false | false/false/false | 4/0 |
| _guarded_add_presentation_decision_revision(uuid,text,jsonb,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_aprovar_conta_pagar(uuid,timestamp with time zone) | function | true | true/true/true | 0/1 |
| _guarded_bulk_upsert_orcamento(text,jsonb) | function | true | false/true/true | 0/1 |
| _guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb) | function | true | false/true/true | 0/0 |
| _guarded_create_conta_receber(text,text,numeric,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid) | function | true | false/true/true | 0/0 |
| _guarded_create_presentation_decision_action(uuid,text,uuid,text,timestamp with time zone,date,text) | function | true | false/true/true | 0/1 |
| _guarded_create_presentation_decision(text,text,date,date,text,text,jsonb,uuid) | function | true | false/true/true | 0/1 |
| _guarded_create_presentation_session(text,text,date,date,text,date,uuid,uuid[],uuid,jsonb) | function | true | false/true/true | 0/1 |
| _guarded_delete_categoria(uuid) | function | true | true/true/true | 0/1 |
| _guarded_delete_centro_custo(uuid) | function | true | true/true/true | 0/1 |
| _guarded_delete_conta_pagar(uuid,timestamp with time zone) | function | true | false/true/false | 0/1 |
| _guarded_delete_conta_receber(uuid,timestamp with time zone) | function | true | false/true/false | 0/1 |
| _guarded_delete_conta(uuid) | function | true | true/true/true | 0/1 |
| _guarded_delete_lancamento(uuid,timestamp with time zone) | function | true | false/true/false | 0/3 |
| _guarded_delete_orcamento(uuid,timestamp with time zone) | function | true | false/true/true | 1/1 |
| _guarded_delete_plano_contas(uuid) | function | true | true/true/true | 0/1 |
| _guarded_estornar_conta_pagar(uuid,text) | function | true | true/true/true | 0/1 |
| _guarded_estornar_conta_receber(uuid,text) | function | true | true/true/true | 0/1 |
| _guarded_list_fin_audit_logs(text,text,text,integer,timestamp with time zone,uuid,integer) | function | true | false/true/true | 0/1 |
| _guarded_list_recorrencias(timestamp with time zone,uuid,integer,text) | function | true | false/true/true | 0/1 |
| _guarded_save_presentation_session(uuid,text,text,date,uuid,uuid[],uuid,jsonb,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_start_presentation_session(uuid,jsonb,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_submit_presentation_minutes(uuid,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_transition_presentation_decision_action(uuid,text,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_transition_presentation_decision(uuid,text,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_transition_presentation_session(uuid,text,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_update_categoria(uuid,text,text,text,text,uuid,timestamp with time zone) | function | true | true/true/true | 0/1 |
| _guarded_update_centro_custo(uuid,text,text,timestamp with time zone) | function | true | true/true/true | 0/1 |
| _guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamp with time zone) | function | true | true/true/true | 0/0 |
| _guarded_update_conta_receber(uuid,text,text,numeric,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,timestamp with time zone) | function | true | true/true/true | 0/0 |
| _guarded_update_conta(uuid,text,text,text,text,text,numeric,timestamp with time zone) | function | true | true/true/true | 0/1 |
| _guarded_update_plano_contas(uuid,text,text,text,text,text,timestamp with time zone) | function | true | true/true/true | 0/1 |
| _guarded_update_presentation_decision_action(uuid,text,uuid,date,text,text,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_update_presentation_decision_draft(uuid,text,text,uuid,timestamp with time zone) | function | true | false/true/true | 0/1 |
| _guarded_update_reconciled_classification(uuid,uuid,uuid,text,jsonb,timestamp with time zone,text) | function | true | false/true/true | 0/0 |
| _guarded_upsert_lancamento(uuid,text,text,numeric,uuid,uuid,uuid,date,date,date,text,text,text,text,boolean,jsonb,jsonb,timestamp with time zone,text) | function | true | true/true/true | 0/2 |
| _guarded_upsert_orcamento(uuid,text,numeric,timestamp with time zone) | function | true | false/true/true | 1/0 |
| _planning_delete_meta_guarded(uuid) | function | true | true/true/true | 0/1 |
| _planning_spend_summary_guarded(integer,integer,text,text) | function | true | true/true/true | 0/1 |
| _planning_spend_summary_inner(uuid,integer,integer,text,text) | function | true | false/false/true | 1/0 |
| _planning_upsert_meta_guarded(integer,integer,text,numeric,numeric,numeric) | function | true | true/true/true | 0/1 |
| _relatorios_compras_guarded(text,text) | function | true | true/true/true | 0/1 |
| _relatorios_kpis_guarded(text,text) | function | true | true/true/true | 0/1 |
| _relatorios_score_guarded(text,text) | function | true | true/true/true | 0/1 |
| _relatorios_tendencia_guarded(text,text) | function | true | true/true/true | 0/1 |
| _replace_fin_presentation_session_content(uuid,uuid,uuid,text,uuid[],jsonb) | function | false | false/false/true | 2/0 |
| _salmon_cancel_entry_guarded(uuid,text) | function | true | true/true/true | 0/2 |
| _salmon_cancel_manipulation_guarded(uuid,text) | function | true | true/true/true | 0/2 |
| _salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text) | function | true | true/true/true | 0/2 |
| _salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text) | function | true | true/true/true | 0/2 |
| _salmon_dashboard_guarded(text,text) | function | true | true/true/true | 0/1 |
| _simulate_relatorios_guarded(text,text,jsonb) | function | true | true/true/true | 0/1 |
| _validate_fin_presentation_decision_snapshot(jsonb,date,date,text,text) | function | false | false/false/true | 2/0 |
| _validate_fin_presentation_meeting_snapshot(jsonb,uuid,date,date,text) | function | false | false/false/true | 1/0 |
| admin_checkup_suite() | function | true | false/true/true | 0/1 |
| admin_has_permission(uuid,text) | function | true | false/true/true | 0/3 |
| admin_health_counts() | function | true | true/true/true | 0/0 |
| admin_list_users() | function | true | false/true/true | 0/1 |
| admin_set_super_admin(uuid,boolean,text,text) | function | true | false/true/true | 0/1 |
| admin_upsert_company_membership(uuid,uuid,uuid,app_role,text[],text,uuid,text,boolean) | function | true | false/false/true | 1/2 |
| aplicar_regras_categorizacao() | function | true | false/true/true | 0/1 |
| aprovar_ferias(uuid,uuid) | function | true | true/true/true | 0/1 |
| assert_requisicao_estoque_movement_consistency() | trigger | true | true/true/true | 0/0 |
| assert_tenant() | function | true | false/true/true | 179/3 |
| attend_requisicao_item_atomic(uuid,uuid,numeric) | function | true | true/true/true | 0/1 |
| audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text) | function | true | true/true/true | 3/0 |
| audit_trigger_fn() | trigger | true | true/true/true | 0/0 |
| batch_reorder_fin_categorias(jsonb) | function | true | true/true/true | 0/1 |
| block_categoria_pai_vinculada_a_marca() | trigger | false | true/true/true | 0/0 |
| can_access_company_document(text,text) | function | true | false/true/false | 0/0 |
| can_receive_company_change(uuid,text[]) | function | true | false/true/false | 0/0 |
| cancel_salmon_entry_atomic(uuid,text) | function | true | true/true/true | 1/0 |
| cancel_salmon_manipulation_atomic(uuid,text) | function | true | true/true/true | 1/0 |
| cleanup_old_audit_logs(integer) | function | true | true/true/true | 0/1 |
| comparativo_periodos(text,text) | function | true | false/true/true | 0/1 |
| compute_requisicao_status_agregado(uuid) | function | true | true/true/true | 1/1 |
| contar_lancamentos_sem_categoria() | function | true | false/true/true | 0/1 |
| copiar_orcamento_mes(text,text) | function | true | false/true/true | 0/1 |
| cotacao_force_company_id() | trigger | true | true/true/true | 0/0 |
| count_requisicoes_with_pending_items() | function | true | true/true/true | 0/1 |
| create_cotacao_atomic(text,text,date,text,uuid,jsonb,jsonb) | function | true | true/true/true | 0/1 |
| create_inventory_atomic(text,date,text,uuid,text[],text,text) | function | true | true/true/true | 0/1 |
| create_purchase_order_atomic(jsonb,uuid) | function | true | true/true/true | 0/1 |
| create_purchase_orders_from_cotacao_atomic(uuid,timestamp with time zone) | function | true | true/true/true | 0/1 |
| create_quick_inventory_atomic(jsonb,text,text) | function | true | true/true/true | 0/1 |
| create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date) | function | true | true/true/true | 1/0 |
| create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text) | function | true | true/true/true | 1/0 |
| create_transfer(uuid,uuid,numeric,date,text,uuid) | function | true | true/true/true | 0/1 |
| debug_company_inventory() | function | true | true/true/true | 0/0 |
| debug_stock_last_movements(integer) | function | true | true/true/true | 0/0 |
| debug_tenant() | function | true | true/true/true | 0/0 |
| delete_transfer(uuid) | function | true | false/true/false | 0/1 |
| edit_purchase_order_atomic(uuid,jsonb) | function | true | true/true/true | 0/1 |
| ensure_salmon_raw_product() | function | true | true/true/true | 2/0 |
| ficha_salvar_componente_itens_atomic(uuid,jsonb) | function | true | true/true/true | 0/1 |
| fin_audit_integrity_check() | function | true | true/true/true | 0/0 |
| fin_block_contamax_ledger_entry() | trigger | true | false/false/false | 0/0 |
| fin_categoria_fora_do_resultado(uuid,uuid) | function | false | false/false/true | 2/0 |
| fin_category_is_excluded(uuid,uuid) | function | true | false/false/false | 2/0 |
| fin_ensure_non_operational_categories(uuid) | function | true | false/false/false | 1/0 |
| fin_entity_has_category(uuid,uuid,uuid) | function | true | false/false/false | 4/0 |
| fin_get_categoria_desconto_baixa(uuid) | function | true | false/false/true | 3/0 |
| fin_get_categoria_desconto_concedido(uuid) | function | true | false/false/true | 3/0 |
| fin_get_limite_aprovacao_atual() | function | true | true/true/true | 0/1 |
| fin_get_limite_aprovacao(uuid) | function | true | false/false/false | 3/0 |
| fin_prepare_category_reporting_class() | trigger | true | false/false/false | 0/0 |
| fin_preserve_materialized_recurrence() | trigger | false | true/true/true | 0/0 |
| fin_protect_system_category() | trigger | true | false/false/false | 0/0 |
| fin_recompute_entity_report_exclusion(uuid,uuid) | function | true | false/false/false | 2/0 |
| fin_recorrencia_config_valida(jsonb) | function | false | false/true/true | 0/0 |
| fin_set_entity_report_exclusion() | trigger | true | false/false/false | 0/0 |
| fin_set_limite_aprovacao(numeric) | function | true | true/true/true | 0/1 |
| fin_validate_orcamento_scope() | trigger | true | false/false/false | 0/0 |
| fin_validate_recorrencia_config(jsonb) | function | false | false/true/true | 2/0 |
| finalize_inventory_atomic(uuid,text) | function | true | true/true/true | 0/1 |
| find_auth_user_by_email(text) | function | true | false/false/true | 0/2 |
| fn_recompute_product_saldo(uuid,uuid) | function | true | false/false/false | 1/0 |
| fn_update_product_stock() | trigger | true | true/true/true | 0/0 |
| generate_next_sku(text) | function | true | true/true/true | 1/1 |
| generate_requisition_code() | trigger | true | true/true/true | 0/0 |
| gerar_parcela_recorrente(uuid) | function | true | false/true/true | 0/1 |
| get_all_saldos_contas() | function | true | false/true/true | 0/1 |
| get_beneficios_masked(uuid) | function | true | true/true/true | 0/0 |
| get_catalog_counts() | function | true | true/true/true | 0/1 |
| get_company_permissions(uuid,uuid) | function | true | false/false/true | 6/0 |
| get_consumo_por_produto(uuid,date,text[],uuid[]) | function | true | false/false/true | 0/1 |
| get_cotacao_ia_config() | function | true | true/true/true | 1/1 |
| get_cotacao_zapi_config() | function | true | true/true/true | 1/1 |
| get_current_company_id_strict() | function | true | false/true/true | 1/0 |
| get_current_company_id() | function | true | false/true/true | 11/0 |
| get_effective_permissions(uuid) | function | true | false/true/true | 2/2 |
| get_fin_alertas() | function | true | false/true/true | 0/1 |
| get_fin_bordero(date,date) | function | true | false/true/true | 0/1 |
| get_fin_cashflow(date,date) | function | true | false/true/true | 0/1 |
| get_fin_counts_by_status(date,date) | function | true | true/true/true | 0/2 |
| get_fin_dashboard_charts(date,date) | function | true | false/true/true | 0/2 |
| get_fin_dashboard_summary(date,date) | function | true | false/true/true | 0/1 |
| get_fin_dfc_summary(date,date) | function | true | false/true/true | 0/1 |
| get_fin_dre_summary(date,date) | function | true | true/true/true | 0/1 |
| get_fin_fluxo_projecao(integer,numeric) | function | true | false/true/true | 0/1 |
| get_fin_kpis(date,date) | function | true | true/true/true | 1/1 |
| get_fin_kpis(integer) | function | true | false/true/true | 1/1 |
| get_fin_lancamentos_totais(date,date,text,uuid,text,uuid,boolean) | function | true | true/true/true | 0/1 |
| get_fin_orcamento_arvore(text) | function | true | false/true/true | 0/1 |
| get_fin_presentation_category_metadata() | function | true | false/true/true | 0/1 |
| get_fin_presentation_decision(uuid) | function | true | false/true/true | 0/1 |
| get_fin_presentation_detail_rows(date,date,text,text,uuid,text,integer,integer) | function | true | false/true/true | 0/1 |
| get_fin_presentation_detail_series(date,date,text,text,uuid,text) | function | true | false/true/true | 0/1 |
| get_fin_presentation_expense_details(text,uuid,jsonb,integer) | function | true | false/true/true | 0/1 |
| get_fin_presentation_expenses(text,integer[]) | function | true | false/true/true | 0/1 |
| get_fin_presentation_minutes_export(uuid) | function | true | false/true/true | 0/1 |
| get_fin_presentation_plan(date,date,text,text,text,uuid,integer,integer) | function | true | false/true/true | 0/1 |
| get_fin_presentation_revenue(text,integer[]) | function | true | false/true/true | 0/1 |
| get_fin_presentation_session(uuid) | function | true | false/true/true | 1/1 |
| get_fin_presentation_socios(date,date,date,date,date,date,text,integer) | function | true | false/true/true | 0/1 |
| get_fin_saldo_atual(uuid,date) | function | true | false/true/false | 0/1 |
| get_fin_saldo_conta_em(uuid,date) | function | true | false/true/false | 0/4 |
| get_inactive_stock_items() | function | true | true/true/true | 0/1 |
| get_movimentacoes_kpis(uuid,text,date,date,boolean) | function | true | true/true/true | 0/1 |
| get_my_company_context() | function | true | false/true/false | 0/1 |
| get_or_set_cache(text,integer) | function | true | true/true/true | 0/0 |
| get_relatorios_compras(date,date) | function | true | true/true/true | 3/0 |
| get_relatorios_compras(text,text) | function | true | true/true/true | 3/0 |
| get_relatorios_kpis(date,date) | function | true | true/true/true | 3/0 |
| get_relatorios_kpis(text,text) | function | true | true/true/true | 3/0 |
| get_relatorios_score(date,date) | function | true | true/true/true | 3/0 |
| get_relatorios_score(text,text) | function | true | true/true/true | 3/0 |
| get_relatorios_tendencia(date,date) | function | true | true/true/true | 3/0 |
| get_relatorios_tendencia(text,text) | function | true | true/true/true | 3/0 |
| get_report_item_detail(uuid,date,date) | function | true | true/true/true | 0/1 |
| get_report_items_summary(date,date) | function | true | true/true/true | 0/1 |
| get_rh_beneficios_total() | function | true | true/true/true | 0/1 |
| get_saldo_conta(uuid) | function | true | true/true/true | 0/0 |
| get_saldo_produto(uuid) | function | true | true/true/true | 0/2 |
| get_saldo_produtos(uuid[]) | function | true | true/true/true | 0/2 |
| get_salmon_dashboard_summary(date,date) | function | true | true/true/true | 1/0 |
| get_salmon_inventory_adjustment_kg() | function | true | true/true/true | 0/1 |
| get_salmon_reconciliation_kpis() | function | true | true/true/true | 0/0 |
| get_spend_by_sector(date,date,boolean) | function | true | true/true/true | 0/1 |
| get_stock_consumption_history(date,date,text,uuid,text) | function | true | true/true/true | 0/0 |
| get_stock_dashboard(integer) | function | true | true/true/true | 0/1 |
| get_stock_losses_report(date,date,text,uuid,text,text,text) | function | true | true/true/true | 0/1 |
| get_stock_predictive_analysis_v2(text,uuid,integer,boolean,boolean) | function | true | true/true/true | 0/1 |
| get_stock_predictive_analysis(text,uuid,integer,integer,boolean) | function | true | true/true/true | 0/0 |
| get_stock_summary() | function | true | false/true/true | 0/0 |
| get_stock_top_consumed(date,date,text,integer,text) | function | true | true/true/true | 0/1 |
| get_supplier_ranking(uuid,text,integer,integer,text) | function | true | true/true/true | 0/1 |
| gin_extract_query_trgm(text,internal,smallint,internal,internal,internal,internal) | extension | false | true/true/true | 0/0 |
| gin_extract_value_trgm(text,internal) | extension | false | true/true/true | 0/0 |
| gin_trgm_consistent(internal,smallint,text,integer,internal,internal,internal,internal) | extension | false | true/true/true | 0/0 |
| gin_trgm_triconsistent(internal,smallint,text,integer,internal,internal,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_compress(internal) | extension | false | true/true/true | 0/0 |
| gtrgm_consistent(internal,text,smallint,oid,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_decompress(internal) | extension | false | true/true/true | 0/0 |
| gtrgm_distance(internal,text,smallint,oid,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_in(cstring) | extension | false | true/true/true | 0/0 |
| gtrgm_options(internal) | extension | false | true/true/true | 0/0 |
| gtrgm_out(gtrgm) | extension | false | true/true/true | 0/0 |
| gtrgm_penalty(internal,internal,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_picksplit(internal,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_same(gtrgm,gtrgm,internal) | extension | false | true/true/true | 0/0 |
| gtrgm_union(internal,internal) | extension | false | true/true/true | 0/0 |
| handle_first_admin() | trigger | true | true/true/true | 0/0 |
| handle_new_user() | trigger | true | true/true/true | 0/0 |
| has_any_permission(uuid,text[]) | function | true | true/true/true | 118/1 |
| has_compras_view(uuid) | function | true | true/true/true | 1/0 |
| has_permission_quick(uuid,text) | function | true | false/true/true | 0/0 |
| has_permission(text) | function | true | true/true/true | 72/12 |
| has_permission(uuid,text) | function | true | false/true/true | 72/12 |
| has_role(uuid,app_role) | function | true | false/true/true | 0/0 |
| immutable_unaccent(text) | function | false | true/true/true | 11/0 |
| is_company_member(uuid,uuid) | function | true | false/true/true | 19/0 |
| list_companies() | function | true | true/true/true | 0/1 |
| list_fin_contas_pagar_abertas(text,numeric,date,integer) | function | true | true/true/true | 0/1 |
| list_fin_contas_pagar_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean) | function | true | false/true/true | 0/1 |
| list_fin_contas_receber_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean) | function | true | false/true/true | 0/1 |
| list_fin_lancamentos_cursor(date,date,text,text,uuid,text,integer,date,uuid,text,uuid,boolean) | function | true | true/true/true | 1/1 |
| list_fin_lancamentos_cursor(date,date,text,text,uuid,text,integer,date,uuid) | function | true | true/true/true | 1/1 |
| list_fin_presentation_decisions(date,date,text,uuid,text,text,integer,integer) | function | true | false/true/true | 0/1 |
| list_fin_presentation_sessions(date,date,text,uuid,uuid,text,integer,integer) | function | true | false/true/true | 0/1 |
| list_movimentacoes_cursor(text,uuid,text,text,date,date,boolean,timestamp with time zone,uuid,integer) | function | true | true/true/true | 0/1 |
| list_my_companies() | function | true | false/true/false | 0/1 |
| list_profiles_minimal(text,integer) | function | true | false/true/true | 0/5 |
| list_purchase_orders_cursor(integer,timestamp with time zone,uuid,text,text,text,text,text) | function | true | true/true/true | 0/1 |
| list_report_items_cursor(date,date,integer,timestamp with time zone,uuid,text,text,text,boolean) | function | true | true/true/true | 0/0 |
| list_report_items_page(date,date,integer,integer,text,text,text,boolean) | function | true | false/true/true | 0/1 |
| list_solic_compra_mercado_cursor(integer,timestamp with time zone,uuid,text,text,uuid,text,date,date) | function | true | true/true/true | 0/0 |
| list_stock_transfers(date,date,uuid,text,integer,integer) | function | true | true/true/true | 0/1 |
| log_audit(text,text,text,text,text,jsonb,jsonb,jsonb) | function | true | true/true/true | 14/0 |
| log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb) | function | true | true/true/true | 14/0 |
| log_integration_error(text,text,text,text,jsonb) | function | true | true/true/true | 0/0 |
| mark_all_notifications_read() | function | true | true/true/true | 0/1 |
| onboard_new_company(text,text,uuid) | function | true | true/true/true | 0/1 |
| orcamento_execucao_mensal(text) | function | true | false/true/true | 0/0 |
| pay_conta_pagar(uuid,text,date,uuid) | function | true | true/true/true | 0/1 |
| preview_regra_categorizacao(text,text) | function | true | false/true/true | 0/1 |
| produtos_force_company_id() | trigger | false | true/true/true | 0/0 |
| protect_profile_identity_scope() | trigger | false | true/true/true | 0/0 |
| rbac_permissions_diff(jsonb) | function | true | true/true/true | 0/0 |
| rbac_sql_lint_report_admin(uuid) | function | true | true/true/true | 0/1 |
| rbac_sql_lint_report_internal() | function | true | true/true/true | 2/0 |
| rbac_sql_lint_report_quick(uuid) | function | true | true/true/true | 0/2 |
| rbac_sql_lint_report() | function | true | true/true/true | 0/0 |
| rbac_top_legacy_usage(integer,integer) | function | true | true/true/true | 0/0 |
| recalc_product_costs(uuid) | function | true | true/true/true | 1/0 |
| receive_conta_receber(uuid,text,date) | function | true | true/true/true | 0/1 |
| receive_market_order_atomic(uuid,jsonb,text) | function | true | true/true/true | 0/0 |
| receive_purchase_order_atomic(uuid,jsonb,jsonb) | function | true | true/true/true | 0/2 |
| reconcile_auto_bind_transfer_counterparts(uuid,jsonb) | function | true | false/true/true | 0/1 |
| reconcile_batch_lancamentos(uuid[]) | function | true | false/true/true | 0/3 |
| reconcile_bind_extrato(uuid,text,text,uuid) | function | true | false/true/true | 1/2 |
| reconcile_create_transfer_from_extrato(date,numeric,text,uuid,uuid,text,text) | function | true | false/true/false | 0/1 |
| reconcile_create_transfer(date,numeric,text,uuid,uuid,uuid) | function | true | false/true/true | 0/0 |
| reconcile_ignorar_lancamento(uuid,date,numeric,text,text,uuid) | function | true | false/true/false | 0/1 |
| reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer) | function | true | false/true/false | 0/5 |
| reconcile_link_existing_lancamento(uuid,uuid,text,text,date) | function | true | true/true/true | 0/1 |
| reconcile_neutralize_contamax(uuid,jsonb) | function | true | false/true/false | 0/1 |
| reconcile_pay_conta_pagar(uuid,uuid,date,uuid,numeric,text,uuid) | function | true | true/true/true | 0/2 |
| reconcile_receive_conta_receber(uuid,uuid,date,uuid,numeric,text,uuid) | function | true | true/true/true | 0/2 |
| reconcile_reconsiderar_ignorada(uuid) | function | true | false/true/false | 0/1 |
| refresh_materialized_views() | function | true | true/true/true | 0/1 |
| refresh_saldo_cache(uuid) | function | true | true/true/true | 2/0 |
| reject_ponto_record(uuid,text) | function | true | true/true/true | 0/1 |
| relatorio_socios_resumo(text) | function | true | true/true/true | 0/0 |
| reopen_inventory(uuid,text) | function | true | true/true/true | 0/1 |
| reorder_fin_categoria(uuid,text) | function | true | true/true/true | 0/1 |
| reserve_company_invitation(uuid,uuid,text) | function | true | false/false/true | 0/1 |
| rpc_confirmacoes_approve(uuid) | function | true | true/true/true | 0/0 |
| rpc_create_company(text,text) | function | true | true/true/true | 0/0 |
| rpc_delete_fechamento_caixa(uuid) | function | true | false/true/true | 0/1 |
| rpc_recebimentos_close(uuid,boolean,text) | function | true | true/true/true | 0/0 |
| rpc_set_user_company(uuid,uuid) | function | true | true/true/true | 0/0 |
| rpc_upsert_fechamento_caixa_com_marcas(date,numeric,numeric,numeric,text,jsonb,timestamp with time zone) | function | true | false/true/false | 0/1 |
| rpc_upsert_fechamento_caixa(date,numeric,numeric,numeric,text,timestamp with time zone) | function | true | false/true/true | 1/0 |
| rpc_upsert_fechamento_caixa(date,numeric,numeric,numeric,text) | function | true | true/true/true | 1/0 |
| save_cotacao_ia_config(text,text,text,boolean) | function | true | true/true/true | 0/1 |
| save_cotacao_respostas_atomic(uuid,jsonb,jsonb) | function | true | true/true/true | 0/1 |
| save_cotacao_sugestao(uuid,text,numeric,numeric,jsonb,jsonb) | function | true | true/true/true | 0/1 |
| save_cotacao_zapi_config(text,text,text,text,text,boolean) | function | true | true/true/true | 0/1 |
| seed_default_categories() | function | true | true/true/true | 0/1 |
| set_cache(text,jsonb,integer) | function | true | true/true/true | 0/0 |
| set_limit(real) | extension | false | true/true/true | 0/0 |
| set_stock_movement_direction() | trigger | false | true/true/true | 0/0 |
| set_updated_at() | trigger | false | true/true/true | 0/0 |
| show_limit() | extension | false | true/true/true | 0/0 |
| show_trgm(text) | extension | false | true/true/true | 0/0 |
| similarity_dist(text,text) | extension | false | true/true/true | 0/0 |
| similarity_op(text,text) | extension | false | true/true/true | 0/0 |
| similarity(text,text) | extension | false | true/true/true | 0/0 |
| simulate_relatorios_score(date,date,jsonb) | function | true | true/true/true | 2/0 |
| simulate_relatorios_score(text,text,jsonb) | function | true | true/true/true | 2/0 |
| soft_delete_cotacao(uuid,timestamp with time zone) | function | true | true/true/true | 0/1 |
| soft_delete_inventory(uuid,text) | function | true | true/true/true | 0/1 |
| stock_insert_movement_atomic(uuid,numeric,text,text,text,text,text,text,text,jsonb) | function | true | true/true/true | 0/0 |
| stock_transfer_between_locations(uuid,text,text,numeric,text) | function | true | true/true/true | 0/1 |
| storno_purchase_order_stock(uuid) | function | true | true/true/true | 0/1 |
| strict_word_similarity_commutator_op(text,text) | extension | false | true/true/true | 0/0 |
| strict_word_similarity_dist_commutator_op(text,text) | extension | false | true/true/true | 0/0 |
| strict_word_similarity_dist_op(text,text) | extension | false | true/true/true | 0/0 |
| strict_word_similarity_op(text,text) | extension | false | true/true/true | 0/0 |
| strict_word_similarity(text,text) | extension | false | true/true/true | 0/0 |
| strip_html(text) | function | false | true/true/true | 5/0 |
| sync_permissions_from_registry(jsonb) | function | true | true/true/true | 0/0 |
| trg_block_placeholder_company() | trigger | false | true/true/true | 0/0 |
| trg_ficha_itens_invalidate_parent() | trigger | true | true/true/true | 0/0 |
| trg_fin_category_propagate_reporting_class() | trigger | true | false/false/false | 0/0 |
| trg_fin_contas_pagar_aprovado_em() | trigger | false | true/true/true | 0/0 |
| trg_fin_ensure_non_operational_categories() | trigger | true | false/false/false | 0/0 |
| trg_fin_rateio_report_exclusion() | trigger | true | false/false/false | 0/0 |
| trg_fin_require_category_on_reconciliation() | trigger | true | false/false/false | 0/0 |
| trg_force_company_alertas_falta() | trigger | true | true/true/true | 0/0 |
| trg_mask_numero_cartao() | trigger | false | true/true/true | 0/0 |
| trg_po_block_post_approval_changes() | trigger | true | true/true/true | 0/0 |
| trg_refresh_saldo_cache_conta() | trigger | true | true/true/true | 0/0 |
| trg_refresh_saldo_cache_lancamento() | trigger | true | true/true/true | 0/0 |
| trg_set_updated_at() | trigger | false | true/true/true | 0/0 |
| trg_validate_fin_lancamento_update() | trigger | true | true/true/true | 0/0 |
| trg_validate_rateio_sum() | trigger | true | true/true/true | 0/0 |
| unaccent_init(internal) | extension | false | true/true/true | 0/0 |
| unaccent_lexize(internal,internal,internal,internal) | extension | false | true/true/true | 0/0 |
| unaccent(regdictionary,text) | extension | false | true/true/true | 3/0 |
| unaccent(text) | extension | false | true/true/true | 3/0 |
| unreconcile_lancamento(uuid) | function | true | false/true/true | 0/1 |
| update_company(uuid,text,text,boolean) | function | true | true/true/true | 0/2 |
| update_cotacao_atomic(uuid,text,text,date,jsonb,jsonb,timestamp with time zone) | function | true | true/true/true | 0/1 |
| update_produto_last_movement() | trigger | true | true/true/true | 0/0 |
| update_transfer(uuid,numeric,date,text,uuid,uuid) | function | true | false/true/true | 0/1 |
| update_updated_at_column() | trigger | false | true/true/true | 0/0 |
| upsert_salmon_leftover_atomic(date,numeric,text) | function | true | true/true/true | 0/1 |
| upsert_supplier(text) | function | true | true/true/true | 0/0 |
| validate_cp_valor() | trigger | true | true/true/true | 0/0 |
| validate_cr_valor() | trigger | true | true/true/true | 0/0 |
| validate_estorno_movement() | trigger | false | true/true/true | 0/0 |
| validate_fechamento_marca_total() | trigger | false | true/true/true | 0/0 |
| validate_fin_lancamento() | trigger | true | true/true/true | 0/0 |
| validate_marca_categoria_vinculo() | trigger | false | true/true/true | 0/0 |
| validate_ponto_ferias() | trigger | true | true/true/true | 0/0 |
| validate_ponto_registro() | trigger | true | true/true/true | 0/0 |
| validate_ponto_update() | trigger | true | true/true/true | 0/0 |
| validate_purchase_order_item() | trigger | true | true/true/true | 0/0 |
| validate_requisicao_item_status() | trigger | true | true/true/true | 0/0 |
| validate_rh_banco_horas_numeric() | trigger | true | true/true/true | 0/0 |
| validate_rh_beneficios_numeric() | trigger | true | true/true/true | 0/0 |
| validate_rh_colaboradores_numeric() | trigger | true | true/true/true | 0/0 |
| validate_rh_folha_numeric() | trigger | true | true/true/true | 0/0 |
| validate_salmon_entry() | trigger | true | true/true/true | 0/0 |
| validate_salmon_manipulation() | trigger | true | true/true/true | 0/0 |
| validate_stock_movement() | trigger | true | true/true/true | 0/0 |
| validate_supplier_item_price() | trigger | true | true/true/true | 0/0 |
| word_similarity_commutator_op(text,text) | extension | false | true/true/true | 0/0 |
| word_similarity_dist_commutator_op(text,text) | extension | false | true/true/true | 0/0 |
| word_similarity_dist_op(text,text) | extension | false | true/true/true | 0/0 |
| word_similarity_op(text,text) | extension | false | true/true/true | 0/0 |
| word_similarity(text,text) | extension | false | true/true/true | 0/0 |

## Writers locais

| Fonte | Tabela | Operação | Empresa |
|---|---|---|---|
| src/components/admin/BugTrackerView.tsx:131 | system_bugs | update | useCompanyId |
| src/components/admin/BugTrackerView.tsx:144 | system_bugs | insert | useCompanyId |
| src/components/compras/AlertasFaltaEstoqueView.tsx:118 | alertas_falta_estoque | update | revisar declaração no caller |
| src/components/compras/CalendarioLembretesView.tsx:112 | purchase_reminders | update | useCompanyId |
| src/components/compras/CalendarioLembretesView.tsx:116 | purchase_reminders | insert | useCompanyId |
| src/components/compras/CalendarioLembretesView.tsx:128 | purchase_reminders | update | useCompanyId |
| src/components/compras/ShoppingChecklistView.tsx:171 | purchase_order_items | update | revisar declaração no caller |
| src/components/estoque/ListaFixaSetorAdmin.tsx:123 | listas_fixas_setor | insert | useCompanyId |
| src/components/estoque/ListaFixaSetorAdmin.tsx:149 | listas_fixas_setor_itens | insert | useCompanyId |
| src/components/estoque/ListaFixaSetorAdmin.tsx:174 | listas_fixas_setor_itens | delete | useCompanyId |
| src/components/estoque/ListaFixaSetorAdmin.tsx:200 | listas_fixas_setor_itens | update | useCompanyId |
| src/components/estoque/ListaFixaSetorAdmin.tsx:201 | listas_fixas_setor_itens | update | useCompanyId |
| src/components/estoque/ListaFixaSetorAdmin.tsx:210 | listas_fixas_setor | update | useCompanyId |
| src/components/financeiro/CadastroBaseTree.tsx:537 | fin_categorias | update | useCompanyId |
| src/components/financeiro/CadastroBaseTree.tsx:550 | fin_categorias | insert | useCompanyId |
| src/components/financeiro/CadastroBaseTree.tsx:590 | fin_categorias | update | useCompanyId |
| src/components/financeiro/CadastroBaseTree.tsx:633 | fin_categorias | update | useCompanyId |
| src/components/financeiro/CategoriasFinSection.tsx:98 | fin_categorias | insert | revisar declaração no caller |
| src/components/financeiro/CategorizacaoSection.tsx:183 | fin_regras_categorizacao | update | useCompanyId |
| src/components/financeiro/CategorizacaoSection.tsx:187 | fin_regras_categorizacao | insert | useCompanyId |
| src/components/financeiro/CategorizacaoSection.tsx:209 | fin_regras_categorizacao | update | useCompanyId |
| src/components/financeiro/CentrosCustoFinSection.tsx:83 | fin_centros_custo | insert | useCompanyId |
| src/components/financeiro/ContasBancariasSection.tsx:267 | fin_contas | insert | useCompanyId |
| src/components/financeiro/CriarLancamentoExtratoDialog.tsx:240 | fin_lancamentos | update | useCompanyId |
| src/components/financeiro/CriarLancamentoExtratoDialog.tsx:286 | fin_contas_pagar | insert | useCompanyId |
| src/components/financeiro/CriarLancamentoExtratoDialog.tsx:302 | fin_lancamentos | update | useCompanyId |
| src/components/financeiro/CriarLancamentoExtratoDialog.tsx:352 | fin_contas_receber | insert | useCompanyId |
| src/components/financeiro/CriarLancamentoExtratoDialog.tsx:363 | fin_lancamentos | update | useCompanyId |
| src/components/financeiro/FechamentoMarcasTab.tsx:146 | financeiro_fechamento_marcas | update | useCompanyId |
| src/components/financeiro/FechamentoMarcasTab.tsx:154 | financeiro_fechamento_marcas | insert | useCompanyId |
| src/components/financeiro/FechamentoMarcasTab.tsx:182 | financeiro_fechamento_marcas | update | useCompanyId |
| src/components/financeiro/PlanoContasFinSection.tsx:92 | fin_plano_contas | insert | useCompanyId |
| src/components/rh/BeneficiosSection.tsx:151 | rh_beneficios | update | useCompanyId |
| src/components/rh/BeneficiosSection.tsx:155 | rh_beneficios | insert | useCompanyId |
| src/components/rh/BeneficiosSection.tsx:191 | rh_beneficios | update | useCompanyId |
| src/components/rh/BeneficiosSection.tsx:222 | rh_beneficios | insert | useCompanyId |
| src/components/rh/ComunicacaoInternaSection.tsx:111 | rh_comunicados | update | useCompanyId |
| src/components/rh/ComunicacaoInternaSection.tsx:115 | rh_comunicados | insert | useCompanyId |
| src/components/rh/ComunicacaoInternaSection.tsx:142 | rh_comunicados | update | useCompanyId |
| src/components/rh/ComunicacaoInternaSection.tsx:149 | rh_comunicados | update | useCompanyId |
| src/components/rh/ControleCustosRhSection.tsx:148 | rh_custos_mensais | upsert | useCompanyId |
| src/components/rh/DocumentosComplianceSection.tsx:158 | rh_documentos | insert | useCompanyId |
| src/components/rh/DocumentosComplianceSection.tsx:215 | rh_documentos | delete | useCompanyId |
| src/components/rh/EscalasSection.tsx:148 | rh_escalas | insert | useCompanyId |
| src/components/rh/EscalasSection.tsx:176 | rh_escalas | update | useCompanyId |
| src/components/rh/EscalasSection.tsx:194 | rh_escala_slots | insert | useCompanyId |
| src/components/rh/EscalasSection.tsx:223 | rh_escala_slots | delete | useCompanyId |
| src/components/rh/EscalasSection.tsx:230 | rh_trocas_turno | update | useCompanyId |
| src/components/rh/FeriasAfastamentosSection.tsx:150 | rh_ferias_afastamentos | insert | useCompanyId |
| src/components/rh/FeriasAfastamentosSection.tsx:190 | rh_ferias_afastamentos | update | useCompanyId |
| src/components/rh/FeriasAfastamentosSection.tsx:207 | rh_ferias_afastamentos | update | useCompanyId |
| src/components/rh/FolhaPagamentoSection.tsx:199 | rh_folha_pagamento | update | useCompanyId |
| src/components/rh/FolhaPagamentoSection.tsx:201 | rh_folha_pagamento | insert | useCompanyId |
| src/components/rh/FolhaPagamentoSection.tsx:215 | rh_folha_pagamento | update | useCompanyId |
| src/components/rh/FolhaPagamentoSection.tsx:225 | rh_folha_pagamento | update | useCompanyId |
| src/components/rh/GestaoDisciplinarSection.tsx:115 | rh_ocorrencias_disciplinares | insert | useCompanyId |
| src/components/rh/GestaoDisciplinarSection.tsx:134 | rh_ocorrencias_disciplinares | update | useCompanyId |
| src/components/rh/OnboardingSection.tsx:140 | rh_onboarding | insert | useCompanyId |
| src/components/rh/OnboardingSection.tsx:167 | rh_onboarding | update | useCompanyId |
| src/components/rh/OnboardingSection.tsx:199 | rh_onboarding | update | useCompanyId |
| src/components/rh/SSTSection.tsx:169 | rh_epis | insert | useCompanyId |
| src/components/rh/SSTSection.tsx:180 | rh_epis | update | useCompanyId |
| src/components/rh/SSTSection.tsx:299 | rh_exames | insert | useCompanyId |
| src/components/rh/SSTSection.tsx:314 | rh_exames | update | useCompanyId |
| src/components/rh/SSTSection.tsx:448 | rh_incidentes | insert | useCompanyId |
| src/components/rh/SSTSection.tsx:461 | rh_incidentes | update | useCompanyId |
| src/components/rh/TarefasSection.tsx:130 | rh_tarefas | insert | useCompanyId |
| src/components/rh/TarefasSection.tsx:159 | rh_tarefas | update | useCompanyId |
| src/components/rh/TarefasSection.tsx:172 | rh_tarefas | update | useCompanyId |
| src/components/rh/TreinamentoSection.tsx:130 | rh_trilhas_treinamento | insert | useCompanyId |
| src/components/rh/TreinamentoSection.tsx:160 | rh_progresso_treinamento | insert | useCompanyId |
| src/components/rh/TreinamentoSection.tsx:195 | rh_progresso_treinamento | update | useCompanyId |
| src/components/RhView.tsx:297 | rh_colaboradores | insert | useCompanyId |
| src/components/RhView.tsx:335 | rh_colaboradores | update | useCompanyId |
| src/components/RhView.tsx:349 | rh_colaboradores | update | useCompanyId |
| src/components/RhView.tsx:356 | rh_colaboradores | update | useCompanyId |
| src/components/RhView.tsx:370 | rh_ponto_registros | insert | useCompanyId |
| src/components/RhView.tsx:392 | rh_ponto_registros | update | useCompanyId |
| src/components/RhView.tsx:443 | rh_ponto_registros | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:146 | stock_categories | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:155 | stock_categories | insert | useCompanyId |
| src/components/StockCadastrosSection.tsx:178 | stock_categories | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:202 | stock_locations | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:209 | stock_locations | insert | useCompanyId |
| src/components/StockCadastrosSection.tsx:232 | stock_locations | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:241 | stock_categories | delete | useCompanyId |
| src/components/StockCadastrosSection.tsx:272 | stock_sectors | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:280 | stock_sectors | insert | useCompanyId |
| src/components/StockCadastrosSection.tsx:303 | stock_sectors | update | useCompanyId |
| src/components/StockCadastrosSection.tsx:312 | stock_sectors | delete | useCompanyId |
| src/components/StockCadastrosSection.tsx:328 | stock_locations | delete | useCompanyId |
| src/hooks/useEstoqueGeralStore.ts:619 | produtos | insert | useCompanyId |
| src/hooks/useEstoqueGeralStore.ts:687 | produtos | update | useCompanyId |
| src/hooks/useEstoqueGeralStore.ts:743 | movimentacoes_estoque | insert | useCompanyId |
| src/hooks/useNotifications.ts:40 | notifications | update | revisar declaração no caller |
| src/hooks/usePurchaseOrdersStore.ts:294 | notifications | insert | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:324 | purchase_order_items | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:351 | purchase_order_items | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:357 | purchase_orders | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:368 | notifications | insert | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:395 | purchase_order_items | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:464 | notifications | insert | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:520 | purchase_orders | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:529 | purchase_orders | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:587 | notifications | insert | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:626 | purchase_order_items | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:631 | purchase_orders | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:663 | purchase_orders | update | useCompanyId |
| src/hooks/usePurchaseOrdersStore.ts:669 | notifications | update | useCompanyId |
| src/hooks/useSalmonStore.ts:263 | suppliers | insert | useCompanyId |
| src/hooks/useSalmonStore.ts:322 | suppliers | update | useCompanyId |
| src/hooks/useSalmonStore.ts:332 | suppliers | delete | useCompanyId |
| src/hooks/useSalmonStore.ts:349 | planning_metas_compra | upsert | useCompanyId |
| src/hooks/useSalmonStore.ts:389 | salmon_metas_provisionadas | upsert | useCompanyId |
| src/hooks/useSalmonStore.ts:660 | salmon_daily_records | upsert | useCompanyId |
| src/hooks/useSalmonStore.ts:687 | salmon_daily_records | delete | useCompanyId |
| src/hooks/useSalmonStore.ts:701 | salmon_config | update | useCompanyId |
| src/hooks/useSalmonStore.ts:952 | salmon_auditorias_compra | insert | useCompanyId |
| src/permissions/hooks.ts:41 | rbac_legacy_usage | insert | revisar declaração no caller |
| supabase/functions/admin-users/index.ts:29 | admin_actions_log | insert | Edge resolver; revisar ação |
| supabase/functions/admin-users/index.ts:104 | profiles | update | Edge resolver; revisar ação |
| supabase/functions/admin-users/index.ts:127 | job_roles | insert | Edge resolver; revisar ação |
| supabase/functions/admin-users/index.ts:132 | job_roles | update | Edge resolver; revisar ação |
| supabase/functions/ai-chat/index.ts:191 | ai_logs | insert | Edge resolver; revisar ação |
| supabase/functions/ai-chat/index.ts:237 | ai_logs | insert | Edge resolver; revisar ação |
| supabase/functions/ai-chat/index.ts:268 | ai_logs | update | Edge resolver; revisar ação |
| supabase/functions/cmv/index.ts:362 | financeiro_fechamento_caixa | upsert | Edge resolver; revisar ação |
| supabase/functions/cmv/index.ts:394 | metas_cmv | upsert | Edge resolver; revisar ação |
| supabase/functions/cmv/index.ts:531 | produtos | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:469 | ficha_componentes | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:526 | ficha_componentes | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:534 | ficha_componentes | insert | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:574 | ficha_componentes | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:703 | canais_venda | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:710 | canais_venda | insert | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:727 | canais_venda | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:755 | precificacao_canal | upsert | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:888 | cenarios_simulacao | insert | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:921 | ficha_componentes | update | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:979 | config_precificacao | upsert | Edge resolver; revisar ação |
| supabase/functions/ficha-tecnica/index.ts:993 | config_precificacao | upsert | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:65 | audit_inventario_log | insert | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:212 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:257 | inventario_itens | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:303 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:317 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:398 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:427 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:461 | movimentacoes_estoque | insert | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:642 | inventario_conferentes | insert | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:666 | inventario_conferentes | delete | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:690 | inventarios | update | Edge resolver; revisar ação |
| supabase/functions/inventario/index.ts:697 | notifications | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:218 | purchase_requisitions | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:244 | purchase_requisition_items | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:251 | purchase_requisition_audit | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:290 | purchase_requisitions | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:303 | purchase_requisition_items | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:313 | purchase_requisitions | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:317 | purchase_requisition_audit | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:346 | purchase_requisition_items | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:360 | purchase_requisitions | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:363 | purchase_requisition_audit | insert | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:385 | purchase_requisitions | update | Edge resolver; revisar ação |
| supabase/functions/purchase-requisitions/index.ts:389 | purchase_requisition_audit | insert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:272 | movimentacoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:351 | movimentacoes_estoque | insert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:378 | movimentacoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:400 | salmon_entries | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:408 | salmon_manipulations | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:498 | requisicoes_estoque | insert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:524 | requisicao_estoque_itens | insert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:584 | alertas_falta_estoque | upsert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:644 | requisicoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:680 | notifications | upsert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:769 | requisicao_estoque_itens | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:899 | alertas_falta_estoque | upsert | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:981 | requisicao_estoque_itens | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:994 | requisicoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:1042 | requisicoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:1050 | notifications | update | Edge resolver; revisar ação |
| supabase/functions/requisicao-estoque/index.ts:1092 | requisicoes_estoque | update | Edge resolver; revisar ação |
| supabase/functions/rh/index.ts:132 | rh_banco_horas | upsert | Edge resolver; revisar ação |
| supabase/functions/rh/index.ts:158 | rh_audit_log | insert | Edge resolver; revisar ação |
| supabase/functions/scheduled-jobs/index.ts:64 | audit_logs | insert | revisar declaração no caller |
| supabase/functions/send-whatsapp-zapi/index.ts:181 | cotacao_whatsapp_logs | insert | Edge resolver; revisar ação |
| supabase/functions/send-whatsapp-zapi/index.ts:200 | cotacao_fornecedores | update | Edge resolver; revisar ação |
