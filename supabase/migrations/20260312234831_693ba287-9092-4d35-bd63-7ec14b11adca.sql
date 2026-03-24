
CREATE OR REPLACE FUNCTION public.list_stock_transfers(
    p_start_date date DEFAULT (now() - interval '30 days')::date,
    p_end_date date DEFAULT now()::date,
    p_product_id uuid DEFAULT NULL,
    p_location text DEFAULT NULL,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_transfers jsonb;
    v_total bigint;
BEGIN
    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Tenant inválido';
    END IF;

    -- Count total
    SELECT count(DISTINCT reference_id) INTO v_total
    FROM public.movimentacoes_estoque
    WHERE company_id = v_company_id
      AND reference_type = 'INTERNAL_TRANSFER'
      AND internal_transfer = true
      AND direction = 'OUT'
      AND status = 'ATIVO'
      AND data >= p_start_date
      AND data <= p_end_date
      AND (p_product_id IS NULL OR produto_id = p_product_id)
      AND (p_location IS NULL OR setor ILIKE '%' || p_location || '%');

    -- Get transfer pairs (OUT side as main record)
    SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_transfers
    FROM (
        SELECT
            m_out.reference_id AS transfer_group_id,
            m_out.produto_id,
            p.nome_produto,
            p.unidade_medida,
            p.categoria,
            m_out.quantidade,
            m_out.custo_unitario,
            m_out.custo_total,
            m_out.setor AS from_location,
            m_in.setor AS to_location,
            m_out.observacao,
            m_out.created_by,
            m_out.created_at,
            m_out.data,
            pr.email AS actor_email
        FROM public.movimentacoes_estoque m_out
        JOIN public.produtos p ON p.id = m_out.produto_id
        LEFT JOIN public.movimentacoes_estoque m_in
            ON m_in.reference_id = m_out.reference_id
            AND m_in.reference_type = 'INTERNAL_TRANSFER'
            AND m_in.direction = 'IN'
            AND m_in.company_id = v_company_id
            AND m_in.status = 'ATIVO'
        LEFT JOIN public.profiles pr ON pr.id = m_out.created_by
        WHERE m_out.company_id = v_company_id
          AND m_out.reference_type = 'INTERNAL_TRANSFER'
          AND m_out.internal_transfer = true
          AND m_out.direction = 'OUT'
          AND m_out.status = 'ATIVO'
          AND m_out.data >= p_start_date
          AND m_out.data <= p_end_date
          AND (p_product_id IS NULL OR m_out.produto_id = p_product_id)
          AND (p_location IS NULL OR m_out.setor ILIKE '%' || p_location || '%' OR m_in.setor ILIKE '%' || p_location || '%')
        ORDER BY m_out.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) t;

    RETURN jsonb_build_object(
        'transfers', v_transfers,
        'total', v_total
    );
END;
$$;
