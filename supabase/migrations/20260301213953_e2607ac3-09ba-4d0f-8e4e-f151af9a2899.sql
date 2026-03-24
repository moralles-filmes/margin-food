
CREATE OR REPLACE FUNCTION public.admin_health_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_result jsonb;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'company_id', v_company,
    'produtos', (SELECT count(*) FROM public.produtos WHERE company_id = v_company),
    'suppliers', (SELECT count(*) FROM public.suppliers WHERE company_id = v_company),
    'movimentacoes_estoque', (SELECT count(*) FROM public.movimentacoes_estoque WHERE company_id = v_company),
    'purchase_orders', (SELECT count(*) FROM public.purchase_orders WHERE company_id = v_company),
    'purchase_order_items', (SELECT count(*) FROM public.purchase_order_items WHERE company_id = v_company),
    'salmon_entries', (SELECT count(*) FROM public.salmon_entries WHERE company_id = v_company),
    'salmon_manipulations', (SELECT count(*) FROM public.salmon_manipulations WHERE company_id = v_company),
    'fin_lancamentos', (SELECT count(*) FROM public.fin_lancamentos WHERE company_id = v_company),
    'inventarios', (SELECT count(*) FROM public.inventarios WHERE company_id = v_company),
    'solic_compra_mercado', (SELECT count(*) FROM public.solic_compra_mercado WHERE company_id = v_company),
    'recebimentos', (SELECT count(*) FROM public.recebimentos WHERE company_id = v_company),
    'financeiro_fechamento_caixa', (SELECT count(*) FROM public.financeiro_fechamento_caixa WHERE company_id = v_company)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
