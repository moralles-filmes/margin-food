CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
  RETURNS TABLE(produto_id uuid, saldo numeric)
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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
$$;

-- 4) Update get_saldo_produto to use direction