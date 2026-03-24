
-- ============================================================
-- BATCH 2: TENANTIZE — Purchases, Compras, Recebimentos
-- ============================================================
DO $$
DECLARE
  default_co uuid := '00000000-0000-0000-0000-000000000001';
  tbl text;
  tbls text[] := ARRAY[
    'purchase_orders','purchase_order_items',
    'purchase_ignored_rules','purchase_reminders',
    'purchase_requisitions','purchase_requisition_items',
    'solic_compra_mercado','solic_compra_mercado_item',
    'solicitacoes_compra','aprovacoes_solic_compra_mercado',
    'confirmacoes_recebimento','recebimentos','recebimento_itens',
    'requisicoes_estoque','requisicao_estoque_itens'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
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
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;
