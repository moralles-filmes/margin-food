
-- ============================================================
-- FINANCEIRO FASE 1: Migrate ALL has_role() → has_permission()
-- Tables: 11 tables with has_role policies
-- Pattern: finance:read (SELECT), finance:manage (INSERT/UPDATE/DELETE)
-- Cross-module: purchases:create for Compras INSERT on CP/Lancamentos
-- ============================================================

-- ─── 1) faturamento_periodos ───
DROP POLICY IF EXISTS "Admin or Compras can insert faturamento" ON faturamento_periodos;
DROP POLICY IF EXISTS "Admin or Compras can update faturamento" ON faturamento_periodos;

CREATE POLICY "fin_manage_insert_faturamento" ON faturamento_periodos
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_faturamento" ON faturamento_periodos
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_faturamento" ON faturamento_periodos
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 2) fin_audit_logs ───
DROP POLICY IF EXISTS "Masters can read fin_audit" ON fin_audit_logs;
DROP POLICY IF EXISTS "Financeiro can read fin_audit" ON fin_audit_logs;

CREATE POLICY "fin_read_audit_logs" ON fin_audit_logs
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

-- ─── 3) fin_categorias ───
DROP POLICY IF EXISTS "Financeiro can manage fin_categorias" ON fin_categorias;
DROP POLICY IF EXISTS "Masters can manage fin_categorias" ON fin_categorias;

CREATE POLICY "fin_read_categorias" ON fin_categorias
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_categorias" ON fin_categorias
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_categorias" ON fin_categorias
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_categorias" ON fin_categorias
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 4) fin_centros_custo ───
DROP POLICY IF EXISTS "Masters can manage fin_centros_custo" ON fin_centros_custo;
DROP POLICY IF EXISTS "Financeiro can manage fin_centros_custo" ON fin_centros_custo;

CREATE POLICY "fin_read_centros_custo" ON fin_centros_custo
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_centros_custo" ON fin_centros_custo
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_centros_custo" ON fin_centros_custo
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_centros_custo" ON fin_centros_custo
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 5) fin_contas ───
DROP POLICY IF EXISTS "Financeiro can manage fin_contas" ON fin_contas;
DROP POLICY IF EXISTS "Masters can manage fin_contas" ON fin_contas;

CREATE POLICY "fin_read_contas" ON fin_contas
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_contas" ON fin_contas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_contas" ON fin_contas
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_contas" ON fin_contas
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 6) fin_contas_pagar ───
DROP POLICY IF EXISTS "Financeiro can manage fin_contas_pagar" ON fin_contas_pagar;
DROP POLICY IF EXISTS "Masters can manage fin_contas_pagar" ON fin_contas_pagar;
DROP POLICY IF EXISTS "Compras can insert fin_contas_pagar" ON fin_contas_pagar;
DROP POLICY IF EXISTS "Compras can read own fin_contas_pagar" ON fin_contas_pagar;

CREATE POLICY "fin_read_contas_pagar" ON fin_contas_pagar
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'finance:read')
    OR (has_permission(auth.uid(), 'purchases:create') AND created_by = auth.uid())
  );

CREATE POLICY "fin_manage_insert_contas_pagar" ON fin_contas_pagar
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'finance:manage')
    OR has_permission(auth.uid(), 'purchases:create')
  );

CREATE POLICY "fin_manage_update_contas_pagar" ON fin_contas_pagar
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_contas_pagar" ON fin_contas_pagar
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 7) fin_contas_receber ───
DROP POLICY IF EXISTS "Financeiro can manage fin_contas_receber" ON fin_contas_receber;
DROP POLICY IF EXISTS "Masters can manage fin_contas_receber" ON fin_contas_receber;

CREATE POLICY "fin_read_contas_receber" ON fin_contas_receber
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_contas_receber" ON fin_contas_receber
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_contas_receber" ON fin_contas_receber
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_contas_receber" ON fin_contas_receber
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 8) fin_dre_linhas ───
DROP POLICY IF EXISTS "Financeiro can manage fin_dre_linhas" ON fin_dre_linhas;
DROP POLICY IF EXISTS "Masters can manage fin_dre_linhas" ON fin_dre_linhas;

CREATE POLICY "fin_read_dre_linhas" ON fin_dre_linhas
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_dre_linhas" ON fin_dre_linhas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_dre_linhas" ON fin_dre_linhas
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_dre_linhas" ON fin_dre_linhas
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 9) fin_lancamentos ───
DROP POLICY IF EXISTS "Financeiro can manage fin_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "Masters can manage fin_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "Compras can insert fin_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "Compras can read own fin_lancamentos" ON fin_lancamentos;

CREATE POLICY "fin_read_lancamentos" ON fin_lancamentos
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'finance:read')
    OR (has_permission(auth.uid(), 'purchases:create') AND created_by = auth.uid())
  );

CREATE POLICY "fin_manage_insert_lancamentos" ON fin_lancamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'finance:manage')
    OR has_permission(auth.uid(), 'purchases:create')
  );

CREATE POLICY "fin_manage_update_lancamentos" ON fin_lancamentos
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_lancamentos" ON fin_lancamentos
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 10) fin_orcamentos ───
DROP POLICY IF EXISTS "Masters can manage fin_orcamentos" ON fin_orcamentos;
DROP POLICY IF EXISTS "Financeiro can manage fin_orcamentos" ON fin_orcamentos;

CREATE POLICY "fin_read_orcamentos" ON fin_orcamentos
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_orcamentos" ON fin_orcamentos
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_orcamentos" ON fin_orcamentos
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_orcamentos" ON fin_orcamentos
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── 11) fin_plano_contas ───
DROP POLICY IF EXISTS "Financeiro can manage fin_plano_contas" ON fin_plano_contas;
DROP POLICY IF EXISTS "Masters can manage fin_plano_contas" ON fin_plano_contas;

CREATE POLICY "fin_read_plano_contas" ON fin_plano_contas
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "fin_manage_insert_plano_contas" ON fin_plano_contas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_update_plano_contas" ON fin_plano_contas
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "fin_manage_delete_plano_contas" ON fin_plano_contas
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- ─── Fix open SELECT policies on already-migrated tables ───
DROP POLICY IF EXISTS "Authenticated users can read rateios" ON fin_lancamento_rateios;

DROP POLICY IF EXISTS "Authenticated users can read fin_rateios" ON fin_rateios;
CREATE POLICY "fin_read_rateios" ON fin_rateios
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

DROP POLICY IF EXISTS "Authenticated users can read fin_regras_categorizacao" ON fin_regras_categorizacao;
CREATE POLICY "fin_read_regras_categorizacao" ON fin_regras_categorizacao
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));
