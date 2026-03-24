
-- RLS policies for purchase_orders: restrict UPDATE/DELETE to admin
CREATE POLICY "Admin can update purchase_orders"
ON public.purchase_orders FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete purchase_orders"
ON public.purchase_orders FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for purchase_order_items: restrict UPDATE/DELETE to admin
CREATE POLICY "Admin can update purchase_order_items"
ON public.purchase_order_items FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete purchase_order_items"
ON public.purchase_order_items FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to storno all stock entries from a purchase order before deleting
CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov RECORD;
BEGIN
  -- Find all active stock movements linked to this purchase order
  FOR v_mov IN
    SELECT * FROM movimentacoes_estoque
    WHERE reference_type = 'PURCHASE_ORDER'
      AND reference_id = p_order_id::text
      AND status = 'ATIVO'
      AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
  LOOP
    -- Mark original as cancelled
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO',
      cancelado_em = now(),
      cancelado_por = p_user_id,
      justificativa_cancelamento = 'Exclusão de pedido de compra'
    WHERE id = v_mov.id;

    -- Create storno entry
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO',
      v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total,
      'ESTORNO', 'Estorno automático — Exclusão pedido compra ' || p_order_id::text,
      p_user_id, 'ATIVO', v_mov.id,
      'PURCHASE_ORDER', p_order_id::text || '_ESTORNO',
      false, 'purchases'
    );
  END LOOP;
END;
$$;
