
-- Cleanup: remove duplicate/legacy policies on financial tables

-- fin_lancamentos: remove old duplicate policies (finance_manage_* / finance_read_*)
DROP POLICY IF EXISTS "finance_manage_delete_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "finance_manage_insert_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "finance_read_lancamentos" ON fin_lancamentos;
DROP POLICY IF EXISTS "finance_manage_update_lancamentos" ON fin_lancamentos;

-- Remove legacy open SELECT policies that bypass finance:read
DROP POLICY IF EXISTS "Authenticated can read faturamento" ON faturamento_periodos;
DROP POLICY IF EXISTS "Authenticated can read fin_categorias" ON fin_categorias;
DROP POLICY IF EXISTS "Authenticated can read fin_centros_custo" ON fin_centros_custo;
DROP POLICY IF EXISTS "Authenticated can read fin_contas" ON fin_contas;
DROP POLICY IF EXISTS "Authenticated can read fin_dre_linhas" ON fin_dre_linhas;
DROP POLICY IF EXISTS "Authenticated can read fin_orcamentos" ON fin_orcamentos;
DROP POLICY IF EXISTS "Authenticated can read fin_plano_contas" ON fin_plano_contas;

-- Add missing SELECT for faturamento_periodos (was relying on open policy)
CREATE POLICY "fin_read_faturamento" ON faturamento_periodos
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

-- fin_audit_logs: remove legacy open INSERT if exists
DROP POLICY IF EXISTS "Authenticated can insert fin_audit" ON fin_audit_logs;
