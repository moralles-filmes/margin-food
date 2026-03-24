
-- ============================================================
-- BATCH 1: TENANTIZE — Salmon, Stock, Suppliers, Ficha Técnica
-- ============================================================

-- Helper: default company for backfill
DO $$
DECLARE
  default_co uuid := '00000000-0000-0000-0000-000000000001';
  tbl text;
  tbls text[] := ARRAY[
    'salmon_entries','salmon_manipulations','salmon_daily_records',
    'salmon_config','salmon_purchase_targets',
    'suppliers','supplier_item_prices',
    'stock_categories','stock_locations','stock_sku_counter',
    'canais_venda','config_precificacao',
    'ficha_componentes','ficha_componente_itens',
    'cenarios_simulacao','precificacao_canal',
    'metas_cmv','planning_metas_compra',
    'faturamento_periodos_legacy',
    'notifications','job_roles','turnos'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Add column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name='company_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN company_id uuid', tbl);
      EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', tbl, default_co);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', tbl);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT get_current_company_id()', tbl);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES companies(id)', tbl, tbl || '_company_fk');
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(company_id)', 'idx_' || tbl || '_company_id', tbl);
    END IF;

    -- Force RLS
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;
