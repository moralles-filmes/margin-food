CREATE OR REPLACE FUNCTION public.list_movimentacoes_cursor(
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamp with time zone DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_direction text DEFAULT 'IN',
  p_produto_id uuid DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_setor text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_show_cancelled boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, produto_id uuid, data date, tipo text, quantidade numeric,
  custo_unitario numeric, custo_total numeric, origem text, referencia_id text,
  observacao text, created_by text, created_at timestamptz, status text,
  estorno_de_id uuid, justificativa_cancelamento text, justificativa_edicao text,
  setor text, reference_type text, reference_id text, internal_transfer boolean,
  source_module text, salmon_lot_id text, direction text, has_more boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actual_limit int := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'stock:movements:read') THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      m.id, m.produto_id, m.data, m.tipo, m.quantidade,
      m.custo_unitario, m.custo_total, m.origem, m.referencia_id,
      m.observacao, m.created_by, m.created_at, m.status,
      m.estorno_de_id, m.justificativa_cancelamento,
      m.justificativa_edicao, m.setor, m.reference_type,
      m.reference_id, m.internal_transfer, m.source_module,
      m.salmon_lot_id, m.direction
    FROM public.movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND (p_direction IS NULL OR m.direction = p_direction)
      AND (p_produto_id IS NULL OR m.produto_id = p_produto_id)
      AND (p_categoria IS NULL OR EXISTS (
        SELECT 1 FROM public.produtos p 
        WHERE p.id = m.produto_id AND p.company_id = v_company AND p.categoria = p_categoria
      ))
      AND (p_setor IS NULL OR m.setor = p_setor)
      AND (p_date_from IS NULL OR m.data >= p_date_from)
      AND (p_date_to IS NULL OR m.data <= p_date_to)
      AND (p_show_cancelled OR m.status = 'ATIVO')
      AND (
        p_cursor_created_at IS NULL
        OR (m.created_at, m.id) < (p_cursor_created_at, COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_actual_limit + 1
  )
  SELECT
    f.id, f.produto_id, f.data, f.tipo, f.quantidade,
    f.custo_unitario, f.custo_total, f.origem, f.referencia_id,
    f.observacao, f.created_by, f.created_at, f.status,
    f.estorno_de_id, f.justificativa_cancelamento,
    f.justificativa_edicao, f.setor, f.reference_type,
    f.reference_id, f.internal_transfer, f.source_module,
    f.salmon_lot_id, f.direction,
    (ROW_NUMBER() OVER () > v_actual_limit) AS has_more
  FROM filtered f
  LIMIT v_actual_limit;
END;
$$;