-- 1) Add integration columns to movimentacoes_estoque
ALTER TABLE public.movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS internal_transfer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_module TEXT,
  ADD COLUMN IF NOT EXISTS salmon_lot_id TEXT;

-- 2) Add is_salmon_raw_linked to produtos
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS is_salmon_raw_linked BOOLEAN NOT NULL DEFAULT false;

-- 3) Unique constraint to prevent duplicate mirrors
CREATE UNIQUE INDEX IF NOT EXISTS idx_mov_reference_unique 
  ON public.movimentacoes_estoque (reference_type, reference_id) 
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL AND status = 'ATIVO';

-- Reload PostgREST schema cache after column additions
NOTIFY pgrst, 'reload schema';

-- Ensure the Salmão Fresco product exists now
SELECT ensure_salmon_raw_product();
