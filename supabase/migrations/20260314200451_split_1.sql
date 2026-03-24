CREATE OR REPLACE FUNCTION public.contar_lancamentos_sem_categoria()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM fin_lancamentos fl
  WHERE fl.company_id = ((auth.jwt()->'app_metadata'->>'company_id')::uuid)
    AND fl.categoria_id IS NULL
    AND fl.status != 'CANCELADO';
$$;