CREATE OR REPLACE FUNCTION list_fin_contas_pagar_cursor(
  p_status TEXT DEFAULT NULL,
  p_fornecedor TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_cursor_date DATE DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _items JSON;
  _effective_limit INT;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      c.id, c.descricao, c.valor, c.data_vencimento, c.data_pagamento,
      c.fornecedor, c.status, c.categoria_id, c.centro_custo_id, c.conta_id,
      c.forma_pagamento, c.observacoes, c.created_at, c.updated_at,
      c.aprovado_por, c.aprovado_em, c.valor_pago
    FROM public.fin_contas_pagar c
    WHERE c.status != 'CANCELADO'
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_fornecedor IS NULL OR c.fornecedor ILIKE '%' || p_fornecedor || '%')
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

-- ═══════════════════════════════════════════════════════════
-- 6) RPC: list_fin_contas_receber_cursor
-- ═══════════════════════════════════════════════════════════