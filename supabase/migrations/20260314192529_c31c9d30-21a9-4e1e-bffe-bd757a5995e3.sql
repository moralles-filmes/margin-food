
-- Add index on origem for filtering
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_origem ON public.fin_lancamentos (company_id, origem);

-- Update RPC to support p_origem filter
CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text
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
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      l.id, l.tipo, l.valor, l.data_competencia, l.data_vencimento, l.data_pagamento,
      l.descricao, l.status,
      l.conta_id, l.conta_destino_id, l.categoria_id, l.centro_custo_id,
      l.forma_pagamento, l.recorrente, l.observacoes, l.created_at, l.updated_at,
      l.lancamento_pai_id, l.conciliado, l.referencia_modulo, l.referencia_id,
      l.origem
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND (p_start IS NULL OR l.data_competencia >= p_start)
      AND (p_end IS NULL OR l.data_competencia <= p_end)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
      AND (p_origem IS NULL OR l.origem = p_origem)
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
