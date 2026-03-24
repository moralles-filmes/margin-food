
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS package_quantity numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS package_measure_unit text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conversion_mode text NOT NULL DEFAULT 'manual';
