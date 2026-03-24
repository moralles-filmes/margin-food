CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_status text DEFAULT NULL,
  p_tipo text DEFAULT NULL, p_conta_id uuid DEFAULT NULL, p_search text DEFAULT NULL,
  p_limit int DEFAULT 50, p_cursor_date date DEFAULT NULL, p_cursor_id uuid DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT (public.has_permission(auth.uid(), 'finance:read') OR public.has_permission(auth.uid(), 'financeiro:lancamentos:view')) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:lancamentos:view)';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      l.id, l.tipo, l.valor, l.data_competencia, l.descricao, l.status,
      l.conta_id, l.conta_destino_id, l.categoria_id, l.centro_custo_id,
      l.forma_pagamento, l.recorrente, l.observacoes, l.created_at, l.updated_at,
      l.lancamento_pai_id
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND (p_start IS NULL OR l.data_competencia >= p_start)
      AND (p_end IS NULL OR l.data_competencia <= p_end)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
      AND (
        p_cursor_date IS NULL
        OR l.data_competencia < p_cursor_date
        OR (l.data_competencia = p_cursor_date AND l.id < p_cursor_id)
      )
    ORDER BY l.data_competencia DESC, l.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

-- create_transfer: accept finance:manage OR financeiro:lancamentos:create