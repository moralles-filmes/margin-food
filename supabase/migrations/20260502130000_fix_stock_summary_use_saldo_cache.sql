-- =========================================================
-- FIX: get_stock_summary alinhada com get_stock_dashboard
-- Data: 2026-05-02
-- Problema: O card "SALDO TOTAL EM ESTOQUE" (topo da Estoque Geral)
--   usava ledger cumulativo sobre movimentacoes_estoque, divergindo
--   do "VALOR EM ESTOQUE" do Dashboard que já usa saldo_atual cache.
--   Princípio MarginPro (2026-05-01): produtos.saldo_atual é a fonte
--   única da verdade; RPCs de leitura consomem o cache.
-- Fix: total_stock_value passa a ser SUM(saldo × custo_efetivo)
--   sobre o CTE product_data (que já existe, já filtra ativo=true e
--   já aplica coalesce avg30 → last → default → 0).
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(
  total_stock_value numeric,
  items_count integer,
  missing_cost_items_count integer,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    WITH product_data AS (
        SELECT
            p.id,
            COALESCE(p.saldo_atual, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS effective_cost
        FROM public.produtos p
        WHERE p.company_id = v_company
          AND p.ativo = true
    ),
    aggregates AS (
        SELECT
            ROUND(COALESCE(SUM(pd.saldo * pd.effective_cost), 0)::numeric, 2) AS total_val,
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(*) FILTER (WHERE pd.effective_cost = 0), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        a.total_val AS total_stock_value,
        a.cnt AS items_count,
        a.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM aggregates a;
END;
$function$;

NOTIFY pgrst, 'reload schema';
