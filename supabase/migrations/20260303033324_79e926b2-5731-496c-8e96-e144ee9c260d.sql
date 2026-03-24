
-- ============================================================
-- COMPRAS P1 FIX — HIGH ISSUES
-- H1) FORCE RLS on remaining tables
-- H2) storno_purchase_order_stock — remove p_user_id
-- ============================================================

-- H1) FORCE RLS on remaining compras tables
ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solic_compra_mercado_item FORCE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_compra FORCE ROW LEVEL SECURITY;

-- H2) storno_purchase_order_stock — remove p_user_id, use auth.uid()
CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid;
  v_company uuid;
  v_mov RECORD;
  v_count int := 0;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  v_company := assert_tenant();

  IF NOT public.has_permission(v_user, 'purchases:create') AND NOT public.has_permission(v_user, 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar movimentações de pedido.';
  END IF;

  -- Lock the order first — also validates tenant
  PERFORM 1 FROM purchase_orders WHERE id = p_order_id AND company_id = v_company FOR UPDATE;

  FOR v_mov IN
    SELECT * FROM movimentacoes_estoque
    WHERE company_id = v_company
    AND (
      (reference_type = 'PURCHASE_ORDER' AND reference_id = p_order_id::text)
      OR
      (reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id LIKE 'POI:%' AND EXISTS (
        SELECT 1 FROM purchase_order_items poi
        WHERE poi.order_id = p_order_id
          AND poi.company_id = v_company
          AND 'POI:' || poi.id::text = movimentacoes_estoque.reference_id
      ))
    )
    AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    FOR UPDATE
  LOOP
    UPDATE movimentacoes_estoque
    SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_user,
        justificativa_cancelamento = 'Exclusão de pedido de compra'
    WHERE id = v_mov.id AND company_id = v_company;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module,
      company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno automático — Exclusão pedido compra ' || p_order_id::text,
      v_user, 'ATIVO', v_mov.id, v_mov.reference_type,
      v_mov.reference_id || '_ESTORNO', false, 'purchases',
      v_company
    );
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit('rpc', 'compras', 'purchase_orders', p_order_id, 'STORNO', NULL,
    jsonb_build_object('movimentacoes_estornadas', v_count));
END;
$function$;

-- Drop the old 2-arg overload to prevent ambiguity
DROP FUNCTION IF EXISTS public.storno_purchase_order_stock(uuid, uuid);
