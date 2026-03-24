CREATE OR REPLACE FUNCTION public.get_saldo_conta(p_conta_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_saldo numeric; v_company uuid;
BEGIN
  v_company := assert_tenant();
  IF NOT EXISTS (SELECT 1 FROM fin_contas WHERE id = p_conta_id AND company_id = v_company) THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
  SELECT COALESCE(saldo_inicial, 0) INTO v_saldo FROM fin_contas WHERE id = p_conta_id;
  v_saldo := v_saldo + COALESCE((
    SELECT SUM(CASE
      WHEN tipo = 'TRANSFERENCIA' AND conta_id = p_conta_id THEN -valor
      WHEN tipo = 'TRANSFERENCIA' AND conta_destino_id = p_conta_id THEN valor
      WHEN tipo = 'RECEITA' AND conta_id = p_conta_id THEN valor
      WHEN tipo = 'DESPESA' AND conta_id = p_conta_id THEN -valor ELSE 0 END)
    FROM fin_lancamentos WHERE status = 'REALIZADO' AND company_id = v_company
      AND (conta_id = p_conta_id OR conta_destino_id = p_conta_id)
  ), 0);
  RETURN ROUND(v_saldo, 2);
END; $$;

-- get_saldo_produto