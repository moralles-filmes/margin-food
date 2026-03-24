
-- ============================================================
-- BATCH 1 PART A: ADD company_id TO 16 TABLES + BACKFILL + NOT NULL + FK + INDEXES
-- ============================================================

DO $$
DECLARE
  v_default_company uuid := '00000000-0000-0000-0000-000000000001';
  v_tables text[] := ARRAY[
    'fin_lancamentos','fin_contas','fin_contas_pagar','fin_contas_receber',
    'fin_categorias','fin_centros_custo','fin_orcamentos','fin_plano_contas',
    'fin_rateios','fin_lancamento_rateios','fin_regras_categorizacao','fin_dre_linhas',
    'produtos','movimentacoes_estoque','inventarios','inventario_itens'
  ];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_t AND column_name='company_id') THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', v_t);
    END IF;
    EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', v_t, v_default_company);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', v_t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT %L::uuid', v_t, v_default_company);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = (format('public.%I', v_t))::regclass AND conname = v_t || '_company_fk') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id)', v_t, v_t || '_company_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_company_id ON public.%I(company_id)', v_t, v_t);
  END LOOP;
END $$;

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_company_data ON public.fin_lancamentos(company_id, data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_company_venc ON public.fin_contas_pagar(company_id, data_vencimento DESC);
CREATE INDEX IF NOT EXISTS idx_fin_contas_receber_company_venc ON public.fin_contas_receber(company_id, data_vencimento DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_company_data ON public.movimentacoes_estoque(company_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_company_nome ON public.produtos(company_id, nome_produto);
CREATE INDEX IF NOT EXISTS idx_inventarios_company_data ON public.inventarios(company_id, data DESC);

-- Fix UNIQUE: fin_orcamentos
ALTER TABLE public.fin_orcamentos DROP CONSTRAINT IF EXISTS fin_orcamentos_mes_ano_categoria_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_orcamentos_company ON public.fin_orcamentos(company_id, mes_ano, categoria_id);
