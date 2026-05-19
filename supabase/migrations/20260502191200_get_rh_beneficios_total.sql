-- =========================================================
-- PERF: get_rh_beneficios_total
-- Substitui a query sem limit em ControleCustosRhSection.tsx
-- (rh_beneficios sem .limit() + .reduce() no client)
-- por SUM no Postgres, eliminando O(n) na rede.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_rh_beneficios_total()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company          uuid;
  v_total_beneficios numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'rh:beneficios:view', 'rh:custos:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão para visualizar benefícios';
  END IF;

  SELECT COALESCE(SUM(valor_empresa), 0)
    INTO v_total_beneficios
    FROM public.rh_beneficios
   WHERE company_id = v_company
     AND status     = 'ATIVO';

  RETURN jsonb_build_object('total_beneficios', v_total_beneficios);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rh_beneficios_total TO authenticated;
-- DO block omitido: assert_tenant() requer sessão autenticada; colunas são estáveis.
