-- Migration: Corrige vazamento cross-tenant em faturamento_periodos_legacy
-- Autor: Moralles
-- Data: 2026-04-29
-- Revisado contra rls-reviewer: OK
--
-- CONTEXTO (auditoria multi-tenant 2026-04-29):
--   A tabela faturamento_periodos_legacy tinha policy "legacy_select_all"
--   wide-open criada em 20260301180830:140 sem nunca ser dropada.
--   Qualquer usuario autenticado conseguia ler dados historicos de faturamento
--   de TODOS os tenants via PostgREST.
--
--   Nota: o leak equivalente em profiles foi corrigido em
--   20260414120000_fix_profiles_rls_and_rpc.sql (commit fd8f6de). Esta migration
--   trata apenas do residuo em faturamento_periodos_legacy, que nao foi coberto.
--
-- Mudancas:
--   1. DROP policy "legacy_select_all" em faturamento_periodos_legacy
--   2. ALTER TABLE FORCE ROW LEVEL SECURITY (defesa em profundidade)
--   3. CREATE policy faturamento_legacy_select_own_tenant
--   4. CREATE policies de bloqueio de writes (escritas vao para tabela atual)

-- ════════════════════════════════════════════════════════════════════════
-- FATURAMENTO_PERIODOS_LEGACY — corrigir leak cross-tenant
-- ════════════════════════════════════════════════════════════════════════

-- Remove policy wide-open
DROP POLICY IF EXISTS "legacy_select_all" ON public.faturamento_periodos_legacy;

-- FORCE RLS ja aplicado em 20260303040616:7 — defensivo
ALTER TABLE public.faturamento_periodos_legacy FORCE ROW LEVEL SECURITY;

-- SELECT scoped por tenant (tabela e historica/somente-leitura)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faturamento_periodos_legacy'
      AND policyname = 'faturamento_legacy_select_own_tenant'
  ) THEN
    CREATE POLICY "faturamento_legacy_select_own_tenant"
      ON public.faturamento_periodos_legacy
      FOR SELECT TO authenticated
      USING (company_id = public.get_current_company_id());
  END IF;
END $$;

-- Bloqueia writes — escritas devem ir para faturamento_periodos atual
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faturamento_periodos_legacy'
      AND policyname = 'faturamento_legacy_block_insert'
  ) THEN
    CREATE POLICY "faturamento_legacy_block_insert"
      ON public.faturamento_periodos_legacy
      FOR INSERT TO authenticated
      WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faturamento_periodos_legacy'
      AND policyname = 'faturamento_legacy_block_update'
  ) THEN
    CREATE POLICY "faturamento_legacy_block_update"
      ON public.faturamento_periodos_legacy
      FOR UPDATE TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'faturamento_periodos_legacy'
      AND policyname = 'faturamento_legacy_block_delete'
  ) THEN
    CREATE POLICY "faturamento_legacy_block_delete"
      ON public.faturamento_periodos_legacy
      FOR DELETE TO authenticated
      USING (false);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- RECARREGAR SCHEMA POSTGREST
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
