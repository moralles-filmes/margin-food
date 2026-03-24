
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(
    total_stock_value numeric,
    items_count integer,
    missing_cost_items_count integer,
    updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company uuid;
BEGIN
    v_company := public.assert_tenant();

    IF NOT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:geral:view', 'estoque:movimentacoes:view', 'system:global:manage'
    ]) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    RETURN QUERY
    WITH ledger_value AS (
        SELECT
            SUM(
                CASE WHEN m.direction = 'IN' 
                     THEN m.quantidade * m.custo_unitario 
                     ELSE -m.quantidade * m.custo_unitario 
                END
            ) AS total_value
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
    ),
    active_count AS (
        SELECT COUNT(*)::integer AS cnt
        FROM public.produtos
        WHERE company_id = v_company AND ativo = true
    ),
    missing_cost AS (
        SELECT COUNT(*)::integer AS cnt
        FROM public.produtos p
        WHERE p.company_id = v_company 
          AND p.ativo = true
          AND COALESCE(NULLIF(p.avg30_cost_base_unit, 0), NULLIF(p.last_cost_base_unit, 0), NULLIF(p.default_cost_base_unit, 0), 0) = 0
          AND EXISTS (
              SELECT 1 FROM public.movimentacoes_estoque me 
              WHERE me.produto_id = p.id AND me.status = 'ATIVO'
              GROUP BY me.produto_id
              HAVING SUM(CASE WHEN me.direction = 'IN' THEN me.quantidade ELSE -me.quantidade END) > 0
          )
    )
    SELECT
        COALESCE(lv.total_value, 0)::numeric AS total_stock_value,
        ac.cnt AS items_count,
        mc.cnt AS missing_cost_items_count,
        now() AS updated_at
    FROM ledger_value lv, active_count ac, missing_cost mc;
END;
$$;
