
CREATE OR REPLACE FUNCTION public.debug_stock_last_movements(p_limit int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_company := public.assert_tenant();

  SELECT jsonb_agg(row_to_json(t)::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.id,
      m.created_at,
      m.company_id,
      m.produto_id,
      p.nome_produto AS produto_nome,
      m.quantidade AS qty,
      m.direction,
      m.tipo,
      m.status,
      m.created_by
    FROM public.movimentacoes_estoque m
    LEFT JOIN public.produtos p ON p.id = m.produto_id
    WHERE m.company_id = v_company
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
