-- 5. Fix existing stale data NOW
DO $$
DECLARE
  v_prod RECORD;
BEGIN
  FOR v_prod IN
    SELECT id FROM public.produtos
    WHERE (last_cost_base_unit > 0 OR avg30_cost_base_unit > 0 OR custo_ultima_compra > 0)
  LOOP
    PERFORM public.recalc_product_costs(v_prod.id);
  END LOOP;
END;
$$;
