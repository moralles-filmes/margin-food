
-- Add pricing columns to produtos table
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS unidade_compra text NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS fator_conversao_padrao numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS custo_medio_30d numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_ultima_compra numeric NOT NULL DEFAULT 0;

-- Add index for pricing queries
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto_data ON public.movimentacoes_estoque (produto_id, data);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo_data ON public.movimentacoes_estoque (tipo, data);
