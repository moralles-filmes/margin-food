CREATE OR REPLACE FUNCTION public.get_saldo_produto(p_produto_id uuid)
  RETURNS numeric
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
        WHEN direction = 'IN' THEN quantidade
        ELSE -quantidade
      END
    ), 0
  )
  FROM movimentacoes_estoque
  WHERE produto_id = p_produto_id
    AND status = 'ATIVO';
$$;

-- 5) ÍNDICES
-- Composite for saldo calculation
CREATE INDEX IF NOT EXISTS idx_mov_produto_status_data
  ON public.movimentacoes_estoque (produto_id, status, data DESC);

-- For cursor pagination
CREATE INDEX IF NOT EXISTS idx_mov_status_created
  ON public.movimentacoes_estoque (status, created_at DESC);

-- For direction-based queries (tabs)
CREATE INDEX IF NOT EXISTS idx_mov_direction_status_created
  ON public.movimentacoes_estoque (direction, status, created_at DESC);

-- Missing index on inventario_itens
CREATE INDEX IF NOT EXISTS idx_inventario_itens_inv_id
  ON public.inventario_itens (inventario_id);

-- Remove duplicate unique index (keep idx_mov_reference_unique, drop uq_mov_reference_active)
DROP INDEX IF EXISTS public.uq_mov_reference_active;

-- 6) FIX CHECK constraint to include missing types
-- Drop old CHECK and recreate with complete list
ALTER TABLE public.movimentacoes_estoque
  DROP CONSTRAINT IF EXISTS movimentacoes_estoque_tipo_check;

ALTER TABLE public.movimentacoes_estoque
  ADD CONSTRAINT movimentacoes_estoque_tipo_check CHECK (tipo IN (
    'ENTRADA', 'SAIDA', 'AJUSTE', 'BAIXA_PERDA',
    'ENTRADA_ESTORNO', 'SAIDA_ESTORNO',
    'ENTRADA_COMPRA', 'ENTRADA_INICIAL',
    'SAIDA_CONSUMO', 'SAIDA_REQUISICAO', 'SAIDA_PERDA',
    'SAIDA_AJUSTE_NEGATIVO', 'SAIDA_VENCIMENTO', 'SAIDA_TRANSFERENCIA',
    'AJUSTE_INVENTARIO_POSITIVO', 'AJUSTE_INVENTARIO_NEGATIVO',
    'AJUSTE_CORRECAO_POSTERIOR_ENTRADA', 'AJUSTE_CORRECAO_POSTERIOR_SAIDA'
  ));

-- 7) Audit trigger on movimentacoes_estoque and produtos (missing!)
CREATE TRIGGER trg_audit_movimentacoes_estoque
  AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_fn('estoque', 'movimentacoes_estoque');

CREATE TRIGGER trg_audit_produtos
  AFTER INSERT OR UPDATE OR DELETE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_fn('estoque', 'produtos');

-- 8) Update get_stock_summary to use direction column