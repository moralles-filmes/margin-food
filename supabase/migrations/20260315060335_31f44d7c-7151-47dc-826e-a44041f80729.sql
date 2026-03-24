
-- Drop the broken function that depends on non-existent calcular_saldo_conta
DROP FUNCTION IF EXISTS public.get_all_saldos_contas();

-- Recreate with inline saldo calculation:
-- saldo = saldo_inicial + SUM(receitas REALIZADAS/CONCILIADAS) - SUM(despesas REALIZADAS/CONCILIADAS)
-- Transferências handled: if conta_id matches it's an outflow, if conta_destino_id matches it's an inflow
CREATE OR REPLACE FUNCTION public.get_all_saldos_contas()
RETURNS TABLE(conta_id uuid, saldo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
BEGIN
  _company_id := public.assert_tenant();

  RETURN QUERY
  SELECT
    c.id AS conta_id,
    (
      c.saldo_inicial
      + COALESCE((
        SELECT SUM(
          CASE
            WHEN l.tipo = 'RECEITA' THEN l.valor
            WHEN l.tipo = 'DESPESA' THEN -l.valor
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
            WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
            ELSE 0
          END
        )
        FROM public.fin_lancamentos l
        WHERE l.company_id = _company_id
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
      ), 0)
    )::numeric AS saldo
  FROM public.fin_contas c
  WHERE c.company_id = _company_id
    AND c.ativo = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_saldos_contas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_saldos_contas() TO authenticated;
