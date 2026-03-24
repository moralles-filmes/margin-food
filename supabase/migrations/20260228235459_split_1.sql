CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
 RETURNS TABLE(produto_id uuid, saldo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(auth.uid(), 'stock:read') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  RETURN QUERY
  SELECT
    m.produto_id,
    COALESCE(SUM(
      CASE
        WHEN m.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade
        ELSE -m.quantidade
      END
    ), 0) AS saldo
  FROM movimentacoes_estoque m
  WHERE m.produto_id = ANY(p_produto_ids)
    AND m.status = 'ATIVO'
  GROUP BY m.produto_id;
END;
$$;

-- 3) get_stock_summary → stock:read