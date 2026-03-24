
-- Update storno RPC to also handle per-item reference type
CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'purchases:create') AND NOT public.has_permission(auth.uid(), 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar movimentações de pedido.';
  END IF;

  -- Handle both old (PURCHASE_ORDER) and new (PURCHASE_ORDER_ITEM) reference types
  FOR v_mov IN
    SELECT * FROM movimentacoes_estoque
    WHERE (
      (reference_type = 'PURCHASE_ORDER' AND reference_id = p_order_id::text)
      OR
      (reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id LIKE 'POI:%' AND EXISTS (
        SELECT 1 FROM purchase_order_items poi
        WHERE poi.order_id = p_order_id
          AND 'POI:' || poi.id::text = movimentacoes_estoque.reference_id
      ))
    )
    AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
  LOOP
    UPDATE movimentacoes_estoque SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = p_user_id, justificativa_cancelamento = 'Exclusão de pedido de compra' WHERE id = v_mov.id;
    INSERT INTO movimentacoes_estoque (produto_id, data, tipo, quantidade, custo_unitario, custo_total, origem, observacao, created_by, status, estorno_de_id, reference_type, reference_id, internal_transfer, source_module)
    VALUES (v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO', 'Estorno automático — Exclusão pedido compra ' || p_order_id::text, p_user_id, 'ATIVO', v_mov.id, v_mov.reference_type, v_mov.reference_id || '_ESTORNO', false, 'purchases');
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_audit('rpc', 'compras', 'purchase_orders', p_order_id, 'STORNO', NULL,
    jsonb_build_object('movimentacoes_estornadas', v_count));
END;
$function$;
