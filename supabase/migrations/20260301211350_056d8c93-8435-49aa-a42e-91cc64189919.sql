
-- ================================================================
-- SALMON HOTFIX: Reconcile orphan + index + drop legacy RPCs
-- ================================================================

-- 1) Cancel orphan movement + create estorno
DO $$
DECLARE
  v_orphan RECORD;
  v_estorno_id uuid;
  v_estorno_tipo text;
BEGIN
  FOR v_orphan IN
    SELECT m.*
    FROM movimentacoes_estoque m
    WHERE m.status = 'ATIVO'
      AND m.reference_type IN ('SALMON_ENTRY', 'SALMON_MANIPULATION')
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
      AND (
        (m.reference_type = 'SALMON_ENTRY' AND NOT EXISTS (
          SELECT 1 FROM salmon_entries se WHERE se.id::text = m.reference_id AND se.status = 'ACTIVE'
        ))
        OR
        (m.reference_type = 'SALMON_MANIPULATION' AND NOT EXISTS (
          SELECT 1 FROM salmon_manipulations sm WHERE sm.id::text = m.reference_id AND sm.status = 'ACTIVE'
        ))
      )
    FOR UPDATE
  LOOP
    -- Determine estorno type
    v_estorno_tipo := CASE
      WHEN v_orphan.direction = 'IN' THEN 'ENTRADA_ESTORNO'
      ELSE 'SAIDA_ESTORNO'
    END;

    -- Cancel the orphan
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO',
      cancelado_em = now(),
      cancelado_por = v_orphan.created_by,
      justificativa_cancelamento = 'Reconciliação: movimento órfão sem salmon_entry/manipulation correspondente ativa'
    WHERE id = v_orphan.id;

    -- Create reversal
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id
    ) VALUES (
      v_orphan.produto_id, CURRENT_DATE, v_estorno_tipo, v_orphan.quantidade,
      v_orphan.custo_unitario, v_orphan.custo_total, 'ESTORNO',
      'Estorno reconciliação — movimento órfão ' || v_orphan.id::text,
      v_orphan.created_by, 'ATIVO', v_orphan.id,
      'SALMON_RECONCILIATION', v_orphan.id::text, false, 'salmon', v_orphan.salmon_lot_id
    ) RETURNING id INTO v_estorno_id;

    -- Audit log
    PERFORM log_audit('migration', 'salmon', 'movimentacoes_estoque', v_orphan.id, 'RECONCILE_ORPHAN_MOVEMENT',
      jsonb_build_object('orphan_id', v_orphan.id, 'reference_type', v_orphan.reference_type, 
        'reference_id', v_orphan.reference_id, 'qty', v_orphan.quantidade, 'tipo', v_orphan.tipo),
      jsonb_build_object('estorno_id', v_estorno_id, 'reason', 'Orphan movement without active salmon record'));
  END LOOP;
END $$;

-- 2) Index for reference lookup (supports FOR UPDATE in RPCs)
CREATE INDEX IF NOT EXISTS idx_mov_reference_active 
  ON movimentacoes_estoque(reference_type, reference_id) 
  WHERE status = 'ATIVO';

-- 3) Drop legacy RPCs (confirmed unused in frontend)
DROP FUNCTION IF EXISTS public.mirror_salmon_to_stock(text, text, numeric, numeric, text, text, text, text);
DROP FUNCTION IF EXISTS public.cancel_salmon_mirror(text, text);
