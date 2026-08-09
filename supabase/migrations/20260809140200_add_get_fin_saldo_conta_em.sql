-- ============================================================================
-- get_fin_saldo_conta_em: saldo de uma conta específica até uma data (inclusive).
-- Usado na conferência de saldo ao importar extrato — calcula o saldo "antes
-- do período do extrato" para somar com a movimentação líquida do arquivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_saldo_conta_em(p_conta_id uuid, p_data date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo_inicial numeric;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:conciliacao:view', 'financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT c.saldo_inicial INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company;

  IF v_saldo_inicial IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' THEN l.valor
      WHEN l.tipo = 'DESPESA' THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
    AND l.data_competencia <= p_data;

  RETURN v_saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_saldo_conta_em(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_saldo_conta_em(uuid, date) TO authenticated;

DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(
    CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END
  ), 0)
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.data_competencia <= '1900-01-31'::date;
END $$;
