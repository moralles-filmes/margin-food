CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
RETURNS TABLE(produto_id uuid, saldo numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  RETURN QUERY
  SELECT m.produto_id, ROUND(COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0 WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END), 0), 4)
  FROM movimentacoes_estoque m
  WHERE m.produto_id = ANY(p_produto_ids) AND m.status = 'ATIVO' AND m.company_id = v_company
  GROUP BY m.produto_id;
END; $$;