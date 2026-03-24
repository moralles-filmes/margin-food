
-- Fix CRITICAL: idx_mov_reference_unique is too broad for inventory adjustments
-- Inventory creates multiple movimentações per inventory (one per product),
-- but this index only allows ONE row per (reference_type, reference_id).
-- Solution: Exclude INVENTARIO_AJUSTE and CORRECAO types from this index.
-- The dedicated idx_mov_estoque_inv_ajuste_idempotent (4-col) handles inventory idempotency.

DROP INDEX IF EXISTS idx_mov_reference_unique;

-- Recreate with exclusion for inventory-related types (which are 1:N per reference_id)
CREATE UNIQUE INDEX idx_mov_reference_unique ON public.movimentacoes_estoque 
  USING btree (reference_type, reference_id) 
  WHERE reference_type IS NOT NULL 
    AND reference_id IS NOT NULL 
    AND status = 'ATIVO'
    AND reference_type NOT IN ('INVENTARIO_AJUSTE', 'AJUSTE_CORRECAO_POSTERIOR');
