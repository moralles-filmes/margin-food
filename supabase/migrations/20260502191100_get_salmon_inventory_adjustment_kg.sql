-- =========================================================
-- PERF: get_salmon_inventory_adjustment_kg
-- Substitui a query sem limit em useSalmonStore.ts
-- (movimentacoes_estoque filtrado por produto salmon raw)
-- por SUM no Postgres, eliminando O(n) na rede.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_salmon_inventory_adjustment_kg()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company       uuid;
  v_produto_id    uuid;
  v_adjustment_kg numeric := 0;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:estoque:view', 'salmon:dashboard:view', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT id INTO v_produto_id
    FROM public.produtos
   WHERE company_id        = v_company
     AND is_salmon_raw_linked = true
   LIMIT 1;

  IF v_produto_id IS NULL THEN
    RETURN jsonb_build_object('adjustment_kg', 0, 'produto_found', false);
  END IF;

  SELECT COALESCE(SUM(
    CASE tipo
      WHEN 'AJUSTE_INVENTARIO_POSITIVO' THEN  quantidade
      WHEN 'AJUSTE_INVENTARIO_NEGATIVO' THEN -quantidade
      ELSE 0
    END
  ), 0)
    INTO v_adjustment_kg
    FROM public.movimentacoes_estoque
   WHERE company_id = v_company
     AND produto_id = v_produto_id
     AND status     = 'ATIVO'
     AND tipo IN ('AJUSTE_INVENTARIO_POSITIVO', 'AJUSTE_INVENTARIO_NEGATIVO');

  RETURN jsonb_build_object(
    'adjustment_kg',  v_adjustment_kg,
    'produto_found',  true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salmon_inventory_adjustment_kg TO authenticated;
-- DO block omitido: assert_tenant() requer sessão autenticada; colunas são estáveis.
