CREATE OR REPLACE FUNCTION public.get_inactive_stock_items()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'estoque:alerts:view', 'estoque:geral:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
    FROM (
      SELECT p.id AS item_id, p.nome_produto AS item_name, 
             COALESCE(p.categoria, '') AS category,
             COALESCE(p.local_estoque, '') AS location,
             p.unidade_medida,
             COALESCE(p.inactivity_days_threshold, 30) AS inactivity_days_threshold,
             MAX(m.data) AS last_movement_at,
             EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(MAX(m.data), '2000-01-01'::date)))::int AS days_inactive,
             COALESCE(
               (SELECT SUM(CASE WHEN m2.direction = 'IN' THEN m2.quantidade ELSE -m2.quantidade END)
                FROM movimentacoes_estoque m2
                WHERE m2.produto_id = p.id AND m2.status = 'ATIVO' AND m2.company_id = v_company), 0
             ) AS stock_qty
      FROM produtos p
      LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id AND m.status = 'ATIVO' AND m.direction = 'OUT' AND m.company_id = v_company
      WHERE p.ativo AND p.company_id = v_company
      GROUP BY p.id, p.nome_produto, p.categoria, p.local_estoque, p.unidade_medida, p.inactivity_days_threshold
      HAVING MAX(m.data) IS NULL OR MAX(m.data) < (CURRENT_DATE - COALESCE(p.inactivity_days_threshold, 30) * interval '1 day')
      ORDER BY last_movement_at NULLS FIRST LIMIT 50
    ) sub
  );
END;
$$;

-- =====================================================================
-- P1-2: Create atomic movement RPC
-- =====================================================================