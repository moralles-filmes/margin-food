-- ── RLS do Financeiro só aceitava as chaves legadas finance:read/finance:manage ──
-- Mesmo padrão já corrigido em fin_categorias/fin_centros_custo (20260912131731),
-- agora nas 9 tabelas restantes do módulo.
--
-- finance:read/finance:manage NÃO existem em src/permissions/registry.ts (o módulo
-- real é "financeiro", não "finance"), então não aparecem em Admin → Permissões e
-- ninguém consegue concedê-las pela tela — elas chegam só via role_permissions.
-- Como admin_upsert_company_membership grava DENY explícito para toda chave do role
-- que não venha marcada em p_permissions, e PermissionMatrix só renderiza chaves do
-- registry, qualquer usuário salvo pela tela de Usuários de uma unidade perde as
-- chaves legadas: a UI continua liberada pela chave granular e a RLS nega tudo.
--
-- Caso real: juniorsaori01@gmail.com em Royal Parma Bauru — "new row violates
-- row-level security policy for table fin_contas" ao criar conta bancária, com
-- financeiro:contas:create em ALLOW e finance:manage em DENY.
--
-- A mudança é ADITIVA: finance:read/finance:manage continuam válidas (não quebra
-- admin/diretor/gerente_geral nem as unidades legadas) e system:global:manage passa
-- a valer nas tabelas onde faltava. O isolamento por company_id é preservado em
-- todas as cláusulas, e has_any_permission continua embrulhado em (select ...) para
-- não reavaliar por linha (InitPlan).

-- ===== fin_contas → financeiro:contas:* (ContasBancariasSection) =====
ALTER POLICY "tenant_read" ON public.fin_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:contas:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_contas
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:contas:create', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:contas:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_contas_pagar → financeiro:pagar:* =====
-- financeiro:conciliacao:reconcile entra no INSERT porque CriarLancamentoExtratoDialog
-- cria o título direto a partir da linha do extrato sob esse único gate.
ALTER POLICY "tenant_read" ON public.fin_contas_pagar
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_contas_pagar
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:pagar:create', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_contas_pagar
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:pagar:edit', 'financeiro:pagar:approve', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:pagar:edit', 'financeiro:pagar:approve', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_contas_pagar
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:pagar:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_contas_receber → financeiro:receber:* =====
ALTER POLICY "tenant_read" ON public.fin_contas_receber
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:receber:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_contas_receber
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:receber:create', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_contas_receber
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:receber:edit', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:receber:edit', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_contas_receber
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:receber:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_orcamentos → financeiro:orcamento:* =====
-- O submódulo Orçamento não tem ação "create" no registry: "Editar / Criar" é uma
-- ação só (edit), então ela cobre INSERT e UPDATE.
ALTER POLICY "tenant_read" ON public.fin_orcamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:orcamento:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_orcamentos
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:orcamento:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_orcamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:orcamento:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:orcamento:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_orcamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:orcamento:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_plano_contas → financeiro:cadastros:* (Cadastros Base → Plano de Contas) =====
ALTER POLICY "tenant_read" ON public.fin_plano_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_plano_contas
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:create', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_plano_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:edit', 'financeiro:cadastros:manage', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:edit', 'financeiro:cadastros:manage', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_plano_contas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_regras_categorizacao → financeiro:categorizacao:* =====
ALTER POLICY "tenant_read" ON public.fin_regras_categorizacao
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:categorizacao:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_regras_categorizacao
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:categorizacao:create', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_regras_categorizacao
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:categorizacao:edit', 'financeiro:categorizacao:manage', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:categorizacao:edit', 'financeiro:categorizacao:manage', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_regras_categorizacao
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:categorizacao:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_rateios / fin_lancamento_rateios → financeiro:lancamentos:* =====
-- O rateio é detalhe do lançamento e nasce/morre junto com ele: quem edita o
-- lançamento precisa poder substituir as linhas (INSERT + DELETE).
ALTER POLICY "tenant_read" ON public.fin_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_rateios
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:create', 'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'financeiro:lancamentos:delete', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY "tenant_read" ON public.fin_lancamento_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_lancamento_rateios
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:create', 'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_lancamento_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_lancamento_rateios
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'financeiro:lancamentos:delete', 'finance:manage', 'system:global:manage']))
  );

-- ===== fin_dre_linhas → financeiro:dre:view (leitura) =====
-- O submódulo DRE só tem view/export no registry — não existe chave granular de
-- escrita e NÃO se inventa uma aqui (regra do CLAUDE.md: chave de policy tem que
-- existir no registry). A escrita segue em finance:manage, acrescido apenas do
-- escape de super-admin que faltava.
ALTER POLICY "tenant_read" ON public.fin_dre_linhas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'finance:read', 'system:global:manage']))
  );
ALTER POLICY "tenant_insert" ON public.fin_dre_linhas
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_update" ON public.fin_dre_linhas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['finance:manage', 'system:global:manage']))
  );
ALTER POLICY "tenant_delete" ON public.fin_dre_linhas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['finance:manage', 'system:global:manage']))
  );
