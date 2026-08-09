-- ============================================================================
-- get_fin_saldo_atual: saldo atual para o card de resumo do Livro Razão.
-- Reaproveita fin_contas_saldo_cache (já mantida por trigger) — sem recalcular.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_conta_id IS NOT NULL THEN
    SELECT sc.saldo INTO v_saldo
    FROM public.fin_contas_saldo_cache sc
    JOIN public.fin_contas c ON c.id = sc.conta_id
    WHERE sc.conta_id = p_conta_id AND c.company_id = v_company;
  ELSE
    SELECT COALESCE(SUM(sc.saldo), 0) INTO v_saldo
    FROM public.fin_contas_saldo_cache sc
    JOIN public.fin_contas c ON c.id = sc.conta_id
    WHERE c.company_id = v_company AND c.ativo = true;
  END IF;

  RETURN COALESCE(v_saldo, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_saldo_atual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_saldo_atual(uuid) TO authenticated;

DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(sc.saldo), 0)
  FROM public.fin_contas_saldo_cache sc
  JOIN public.fin_contas c ON c.id = sc.conta_id
  WHERE c.company_id = v_sentinel AND c.ativo = true;
END $$;
