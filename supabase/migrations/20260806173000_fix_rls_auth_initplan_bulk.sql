-- Auto-gerado: corrige auth_rls_initplan (388 policies / 111 tabelas).
-- Todas as chamadas a get_current_company_id()/has_permission()/has_any_permission()/
-- has_compras_view()/has_permission_quick()/auth.uid() nas policies de RLS passam a ir
-- embrulhadas em (select ...), forcando avaliacao unica por query (InitPlan) em vez de
-- reavaliacao linha a linha. NENHUMA mudanca de logica -- mesma expressao booleana,
-- so a forma de avaliacao. Ver principio 'Policy RLS: ... (select ...)' no CLAUDE.md e
-- o caso fin_lancamentos (migration 20260806171500, 8.7s -> 47ms) que motivou este audit.

-- ===== ai_insights =====
ALTER POLICY "ai_insights_select_tenant" ON public."ai_insights"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ia:consultor-geral:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "ai_insights_write_tenant" ON public."ai_insights"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
-- ===== ai_logs =====
ALTER POLICY "ai_logs_insert_own" ON public."ai_logs"
  WITH CHECK (((user_id = (select auth.uid())) AND (company_id = (select get_current_company_id()))));
ALTER POLICY "ai_logs_select_admin" ON public."ai_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ia:logs:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "ai_logs_select_own" ON public."ai_logs"
  USING (((company_id = (select get_current_company_id())) AND (user_id = (select auth.uid()))));
ALTER POLICY "ai_logs_update_own" ON public."ai_logs"
  USING (((user_id = (select auth.uid())) AND (company_id = (select get_current_company_id()))))
  WITH CHECK (((user_id = (select auth.uid())) AND (company_id = (select get_current_company_id()))));
-- ===== ai_score_historico =====
ALTER POLICY "ai_score_delete_tenant" ON public."ai_score_historico"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "ai_score_insert_tenant" ON public."ai_score_historico"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "ai_score_select_tenant" ON public."ai_score_historico"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ia:consultor-geral:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "ai_score_update_tenant" ON public."ai_score_historico"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
-- ===== alertas_falta_estoque =====
ALTER POLICY "alertas_falta_insert" ON public."alertas_falta_estoque"
  WITH CHECK ((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = (select auth.uid())))));
ALTER POLICY "alertas_falta_select" ON public."alertas_falta_estoque"
  USING (((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = (select auth.uid())))) AND ((select has_permission(auth.uid(), 'compras:alertas_falta:view'::text)) OR (select has_permission(auth.uid(), 'compras:pedidos:view'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text)))));
ALTER POLICY "alertas_falta_update" ON public."alertas_falta_estoque"
  USING (((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = (select auth.uid())))) AND ((select has_permission(auth.uid(), 'compras:alertas_falta:approve'::text)) OR (select has_permission(auth.uid(), 'compras:pedidos:edit'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text)))))
  WITH CHECK ((company_id = ( SELECT p.company_id
   FROM profiles p
  WHERE (p.id = (select auth.uid())))));
-- ===== aprovacoes_solic_compra_mercado =====
ALTER POLICY "compras:confirmacoes:approve insert" ON public."aprovacoes_solic_compra_mercado"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:approve'::text, 'compras:confirmacoes:approve'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view aprovacoes" ON public."aprovacoes_solic_compra_mercado"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== audit_inventario_log =====
ALTER POLICY "inventory_insert_audit_log" ON public."audit_inventario_log"
  WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "inventory_read_audit_log" ON public."audit_inventario_log"
  USING ((select has_permission(auth.uid(), 'inventory:read'::text)));
-- ===== audit_log =====
ALTER POLICY "Authenticated can insert audit" ON public."audit_log"
  WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "perm_audit_log_select" ON public."audit_log"
  USING ((select has_permission(auth.uid(), 'system:read'::text)));
-- ===== audit_logs =====
ALTER POLICY "audit_logs_insert_tenant" ON public."audit_logs"
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));
ALTER POLICY "audit_logs_select_tenant" ON public."audit_logs"
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));
ALTER POLICY "perm_audit_logs_select" ON public."audit_logs"
  USING ((select has_permission(auth.uid(), 'system:read'::text)));
-- ===== canais_venda =====
ALTER POLICY "canais_insert" ON public."canais_venda"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:canais:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "canais_select" ON public."canais_venda"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:canais:view'::text, 'ficha:markup:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "canais_update" ON public."canais_venda"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:canais:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== cenarios_simulacao =====
ALTER POLICY "cenarios_insert" ON public."cenarios_simulacao"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:analise:simulate'::text, 'system:global:manage'::text]))));
ALTER POLICY "cenarios_select" ON public."cenarios_simulacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:analise:view'::text, 'ficha:analise:simulate'::text, 'system:global:manage'::text]))));
ALTER POLICY "cenarios_update" ON public."cenarios_simulacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:analise:simulate'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== cmv_cache =====
ALTER POLICY "cmv_cache_delete" ON public."cmv_cache"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:categoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "cmv_cache_insert" ON public."cmv_cache"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:categoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "cmv_cache_select" ON public."cmv_cache"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:categoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "cmv_cache_update" ON public."cmv_cache"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:categoria:view'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== companies =====
ALTER POLICY "companies_admin" ON public."companies"
  USING ((select has_permission(auth.uid(), 'system:admin'::text)));
ALTER POLICY "companies_read" ON public."companies"
  USING ((id = (select get_current_company_id())));
-- ===== config_precificacao =====
ALTER POLICY "config_prec_insert" ON public."config_precificacao"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "config_prec_select" ON public."config_precificacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:view'::text, 'ficha:analise:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "config_prec_update" ON public."config_precificacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== confirmacoes_recebimento =====
ALTER POLICY "compras:confirmacoes:approve insert" ON public."confirmacoes_recebimento"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve'::text, 'compras:recebimentos:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:confirmacoes:approve update" ON public."confirmacoes_recebimento"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:confirmacoes:approve'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:confirmacoes:view" ON public."confirmacoes_recebimento"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
ALTER POLICY "compras:pedidos:delete confirmacoes" ON public."confirmacoes_recebimento"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
-- ===== cotacao_fornecedores =====
ALTER POLICY "cotacao_fornecedores_select" ON public."cotacao_fornecedores"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacao_fornecedores_write" ON public."cotacao_fornecedores"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_ia_config =====
ALTER POLICY "cotacao_ia_config_all" ON public."cotacao_ia_config"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'configuracoes:integracoes:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'configuracoes:integracoes:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_itens =====
ALTER POLICY "cotacao_itens_select" ON public."cotacao_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacao_itens_write" ON public."cotacao_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_respostas =====
ALTER POLICY "cotacao_respostas_select" ON public."cotacao_respostas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacao_respostas_write" ON public."cotacao_respostas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:delete'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_sugestoes =====
ALTER POLICY "cotacao_sugestoes_select" ON public."cotacao_sugestoes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacao_sugestoes_write" ON public."cotacao_sugestoes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'compras:cotacao:edit'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_whatsapp_logs =====
ALTER POLICY "cotacao_wa_logs_select" ON public."cotacao_whatsapp_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacao_wa_logs_write" ON public."cotacao_whatsapp_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacao_zapi_config =====
ALTER POLICY "cotacao_zapi_config_all" ON public."cotacao_zapi_config"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage'::text, 'system:global:manage'::text]))));
-- ===== cotacoes =====
ALTER POLICY "cotacoes_delete" ON public."cotacoes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacoes_insert" ON public."cotacoes"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacoes_select" ON public."cotacoes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "cotacoes_update" ON public."cotacoes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:cotacao:edit'::text, 'compras:cotacao:approve'::text, 'compras:cotacao:close'::text, 'compras:cotacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== faturamento_periodos_legacy =====
ALTER POLICY "faturamento_legacy_select_own_tenant" ON public."faturamento_periodos_legacy"
  USING ((company_id = (select get_current_company_id())));
-- ===== ficha_componente_itens =====
ALTER POLICY "ficha_itens_insert" ON public."ficha_componente_itens"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:edit'::text, 'ficha:itens-prontos:edit'::text, 'ficha:produtos-finais:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "ficha_itens_select" ON public."ficha_componente_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:view'::text, 'ficha:itens-prontos:view'::text, 'ficha:produtos-finais:view'::text, 'ficha:analise:view'::text, 'ficha:markup:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "ficha_itens_update" ON public."ficha_componente_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:edit'::text, 'ficha:itens-prontos:edit'::text, 'ficha:produtos-finais:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== ficha_componentes =====
ALTER POLICY "ficha_comp_insert" ON public."ficha_componentes"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:create'::text, 'ficha:itens-prontos:create'::text, 'ficha:produtos-finais:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "ficha_comp_select" ON public."ficha_componentes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:view'::text, 'ficha:itens-prontos:view'::text, 'ficha:produtos-finais:view'::text, 'ficha:analise:view'::text, 'ficha:markup:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "ficha_comp_update" ON public."ficha_componentes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:pre-preparos:edit'::text, 'ficha:itens-prontos:edit'::text, 'ficha:produtos-finais:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== fin_audit_logs =====
ALTER POLICY "delete_fin_audit_logs_system" ON public."fin_audit_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['system:global:manage'::text]))));
ALTER POLICY "insert_fin_audit_logs_tenant" ON public."fin_audit_logs"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:auditoria:write'::text, 'financeiro:lancamentos:create'::text, 'financeiro:pagar:create'::text, 'financeiro:receber:create'::text, 'financeiro:conciliacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "select_fin_audit_logs_tenant" ON public."fin_audit_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:auditoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "update_fin_audit_logs_system" ON public."fin_audit_logs"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['system:global:manage'::text]))));
-- ===== fin_categorias =====
ALTER POLICY "tenant_delete_fin_categorias" ON public."fin_categorias"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:categorias:delete'::text, 'finance:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_fin_categorias" ON public."fin_categorias"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:categorias:create'::text, 'finance:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_fin_categorias" ON public."fin_categorias"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:categorias:view'::text, 'finance:read'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_fin_categorias" ON public."fin_categorias"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:categorias:edit'::text, 'finance:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== fin_centros_custo =====
ALTER POLICY "tenant_delete_fin_centros_custo" ON public."fin_centros_custo"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:centros-custo:delete'::text, 'finance:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_fin_centros_custo" ON public."fin_centros_custo"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:centros-custo:create'::text, 'finance:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_fin_centros_custo" ON public."fin_centros_custo"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:centros-custo:view'::text, 'finance:read'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_fin_centros_custo" ON public."fin_centros_custo"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:centros-custo:edit'::text, 'finance:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== fin_conciliacao_ignoradas =====
ALTER POLICY "conciliacao_ignoradas_company_rls" ON public."fin_conciliacao_ignoradas"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "conciliacao_ignoradas_superadmin" ON public."fin_conciliacao_ignoradas"
  USING ((select has_permission(auth.uid(), 'system:global:manage'::text)));
-- ===== fin_contas =====
ALTER POLICY "tenant_delete" ON public."fin_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_contas"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:contas:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update" ON public."fin_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_contas_pagar =====
ALTER POLICY "tenant_delete" ON public."fin_contas_pagar"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_contas_pagar"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_contas_pagar"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update" ON public."fin_contas_pagar"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_contas_receber =====
ALTER POLICY "tenant_delete" ON public."fin_contas_receber"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_contas_receber"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_contas_receber"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['financeiro:receber:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update" ON public."fin_contas_receber"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_contas_saldo_cache =====
ALTER POLICY "tenant_isolation" ON public."fin_contas_saldo_cache"
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));
-- ===== fin_dre_linhas =====
ALTER POLICY "tenant_delete" ON public."fin_dre_linhas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_dre_linhas"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_dre_linhas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_dre_linhas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_lancamento_rateios =====
ALTER POLICY "tenant_delete" ON public."fin_lancamento_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_lancamento_rateios"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_lancamento_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_lancamento_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_orcamentos =====
ALTER POLICY "tenant_delete" ON public."fin_orcamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_orcamentos"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_orcamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_orcamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_plano_contas =====
ALTER POLICY "tenant_delete" ON public."fin_plano_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_plano_contas"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_plano_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_plano_contas"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_rateios =====
ALTER POLICY "tenant_delete" ON public."fin_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_rateios"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_rateios"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== fin_regras_categorizacao =====
ALTER POLICY "tenant_delete" ON public."fin_regras_categorizacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_insert" ON public."fin_regras_categorizacao"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
ALTER POLICY "tenant_read" ON public."fin_regras_categorizacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:read'::text))));
ALTER POLICY "tenant_update" ON public."fin_regras_categorizacao"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'finance:manage'::text))));
-- ===== financeiro_fechamento_caixa =====
ALTER POLICY "fechamento_delete" ON public."financeiro_fechamento_caixa"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['finance:manage'::text, 'financeiro:fechamento:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "fechamento_insert" ON public."financeiro_fechamento_caixa"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['finance:manage'::text, 'financeiro:fechamento:create'::text, 'financeiro:fechamento:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "fechamento_select" ON public."financeiro_fechamento_caixa"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['finance:read'::text, 'financeiro:fechamento:view'::text, 'financeiro:lancamentos:view'::text, 'cmv:categoria:view'::text, 'cmv:semanal:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "fechamento_update" ON public."financeiro_fechamento_caixa"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['finance:manage'::text, 'financeiro:fechamento:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== integration_logs =====
ALTER POLICY "perm_integration_logs_select" ON public."integration_logs"
  USING ((select has_permission(auth.uid(), 'system:read'::text)));
-- ===== inventario_conferentes =====
ALTER POLICY "conferentes_delete" ON public."inventario_conferentes"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'inventario:conferentes:manage'::text))));
ALTER POLICY "conferentes_insert" ON public."inventario_conferentes"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'inventario:conferentes:manage'::text))));
ALTER POLICY "conferentes_select" ON public."inventario_conferentes"
  USING ((company_id = (select get_current_company_id())));
-- ===== inventario_itens =====
ALTER POLICY "inv_itens_insert_granular" ON public."inventario_itens"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:criar:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "inv_itens_select_granular" ON public."inventario_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:detalhe:view'::text, 'inventario:auditoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "inv_itens_update_granular" ON public."inventario_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:detalhe:edit'::text, 'inventario:auditoria:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== inventarios =====
ALTER POLICY "inv_insert_granular" ON public."inventarios"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:criar:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "inv_select_granular" ON public."inventarios"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:lista:view'::text, 'inventario:detalhe:view'::text, 'inventario:dashboard:view'::text, 'inventario:auditoria:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "inv_update_granular" ON public."inventarios"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['inventario:detalhe:edit'::text, 'inventario:detalhe:close'::text, 'inventario:auditoria:approve'::text, 'inventario:auditoria:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== job_roles =====
ALTER POLICY "tenant_delete_job_roles" ON public."job_roles"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['usuarios:cargos:delete'::text, 'users:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_job_roles" ON public."job_roles"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['usuarios:cargos:create'::text, 'users:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_job_roles" ON public."job_roles"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['usuarios:cargos:view'::text, 'users:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_job_roles" ON public."job_roles"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['usuarios:cargos:edit'::text, 'users:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== listas_fixas_setor =====
ALTER POLICY "listas_fixas_setor_delete" ON public."listas_fixas_setor"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_insert" ON public."listas_fixas_setor"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_select" ON public."listas_fixas_setor"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:view'::text, 'estoque:requisicoes:create'::text, 'estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_update" ON public."listas_fixas_setor"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== listas_fixas_setor_itens =====
ALTER POLICY "listas_fixas_setor_itens_delete" ON public."listas_fixas_setor_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_itens_insert" ON public."listas_fixas_setor_itens"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_itens_select" ON public."listas_fixas_setor_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:view'::text, 'estoque:requisicoes:create'::text, 'estoque:requisicoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "listas_fixas_setor_itens_update" ON public."listas_fixas_setor_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:requisicoes:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== metas_cmv =====
ALTER POLICY "metas_cmv_delete" ON public."metas_cmv"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "metas_cmv_insert" ON public."metas_cmv"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "metas_cmv_select" ON public."metas_cmv"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:semanal:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "metas_cmv_update" ON public."metas_cmv"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['cmv:semanal:edit'::text, 'system:global:manage'::text]))));
-- ===== movimentacoes_estoque =====
ALTER POLICY "movimentacoes_delete" ON public."movimentacoes_estoque"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:delete'::text, 'estoque:movimentacoes:delete'::text, 'estoque:movimentacoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "movimentacoes_insert" ON public."movimentacoes_estoque"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:movements:create'::text, 'estoque:movimentacoes:create'::text, 'estoque:movimentacoes:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "movimentacoes_select" ON public."movimentacoes_estoque"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:movements:read'::text, 'estoque:movimentacoes:view'::text, 'cmv:categoria:view'::text, 'cmv:top-itens:view'::text, 'cmv:setor:view'::text, 'cmv:semanal:view'::text, 'cmv:simulador:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "movimentacoes_update" ON public."movimentacoes_estoque"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:movements:edit'::text, 'estoque:movimentacoes:edit'::text, 'estoque:movimentacoes:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== notifications =====
ALTER POLICY "Users can insert notifications as themselves" ON public."notifications"
  WITH CHECK ((created_by = (select auth.uid())));
ALTER POLICY "Users read own notifications" ON public."notifications"
  USING ((recipient_user_id = (select auth.uid())));
ALTER POLICY "Users update own notifications" ON public."notifications"
  USING ((recipient_user_id = (select auth.uid())));
-- ===== planning_metas_compra =====
ALTER POLICY "planning_delete" ON public."planning_metas_compra"
  USING ((select has_permission(auth.uid(), 'planning:manage'::text)));
ALTER POLICY "planning_insert" ON public."planning_metas_compra"
  WITH CHECK (((select has_permission(auth.uid(), 'planning:manage'::text)) AND (created_by = (select auth.uid()))));
ALTER POLICY "planning_select" ON public."planning_metas_compra"
  USING ((select has_permission(auth.uid(), 'planning:read'::text)));
ALTER POLICY "planning_update" ON public."planning_metas_compra"
  USING ((select has_permission(auth.uid(), 'planning:manage'::text)))
  WITH CHECK ((select has_permission(auth.uid(), 'planning:manage'::text)));
-- ===== precificacao_canal =====
ALTER POLICY "prec_canal_delete" ON public."precificacao_canal"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "prec_canal_insert" ON public."precificacao_canal"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "prec_canal_select" ON public."precificacao_canal"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:view'::text, 'ficha:analise:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "prec_canal_update" ON public."precificacao_canal"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['ficha:markup:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== produtos =====
ALTER POLICY "produtos_delete" ON public."produtos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:delete'::text, 'estoque:cadastros:delete'::text, 'estoque:cadastros:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "produtos_insert" ON public."produtos"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:edit'::text, 'estoque:cadastros:create'::text, 'estoque:cadastros:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "produtos_select" ON public."produtos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:read'::text, 'estoque:geral:view'::text, 'estoque:cadastros:view'::text, 'estoque:catalogo:view'::text, 'estoque:saldo:view'::text, 'estoque:requisicoes:view'::text, 'estoque:requisicoes:create'::text, 'estoque:dashboard:view'::text, 'estoque:movimentacoes:view'::text, 'estoque:consumo:view'::text, 'estoque:ranking:view'::text, 'estoque:perdas:view'::text, 'estoque:transferencias:view'::text, 'estoque:preditivo:view'::text, 'estoque:simulador:view'::text, 'cmv:categoria:view'::text, 'cmv:top-itens:view'::text, 'cmv:setor:view'::text, 'cmv:semanal:view'::text, 'cmv:precos:view'::text, 'cmv:simulador:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "produtos_update" ON public."produtos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:edit'::text, 'estoque:cadastros:edit'::text, 'estoque:cadastros:manage'::text, 'cmv:precos:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "tenant_delete" ON public."produtos"
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (select has_permission_quick(auth.uid(), 'stock:delete'::text))));
ALTER POLICY "tenant_insert" ON public."produtos"
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (select has_permission_quick(auth.uid(), 'stock:edit'::text))));
ALTER POLICY "tenant_read" ON public."produtos"
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND ((select has_permission_quick(auth.uid(), 'stock:read'::text)) OR (select has_permission_quick(auth.uid(), 'admin'::text)))));
ALTER POLICY "tenant_update" ON public."produtos"
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (select has_permission_quick(auth.uid(), 'stock:edit'::text))))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (select has_permission_quick(auth.uid(), 'stock:edit'::text))));
-- ===== profiles =====
ALTER POLICY "profiles_select_admin_company" ON public."profiles"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['configuracoes:usuarios:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "profiles_select_company_member" ON public."profiles"
  USING (((company_id = (select get_current_company_id())) AND (nome !~~* '[EXCLUÍDO]%'::text)));
ALTER POLICY "profiles_select_own" ON public."profiles"
  USING ((id = (select auth.uid())));
ALTER POLICY "profiles_update_own" ON public."profiles"
  USING ((id = (select auth.uid())))
  WITH CHECK ((id = (select auth.uid())));
-- ===== purchase_ignored_rules =====
ALTER POLICY "compras:pedidos:delete ignored_rules" ON public."purchase_ignored_rules"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit ignored_rules insert" ON public."purchase_ignored_rules"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit ignored_rules update" ON public."purchase_ignored_rules"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view ignored_rules" ON public."purchase_ignored_rules"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== purchase_order_items =====
ALTER POLICY "compras:pedidos:create order_items" ON public."purchase_order_items"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:create'::text, 'compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:delete order_items" ON public."purchase_order_items"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit order_items" ON public."purchase_order_items"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:checklist:edit'::text, 'compras:recebimentos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:checklist:edit'::text, 'compras:recebimentos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view order_items" ON public."purchase_order_items"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== purchase_orders =====
ALTER POLICY "compras:pedidos:create orders" ON public."purchase_orders"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:create'::text, 'compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:delete orders" ON public."purchase_orders"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view orders" ON public."purchase_orders"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
ALTER POLICY "po_tenant_update_approved" ON public."purchase_orders"
  USING (((company_id = (select get_current_company_id())) AND (status <> ALL (ARRAY['OPEN'::text, 'DRAFT'::text, 'SUBMITTED'::text])) AND (select has_any_permission(auth.uid(), ARRAY['compras:lista:approve'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:lista:approve'::text, 'system:global:manage'::text]))));
ALTER POLICY "po_tenant_update_draft" ON public."purchase_orders"
  USING (((company_id = (select get_current_company_id())) AND (status = ANY (ARRAY['OPEN'::text, 'DRAFT'::text, 'SUBMITTED'::text])) AND ((created_by = (select auth.uid())) OR (responsible_user_id = (select auth.uid())) OR (select has_permission(auth.uid(), 'compras:pedidos:edit'::text)))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (status = ANY (ARRAY['OPEN'::text, 'DRAFT'::text, 'SUBMITTED'::text]))));
-- ===== purchase_reminders =====
ALTER POLICY "compras:calendario:edit insert" ON public."purchase_reminders"
  WITH CHECK ((((select auth.uid()) = created_by) AND (select has_any_permission(auth.uid(), ARRAY['compras:calendario:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "compras:calendario:edit update" ON public."purchase_reminders"
  USING (((created_by = (select auth.uid())) AND (select has_any_permission(auth.uid(), ARRAY['compras:calendario:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK (((created_by = (select auth.uid())) AND (select has_any_permission(auth.uid(), ARRAY['compras:calendario:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "compras:calendario:view reminders" ON public."purchase_reminders"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== purchase_requisition_audit =====
ALTER POLICY "Users can insert their own purchase_requisition_audit" ON public."purchase_requisition_audit"
  WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY "compras:view req_audit" ON public."purchase_requisition_audit"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== purchase_requisition_items =====
ALTER POLICY "compras:lista:create req_items" ON public."purchase_requisition_items"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:create'::text, 'compras:pedidos:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:delete req_items" ON public."purchase_requisition_items"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:delete'::text, 'compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:edit req_items" ON public."purchase_requisition_items"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'compras:pedidos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'compras:pedidos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view req_items" ON public."purchase_requisition_items"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== purchase_requisitions =====
ALTER POLICY "compras:lista:create requisitions" ON public."purchase_requisitions"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:create'::text, 'compras:pedidos:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:delete requisitions" ON public."purchase_requisitions"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:delete'::text, 'compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:edit requisitions" ON public."purchase_requisitions"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'compras:pedidos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'compras:pedidos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view requisitions" ON public."purchase_requisitions"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== rbac_legacy_usage =====
ALTER POLICY "admin_read_legacy_usage" ON public."rbac_legacy_usage"
  USING ((select has_permission(auth.uid(), 'system:global:manage'::text)));
ALTER POLICY "authenticated_insert_legacy_usage" ON public."rbac_legacy_usage"
  WITH CHECK ((user_id = (select auth.uid())));
-- ===== recebimento_itens =====
ALTER POLICY "compras:recebimentos:create itens" ON public."recebimento_itens"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:create'::text, 'compras:recebimentos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:delete itens" ON public."recebimento_itens"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:edit itens" ON public."recebimento_itens"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:view itens" ON public."recebimento_itens"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== recebimentos =====
ALTER POLICY "compras:recebimentos:create" ON public."recebimentos"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:delete" ON public."recebimentos"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:edit" ON public."recebimentos"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:recebimentos:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:recebimentos:view" ON public."recebimentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== requisicao_estoque_itens =====
ALTER POLICY "req_itens_insert" ON public."requisicao_estoque_itens"
  WITH CHECK (((select has_permission(auth.uid(), 'estoque:requisicoes:create'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "req_itens_select" ON public."requisicao_estoque_itens"
  USING (((select has_permission(auth.uid(), 'estoque:requisicoes:view'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:read'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "req_itens_update" ON public."requisicao_estoque_itens"
  USING (((select has_permission(auth.uid(), 'estoque:requisicoes:approve'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))))
  WITH CHECK (((select has_permission(auth.uid(), 'estoque:requisicoes:approve'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
-- ===== requisicoes_estoque =====
ALTER POLICY "Authenticated can insert requisicoes" ON public."requisicoes_estoque"
  WITH CHECK ((solicitante_user_id = (select auth.uid())));
ALTER POLICY "Solicitante can delete own pending requisicao" ON public."requisicoes_estoque"
  USING (((solicitante_user_id = (select auth.uid())) AND (status = 'SOLICITADA'::text)));
ALTER POLICY "Solicitantes can read own requisicoes" ON public."requisicoes_estoque"
  USING ((solicitante_user_id = (select auth.uid())));
ALTER POLICY "req_delete" ON public."requisicoes_estoque"
  USING ((select has_permission(auth.uid(), 'system:global:manage'::text)));
ALTER POLICY "req_insert" ON public."requisicoes_estoque"
  WITH CHECK (((select has_permission(auth.uid(), 'estoque:requisicoes:create'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "req_select" ON public."requisicoes_estoque"
  USING (((select has_permission(auth.uid(), 'estoque:requisicoes:view'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:read'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "req_update" ON public."requisicoes_estoque"
  USING (((select has_permission(auth.uid(), 'estoque:requisicoes:approve'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))))
  WITH CHECK (((select has_permission(auth.uid(), 'estoque:requisicoes:approve'::text)) OR (select has_permission(auth.uid(), 'stock:requisitions:create'::text)) OR (select has_permission(auth.uid(), 'system:global:manage'::text))));
-- ===== rh_audit_log =====
ALTER POLICY "Authenticated can insert rh_audit" ON public."rh_audit_log"
  WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "rh_audit_log_select" ON public."rh_audit_log"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:prontuario:manage'::text, 'system:global:manage'::text]))));
-- ===== rh_banco_horas =====
ALTER POLICY "rh_banco_horas_insert" ON public."rh_banco_horas"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_banco_horas_select" ON public."rh_banco_horas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:view'::text, 'rh:folha:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_banco_horas_update" ON public."rh_banco_horas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_beneficios =====
ALTER POLICY "rh_beneficios_insert" ON public."rh_beneficios"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:beneficios:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_beneficios_select" ON public."rh_beneficios"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:beneficios:view'::text, 'rh:beneficios:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_beneficios_update" ON public."rh_beneficios"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:beneficios:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_colaboradores =====
ALTER POLICY "rh_colaboradores_insert_hr" ON public."rh_colaboradores"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['rh:prontuario:create'::text, 'rh:prontuario:manage'::text, 'system:global:manage'::text])));
ALTER POLICY "rh_colaboradores_select" ON public."rh_colaboradores"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:prontuario:view'::text, 'rh:prontuario:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_colaboradores_select_own" ON public."rh_colaboradores"
  USING (((company_id = (select get_current_company_id())) AND (user_id = (select auth.uid()))));
ALTER POLICY "rh_colaboradores_update" ON public."rh_colaboradores"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:prontuario:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_comunicados =====
ALTER POLICY "rh_comunicados_insert" ON public."rh_comunicados"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:comunicacao:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_comunicados_select" ON public."rh_comunicados"
  USING ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_comunicados_update" ON public."rh_comunicados"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:comunicacao:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_custos_mensais =====
ALTER POLICY "rh_custos_mensais_insert" ON public."rh_custos_mensais"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:custos:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_custos_mensais_select" ON public."rh_custos_mensais"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:custos:view'::text, 'rh:custos:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_custos_mensais_update" ON public."rh_custos_mensais"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:custos:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_disponibilidade =====
ALTER POLICY "rh_disponibilidade_delete" ON public."rh_disponibilidade"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_disponibilidade_insert" ON public."rh_disponibilidade"
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_disponibilidade_select" ON public."rh_disponibilidade"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:view'::text, 'rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_disponibilidade_update" ON public."rh_disponibilidade"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_documentos =====
ALTER POLICY "rh_documentos_insert" ON public."rh_documentos"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:documentos:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_documentos_select" ON public."rh_documentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:documentos:view'::text, 'rh:documentos:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_documentos_update" ON public."rh_documentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:documentos:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_epis =====
ALTER POLICY "rh_epis_insert" ON public."rh_epis"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_epis_select" ON public."rh_epis"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:view'::text, 'rh:sst:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_epis_update" ON public."rh_epis"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_escala_slots =====
ALTER POLICY "rh_escala_slots_insert" ON public."rh_escala_slots"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_escala_slots_select" ON public."rh_escala_slots"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:view'::text, 'rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_escala_slots_update" ON public."rh_escala_slots"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_escalas =====
ALTER POLICY "rh_escalas_delete" ON public."rh_escalas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_escalas_insert" ON public."rh_escalas"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_escalas_select" ON public."rh_escalas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:view'::text, 'rh:escalas:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_escalas_update" ON public."rh_escalas"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:escalas:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_exames =====
ALTER POLICY "rh_exames_insert" ON public."rh_exames"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_exames_select" ON public."rh_exames"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:view'::text, 'rh:sst:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_exames_update" ON public."rh_exames"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_ferias_afastamentos =====
ALTER POLICY "Colaborador can insert own ferias" ON public."rh_ferias_afastamentos"
  WITH CHECK ((solicitado_por = (select auth.uid())));
ALTER POLICY "rh_ferias_delete" ON public."rh_ferias_afastamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ferias_select" ON public."rh_ferias_afastamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:view'::text, 'rh:ferias:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ferias_select_own" ON public."rh_ferias_afastamentos"
  USING (((company_id = (select get_current_company_id())) AND (EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_ferias_afastamentos.colaborador_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY "rh_ferias_update" ON public."rh_ferias_afastamentos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_ferias_saldo =====
ALTER POLICY "rh_ferias_saldo_insert" ON public."rh_ferias_saldo"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ferias_saldo_select" ON public."rh_ferias_saldo"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:view'::text, 'rh:ferias:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ferias_saldo_select_own" ON public."rh_ferias_saldo"
  USING (((company_id = (select get_current_company_id())) AND (EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_ferias_saldo.colaborador_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY "rh_ferias_saldo_update" ON public."rh_ferias_saldo"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ferias:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_folha_pagamento =====
ALTER POLICY "rh_folha_delete" ON public."rh_folha_pagamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:folha:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_folha_insert" ON public."rh_folha_pagamento"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:folha:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_folha_select" ON public."rh_folha_pagamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:folha:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_folha_select_own" ON public."rh_folha_pagamento"
  USING (((company_id = (select get_current_company_id())) AND (EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_folha_pagamento.colaborador_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY "rh_folha_update" ON public."rh_folha_pagamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:folha:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_incidentes =====
ALTER POLICY "rh_incidentes_insert" ON public."rh_incidentes"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_incidentes_select" ON public."rh_incidentes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_incidentes_update" ON public."rh_incidentes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:sst:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_ocorrencias_disciplinares =====
ALTER POLICY "rh_ocorrencias_delete" ON public."rh_ocorrencias_disciplinares"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:disciplinar:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ocorrencias_insert" ON public."rh_ocorrencias_disciplinares"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:disciplinar:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ocorrencias_select" ON public."rh_ocorrencias_disciplinares"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:disciplinar:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ocorrencias_update" ON public."rh_ocorrencias_disciplinares"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:disciplinar:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_onboarding =====
ALTER POLICY "rh_onboarding_insert" ON public."rh_onboarding"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:onboarding:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_onboarding_select" ON public."rh_onboarding"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:onboarding:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_onboarding_update" ON public."rh_onboarding"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:onboarding:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_ponto_ajustes =====
ALTER POLICY "rh_ponto_ajustes_delete" ON public."rh_ponto_ajustes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ponto_ajustes_insert" ON public."rh_ponto_ajustes"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ponto_ajustes_select" ON public."rh_ponto_ajustes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ponto_ajustes_update" ON public."rh_ponto_ajustes"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_ponto_registros =====
ALTER POLICY "Colaborador can insert own ponto" ON public."rh_ponto_registros"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_ponto_registros.colaborador_id) AND (c.user_id = (select auth.uid()))))));
ALTER POLICY "rh_ponto_delete" ON public."rh_ponto_registros"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ponto_insert" ON public."rh_ponto_registros"
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_ponto_select" ON public."rh_ponto_registros"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_ponto_select_own" ON public."rh_ponto_registros"
  USING (((company_id = (select get_current_company_id())) AND (EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_ponto_registros.colaborador_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY "rh_ponto_update" ON public."rh_ponto_registros"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:ponto:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_progresso_treinamento =====
ALTER POLICY "rh_progresso_delete" ON public."rh_progresso_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_progresso_insert" ON public."rh_progresso_treinamento"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_progresso_select" ON public."rh_progresso_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_progresso_select_own" ON public."rh_progresso_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_progresso_treinamento.colaborador_id) AND (c.user_id = (select auth.uid())))))));
ALTER POLICY "rh_progresso_update" ON public."rh_progresso_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_tarefas =====
ALTER POLICY "rh_tarefas_insert" ON public."rh_tarefas"
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_tarefas_select" ON public."rh_tarefas"
  USING ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_tarefas_update" ON public."rh_tarefas"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_trilhas_treinamento =====
ALTER POLICY "rh_trilhas_delete" ON public."rh_trilhas_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_trilhas_insert" ON public."rh_trilhas_treinamento"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_trilhas_select" ON public."rh_trilhas_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "rh_trilhas_update" ON public."rh_trilhas_treinamento"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['rh:treinamento:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== rh_trocas_turno =====
ALTER POLICY "Colaborador can insert own trocas" ON public."rh_trocas_turno"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM rh_colaboradores c
  WHERE ((c.id = rh_trocas_turno.solicitante_id) AND (c.user_id = (select auth.uid()))))));
ALTER POLICY "rh_trocas_delete" ON public."rh_trocas_turno"
  USING ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_trocas_insert" ON public."rh_trocas_turno"
  WITH CHECK ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_trocas_select" ON public."rh_trocas_turno"
  USING ((company_id = (select get_current_company_id())));
ALTER POLICY "rh_trocas_update" ON public."rh_trocas_turno"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== role_permissions =====
ALTER POLICY "perm_role_permissions_manage" ON public."role_permissions"
  USING ((select has_permission(auth.uid(), 'users:manage'::text)))
  WITH CHECK ((select has_permission(auth.uid(), 'users:manage'::text)));
-- ===== salmon_auditorias_compra =====
ALTER POLICY "Tenant isolation" ON public."salmon_auditorias_compra"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_config =====
ALTER POLICY "salmon_config_insert" ON public."salmon_config"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_config_select" ON public."salmon_config"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view'::text, 'salmon:manipulacao:view'::text, 'salmon:entradas:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_config_update" ON public."salmon_config"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_daily_records =====
ALTER POLICY "salmon_daily_delete" ON public."salmon_daily_records"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_daily_insert" ON public."salmon_daily_records"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view'::text, 'salmon:metas:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_daily_select" ON public."salmon_daily_records"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view'::text, 'salmon:metas:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_daily_update" ON public."salmon_daily_records"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:dashboard:view'::text, 'salmon:metas:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_entries =====
ALTER POLICY "salmon_tenant_delete" ON public."salmon_entries"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'salmon:delete'::text))));
ALTER POLICY "salmon_tenant_insert" ON public."salmon_entries"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'salmon:entries:create'::text))));
ALTER POLICY "salmon_tenant_select" ON public."salmon_entries"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'salmon:read'::text))));
ALTER POLICY "salmon_tenant_update" ON public."salmon_entries"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'salmon:edit'::text))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_manipulations =====
ALTER POLICY "salmon_manipulations_delete" ON public."salmon_manipulations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_manipulations_insert" ON public."salmon_manipulations"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_manipulations_select" ON public."salmon_manipulations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:view'::text, 'salmon:dashboard:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_manipulations_update" ON public."salmon_manipulations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_metas_provisionadas =====
ALTER POLICY "Tenant isolation" ON public."salmon_metas_provisionadas"
  USING ((company_id = (select get_current_company_id())))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== salmon_purchase_targets =====
ALTER POLICY "salmon_targets_delete" ON public."salmon_purchase_targets"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:metas:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_targets_insert" ON public."salmon_purchase_targets"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:metas:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_targets_select" ON public."salmon_purchase_targets"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:metas:view'::text, 'salmon:planejamento:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "salmon_targets_update" ON public."salmon_purchase_targets"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['salmon:metas:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== security_risk_register =====
ALTER POLICY "srr_select_admin" ON public."security_risk_register"
  USING ((select has_permission(auth.uid(), 'system:global:manage'::text)));
ALTER POLICY "srr_write_admin" ON public."security_risk_register"
  WITH CHECK ((select has_permission(auth.uid(), 'system:global:manage'::text)));
-- ===== solic_compra_mercado =====
ALTER POLICY "Authenticated can insert solic_mercado" ON public."solic_compra_mercado"
  WITH CHECK ((solicitante_user_id = (select auth.uid())));
ALTER POLICY "Solicitantes can delete own pending solic_mercado" ON public."solic_compra_mercado"
  USING (((solicitante_user_id = (select auth.uid())) AND (status = 'ENVIADA'::text)));
ALTER POLICY "Solicitantes can read own solic_mercado" ON public."solic_compra_mercado"
  USING (((company_id = (select get_current_company_id())) AND (solicitante_user_id = (select auth.uid()))));
ALTER POLICY "Solicitantes can update own pending solic_mercado" ON public."solic_compra_mercado"
  USING (((solicitante_user_id = (select auth.uid())) AND (status = 'ENVIADA'::text)))
  WITH CHECK (((solicitante_user_id = (select auth.uid())) AND (status = 'ENVIADA'::text)));
ALTER POLICY "compras:pedidos:create solic_mercado" ON public."solic_compra_mercado"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:create'::text, 'compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:delete solic_mercado" ON public."solic_compra_mercado"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit solic_mercado" ON public."solic_compra_mercado"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view solic_mercado" ON public."solic_compra_mercado"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== solic_compra_mercado_item =====
ALTER POLICY "Solicitantes can delete own solic_items" ON public."solic_compra_mercado_item"
  USING ((EXISTS ( SELECT 1
   FROM solic_compra_mercado s
  WHERE ((s.id = solic_compra_mercado_item.solicitacao_id) AND (s.solicitante_user_id = (select auth.uid())) AND (s.status = 'ENVIADA'::text)))));
ALTER POLICY "Solicitantes can insert own solic_items" ON public."solic_compra_mercado_item"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM solic_compra_mercado s
  WHERE ((s.id = solic_compra_mercado_item.solicitacao_id) AND (s.solicitante_user_id = (select auth.uid())) AND (s.status = 'ENVIADA'::text)))));
ALTER POLICY "Solicitantes can read own solic_items" ON public."solic_compra_mercado_item"
  USING ((EXISTS ( SELECT 1
   FROM solic_compra_mercado s
  WHERE ((s.id = solic_compra_mercado_item.solicitacao_id) AND (s.solicitante_user_id = (select auth.uid()))))));
ALTER POLICY "compras:pedidos:create solic_items" ON public."solic_compra_mercado_item"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:create'::text, 'compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:create solic_mercado_item" ON public."solic_compra_mercado_item"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:create'::text, 'compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:delete solic_items" ON public."solic_compra_mercado_item"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:delete solic_mercado_item" ON public."solic_compra_mercado_item"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit solic_items" ON public."solic_compra_mercado_item"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:pedidos:edit solic_mercado_item" ON public."solic_compra_mercado_item"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:pedidos:edit'::text, 'compras:lista:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view solic_items" ON public."solic_compra_mercado_item"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
ALTER POLICY "compras:view solic_mercado_item" ON public."solic_compra_mercado_item"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== solicitacoes_compra =====
ALTER POLICY "Authenticated can insert solicitacoes_compra" ON public."solicitacoes_compra"
  WITH CHECK ((solicitante_user_id = (select auth.uid())));
ALTER POLICY "Solicitante can read own solicitacoes_compra" ON public."solicitacoes_compra"
  USING ((solicitante_user_id = (select auth.uid())));
ALTER POLICY "compras:lista:create solicitacoes" ON public."solicitacoes_compra"
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:create'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:delete solicitacoes" ON public."solicitacoes_compra"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:delete'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:lista:edit solicitacoes" ON public."solicitacoes_compra"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'system:global:manage'::text])))
  WITH CHECK ((select has_any_permission(auth.uid(), ARRAY['compras:lista:edit'::text, 'system:global:manage'::text])));
ALTER POLICY "compras:view solicitacoes" ON public."solicitacoes_compra"
  USING (((company_id = (select get_current_company_id())) AND (select has_compras_view(auth.uid()))));
-- ===== stock_categories =====
ALTER POLICY "tenant_delete_stock_categories" ON public."stock_categories"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:categorias:delete'::text, 'stock:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_stock_categories" ON public."stock_categories"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:categorias:create'::text, 'stock:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_stock_categories" ON public."stock_categories"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:categorias:view'::text, 'stock:read'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_stock_categories" ON public."stock_categories"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:categorias:edit'::text, 'stock:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== stock_locations =====
ALTER POLICY "tenant_delete_stock_locations" ON public."stock_locations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:locais:delete'::text, 'stock:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_stock_locations" ON public."stock_locations"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:locais:create'::text, 'stock:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_stock_locations" ON public."stock_locations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:locais:view'::text, 'stock:read'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_stock_locations" ON public."stock_locations"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['estoque:locais:edit'::text, 'stock:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== stock_sku_counter =====
ALTER POLICY "stock_sku_counter_delete" ON public."stock_sku_counter"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:delete'::text, 'estoque:sku:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "stock_sku_counter_insert" ON public."stock_sku_counter"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:edit'::text, 'estoque:catalogo:create'::text, 'estoque:sku:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "stock_sku_counter_select" ON public."stock_sku_counter"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:read'::text, 'estoque:catalogo:view'::text, 'estoque:catalogo:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "stock_sku_counter_update" ON public."stock_sku_counter"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:edit'::text, 'estoque:catalogo:create'::text, 'estoque:sku:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['stock:edit'::text, 'estoque:catalogo:create'::text, 'estoque:sku:manage'::text, 'system:global:manage'::text]))));
-- ===== supplier_item_prices =====
ALTER POLICY "perm_supplier_prices_select" ON public."supplier_item_prices"
  USING ((select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'system:global:manage'::text])));
ALTER POLICY "sip_perm_delete" ON public."supplier_item_prices"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "sip_perm_insert" ON public."supplier_item_prices"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]))));
ALTER POLICY "sip_perm_update" ON public."supplier_item_prices"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== suppliers =====
ALTER POLICY "compras:fornecedores:view suppliers" ON public."suppliers"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'compras:pedidos:view'::text, 'system:global:manage'::text]))));
ALTER POLICY "suppliers_perm_delete" ON public."suppliers"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:delete'::text, 'system:global:manage'::text]))));
ALTER POLICY "suppliers_perm_insert" ON public."suppliers"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:create'::text, 'system:global:manage'::text]))));
ALTER POLICY "suppliers_perm_update" ON public."suppliers"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== system_bugs =====
ALTER POLICY "admin_delete_bugs" ON public."system_bugs"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "admin_insert_bugs" ON public."system_bugs"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "admin_read_bugs" ON public."system_bugs"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
ALTER POLICY "admin_update_bugs" ON public."system_bugs"
  USING (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))))
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_permission(auth.uid(), 'system:global:manage'::text))));
-- ===== turnos =====
ALTER POLICY "tenant_delete_turnos" ON public."turnos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['configuracoes:turnos:delete'::text, 'settings:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_insert_turnos" ON public."turnos"
  WITH CHECK (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['configuracoes:turnos:create'::text, 'settings:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_select_turnos" ON public."turnos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['configuracoes:turnos:view'::text, 'settings:manage'::text, 'system:global:manage'::text]))));
ALTER POLICY "tenant_update_turnos" ON public."turnos"
  USING (((company_id = (select get_current_company_id())) AND (select has_any_permission(auth.uid(), ARRAY['configuracoes:turnos:edit'::text, 'settings:manage'::text, 'system:global:manage'::text]))))
  WITH CHECK ((company_id = (select get_current_company_id())));
-- ===== user_permissions =====
ALTER POLICY "Users can read own permissions" ON public."user_permissions"
  USING ((user_id = (select auth.uid())));
ALTER POLICY "perm_user_permissions_manage" ON public."user_permissions"
  USING ((select has_permission(auth.uid(), 'users:manage'::text)))
  WITH CHECK ((select has_permission(auth.uid(), 'users:manage'::text)));
-- ===== user_roles =====
ALTER POLICY "Users can read own roles" ON public."user_roles"
  USING (((select auth.uid()) = user_id));
ALTER POLICY "perm_user_roles_manage" ON public."user_roles"
  USING ((select has_permission(auth.uid(), 'users:manage'::text)))
  WITH CHECK ((select has_permission(auth.uid(), 'users:manage'::text)));
