CREATE OR REPLACE FUNCTION public.contar_lancamentos_sem_categoria()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_count int;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:view',
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT count(*)::int INTO v_count
  FROM fin_lancamentos fl
  WHERE fl.company_id = v_company_id
    AND fl.categoria_id IS NULL
    AND fl.status NOT IN ('CANCELADO')
    AND NOT EXISTS (
      SELECT 1 FROM fin_lancamento_rateios flr
      WHERE flr.lancamento_id = fl.id
        AND flr.categoria_id IS NOT NULL
    );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.contar_lancamentos_sem_categoria() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contar_lancamentos_sem_categoria() TO authenticated;

-- 3) Preview RPC for testing a rule before saving