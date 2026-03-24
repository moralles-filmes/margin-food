-- 1) ALTER TABLES
DO $$
BEGIN
  ALTER TABLE public.requisicoes_estoque ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  ALTER TABLE public.requisicoes_estoque ADD COLUMN IF NOT EXISTS deleted_by uuid;
  ALTER TABLE public.requisicoes_estoque ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
END $$;
