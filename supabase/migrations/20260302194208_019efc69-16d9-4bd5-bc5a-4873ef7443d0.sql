-- P2 BLOCO 1: Idempotency key for ai_logs
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Backfill existing rows with their id as idempotency_key
UPDATE public.ai_logs SET idempotency_key = id::text WHERE idempotency_key IS NULL;

-- Now make NOT NULL
ALTER TABLE public.ai_logs ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.ai_logs ALTER COLUMN idempotency_key SET DEFAULT '';

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_logs_idempotency
  ON public.ai_logs (company_id, user_id, idempotency_key);

-- P2 BLOCO 4: Index for observability queries
CREATE INDEX IF NOT EXISTS idx_ai_logs_agente_created
  ON public.ai_logs (agente, created_at DESC);