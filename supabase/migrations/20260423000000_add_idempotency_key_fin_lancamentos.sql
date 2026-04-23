ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_lancamentos_company_idempotency
  ON public.fin_lancamentos (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
