
CREATE OR REPLACE FUNCTION public.debug_company_inventory()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_current_company_id UUID := public.get_current_company_id();
  v_inventory_counts JSONB;
BEGIN
  IF NOT public.has_permission(v_auth_uid, 'system:global:manage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  SELECT jsonb_object_agg(table_name, rows)
  INTO v_inventory_counts
  FROM (
    SELECT t.table_name, jsonb_agg(jsonb_build_object('company_id', t.company_id, 'count', t.cnt)) AS rows
    FROM (
      SELECT 'produtos' AS table_name, company_id, COUNT(*) AS cnt FROM public.produtos GROUP BY company_id
      UNION ALL
      SELECT 'movimentacoes_estoque', company_id, COUNT(*) FROM public.movimentacoes_estoque GROUP BY company_id
      UNION ALL
      SELECT 'suppliers', company_id, COUNT(*) FROM public.suppliers GROUP BY company_id
      UNION ALL
      SELECT 'purchase_orders', company_id, COUNT(*) FROM public.purchase_orders GROUP BY company_id
      UNION ALL
      SELECT 'purchase_order_items', company_id, COUNT(*) FROM public.purchase_order_items GROUP BY company_id
      UNION ALL
      SELECT 'salmon_entries', company_id, COUNT(*) FROM public.salmon_entries GROUP BY company_id
      UNION ALL
      SELECT 'salmon_manipulations', company_id, COUNT(*) FROM public.salmon_manipulations GROUP BY company_id
      UNION ALL
      SELECT 'salmon_daily_records', company_id, COUNT(*) FROM public.salmon_daily_records GROUP BY company_id
    ) t
    GROUP BY t.table_name
  ) agg;

  RETURN jsonb_build_object(
    'auth_uid', v_auth_uid,
    'current_company_id', v_current_company_id,
    'by_table', COALESCE(v_inventory_counts, '{}'::jsonb)
  );
END;
$$;
