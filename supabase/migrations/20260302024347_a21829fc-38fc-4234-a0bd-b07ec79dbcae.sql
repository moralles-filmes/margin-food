
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
BEGIN
    v_company := public.assert_tenant();

    IF NOT public.has_permission(auth.uid(), 'stock:read') THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    RETURN QUERY
    WITH saldos AS (
        SELECT
            m.produto_id,
            SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
        GROUP BY m.produto_id
        HAVING SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) > 0
    ),
    joined AS (
        SELECT
            s.saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS effective_cost
        FROM saldos s
        JOIN public.produtos p ON p.id = s.produto_id AND p.company_id = v_company AND p.ativo = true
    )
    SELECT
        COALESCE(SUM(j.saldo * j.effective_cost), 0)::numeric AS total_stock_value,
        COUNT(*)::integer AS items_count,
        COUNT(CASE WHEN j.effective_cost = 0 THEN 1 END)::integer AS missing_cost_items_count,
        now() AS updated_at
    FROM joined j;
END;
$function$;
