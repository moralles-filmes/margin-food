CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN tipo LIKE 'ENTRADA%' OR tipo = 'AJUSTE' OR tipo LIKE '%DEVOLUCAO%' THEN quantidade
        ELSE -quantidade
      END
    ), 0
  )
  FROM movimentacoes_estoque
  WHERE produto_id = p_produto_id
    AND status = 'ATIVO'
$function$;