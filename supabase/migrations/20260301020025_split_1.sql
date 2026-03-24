CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_saldo numeric; v_company uuid;
BEGIN
  v_company := assert_tenant();
  SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0 WHEN direction = 'IN' THEN quantidade ELSE -quantidade END), 0) INTO v_saldo
  FROM movimentacoes_estoque WHERE produto_id = p_produto_id AND status = 'ATIVO' AND company_id = v_company;
  RETURN ROUND(v_saldo, 4);
END; $$;

-- get_saldo_produtos (batch)