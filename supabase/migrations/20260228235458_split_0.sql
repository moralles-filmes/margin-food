CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(auth.uid(), 'stock:read') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  RETURN (
    SELECT COALESCE(
      SUM(
        CASE
          WHEN tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
          WHEN direction = 'IN' THEN quantidade
          ELSE -quantidade
        END
      ), 0
    )
    FROM movimentacoes_estoque
    WHERE produto_id = p_produto_id
      AND status = 'ATIVO'
  );
END;
$$;

-- 2) get_saldo_produtos → stock:read