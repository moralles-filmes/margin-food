
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
    public.calcular_saldo_conta(c.id) AS saldo
  FROM public.fin_contas c
  WHERE c.company_id = _company_id
    AND c.ativo = true;
END;
$$;
