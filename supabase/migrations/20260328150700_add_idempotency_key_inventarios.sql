-- =========================================================
-- ADICIONAR COLUNA IDEMPOTENCY_KEY NA TABELA INVENTARIOS
-- Data: 2026-03-28
-- Objetivo: Resolver erro "column idempotency_key does not exist"
-- que impede a criação de novos inventários.
-- =========================================================

ALTER TABLE public.inventarios 
ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Índice parcial para buscas rápidas de idempotência
CREATE INDEX IF NOT EXISTS idx_inventarios_idempotency 
ON public.inventarios (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Recarregar cache do PostgREST
NOTIFY pgrst, 'reload schema';
