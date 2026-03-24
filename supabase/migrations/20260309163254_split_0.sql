CREATE OR REPLACE FUNCTION recalc_product_costs(p_produto_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last RECORD;
  v_avg30 RECORD;
BEGIN
  SELECT m.custo_unitario, m.data, 
         CASE 
           WHEN m.reference_type = 'SALMON_ENTRY' THEN (SELECT supplier_name FROM salmon_entries WHERE id = m.reference_id::uuid AND status = 'ACTIVE' LIMIT 1)
           WHEN m.reference_type = 'PURCHASE_ORDER_ITEM' THEN (
             SELECT po.supplier_name FROM purchase_orders po
             JOIN purchase_order_items poi ON poi.order_id = po.id
             WHERE 'POI:' || poi.id::text = m.reference_id AND poi.deleted_at IS NULL
             LIMIT 1
           )
           ELSE NULL
         END as supplier_name
  INTO v_last
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id
    AND m.status = 'ATIVO'
    AND m.cancelado_em IS NULL
    AND m.direction = 'IN'
    AND m.tipo = 'ENTRADA'
    AND m.custo_unitario > 0
  ORDER BY m.data DESC, m.created_at DESC
  LIMIT 1;

  SELECT 
    COALESCE(AVG(m.custo_unitario), 0) as avg_cost,
    COUNT(*) as cnt
  INTO v_avg30
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id
    AND m.status = 'ATIVO'
    AND m.cancelado_em IS NULL
    AND m.direction = 'IN'
    AND m.tipo = 'ENTRADA'
    AND m.custo_unitario > 0
    AND m.data >= (CURRENT_DATE - interval '30 days')::date;

  UPDATE produtos SET
    last_cost_base_unit = COALESCE(v_last.custo_unitario, 0),
    last_cost_purchase_unit = COALESCE(v_last.custo_unitario, 0),
    last_purchase_date = CASE WHEN v_last.data IS NOT NULL THEN v_last.data::text ELSE NULL END,
    last_supplier = v_last.supplier_name,
    custo_ultima_compra = COALESCE(v_last.custo_unitario, 0),
    avg30_cost_base_unit = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    avg30_cost_purchase_unit = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    custo_medio_30d = CASE WHEN v_avg30.cnt > 0 THEN ROUND(v_avg30.avg_cost::numeric, 4) ELSE 0 END,
    avg30_variation_percent = CASE 
      WHEN v_avg30.cnt > 0 AND COALESCE(v_last.custo_unitario, 0) > 0 
      THEN ROUND(((v_avg30.avg_cost - v_last.custo_unitario) / v_last.custo_unitario * 100)::numeric, 2)
      ELSE 0 
    END
  WHERE id = p_produto_id;
END;
$$;

-- 2. Update cancel_salmon_entry_atomic