
-- Phase 1: Add conta_no_cmv column (nullable first)
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS conta_no_cmv boolean;

-- Phase 2: Backfill all existing rows
UPDATE public.produtos
SET conta_no_cmv = true
WHERE conta_no_cmv IS NULL;

-- Phase 3: Set default and NOT NULL
ALTER TABLE public.produtos
ALTER COLUMN conta_no_cmv SET DEFAULT true;

ALTER TABLE public.produtos
ALTER COLUMN conta_no_cmv SET NOT NULL;
