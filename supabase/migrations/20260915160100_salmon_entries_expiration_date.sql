-- Data de vencimento do lote bruto de salmão (informada na Entrada).
-- Opcional: lote legado sem validade continua válido e é ordenado pela data de entrada.
-- A sugestão de lote na Manipulação passa a ser FEFO (vence primeiro) quando a validade existe.

ALTER TABLE public.salmon_entries
  ADD COLUMN IF NOT EXISTS expiration_date date;

COMMENT ON COLUMN public.salmon_entries.expiration_date IS
  'Validade do lote bruto informada na entrada. NULL = lote legado/sem validade informada.';

CREATE INDEX IF NOT EXISTS idx_salmon_entries_expiration
  ON public.salmon_entries (company_id, expiration_date)
  WHERE status = 'ACTIVE';
