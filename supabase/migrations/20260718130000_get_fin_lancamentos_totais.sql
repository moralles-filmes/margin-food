-- =========================================================
-- PERF: get_fin_lancamentos_totais
-- Agrega os totais de entradas (RECEITA), saidas (DESPESA) e
-- transferencias do Livro Razao respeitando os mesmos filtros
-- de list_fin_lancamentos_cursor (periodo, tipo, conta, origem),
-- usando SUM no Postgres em vez de somar no cliente sobre a
-- pagina carregada (que so tem os primeiros N registros).
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_fin_lancamentos_totais(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_transferencia numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'RECEITA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'DESPESA'), 0),
    COALESCE(SUM(l.valor) FILTER (WHERE l.tipo = 'TRANSFERENCIA'), 0)
  INTO v_receita, v_despesa, v_transferencia
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status != 'CANCELADO'
    AND (p_start IS NULL OR l.data_competencia >= p_start)
    AND (p_end IS NULL OR l.data_competencia <= p_end)
    AND (p_tipo IS NULL OR l.tipo = p_tipo)
    AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
    AND (p_origem IS NULL OR l.origem = p_origem);

  RETURN json_build_object(
    'total_receita', v_receita,
    'total_despesa', v_despesa,
    'total_transferencia', v_transferencia,
    'resultado', v_receita - v_despesa
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_fin_lancamentos_totais(date, date, text, uuid, text) TO authenticated;
