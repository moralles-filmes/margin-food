CREATE OR REPLACE FUNCTION public.refresh_saldo_cache(p_conta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo numeric;
  v_company uuid;
  v_saldo_inicial numeric;
BEGIN
  SELECT company_id, saldo_inicial INTO v_company, v_saldo_inicial
  FROM fin_contas WHERE id = p_conta_id;

  IF v_company IS NULL THEN RETURN; END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM fin_lancamentos l
  WHERE l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.company_id = v_company
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id);

  INSERT INTO fin_contas_saldo_cache (conta_id, company_id, saldo, updated_at)
  VALUES (p_conta_id, v_company, v_saldo, now())
  ON CONFLICT (conta_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now();
END;
$$;

-- 3) Trigger on fin_lancamentos to refresh cache