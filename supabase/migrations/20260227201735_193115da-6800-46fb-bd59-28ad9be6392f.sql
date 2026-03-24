
-- Update saldo function to exclude cancelled movements
CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN tipo IN ('ENTRADA', 'AJUSTE') THEN quantidade
        ELSE -quantidade
      END
    ), 0
  )
  FROM movimentacoes_estoque
  WHERE produto_id = p_produto_id
    AND status = 'ATIVO'
$$;
