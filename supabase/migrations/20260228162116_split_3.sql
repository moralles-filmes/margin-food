CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov RECORD;
BEGIN
  -- Security guards
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;
  IF NOT public.has_permission(auth.uid(), 'purchases:create') AND NOT public.has_permission(auth.uid(), 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para estornar movimentações de pedido.';
  END IF;

  FOR v_mov IN
    SELECT * FROM movimentacoes_estoque
    WHERE reference_type = 'PURCHASE_ORDER'
      AND reference_id = p_order_id::text
      AND status = 'ATIVO'
      AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
  LOOP
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO',
      cancelado_em = now(),
      cancelado_por = p_user_id,
      justificativa_cancelamento = 'Exclusão de pedido de compra'
    WHERE id = v_mov.id;

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
$function$;

-- ============================================================
-- C) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos (categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON public.produtos (ativo);
CREATE INDEX IF NOT EXISTS idx_produtos_created_at ON public.produtos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solic_compra_mercado_status ON public.solic_compra_mercado (status);
CREATE INDEX IF NOT EXISTS idx_solic_compra_mercado_created_at ON public.solic_compra_mercado (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solic_compra_mercado_solicitante ON public.solic_compra_mercado (solicitante_user_id);

-- ============================================================
-- D) FKs AND CHECKS
-- ============================================================

-- D1) recebimento_itens.recebimento_id → ON DELETE CASCADE
ALTER TABLE public.recebimento_itens DROP CONSTRAINT IF EXISTS recebimento_itens_recebimento_id_fkey;
ALTER TABLE public.recebimento_itens ADD CONSTRAINT recebimento_itens_recebimento_id_fkey
  FOREIGN KEY (recebimento_id) REFERENCES public.recebimentos(id) ON DELETE CASCADE;

-- D2) fin_lancamentos.conciliado_por → ON DELETE SET NULL
-- First check if FK exists, drop and re-add
DO $$
BEGIN
  -- Check if there's an existing FK on conciliado_por
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'fin_lancamentos' AND kcu.column_name = 'conciliado_por' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE 'ALTER TABLE public.fin_lancamentos DROP CONSTRAINT ' || (
      SELECT tc.constraint_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'fin_lancamentos' AND kcu.column_name = 'conciliado_por' AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

-- D3) CHECK valor > 0 using validation triggers (per guidelines)