-- ============================================================
-- Migration: drop legacy fin_* policies em faturamento_periodos_legacy
--
-- Contexto: Em 20260429000001 dropamos a policy "legacy_select_all" wide-open
-- e criamos policies novas (faturamento_legacy_select_own_tenant + block_*).
-- Porém ficaram ativas 4 policies legadas que NÃO filtram por tenant:
--   - fin_read_faturamento            (SELECT WHERE has_permission('finance:read'))
--   - fin_manage_insert_faturamento   (INSERT)
--   - fin_manage_update_faturamento   (UPDATE)
--   - fin_manage_delete_faturamento   (DELETE)
--
-- Em RLS, policies do mesmo comando são combinadas com OR. Resultado: qualquer
-- usuário com 'finance:read' bypassava o faturamento_legacy_select_own_tenant
-- e lia dados cross-tenant. Da mesma forma, 'finance:manage' bypassava os blocks.
--
-- Esta migration remove as 4 policies legadas. Após o drop, restam apenas:
--   - faturamento_legacy_select_own_tenant  (SELECT scoped por tenant)
--   - faturamento_legacy_block_insert       (bloqueia writes)
--   - faturamento_legacy_block_update       (bloqueia writes)
--   - faturamento_legacy_block_delete       (bloqueia writes)
--
-- A tabela é histórica/read-only — escritas devem ir para faturamento_periodos atual.
-- ============================================================

DROP POLICY IF EXISTS "fin_read_faturamento"           ON public.faturamento_periodos_legacy;
DROP POLICY IF EXISTS "fin_manage_insert_faturamento"  ON public.faturamento_periodos_legacy;
DROP POLICY IF EXISTS "fin_manage_update_faturamento"  ON public.faturamento_periodos_legacy;
DROP POLICY IF EXISTS "fin_manage_delete_faturamento"  ON public.faturamento_periodos_legacy;

-- Validação defensiva: garantir que ainda existe policy de SELECT scoped por tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'faturamento_periodos_legacy'
      AND policyname = 'faturamento_legacy_select_own_tenant'
  ) THEN
    RAISE EXCEPTION 'Pre-condição violada: policy faturamento_legacy_select_own_tenant não existe — abortar antes de deixar tabela sem SELECT';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
