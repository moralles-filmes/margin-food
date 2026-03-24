CREATE OR REPLACE FUNCTION public.get_salmon_dashboard_summary(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_total_comprado numeric;
  v_total_utilizado numeric;
  v_total_perdas numeric;
  v_custo_medio numeric;
  v_estoque_atual numeric;
  v_faturamento numeric;
  v_cmv_salmon_pct numeric;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:dashboard:view',
    'salmon:dashboard:read',
    'salmon:read',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão (salmon:dashboard:view/read ou salmon:read).';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'IN' AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'OUT' AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO','PERDA') THEN quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'PERDA' THEN quantidade ELSE 0 END), 0),
    COALESCE(AVG(CASE WHEN direction = 'IN' AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND custo_unitario > 0 THEN custo_unitario END), 0)
  INTO v_total_comprado, v_total_utilizado, v_total_perdas, v_custo_medio
  FROM public.movimentacoes_estoque
  WHERE company_id = v_company
    AND data BETWEEN p_start AND p_end
    AND status = 'ATIVO'
    AND source_module = 'salmon';

  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN direction = 'IN' THEN quantidade
      ELSE -quantidade
    END
  ), 0)
  INTO v_estoque_atual
  FROM public.movimentacoes_estoque
  WHERE company_id = v_company
    AND status = 'ATIVO'
    AND source_module = 'salmon';

  SELECT COALESCE(SUM(faturamento_bruto), 0)
  INTO v_faturamento
  FROM public.financeiro_fechamento_caixa
  WHERE company_id = v_company
    AND data BETWEEN p_start AND p_end;

  v_cmv_salmon_pct := CASE
    WHEN v_faturamento > 0 THEN ROUND((
      SELECT COALESCE(SUM(custo_total), 0)
      FROM public.movimentacoes_estoque
      WHERE company_id = v_company
        AND data BETWEEN p_start AND p_end
        AND status = 'ATIVO'
        AND source_module = 'salmon'
        AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        AND direction = 'OUT'
    ) / v_faturamento * 100, 2)
    ELSE 0
  END;

  v_result := jsonb_build_object(
    'total_comprado_kg', ROUND(v_total_comprado, 2),
    'total_utilizado_kg', ROUND(v_total_utilizado, 2),
    'total_perdas_kg', ROUND(v_total_perdas, 2),
    'custo_medio_kg', ROUND(v_custo_medio, 2),
    'estoque_atual_kg', ROUND(v_estoque_atual, 2),
    'faturamento_periodo', ROUND(v_faturamento, 2),
    'cmv_salmon_percent', v_cmv_salmon_pct,
    'rendimento_percent', CASE WHEN v_total_comprado > 0 THEN ROUND(v_total_utilizado / v_total_comprado * 100, 2) ELSE 0 END
  );

  RETURN v_result;
END;
$$;