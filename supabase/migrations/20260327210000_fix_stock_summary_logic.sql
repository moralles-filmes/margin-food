-- =========================================================
-- CORREÇÃO DE LÓGICA: RESUMO DE ESTOQUE SINCRONIZADO
-- Data: 2026-03-27
-- Objetivo: Sincronizar o card resumo com o cache saldo_atual
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
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
    ledger_value AS (
        SELECT COALESCE(SUM(
            CASE 
                WHEN m.direction = 'IN' THEN m.custo_total
                ELSE -m.custo_total
            END
        ), 0)::numeric AS total_val
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company 
          AND m.status = 'ATIVO'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    ),
    active_totals AS (
        SELECT 
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(CASE WHEN pd.effective_cost = 0 THEN 1 END), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        lv.total_val AS total_stock_value,
        at.cnt AS items_count,
        at.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM ledger_value lv, active_totals at;
END;
$function$;

-- GARANTIR RECOMPUTAÇÃO DE SALDOS ANTES DE LIBERAR (OPCIONAL MAS SEGURO)
DO $$
DECLARE
  prod_record RECORD;
BEGIN
  FOR prod_record IN 
    SELECT id, company_id FROM public.produtos 
    WHERE ativo = true 
    AND company_id != '00000000-0000-0000-0000-000000000001'::uuid 
  LOOP
    PERFORM public.fn_recompute_product_saldo(prod_record.id, prod_record.company_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
