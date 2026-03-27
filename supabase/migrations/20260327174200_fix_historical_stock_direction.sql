
-- Correction: Fix historical stock movements by backfilling missing 'direction' metadata
-- This ensures that old entries (Entries/Purchase) are correctly added to the total balance.

-- 1. Backfill 'direction' for all existing movements based on 'tipo'
UPDATE public.movimentacoes_estoque
SET direction = CASE
    WHEN tipo LIKE 'ENTRADA%' THEN 'IN'
    ELSE 'OUT'
END
WHERE direction IS NULL;

-- 2. Upgrade fn_recompute_product_saldo with extra fallback for safety
CREATE OR REPLACE FUNCTION public.fn_recompute_product_saldo(p_id uuid, p_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.produtos
  SET saldo_atual = (
    SELECT ROUND(COALESCE(SUM(
      CASE 
        WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        -- Use direction as primary, fallback to tipo for historical data safety
        WHEN COALESCE(m.direction, (CASE WHEN m.tipo LIKE 'ENTRADA%' THEN 'IN' ELSE 'OUT' END)) = 'IN' THEN m.quantidade 
        ELSE -m.quantidade 
      END
    ), 0), 4)
    FROM public.movimentacoes_estoque m
    WHERE m.produto_id = p_id AND m.status = 'ATIVO' AND m.company_id = p_company
  )
  WHERE id = p_id AND company_id = p_company;
END;
$function$;

-- 3. Trigger full recalculation for all active products
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, company_id FROM public.produtos WHERE company_id != '00000000-0000-0000-0000-000000000001' LOOP
        PERFORM public.fn_recompute_product_saldo(r.id, r.company_id);
    END LOOP;
END $$;
