
-- BATCH 1 PART B: RLS POLICIES ONLY (no MVs)

-- Drop all existing policies on Batch 1 tables
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'fin_lancamentos','fin_contas','fin_contas_pagar','fin_contas_receber',
    'fin_categorias','fin_centros_custo','fin_orcamentos','fin_plano_contas',
    'fin_rateios','fin_lancamento_rateios','fin_regras_categorizacao','fin_dre_linhas',
    'produtos','movimentacoes_estoque','inventarios','inventario_itens'
  ];
  v_t text;
  pol record;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=v_t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, v_t);
    END LOOP;
  END LOOP;
END $$;

-- FINANCEIRO tables
DO $$
DECLARE
  v_fin text[] := ARRAY[
    'fin_lancamentos','fin_contas','fin_contas_pagar','fin_contas_receber',
    'fin_categorias','fin_centros_custo','fin_orcamentos','fin_plano_contas',
    'fin_rateios','fin_lancamento_rateios','fin_regras_categorizacao','fin_dre_linhas'
  ];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY v_fin LOOP
    EXECUTE format('CREATE POLICY "tenant_read" ON public.%I FOR SELECT TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), ''finance:read''))', v_t);
    EXECUTE format('CREATE POLICY "tenant_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), ''finance:manage''))', v_t);
    EXECUTE format('CREATE POLICY "tenant_update" ON public.%I FOR UPDATE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), ''finance:manage'')) WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), ''finance:manage''))', v_t);
    EXECUTE format('CREATE POLICY "tenant_delete" ON public.%I FOR DELETE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), ''finance:manage''))', v_t);
  END LOOP;
END $$;

-- PRODUTOS
CREATE POLICY "tenant_read" ON public.produtos FOR SELECT TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:read'));
CREATE POLICY "tenant_insert" ON public.produtos FOR INSERT TO authenticated WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:edit'));
CREATE POLICY "tenant_update" ON public.produtos FOR UPDATE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:edit')) WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:edit'));
CREATE POLICY "tenant_delete" ON public.produtos FOR DELETE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:delete'));

-- MOVIMENTACOES_ESTOQUE
CREATE POLICY "tenant_read" ON public.movimentacoes_estoque FOR SELECT TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:movements:read'));
CREATE POLICY "tenant_insert" ON public.movimentacoes_estoque FOR INSERT TO authenticated WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:movements:create'));
CREATE POLICY "tenant_update" ON public.movimentacoes_estoque FOR UPDATE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:movements:edit')) WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:movements:edit'));
CREATE POLICY "tenant_delete" ON public.movimentacoes_estoque FOR DELETE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'stock:delete'));

-- INVENTARIOS
CREATE POLICY "tenant_read" ON public.inventarios FOR SELECT TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:read'));
CREATE POLICY "tenant_insert" ON public.inventarios FOR INSERT TO authenticated WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:create'));
CREATE POLICY "tenant_update" ON public.inventarios FOR UPDATE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:edit')) WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:edit'));
CREATE POLICY "tenant_delete" ON public.inventarios FOR DELETE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:delete'));

-- INVENTARIO_ITENS
CREATE POLICY "tenant_read" ON public.inventario_itens FOR SELECT TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:read'));
CREATE POLICY "tenant_insert" ON public.inventario_itens FOR INSERT TO authenticated WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:count'));
CREATE POLICY "tenant_update" ON public.inventario_itens FOR UPDATE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:count')) WITH CHECK (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:count'));
CREATE POLICY "tenant_delete" ON public.inventario_itens FOR DELETE TO authenticated USING (company_id = get_current_company_id() AND has_permission(auth.uid(), 'inventory:delete'));
