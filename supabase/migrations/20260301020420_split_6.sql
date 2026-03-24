CREATE OR REPLACE FUNCTION public.list_fin_contas_receber_cursor(
  p_status text DEFAULT NULL::text,
  p_cliente text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_recebimento,
      c.cliente, c.status, c.categoria_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.valor_recebido
    FROM public.fin_contas_receber c
    WHERE c.company_id = v_company
      AND c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_cliente IS NULL OR c.cliente ILIKE '%' || p_cliente || '%')
      AND (p_search IS NULL OR c.descricao ILIKE '%' || p_search || '%')
      AND (
        p_cursor_date IS NULL
        OR c.data_vencimento < p_cursor_date
        OR (c.data_vencimento = p_cursor_date AND c.id < p_cursor_id)
      )
    ORDER BY c.data_vencimento DESC, c.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$$;