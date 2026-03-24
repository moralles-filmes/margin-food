
-- ============================================================
-- BATCH 1 PART E: company_id defaults must be tenant-derived for direct client writes
-- ============================================================

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'fin_lancamentos','fin_contas','fin_contas_pagar','fin_contas_receber',
    'fin_categorias','fin_centros_custo','fin_orcamentos','fin_plano_contas',
    'fin_rateios','fin_lancamento_rateios','fin_regras_categorizacao','fin_dre_linhas',
    'produtos','movimentacoes_estoque','inventarios','inventario_itens',
    'financeiro_fechamento_caixa'
  ];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT public.get_current_company_id()', v_t);
  END LOOP;
END $$;
